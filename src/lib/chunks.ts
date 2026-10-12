import { IncomeSource, Investment, Loan, Settings, Subscription, Transaction } from '../types';
import { money } from './format';

/**
 * Turns the ledger into short, self-describing text chunks for retrieval.
 *
 * One function, two users: the server embeds these into the search index, and
 * the browser's offline keyword search scores the very same text, so both
 * paths agree on what an entry "says".
 *
 * Each chunk spells out what a person would search by — merchant, item, month
 * name, category, how it was paid — and keeps the exact fields alongside, so
 * filters and totals never depend on parsing prose back out.
 */

export type ChunkKind = 'transaction' | 'line_item' | 'vault_plan' | 'holding' | 'income_source' | 'loan';

export interface LedgerChunk {
  /** Stable for the life of the source row: re-indexing replaces, never duplicates. */
  chunkId: string;
  kind: ChunkKind;
  /** Id of the record this came from, so an answer can cite and open it. */
  sourceId: string;
  content: string;
  date?: string;
  /** Signed like the ledger: negative is money out. */
  amount?: number;
  category?: string;
  merchant?: string;
  metadata: Record<string, string | number | boolean>;
}

export interface ChunkSource {
  transactions: Transaction[];
  subscriptions: Subscription[];
  investments: Investment[];
  incomeSources: IncomeSource[];
  loans: Loan[];
  currency: Settings['currency'];
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "6 October 2026" — month spelled out so "October" and "Oct" both find it. */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function transactionChunks(tx: Transaction, currency: Settings['currency']): LedgerChunk[] {
  const abs = money(Math.abs(tx.amount), currency);
  const verb =
    tx.type === 'transfer'
      ? tx.amount < 0 ? `Transferred out ${abs} to` : `Transferred in ${abs} from`
      : tx.amount < 0 ? `Spent ${abs} at` : `Received ${abs} from`;

  const parts = [`${verb} ${tx.merchant} on ${longDate(tx.date)}`, `category ${tx.category}`, tx.type];
  if (tx.paymentMethod) parts.push(`paid by ${tx.paymentMethod}`);
  if (tx.origin === 'scan') parts.push('scanned bill');
  let content = parts.join(', ') + '.';
  if (tx.note) content += ` Note: ${tx.note}.`;
  if (tx.items?.length) {
    content += ` Items: ${tx.items.map((item) => `${item.name} x${item.qty}`).join(', ')}.`;
  }

  const chunks: LedgerChunk[] = [
    {
      chunkId: `tx:${tx.id}`,
      kind: 'transaction',
      sourceId: tx.id,
      content,
      date: tx.date,
      amount: tx.amount,
      category: tx.category,
      merchant: tx.merchant,
      metadata: { type: tx.type, ...(tx.receiptId ? { hasBill: true } : {}) },
    },
  ];

  // A line item is its own chunk: "where did I buy milk cheapest" is a question
  // about one row on a bill, and a whole-basket chunk would bury it.
  tx.items?.forEach((item, index) => {
    const total = round2(item.qty * item.unitPrice);
    chunks.push({
      chunkId: `item:${tx.id}:${index}`,
      kind: 'line_item',
      sourceId: tx.id,
      content:
        `${item.name}: ${item.qty} x ${money(item.unitPrice, currency)} = ${money(total, currency)}, ` +
        `bought at ${tx.merchant} on ${longDate(tx.date)}, category ${tx.category}.`,
      date: tx.date,
      amount: -total,
      category: tx.category,
      merchant: tx.merchant,
      metadata: { item: item.name, qty: item.qty, unitPrice: item.unitPrice },
    });
  });

  return chunks;
}

function vaultChunk(sub: Subscription, currency: Settings['currency']): LedgerChunk {
  const what = sub.kind === 'recharge' ? 'Recharge or recurring bill' : 'Subscription';
  const period = sub.billingPeriod === 'yr' ? 'year' : 'month';
  let content =
    `${what}: ${sub.name}${sub.plan ? ` (${sub.plan})` : ''}, ${money(sub.cost, currency)} per ${period}, ` +
    `category ${sub.category || 'Uncategorised'}, ${sub.status}, next renewal ${longDate(sub.nextRenewal)}.`;
  if (sub.notes) content += ` Note: ${sub.notes}.`;
  return {
    chunkId: `sub:${sub.id}`,
    kind: 'vault_plan',
    sourceId: sub.id,
    content,
    date: sub.nextRenewal,
    amount: -sub.cost,
    category: sub.category,
    merchant: sub.name,
    metadata: { billingPeriod: sub.billingPeriod, status: sub.status, planKind: sub.kind },
  };
}

function holdingChunk(inv: Investment, currency: Settings['currency']): LedgerChunk {
  const value = round2(inv.units * inv.currentPrice);
  let content =
    `Investment: ${inv.name}${inv.symbol ? ` (${inv.symbol})` : ''}, ${inv.assetClass}, ${inv.units} units ` +
    `at average cost ${money(inv.avgCost, currency)}, current price ${money(inv.currentPrice, currency)}, ` +
    `worth ${money(value, currency)}, held since ${longDate(inv.openedDate)}.`;
  if (inv.ipo) content += ` IPO application, ${inv.ipo.status}.`;
  if (inv.notes) content += ` Note: ${inv.notes}.`;
  return {
    chunkId: `inv:${inv.id}`,
    kind: 'holding',
    sourceId: inv.id,
    content,
    date: inv.openedDate,
    amount: value,
    category: inv.assetClass,
    merchant: inv.name,
    metadata: { units: inv.units, avgCost: inv.avgCost, currentPrice: inv.currentPrice },
  };
}

function incomeSourceChunk(src: IncomeSource, currency: Settings['currency']): LedgerChunk {
  const per = src.frequency === 'yr' ? 'year' : src.frequency === 'qtr' ? 'quarter' : 'month';
  let content =
    `Income source: ${src.name} (${src.kind})${src.payer ? `, paid by ${src.payer}` : ''}, ` +
    `${money(src.amount, currency)} per ${per}, due on day ${src.dueDay}, ${src.status}, since ${longDate(src.startDate)}.`;
  if (src.notes) content += ` Note: ${src.notes}.`;
  return {
    chunkId: `src:${src.id}`,
    kind: 'income_source',
    sourceId: src.id,
    content,
    date: src.startDate,
    amount: src.amount,
    category: src.kind,
    merchant: src.payer ?? src.name,
    metadata: { frequency: src.frequency, dueDay: src.dueDay, status: src.status },
  };
}

function loanChunk(loan: Loan, currency: Settings['currency']): LedgerChunk {
  const how = loan.direction === 'lent' ? `Lent ${money(loan.principal, currency)} to` : `Borrowed ${money(loan.principal, currency)} from`;
  let content = `${how} ${loan.person} on ${longDate(loan.date)}`;
  if (loan.expectedBack) content += `, expected back ${longDate(loan.expectedBack)}`;
  if (loan.status === 'written-off') content += ', written off';
  content += '.';
  if (loan.note) content += ` Note: ${loan.note}.`;
  return {
    chunkId: `loan:${loan.id}`,
    kind: 'loan',
    sourceId: loan.id,
    content,
    date: loan.date,
    amount: loan.direction === 'lent' ? -loan.principal : loan.principal,
    merchant: loan.person,
    metadata: { direction: loan.direction },
  };
}

const STOPWORDS = new Set(
  'a an and are at be bought buy by did do does for from get got how i in is it me much my of on or paid pay spend spent the this to was what when where which who why with you your'.split(' ')
);

/** Content words of a question, for the keyword half of search. */
export function keywordsOf(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    ),
  ].slice(0, 12);
}

export function buildChunks(source: ChunkSource): LedgerChunk[] {
  const { currency } = source;
  return [
    ...source.transactions.flatMap((tx) => transactionChunks(tx, currency)),
    ...source.subscriptions.map((sub) => vaultChunk(sub, currency)),
    ...source.investments.map((inv) => holdingChunk(inv, currency)),
    ...source.incomeSources.map((src) => incomeSourceChunk(src, currency)),
    ...source.loans.map((loan) => loanChunk(loan, currency)),
  ];
}
