/**
 * Retrieval eval for ledger search.
 *
 * Indexes the demo ledger with real Gemini embeddings into the real migration
 * (PGlite + pgvector), then asks 34 labelled questions three ways:
 *
 *   keyword  the offline fallback (BM25 over chunk text, in the browser)
 *   vector   search_ledger with embeddings only
 *   hybrid   search_ledger with embeddings + keywords (what the app uses)
 *
 * Questions come in three kinds: sharing words with the answer ("milk"),
 * paraphrases sharing none ("food delivery" → Swiggy, Zomato), and exact
 * identifiers (tickers, amounts, plan codes). Reports
 * Hit@1, Recall@5 and MRR, and writes eval/RESULTS.md.
 *
 * Run: npm run eval   (needs GEMINI_API_KEY; embeddings are cached in eval/.cache)
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoData } from '../src/data/initialData.ts';
import { buildChunks, keywordsOf, LedgerChunk } from '../src/lib/chunks.ts';
import { keywordSearch } from '../src/lib/ledgerTools.ts';
import { embed, EMBEDDING_MODEL } from '../server/search.ts';
import { startDatabase, toVector } from '../tests/pgHarness.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '.cache', 'embeddings.json');
const USER = '11111111-1111-1111-1111-111111111111';
const K = 5;

type Pred = (c: LedgerChunk) => boolean;
const merchant = (re: RegExp): Pred => (c) => re.test(c.merchant ?? '');
const item = (re: RegExp): Pred => (c) => c.kind === 'line_item' && re.test(String(c.metadata.item ?? ''));
const plan = (re: RegExp): Pred => (c) => c.kind === 'vault_plan' && re.test(c.merchant ?? '');
const holding = (re: RegExp): Pred => (c) => c.kind === 'holding' && re.test(c.merchant ?? '');

const QUESTIONS: { q: string; type: 'lexical' | 'paraphrase' | 'exact'; relevant: Pred }[] = [
  { q: 'where did I buy milk', type: 'lexical', relevant: item(/milk/i) },
  { q: 'Swiggy order', type: 'lexical', relevant: merchant(/swiggy/i) },
  { q: 'Cult Fit payments', type: 'lexical', relevant: merchant(/cult fit/i) },
  { q: 'Netflix plan', type: 'lexical', relevant: plan(/netflix/i) },
  { q: 'Infosys shares', type: 'lexical', relevant: holding(/infosys/i) },
  { q: 'rice', type: 'lexical', relevant: item(/rice/i) },
  { q: 'eggs', type: 'lexical', relevant: item(/eggs/i) },
  { q: 'Zomato', type: 'lexical', relevant: merchant(/zomato/i) },
  { q: 'cooking oil', type: 'lexical', relevant: item(/cooking oil/i) },
  { q: 'Amazon purchase', type: 'lexical', relevant: merchant(/amazon/i) },
  { q: 'Blue Tokai', type: 'lexical', relevant: merchant(/blue tokai/i) },
  { q: 'electricity bill', type: 'lexical', relevant: merchant(/electricity/i) },
  { q: 'Bitcoin', type: 'lexical', relevant: holding(/bitcoin/i) },
  { q: 'YouTube Premium', type: 'lexical', relevant: plan(/youtube/i) },
  { q: 'food delivery', type: 'paraphrase', relevant: merchant(/swiggy|zomato/i) },
  { q: 'internet connection at home', type: 'paraphrase', relevant: plan(/airtel/i) },
  { q: 'gym membership', type: 'paraphrase', relevant: merchant(/cult fit/i) },
  { q: 'café', type: 'paraphrase', relevant: merchant(/blue tokai/i) },
  { q: 'music streaming', type: 'paraphrase', relevant: plan(/spotify/i) },
  { q: 'TV channels', type: 'paraphrase', relevant: plan(/tata play/i) },
  { q: 'cab ride', type: 'paraphrase', relevant: merchant(/uber/i) },
  { q: 'power bill', type: 'paraphrase', relevant: merchant(/electricity/i) },
  { q: 'paying the landlord', type: 'paraphrase', relevant: merchant(/house rent/i) },
  { q: 'paycheck', type: 'paraphrase', relevant: merchant(/salary/i) },
  { q: 'cryptocurrency', type: 'paraphrase', relevant: holding(/bitcoin/i) },
  { q: 'dairy', type: 'paraphrase', relevant: item(/milk/i) },
  { q: 'photo backup', type: 'paraphrase', relevant: plan(/google one/i) },
  { q: 'client work income', type: 'paraphrase', relevant: merchant(/freelance/i) },
  // Exact identifiers: tickers, amounts, plan codes. Embeddings tend to blur these.
  { q: 'INFY', type: 'exact', relevant: holding(/infosys/i) },
  { q: 'HDFCBANK', type: 'exact', relevant: holding(/hdfc/i) },
  { q: 'PPFCF', type: 'exact', relevant: holding(/parag parikh/i) },
  { q: '3599', type: 'exact', relevant: (c) => /3,599/.test(c.content) },
  { q: '2GB/day', type: 'exact', relevant: (c) => /2GB\/day/i.test(c.content) },
  { q: '200 Mbps', type: 'exact', relevant: plan(/airtel/i) },
];

/* ------------------------------ embeddings, cached ------------------------------ */

const cache: Record<string, number[]> = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const cacheKey = (task: string, text: string) =>
  crypto.createHash('sha256').update(`${EMBEDDING_MODEL}|${task}|${text}`).digest('hex');

async function embedCached(texts: string[], task: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<number[][]> {
  const key = process.env.GEMINI_API_KEY?.trim();
  const missing = [...new Set(texts.filter((t) => !cache[cacheKey(task, t)]))];
  if (missing.length > 0) {
    if (!key) throw new Error('GEMINI_API_KEY is needed to embed uncached text.');
    const vectors = await embed(missing, task, key);
    missing.forEach((t, i) => (cache[cacheKey(task, t)] = vectors[i]));
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify(cache));
  }
  return texts.map((t) => cache[cacheKey(task, t)]);
}

/* ------------------------------ metrics ------------------------------ */

function score(ranked: string[], relevant: Set<string>) {
  const firstHit = ranked.findIndex((id) => relevant.has(id));
  const inTopK = ranked.slice(0, K).filter((id) => relevant.has(id)).length;
  return {
    hit1: firstHit === 0 ? 1 : 0,
    recall: inTopK / Math.min(relevant.size, K),
    rr: firstHit === -1 ? 0 : 1 / (firstHit + 1),
  };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

async function main() {
  const data = buildDemoData();
  const chunks = buildChunks({ ...data, incomeSources: [], loans: [], currency: 'INR' });
  const docVectors = await embedCached(chunks.map((c) => c.content), 'RETRIEVAL_DOCUMENT');

  const { db, asUser } = await startDatabase([USER]);
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    await db.query(
      `insert into public.ledger_chunks (user_id, chunk_id, kind, source_id, content, entry_date, amount, category, merchant, metadata, content_hash, embedding)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'eval', $11)`,
      [USER, c.chunkId, c.kind, c.sourceId, c.content, c.date ?? null, c.amount ?? null, c.category ?? null, c.merchant ?? null, c.metadata, toVector(docVectors[i])]
    );
  }

  const queryVectors = await embedCached(QUESTIONS.map((x) => x.q), 'RETRIEVAL_QUERY');
  /** No weight given: whatever the migration ships as its default. */
  const sql = (vector: number[], keywords: string[] | null, weight?: number) =>
    asUser<{ chunk_id: string }>(
      USER,
      weight === undefined
        ? 'select chunk_id from public.search_ledger($1::extensions.vector, $2::text[], 10)'
        : 'select chunk_id from public.search_ledger($1::extensions.vector, $2::text[], 10, keyword_weight => $3)',
      weight === undefined ? [toVector(vector), keywords] : [toVector(vector), keywords, weight]
    ).then((r) => r.rows.map((row) => row.chunk_id));

  // hybrid uses the migration's default keyword weight; the others show the trade-off it was tuned on.
  const modes = ['keyword', 'vector', 'hybrid', 'hybrid@0.5', 'hybrid@1.0'] as const;
  const rows: { q: string; type: string; scores: Record<string, ReturnType<typeof score>>; top: string }[] = [];

  for (let i = 0; i < QUESTIONS.length; i++) {
    const { q, type, relevant: pred } = QUESTIONS[i];
    const relevant = new Set(chunks.filter(pred).map((c) => c.chunkId));
    if (relevant.size === 0) throw new Error(`No relevant chunks for "${q}" — fix the label.`);
    const ranked = {
      keyword: keywordSearch(chunks, { query: q, limit: 10 }).map((h) => h.chunkId),
      vector: await sql(queryVectors[i], null),
      hybrid: await sql(queryVectors[i], keywordsOf(q)),
      'hybrid@0.5': await sql(queryVectors[i], keywordsOf(q), 0.5),
      'hybrid@1.0': await sql(queryVectors[i], keywordsOf(q), 1.0),
    };
    const top = chunks.find((c) => c.chunkId === ranked.hybrid[0])?.content.slice(0, 70) ?? '(nothing)';
    rows.push({ q, type, scores: Object.fromEntries(modes.map((m) => [m, score(ranked[m], relevant)])), top });
  }

  const summary = (subset: typeof rows) =>
    modes.map((m) => ({
      mode: m,
      hit1: mean(subset.map((r) => r.scores[m].hit1)),
      recall: mean(subset.map((r) => r.scores[m].recall)),
      mrr: mean(subset.map((r) => r.scores[m].rr)),
    }));

  const groups = {
    all: rows,
    lexical: rows.filter((r) => r.type === 'lexical'),
    paraphrase: rows.filter((r) => r.type === 'paraphrase'),
    exact: rows.filter((r) => r.type === 'exact'),
  };
  const lines: string[] = [];
  lines.push('# Ledger search — retrieval eval', '');
  lines.push(
    `Demo ledger: ${chunks.length} chunks. ${QUESTIONS.length} labelled questions (${groups.lexical.length} share words with the answer, ${groups.paraphrase.length} are paraphrases, ${groups.exact.length} are exact identifiers). ` +
      `Embeddings: \`${EMBEDDING_MODEL}\`, 768-d. Searched through the real \`search_ledger\` SQL (PGlite + pgvector). Generated by \`npm run eval\`.`,
    ''
  );
  for (const [name, subset] of Object.entries(groups)) {
    lines.push(`## ${name} (${subset.length})`, '', '| Mode | Hit@1 | Recall@5 | MRR |', '|---|---|---|---|');
    for (const s of summary(subset)) lines.push(`| ${s.mode} | ${pct(s.hit1)} | ${pct(s.recall)} | ${s.mrr.toFixed(2)} |`);
    lines.push('');
  }
  lines.push('## Per question', '', '| Question | Type | Keyword R@5 | Vector R@5 | Hybrid R@5 | Hybrid #1 |', '|---|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(`| ${r.q} | ${r.type} | ${pct(r.scores.keyword.recall)} | ${pct(r.scores.vector.recall)} | ${pct(r.scores.hybrid.recall)} | ${r.top.replace(/\|/g, '/')} |`);
  }
  fs.writeFileSync(path.join(HERE, 'RESULTS.md'), lines.join('\n') + '\n');

  for (const [name, subset] of Object.entries(groups)) {
    console.log(`\n${name} (${subset.length})`);
    console.table(summary(subset).map((s) => ({ mode: s.mode, 'Hit@1': pct(s.hit1), 'Recall@5': pct(s.recall), MRR: s.mrr.toFixed(2) })));
  }
  const misses = rows.filter((r) => r.scores.hybrid.recall < 1);
  if (misses.length) console.log('\nHybrid misses:', misses.map((r) => `${r.q} (R@5 ${pct(r.scores.hybrid.recall)})`).join('; '));
  console.log('\nWrote eval/RESULTS.md');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
