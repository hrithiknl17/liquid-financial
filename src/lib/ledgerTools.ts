import { Transaction } from '../types';
import { ChunkKind, keywordsOf, LedgerChunk } from './chunks';

/**
 * The agent's read-only tools, as pure functions (the network half of search
 * lives in ledgerSearch.ts). They run automatically (nothing to confirm,
 * nothing changes) and split the work deliberately:
 *
 *  - searchLedger FINDS. Hybrid retrieval over the indexed ledger when the
 *    server offers it, keyword scoring over the same chunk text otherwise.
 *    It returns the best matches, never "all" matches.
 *  - summarizeSpending COUNTS. Exact arithmetic over every transaction in the
 *    browser, so a total can never be missing entries that fell below a
 *    search cutoff, and the model never adds numbers itself.
 */

export interface SearchArgs {
  query: string;
  kinds?: ChunkKind[];
  dateFrom?: string;
  dateTo?: string;
  category?: string;
  limit?: number;
}

export interface LedgerHit {
  chunkId: string;
  kind: string;
  sourceId: string;
  content: string;
  date?: string | null;
  amount?: number | null;
  category?: string | null;
  merchant?: string | null;
}

export interface SearchOutcome {
  /** Which path answered, so the UI and the eval can tell them apart. */
  mode: 'indexed' | 'keyword';
  hits: LedgerHit[];
}

const inRange = (date: string | undefined | null, from?: string, to?: string) =>
  (!from || (date ?? '') >= from) && (!to || (date ?? '') <= to);

/**
 * Offline search: IDF-weighted prefix matching of the question's content
 * words against chunk text. No network, no key — so local-only and demo users
 * still get a working lookup, just without matching by meaning.
 */
export function keywordSearch(chunks: LedgerChunk[], args: SearchArgs): LedgerHit[] {
  const terms = keywordsOf(args.query);
  if (terms.length === 0) return [];

  const scoped = chunks.filter(
    (chunk) =>
      (!args.kinds?.length || args.kinds.includes(chunk.kind)) &&
      inRange(chunk.date, args.dateFrom, args.dateTo) &&
      (!args.category || chunk.category?.toLowerCase() === args.category.toLowerCase())
  );
  const tokens = scoped.map((chunk) => chunk.content.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const tf = (words: string[], term: string) => words.filter((word) => word.startsWith(term)).length;
  const idf = terms.map((term) => {
    const df = tokens.filter((words) => tf(words, term) > 0).length;
    return df === 0 ? 0 : Math.log(1 + (scoped.length - df + 0.5) / (df + 0.5));
  });
  const avgLength = tokens.reduce((sum, words) => sum + words.length, 0) / Math.max(tokens.length, 1);

  // BM25 (k1 = 1.2, b = 0.75): a word in a short, focused chunk outranks the
  // same word in a long one, so "milk" lands on the bill line, not the whole
  // basket that happens to list it.
  const bm25 = (words: string[]) =>
    terms.reduce((sum, term, t) => {
      const f = tf(words, term);
      if (f === 0) return sum;
      return sum + (idf[t] * (f * 2.2)) / (f + 1.2 * (0.25 + (0.75 * words.length) / avgLength));
    }, 0);

  return scoped
    .map((chunk, i) => ({ chunk, score: bm25(tokens[i]) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || (b.chunk.date ?? '').localeCompare(a.chunk.date ?? ''))
    .slice(0, Math.min(Math.max(args.limit ?? 15, 1), 50))
    .map(({ chunk }) => ({
      chunkId: chunk.chunkId,
      kind: chunk.kind,
      sourceId: chunk.sourceId,
      content: chunk.content,
      date: chunk.date,
      amount: chunk.amount,
      category: chunk.category,
      merchant: chunk.merchant,
    }));
}

/* ============================ EXACT TOTALS ============================ */

export interface SummaryArgs {
  /** Matched case-insensitively, either way round: "swiggy" finds "Swiggy Instamart". */
  merchants?: string[];
  categories?: string[];
  /** A bill line item, e.g. "milk": switches to per-item price analysis. */
  item?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Money out (default) or money in. Transfers are never spending or income. */
  direction?: 'out' | 'in';
}

interface EntryRef {
  id: string;
  merchant: string;
  date: string;
  amount: number;
}

/** Whole paise, so sums are exact and 0.1 + 0.2 never shows up in an answer. */
const toPaise = (value: number) => Math.round(Math.abs(value) * 100);
const fromPaise = (paise: number) => paise / 100;

const norm = (s: string) => s.trim().toLowerCase();

function merchantMatches(merchant: string, wanted?: string[]): boolean {
  if (!wanted?.length) return true;
  const m = norm(merchant);
  return wanted.some((w) => {
    const target = norm(w);
    return target.length > 0 && (m.includes(target) || target.includes(m));
  });
}

export function summarizeSpending(transactions: Transaction[], args: SummaryArgs) {
  const categories = args.categories?.map(norm);
  const scoped = transactions.filter(
    (tx) =>
      inRange(tx.date, args.dateFrom, args.dateTo) &&
      merchantMatches(tx.merchant, args.merchants) &&
      (!categories?.length || categories.includes(norm(tx.category)))
  );

  if (args.item) return summarizeItem(scoped, args.item);

  const direction = args.direction ?? 'out';
  const matched = scoped.filter(
    (tx) => tx.type !== 'transfer' && (direction === 'out' ? tx.amount < 0 : tx.amount > 0)
  );
  if (matched.length === 0) return { count: 0, note: 'No entries match these filters.', filters: args };

  const total = matched.reduce((sum, tx) => sum + toPaise(tx.amount), 0);
  const byMerchant = new Map<string, { count: number; paise: number }>();
  const byMonth = new Map<string, number>();
  for (const tx of matched) {
    const entry = byMerchant.get(tx.merchant) ?? { count: 0, paise: 0 };
    entry.count += 1;
    entry.paise += toPaise(tx.amount);
    byMerchant.set(tx.merchant, entry);
    const month = tx.date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + toPaise(tx.amount));
  }
  const largest = matched.reduce((a, b) => (toPaise(b.amount) > toPaise(a.amount) ? b : a));
  const ref = (tx: Transaction): EntryRef => ({ id: tx.id, merchant: tx.merchant, date: tx.date, amount: tx.amount });

  return {
    count: matched.length,
    direction,
    total: fromPaise(total),
    average: fromPaise(Math.round(total / matched.length)),
    largest: ref(largest),
    firstDate: matched.reduce((a, b) => (b.date < a.date ? b : a)).date,
    lastDate: matched.reduce((a, b) => (b.date > a.date ? b : a)).date,
    byMerchant: [...byMerchant.entries()]
      .sort((a, b) => b[1].paise - a[1].paise)
      .slice(0, 8)
      .map(([merchant, v]) => ({ merchant, count: v.count, total: fromPaise(v.paise) })),
    byMonth: [...byMonth.entries()].sort().map(([month, paise]) => ({ month, total: fromPaise(paise) })),
    // Largest first: the entries an answer is most likely to want to cite.
    entries: [...matched].sort((a, b) => toPaise(b.amount) - toPaise(a.amount)).slice(0, 12).map(ref),
  };
}

function summarizeItem(transactions: Transaction[], item: string) {
  const wanted = norm(item);
  const rows: { name: string; qty: number; unitPrice: number; tx: Transaction }[] = [];
  for (const tx of transactions) {
    for (const line of tx.items ?? []) {
      if (norm(line.name).includes(wanted)) rows.push({ name: line.name, qty: line.qty, unitPrice: line.unitPrice, tx });
    }
  }
  if (rows.length === 0) return { purchases: 0, note: `No bill line items mention "${item}".` };

  const cheapest = rows.reduce((a, b) => (b.unitPrice < a.unitPrice ? b : a));
  const dearest = rows.reduce((a, b) => (b.unitPrice > a.unitPrice ? b : a));
  const latest = rows.reduce((a, b) => (b.tx.date > a.tx.date ? b : a));
  const line = (r: (typeof rows)[number]) => ({
    item: r.name,
    unitPrice: r.unitPrice,
    qty: r.qty,
    merchant: r.tx.merchant,
    date: r.tx.date,
    transactionId: r.tx.id,
  });

  const byStore = new Map<string, { purchases: number; qty: number; paise: number; minUnit: number }>();
  for (const r of rows) {
    const entry = byStore.get(r.tx.merchant) ?? { purchases: 0, qty: 0, paise: 0, minUnit: Infinity };
    entry.purchases += 1;
    entry.qty += r.qty;
    entry.paise += Math.round(r.qty * r.unitPrice * 100);
    entry.minUnit = Math.min(entry.minUnit, r.unitPrice);
    byStore.set(r.tx.merchant, entry);
  }
  const totalPaise = rows.reduce((sum, r) => sum + Math.round(r.qty * r.unitPrice * 100), 0);
  const totalQty = rows.reduce((sum, r) => sum + r.qty, 0);

  return {
    item,
    purchases: rows.length,
    totalQty,
    totalSpent: fromPaise(totalPaise),
    averageUnitPrice: fromPaise(Math.round(totalPaise / totalQty)),
    cheapest: line(cheapest),
    dearest: line(dearest),
    latest: line(latest),
    byStore: [...byStore.entries()].map(([merchant, v]) => ({
      merchant,
      purchases: v.purchases,
      qty: v.qty,
      averageUnitPrice: fromPaise(Math.round(v.paise / v.qty)),
      cheapestUnitPrice: v.minUnit,
    })),
  };
}
