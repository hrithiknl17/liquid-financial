/**
 * Optional companion server.
 *
 * Four jobs:
 *  1. Serve the built app from dist/.
 *  2. Hold the Gemini API key so it never reaches the browser.
 *  3. Meter that key per account, so one enthusiastic user cannot run up the
 *     bill for everyone.
 *  4. Sign Cloudinary uploads, so no upload credential ships in the bundle.
 *
 * The app works fine without this — it falls back to a key you paste into
 * Settings. Run it when you want the key kept server-side.
 *
 *   npm run build && npm start
 */
import 'dotenv/config';
import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { ALLOWED_MODELS, DEFAULT_MODEL } from './src/lib/prompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const API_KEY = process.env.GEMINI_API_KEY?.trim();
const GOOGLE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL?.trim();
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const CLOUDINARY_KEY = process.env.CLOUDINARY_API_KEY?.trim();
const CLOUDINARY_SECRET = process.env.CLOUDINARY_API_SECRET?.trim();

/** Empty list means signups are open to anyone with a Google account. */
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS ?? '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

const AI_MONTHLY_CAP = Number(process.env.AI_MONTHLY_CAP ?? 50);

/** Accounts only exist once Supabase is wired up. */
const cloudReady = Boolean(SUPABASE_URL && SERVICE_ROLE);

interface Caller {
  id: string;
  email: string;
}

/**
 * Resolves the bearer token to an account, using Supabase as the authority.
 * Nothing here trusts a user id sent by the browser.
 */
async function resolveCaller(req: Request): Promise<Caller | null> {
  if (!cloudReady) return null;

  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_ROLE as string },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const user = (await response.json()) as { id?: string; email?: string };
    if (!user.id || !user.email) return null;
    return { id: user.id, email: user.email.toLowerCase() };
  } catch {
    return null;
  }
}

function allowed(caller: Caller): boolean {
  return ALLOWED_EMAILS.length === 0 || ALLOWED_EMAILS.includes(caller.email);
}

/**
 * Counts one funded Gemini call and reports whether the account is over its
 * monthly allowance. Uses the service role deliberately: row level security
 * would otherwise let someone reset their own counter.
 */
async function meter(caller: Caller): Promise<{ ok: boolean; used: number }> {
  if (!cloudReady) return { ok: true, used: 0 };

  const month = new Date().toISOString().slice(0, 7);
  const headers = {
    'Content-Type': 'application/json',
    apikey: SERVICE_ROLE as string,
    Authorization: `Bearer ${SERVICE_ROLE}`,
  };

  try {
    const read = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_usage?user_id=eq.${caller.id}&month=eq.${month}&select=calls`,
      { headers, signal: AbortSignal.timeout(8_000) }
    );
    const rows = (await read.json()) as { calls?: number }[];
    const used = rows?.[0]?.calls ?? 0;

    if (used >= AI_MONTHLY_CAP) return { ok: false, used };

    await fetch(`${SUPABASE_URL}/rest/v1/ai_usage`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: caller.id, month, calls: used + 1 }),
      signal: AbortSignal.timeout(8_000),
    });

    return { ok: true, used: used + 1 };
  } catch {
    // Metering must never take the app down; log and let the call through.
    console.warn('AI usage metering failed; allowing the call.');
    return { ok: true, used: 0 };
  }
}

// Bills are photographs; 25MB leaves room for an uncompressed capture.
app.use(express.json({ limit: '25mb' }));

app.get('/api/ai/health', (_req, res) => {
  res.json({
    keyConfigured: Boolean(API_KEY && API_KEY !== 'MY_GEMINI_API_KEY'),
    defaultModel: DEFAULT_MODEL,
    accounts: cloudReady,
    monthlyCap: AI_MONTHLY_CAP,
  });
});

/**
 * Forwards one generateContent call with the key attached.
 *
 * Deliberately narrow: only the two operations this app makes, and only
 * models on the allowlist, so an exposed port can't be turned into a general
 * relay for someone else's traffic.
 */
app.post('/api/ai/generate', async (req, res) => {
  if (!API_KEY || API_KEY === 'MY_GEMINI_API_KEY') {
    res.status(503).json({ error: 'GEMINI_API_KEY is not set on the server.' });
    return;
  }

  const { operation, model, body } = req.body ?? {};

  if (operation !== 'scan-bill' && operation !== 'quick-add' && operation !== 'agent') {
    res.status(400).json({ error: 'Unknown operation.' });
    return;
  }
  const chosenModel = typeof model === 'string' && ALLOWED_MODELS.includes(model) ? model : DEFAULT_MODEL;
  if (!body || typeof body !== 'object' || !Array.isArray((body as { contents?: unknown }).contents)) {
    res.status(400).json({ error: 'Malformed request body.' });
    return;
  }

  // Once accounts exist, the shared key is only for signed-in, allowlisted
  // people, and only up to the monthly cap. Local-only installs are unaffected.
  if (cloudReady) {
    const caller = await resolveCaller(req);
    if (!caller) {
      res.status(401).json({ error: 'Sign in to use the shared Gemini key, or add your own in Settings.' });
      return;
    }
    if (!allowed(caller)) {
      res.status(403).json({ error: 'This account is not on the allowlist yet.' });
      return;
    }
    const { ok, used } = await meter(caller);
    if (!ok) {
      res.status(429).json({
        error: `Monthly limit of ${AI_MONTHLY_CAP} AI actions reached (${used} used). Add your own Gemini key in Settings to keep going.`,
      });
      return;
    }
  }

  try {
    const upstream = await fetch(`${GOOGLE_ENDPOINT}/${encodeURIComponent(chosenModel)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
      body: JSON.stringify(body),
      // Never hold a browser request open on a stalled upstream.
      signal: AbortSignal.timeout(40_000),
    });

    const text = await upstream.text();
    res.status(upstream.status).type('application/json').send(text);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    res
      .status(timedOut ? 504 : 502)
      .json({ error: timedOut ? 'Gemini did not answer in time.' : `Could not reach Gemini: ${(error as Error).message}` });
  }
});

/**
 * Hands back a one-shot signature for a direct-to-Cloudinary upload.
 *
 * The API secret never leaves the server, and the signature covers the folder
 * and public id, so a signature issued for one account cannot be replayed to
 * overwrite another's bill photo.
 */
app.post('/api/uploads/sign', async (req: Request, res: Response) => {
  if (!CLOUDINARY_KEY || !CLOUDINARY_SECRET) {
    res.status(503).json({ error: 'Cloudinary credentials are not set on the server.' });
    return;
  }

  const caller = await resolveCaller(req);
  if (!caller) {
    res.status(401).json({ error: 'Sign in to upload bill photos.' });
    return;
  }
  if (!allowed(caller)) {
    res.status(403).json({ error: 'This account is not on the allowlist yet.' });
    return;
  }

  const receiptId = String((req.body ?? {}).receiptId ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!receiptId) {
    res.status(400).json({ error: 'A receiptId is required.' });
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  // Uploads are namespaced by account, so one person's folder is not another's.
  const folder = `liquid/${caller.id}`;
  const params = `folder=${folder}&public_id=${receiptId}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha256').update(params + CLOUDINARY_SECRET).digest('hex');

  res.json({ signature, timestamp, folder, publicId: receiptId, apiKey: CLOUDINARY_KEY });
});

// Static app, with SPA fallback so a refresh on any path still loads.
const distDir = path.join(__dirname, 'dist');
app.use(express.static(distDir));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, () => {
  const keyState = API_KEY && API_KEY !== 'MY_GEMINI_API_KEY' ? 'configured' : 'MISSING';
  const accounts = cloudReady
    ? `on${ALLOWED_EMAILS.length > 0 ? ` (allowlist: ${ALLOWED_EMAILS.length})` : ' (open signup)'}`
    : 'off — local only';
  const uploads = CLOUDINARY_KEY && CLOUDINARY_SECRET ? 'signed' : 'MISSING';
  console.log(
    `Liquid running at http://localhost:${PORT}\n` +
      `  Gemini key: ${keyState}\n` +
      `  Accounts:   ${accounts}\n` +
      `  Uploads:    ${uploads}`
  );
});
