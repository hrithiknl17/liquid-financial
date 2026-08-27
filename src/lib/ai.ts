import { Category, LineItem, Settings, Transaction } from '../types';
import { addDays, todayISO } from './dates';
import { iconForCategory } from './finance';
import { uid } from './storage';
import {
  AiOperation,
  DEFAULT_MODEL,
  EXPENSE_CATEGORY_LIST,
  buildBillRequest,
  buildQuickAddRequest,
} from './prompts';

const GOOGLE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export type AiRoute = 'proxy' | 'direct' | 'none';

export interface AiStatus {
  route: AiRoute;
  /** Human-readable reason shown in Settings when nothing is available. */
  detail: string;
}

let cachedProxy: boolean | null = null;

/** One probe per page load: is a key-holding server sitting in front of us? */
async function proxyAvailable(): Promise<boolean> {
  if (cachedProxy !== null) return cachedProxy;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch('/api/ai/health', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      cachedProxy = false;
    } else {
      const body = (await res.json()) as { keyConfigured?: boolean };
      cachedProxy = Boolean(body.keyConfigured);
    }
  } catch {
    cachedProxy = false;
  }
  return cachedProxy;
}

export async function aiStatus(settings: Settings): Promise<AiStatus> {
  if (await proxyAvailable()) {
    return { route: 'proxy', detail: 'Server proxy — your key stays on the server' };
  }
  if (settings.geminiApiKey?.trim()) {
    return { route: 'direct', detail: 'Personal key from Settings — stored on this device only' };
  }
  return {
    route: 'none',
    detail: 'No key found. Run the server with GEMINI_API_KEY, or paste a key below.',
  };
}

export class AiUnavailableError extends Error {}

/** Overload and rate-limit responses are worth a second try; the rest are not. */
const TRANSIENT = new Set([429, 500, 502, 503, 504]);

/**
 * Per-operation deadlines. A bill scan has no local fallback, so it waits and
 * retries; quick-add has an on-device parser, so it gives up early rather than
 * leaving someone staring at a spinner.
 */
const OPERATION_LIMITS: Record<AiOperation, { timeoutMs: number; attempts: number }> = {
  'scan-bill': { timeoutMs: 45_000, attempts: 3 },
  'quick-add': { timeoutMs: 15_000, attempts: 2 },
  agent: { timeoutMs: 30_000, attempts: 2 },
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends one request either through the proxy (which injects the key) or
 * straight to Google with the user's own key. Same body either way.
 */
export async function callGemini(
  operation: AiOperation,
  body: unknown,
  settings: Settings,
  options: { raw?: boolean } = {}
): Promise<Record<string, unknown>> {
  const model = settings.geminiModel?.trim() || DEFAULT_MODEL;
  const { timeoutMs, attempts } = OPERATION_LIMITS[operation];
  const viaProxy = await proxyAvailable();
  const key = settings.geminiApiKey?.trim();

  if (!viaProxy && !key) {
    throw new AiUnavailableError(
      'No Gemini key available. Start the server with GEMINI_API_KEY set, or add your key in Settings.'
    );
  }

  // Without a deadline a stalled upstream leaves the sheet spinning forever.
  const send = (): Promise<Response> =>
    viaProxy
      ? fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation, model, body }),
          signal: AbortSignal.timeout(timeoutMs),
        })
      : fetch(`${GOOGLE_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key as string },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });

  let res: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(700 * attempt);
    try {
      res = await send();
      if (!TRANSIENT.has(res.status)) break;
    } catch (err) {
      // A timeout or dropped connection is worth one more go.
      lastError = err;
      res = null;
    }
  }

  if (!res) {
    throw new Error(
      lastError instanceof DOMException && lastError.name === 'TimeoutError'
        ? 'Gemini took too long to answer. Try again, or use a smaller photo.'
        : `Could not reach Gemini: ${lastError instanceof Error ? lastError.message : 'network error'}`
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const message = trimError(detail);
    throw new Error(
      TRANSIENT.has(res.status)
        ? `Gemini is busy right now (${res.status}). Try again in a moment.`
        : `Gemini request failed (${res.status}). ${message}`
    );
  }

  const payload = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };

  if (payload.promptFeedback?.blockReason) {
    throw new Error(`Gemini refused the request (${payload.promptFeedback.blockReason}).`);
  }

  // The agent needs the envelope itself, since its answer is in functionCall parts.
  if (options.raw) return payload as unknown as Record<string, unknown>;

  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text.trim()) throw new Error('Gemini returned an empty response. Try a sharper photo.');

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Structured output occasionally arrives fenced; salvage the JSON body.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Could not read the model response as JSON.');
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

function trimError(detail: string): string {
  try {
    const parsed = JSON.parse(detail) as { error?: { message?: string } };
    return parsed.error?.message?.slice(0, 200) ?? '';
  } catch {
    return detail.slice(0, 200);
  }
}

/* ============================ BILL SCAN ============================ */

export interface ScannedBill {
  merchant: string;
  date: string;
  total: number;
  tax: number;
  discount: number;
  category: Category;
  paymentMethod: string;
  note: string;
  confidence: number;
  items: LineItem[];
  /** Items sum vs printed total, so the review sheet can flag a mismatch. */
  itemsTotal: number;
}

const toNumber = (value: unknown, fallback = 0): number => {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
};

const toText = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

function safeCategory(value: unknown, fallback: Category): Category {
  const text = toText(value);
  return (EXPENSE_CATEGORY_LIST.includes(text) ? text : fallback) as Category;
}

/** ISO dates only, and never in the future — a misread year is worse than today. */
function safeDate(value: unknown): string {
  const text = toText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return todayISO();
  return text > todayISO() ? todayISO() : text;
}

export async function scanBill(
  imageBase64: string,
  mimeType: string,
  settings: Settings
): Promise<ScannedBill> {
  const raw = await callGemini('scan-bill', buildBillRequest(imageBase64, mimeType, settings.currency), settings);

  const items: LineItem[] = Array.isArray(raw.items)
    ? (raw.items as Record<string, unknown>[])
        .map((item) => ({
          id: uid('li'),
          name: toText(item.name),
          qty: Math.max(0, toNumber(item.qty, 1)) || 1,
          unitPrice: Math.max(0, toNumber(item.unitPrice)),
        }))
        .filter((item) => item.name && item.unitPrice > 0)
    : [];

  const itemsTotal = items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const total = Math.abs(toNumber(raw.total, itemsTotal));

  return {
    merchant: toText(raw.merchant, 'Unknown merchant'),
    date: safeDate(raw.date),
    total: total || itemsTotal,
    tax: Math.max(0, toNumber(raw.tax)),
    discount: Math.max(0, toNumber(raw.discount)),
    category: safeCategory(raw.category, 'Groceries'),
    paymentMethod: toText(raw.paymentMethod, 'UPI'),
    note: toText(raw.note),
    confidence: Math.min(1, Math.max(0, toNumber(raw.confidence, 0.5))),
    items,
    itemsTotal,
  };
}

/* ============================ QUICK ADD ============================ */

export type DraftTransaction = Omit<Transaction, 'id'>;

export async function parseQuickAdd(text: string, settings: Settings): Promise<DraftTransaction[]> {
  const raw = await callGemini('quick-add', buildQuickAddRequest(text, todayISO(), settings.currency), settings);
  const entries = Array.isArray(raw.entries) ? (raw.entries as Record<string, unknown>[]) : [];

  return entries
    .map((entry): DraftTransaction | null => {
      const amount = Math.abs(toNumber(entry.amount));
      const merchant = toText(entry.merchant);
      if (!merchant || amount <= 0) return null;

      const incoming = toText(entry.direction) === 'in';
      const category = incoming ? 'Other Income' : safeCategory(entry.category, 'Other');
      const rawType = toText(entry.type, 'discretionary');
      const type: Transaction['type'] = incoming
        ? 'income'
        : rawType === 'fixed'
          ? 'fixed'
          : 'discretionary';

      const offset = Math.min(0, Math.round(toNumber(entry.dayOffset)));

      return {
        merchant,
        category: category as Category,
        date: addDays(todayISO(), offset),
        amount: incoming ? amount : -amount,
        iconName: iconForCategory(category),
        type,
        note: toText(entry.note) || undefined,
        origin: 'quick-add',
      };
    })
    .filter((entry): entry is DraftTransaction => entry !== null);
}

/** Strips the `data:...;base64,` prefix that FileReader produces. */
export function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) throw new Error('Unsupported image data.');
  return { mimeType: match[1], base64: match[2] };
}

export async function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Shrinks a photo before it goes over the wire. Phone cameras produce 4-8MB
 * files; 1600px on the long edge is plenty for reading a receipt.
 */
export async function compressImage(file: Blob, maxEdge = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1_500_000) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((result) => resolve(result), 'image/jpeg', quality)
  );
  return blob ?? file;
}
