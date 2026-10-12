/**
 * Ledger search: indexing and retrieval for Ask Liquid.
 *
 * Indexing is a reconcile, not an event stream. On each call the server reads
 * the account's rows from the database (never text sent by the browser),
 * rebuilds every chunk, and compares content hashes with what is indexed:
 * new or changed chunks are embedded and upserted, vanished ones deleted.
 * That makes it idempotent and self-healing — a missed sync, a second device
 * or a deleted bill all converge on the next run — and unchanged data costs
 * no embedding calls at all.
 *
 * Search runs in the database (search_ledger in migration 005) with the
 * caller's own token, so row-level security decides what is visible.
 */
import crypto from 'crypto';
import { buildChunks, keywordsOf, LedgerChunk } from '../src/lib/chunks.js';
import { rowToInv, rowToLoan, rowToSource, rowToSub, rowToTx } from '../src/lib/rowmap.js';
import type { Settings } from '../src/types.js';

const GOOGLE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
export const EMBEDDING_MODEL = (process.env.EMBEDDING_MODEL ?? 'gemini-embedding-001').trim();
const DIMENSIONS = 768;
/** batchEmbedContents accepts up to 100 texts per call. */
const EMBED_BATCH = 100;
const PAGE = 1000;

export interface SearchConfig {
  supabaseUrl: string;
  serviceRole: string;
  anonKey: string;
  geminiKey: string;
}

type TaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

/* ============================ EMBEDDINGS ============================ */

/** Unit-length, so cosine distance in the database behaves at 768 dims. */
function normalise(values: number[]): number[] {
  const norm = Math.hypot(...values) || 1;
  return values.map((v) => v / norm);
}

export async function embed(texts: string[], taskType: TaskType, geminiKey: string): Promise<number[][]> {
  const out: number[][] = [];
  for (let start = 0; start < texts.length; start += EMBED_BATCH) {
    const batch = texts.slice(start, start + EMBED_BATCH);
    const body = JSON.stringify({
      requests: batch.map((text) => ({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: DIMENSIONS,
      })),
    });

    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      response = await fetch(`${GOOGLE_ENDPOINT}/${EMBEDDING_MODEL}:batchEmbedContents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body,
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok || ![429, 500, 502, 503, 504].includes(response.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    if (!response || !response.ok) {
      throw new Error(`Embedding failed (${response?.status}): ${(await response?.text())?.slice(0, 200)}`);
    }
    const json = (await response.json()) as { embeddings: { values: number[] }[] };
    out.push(...json.embeddings.map((e) => normalise(e.values)));
  }
  return out;
}

const asVector = (values: number[]) => `[${values.join(',')}]`;

/* ============================ DATABASE ============================ */

function serviceHeaders(cfg: SearchConfig): Record<string, string> {
  return { apikey: cfg.serviceRole, Authorization: `Bearer ${cfg.serviceRole}`, 'Content-Type': 'application/json' };
}

/** Reads every row of one table for one account, a page at a time. */
async function readAll(cfg: SearchConfig, table: string, userId: string, select = '*'): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const url =
      `${cfg.supabaseUrl}/rest/v1/${table}?user_id=eq.${encodeURIComponent(userId)}` +
      `&select=${select}&order=${table === 'ledger_chunks' ? 'chunk_id' : 'id'}&limit=${PAGE}&offset=${offset}`;
    const response = await fetch(url, { headers: serviceHeaders(cfg), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Reading ${table} failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
    const page = (await response.json()) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function readCurrency(cfg: SearchConfig, userId: string): Promise<Settings['currency']> {
  const response = await fetch(`${cfg.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=settings`, {
    headers: serviceHeaders(cfg),
    signal: AbortSignal.timeout(10_000),
  });
  const rows = response.ok ? ((await response.json()) as { settings?: { currency?: string } }[]) : [];
  const currency = rows[0]?.settings?.currency;
  return currency === 'USD' || currency === 'EUR' || currency === 'GBP' ? currency : 'INR';
}

/** What gets hashed is what gets stored: text, filter fields, and the model that embedded it. */
export function chunkHash(chunk: LedgerChunk): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        EMBEDDING_MODEL,
        chunk.content,
        chunk.kind,
        chunk.sourceId,
        chunk.date ?? null,
        chunk.amount ?? null,
        chunk.category ?? null,
        chunk.merchant ?? null,
        chunk.metadata,
      ])
    )
    .digest('hex');
}

/* ============================ INDEXING ============================ */

export interface ReindexResult {
  chunks: number;
  embedded: number;
  deleted: number;
  ms: number;
}

/** Which chunks need embedding and which are gone, given what is already indexed. */
export function planReindex(chunks: LedgerChunk[], indexed: Map<string, string>) {
  const wanted = new Set(chunks.map((chunk) => chunk.chunkId));
  const changed = chunks
    .map((chunk) => ({ chunk, hash: chunkHash(chunk) }))
    .filter(({ chunk, hash }) => indexed.get(chunk.chunkId) !== hash);
  const stale = [...indexed.keys()].filter((id) => !wanted.has(id));
  return { changed, stale };
}

async function reconcile(cfg: SearchConfig, userId: string): Promise<ReindexResult> {
  const started = Date.now();

  const [txs, subs, invs, sources, loans, currency, indexed] = await Promise.all([
    readAll(cfg, 'transactions', userId),
    readAll(cfg, 'subscriptions', userId),
    readAll(cfg, 'investments', userId),
    readAll(cfg, 'income_sources', userId),
    readAll(cfg, 'loans', userId),
    readCurrency(cfg, userId),
    readAll(cfg, 'ledger_chunks', userId, 'chunk_id,content_hash'),
  ]);

  const chunks = buildChunks({
    transactions: txs.map(rowToTx),
    subscriptions: subs.map(rowToSub),
    investments: invs.map(rowToInv),
    incomeSources: sources.map(rowToSource),
    loans: loans.map(rowToLoan),
    currency,
  });

  const { changed, stale } = planReindex(
    chunks,
    new Map(indexed.map((row) => [String(row.chunk_id), String(row.content_hash)]))
  );

  if (changed.length > 0) {
    const vectors = await embed(
      changed.map(({ chunk }) => chunk.content),
      'RETRIEVAL_DOCUMENT',
      cfg.geminiKey
    );
    const rows = changed.map(({ chunk, hash }, i) => ({
      user_id: userId,
      chunk_id: chunk.chunkId,
      kind: chunk.kind,
      source_id: chunk.sourceId,
      content: chunk.content,
      entry_date: chunk.date ?? null,
      amount: chunk.amount ?? null,
      category: chunk.category ?? null,
      merchant: chunk.merchant ?? null,
      metadata: chunk.metadata,
      content_hash: hash,
      embedding: asVector(vectors[i]),
      updated_at: new Date().toISOString(),
    }));
    for (let start = 0; start < rows.length; start += 200) {
      const response = await fetch(`${cfg.supabaseUrl}/rest/v1/ledger_chunks`, {
        method: 'POST',
        headers: { ...serviceHeaders(cfg), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows.slice(start, start + 200)),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Writing the index failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
    }
  }

  for (let start = 0; start < stale.length; start += 100) {
    const ids = stale
      .slice(start, start + 100)
      .map((id) => `"${id.replace(/"/g, '')}"`)
      .join(',');
    const response = await fetch(
      `${cfg.supabaseUrl}/rest/v1/ledger_chunks?user_id=eq.${encodeURIComponent(userId)}&chunk_id=in.(${encodeURIComponent(ids)})`,
      { method: 'DELETE', headers: serviceHeaders(cfg), signal: AbortSignal.timeout(15_000) }
    );
    if (!response.ok) throw new Error(`Pruning the index failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
  }

  return { chunks: chunks.length, embedded: changed.length, deleted: stale.length, ms: Date.now() - started };
}

/**
 * One reconcile per account at a time. A request that arrives mid-run is
 * folded into a single follow-up run, so a burst of syncs costs at most two.
 */
const running = new Map<string, { promise: Promise<ReindexResult>; again: boolean }>();

export function reindex(cfg: SearchConfig, userId: string): Promise<ReindexResult> {
  const current = running.get(userId);
  if (current) {
    current.again = true;
    return current.promise;
  }
  const entry: { promise: Promise<ReindexResult>; again: boolean } = { again: false, promise: Promise.resolve(null as never) };
  entry.promise = (async () => {
    try {
      let result = await reconcile(cfg, userId);
      while (entry.again) {
        entry.again = false;
        result = await reconcile(cfg, userId);
      }
      return result;
    } finally {
      running.delete(userId);
    }
  })();
  running.set(userId, entry);
  return entry.promise;
}

/* ============================ SEARCH ============================ */

export interface SearchFilters {
  kinds?: string[];
  dateFrom?: string;
  dateTo?: string;
  category?: string;
  limit?: number;
}

export interface SearchHit {
  chunkId: string;
  kind: string;
  sourceId: string;
  content: string;
  date: string | null;
  amount: number | null;
  category: string | null;
  merchant: string | null;
  metadata: Record<string, unknown>;
  similarity: number | null;
  keywordRank: number | null;
  score: number;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = new Set(['transaction', 'line_item', 'vault_plan', 'holding', 'income_source', 'loan']);

export async function search(cfg: SearchConfig, userToken: string, query: string, filters: SearchFilters): Promise<SearchHit[]> {
  const [vector] = await embed([query], 'RETRIEVAL_QUERY', cfg.geminiKey);
  const kinds = (filters.kinds ?? []).filter((kind) => KINDS.has(kind));
  const response = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/search_ledger`, {
    method: 'POST',
    // The user's own token: the database, not this server, decides which rows are theirs.
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query_embedding: asVector(vector),
      keywords: keywordsOf(query),
      match_count: Math.min(Math.max(Math.round(filters.limit ?? 15), 1), 50),
      kinds: kinds.length ? kinds : null,
      date_from: filters.dateFrom && ISO.test(filters.dateFrom) ? filters.dateFrom : null,
      date_to: filters.dateTo && ISO.test(filters.dateTo) ? filters.dateTo : null,
      category_filter: filters.category || null,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Search failed (${response.status}): ${(await response.text()).slice(0, 200)}`);

  const rows = (await response.json()) as Record<string, unknown>[];
  return rows.map((row) => ({
    chunkId: String(row.chunk_id),
    kind: String(row.kind),
    sourceId: String(row.source_id),
    content: String(row.content),
    date: row.entry_date ? String(row.entry_date) : null,
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    category: row.category ? String(row.category) : null,
    merchant: row.merchant ? String(row.merchant) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    similarity: row.similarity === null ? null : Number(row.similarity),
    keywordRank: row.keyword_rank === null ? null : Number(row.keyword_rank),
    score: Number(row.score),
  }));
}
