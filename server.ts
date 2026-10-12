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
import { EMBEDDING_MODEL, reindex, search, SearchConfig } from './server/search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const API_KEY = process.env.GEMINI_API_KEY?.trim();
const GOOGLE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL?.trim();
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
// Search runs as the signed-in user, which PostgREST needs the public key for.
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY?.trim();
const CLOUDINARY_KEY = process.env.CLOUDINARY_API_KEY?.trim();
const CLOUDINARY_SECRET = process.env.CLOUDINARY_API_SECRET?.trim();
// Deleting a bill needs the cloud name too. The VITE_ copy already exists for
// the bundle, so fall back to it rather than making anyone set it twice.
const CLOUDINARY_CLOUD = (process.env.CLOUDINARY_CLOUD_NAME ?? process.env.VITE_CLOUDINARY_CLOUD_NAME)?.trim();
/**
 * Cloudinary verifies signatures with SHA-1 unless the account has been
 * switched to SHA-256 (Console > Settings > Security). Getting this wrong is
 * the one failure that looks like a credential problem but is not, so it is a
 * setting rather than a constant: an upload rejected as "Invalid Signature"
 * is fixed by flipping this to sha1.
 */
const CLOUDINARY_SIGN_ALGO = (process.env.CLOUDINARY_SIGN_ALGO ?? 'sha256').trim().toLowerCase();

function signCloudinary(params: string): string {
  return crypto.createHash(CLOUDINARY_SIGN_ALGO).update(params + CLOUDINARY_SECRET).digest('hex');
}

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

/**
 * Access is decided by the database now: an account is allowed once it has
 * been approved in the app. ALLOWED_EMAILS stays as an override so the owner
 * can always get in, even before any approval exists.
 */
async function allowed(caller: Caller): Promise<boolean> {
  if (ALLOWED_EMAILS.includes(caller.email)) return true;
  if (!cloudReady) return ALLOWED_EMAILS.length === 0;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${caller.id}&select=approved`,
      {
        headers: { apikey: SERVICE_ROLE as string, Authorization: `Bearer ${SERVICE_ROLE}` },
        signal: AbortSignal.timeout(8_000),
      }
    );
    const rows = (await response.json()) as { approved?: boolean }[];
    return Boolean(rows?.[0]?.approved);
  } catch {
    // Fail closed: an unreachable database must not hand out the shared key.
    return false;
  }
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

/**
 * Tried in order after the requested model, when it is overloaded, rate
 * limited, retired or silent. All on ALLOWED_MODELS and checked against the
 * live model list.
 */
const FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'];

/** Upstream answers worth trying another model for; anything else is final. */
const FALL_THROUGH = new Set([404, 429, 500, 502, 503, 504]);

/**
 * Server-side time budget per operation, kept just under the browser's own
 * deadline in src/lib/ai.ts so the browser hears a real answer, not an abort.
 */
const OPERATION_BUDGET_MS: Record<'scan-bill' | 'quick-add' | 'agent', number> = {
  'scan-bill': 40_000,
  'quick-add': 13_000,
  agent: 26_000,
};

// Bills are photographs; 25MB leaves room for an uncompressed capture.
app.use(express.json({ limit: '25mb' }));

app.get('/api/ai/health', (_req, res) => {
  res.json({
    keyConfigured: Boolean(API_KEY && API_KEY !== 'MY_GEMINI_API_KEY'),
    defaultModel: DEFAULT_MODEL,
    accounts: cloudReady,
    monthlyCap: AI_MONTHLY_CAP,
    // Lets the browser choose indexed search or its own keyword fallback.
    search: Boolean(searchConfig),
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
    if (!(await allowed(caller))) {
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

  // A single overloaded model used to fail the whole request (503s, or a hang
  // until the deadline). Fall through to the next model instead, inside a
  // budget that ends before the browser's own timeout for this operation.
  const chain = [chosenModel, ...FALLBACK_MODELS.filter((m) => m !== chosenModel)];
  const deadline = Date.now() + OPERATION_BUDGET_MS[operation];
  const payload = JSON.stringify(body);
  let last: { status: number; text: string } | null = null;

  for (let i = 0; i < chain.length; i++) {
    const remaining = deadline - Date.now();
    if (remaining < 1_000) break;
    // The first model gets most of the budget, so a slow-but-working call is
    // not cut short; the fallbacks share what is left.
    const slice = i === 0 ? remaining * 0.55 : remaining / (chain.length - i);

    try {
      const upstream = await fetch(`${GOOGLE_ENDPOINT}/${encodeURIComponent(chain[i])}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
        body: payload,
        signal: AbortSignal.timeout(Math.max(1_000, slice)),
      });
      const text = await upstream.text();
      if (!FALL_THROUGH.has(upstream.status)) {
        if (i > 0) console.warn(`Gemini ${chain[0]} unavailable; served by ${chain[i]}.`);
        res.status(upstream.status).set('X-Liquid-Model', chain[i]).type('application/json').send(text);
        return;
      }
      last = { status: upstream.status, text };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      last = {
        status: timedOut ? 504 : 502,
        text: JSON.stringify({
          error: timedOut ? 'Gemini did not answer in time.' : `Could not reach Gemini: ${(error as Error).message}`,
        }),
      };
    }
  }

  const failed = last ?? { status: 504, text: JSON.stringify({ error: 'Gemini did not answer in time.' }) };
  res.status(failed.status).type('application/json').send(failed.text);
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
  if (!(await allowed(caller))) {
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
  const signature = signCloudinary(params);

  res.json({ signature, timestamp, folder, publicId: receiptId, apiKey: CLOUDINARY_KEY });
});

/**
 * Removes one bill photo, so deleting a transaction does not leave its picture
 * in the archive forever.
 *
 * Ownership is settled here and nowhere else: the public id must sit inside
 * the caller's own folder, which the browser cannot talk its way around
 * because the folder name comes from the verified token.
 */
app.post('/api/uploads/destroy', async (req: Request, res: Response) => {
  if (!CLOUDINARY_KEY || !CLOUDINARY_SECRET || !CLOUDINARY_CLOUD) {
    res.status(503).json({ error: 'Cloudinary credentials are not set on the server.' });
    return;
  }

  const caller = await resolveCaller(req);
  if (!caller) {
    res.status(401).json({ error: 'Sign in to manage bill photos.' });
    return;
  }
  if (!(await allowed(caller))) {
    res.status(403).json({ error: 'This account is not on the allowlist yet.' });
    return;
  }

  const publicId = String((req.body ?? {}).publicId ?? '');
  const prefix = `liquid/${caller.id}/`;
  if (!publicId.startsWith(prefix) || !/^[a-zA-Z0-9/_-]+$/.test(publicId)) {
    res.status(403).json({ error: 'That bill does not belong to this account.' });
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const params = `public_id=${publicId}&timestamp=${timestamp}`;
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: CLOUDINARY_KEY,
    signature: signCloudinary(params),
  });

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/destroy`, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(15_000),
    });
    res.status(response.ok ? 200 : 502).json(await response.json());
  } catch {
    res.status(502).json({ error: 'Cloudinary could not be reached.' });
  }
});

/* ============================ LEDGER SEARCH ============================ */

/** Search lives in the account database, so it exists only when accounts do. */
const searchConfig: SearchConfig | null =
  cloudReady && ANON_KEY && API_KEY && API_KEY !== 'MY_GEMINI_API_KEY'
    ? { supabaseUrl: SUPABASE_URL as string, serviceRole: SERVICE_ROLE as string, anonKey: ANON_KEY, geminiKey: API_KEY }
    : null;

/** Signed-in, approved caller plus their raw token, or a response already sent. */
async function searchCaller(req: Request, res: Response): Promise<{ caller: Caller; token: string } | null> {
  if (!searchConfig) {
    res.status(503).json({ error: 'Ledger search needs accounts (Supabase) and a Gemini key on the server.' });
    return null;
  }
  const caller = await resolveCaller(req);
  if (!caller) {
    res.status(401).json({ error: 'Sign in to search your ledger.' });
    return null;
  }
  if (!(await allowed(caller))) {
    res.status(403).json({ error: 'This account is not on the allowlist yet.' });
    return null;
  }
  return { caller, token: (req.header('authorization') ?? '').slice(7).trim() };
}

/**
 * Brings the caller's search index in line with their rows. The browser only
 * says "something changed"; what gets indexed is read from the database.
 */
app.post('/api/search/reindex', async (req: Request, res: Response) => {
  const who = await searchCaller(req, res);
  if (!who) return;
  try {
    res.json(await reindex(searchConfig as SearchConfig, who.caller.id));
  } catch (error) {
    console.error('Reindex failed:', (error as Error).message);
    res.status(502).json({ error: 'Could not update the search index. It will retry on the next sync.' });
  }
});

/** Hybrid search over the caller's own index. */
app.post('/api/search', async (req: Request, res: Response) => {
  const who = await searchCaller(req, res);
  if (!who) return;

  const { query, kinds, dateFrom, dateTo, category, limit } = req.body ?? {};
  if (typeof query !== 'string' || !query.trim() || query.length > 300) {
    res.status(400).json({ error: 'A query of up to 300 characters is required.' });
    return;
  }
  try {
    const results = await search(searchConfig as SearchConfig, who.token, query.trim(), {
      kinds: Array.isArray(kinds) ? kinds.map(String) : undefined,
      dateFrom: typeof dateFrom === 'string' ? dateFrom : undefined,
      dateTo: typeof dateTo === 'string' ? dateTo : undefined,
      category: typeof category === 'string' ? category : undefined,
      limit: typeof limit === 'number' ? limit : undefined,
    });
    res.json({ results, embeddingModel: EMBEDDING_MODEL });
  } catch (error) {
    console.error('Search failed:', (error as Error).message);
    res.status(502).json({ error: 'Search is unavailable right now.' });
  }
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
