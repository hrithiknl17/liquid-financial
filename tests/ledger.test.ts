/**
 * Ledger search and exact totals.
 *
 * Run: npm test
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { buildDemoData } from '../src/data/initialData.ts';
import { buildChunks, keywordsOf, longDate } from '../src/lib/chunks.ts';
import { keywordSearch, summarizeSpending } from '../src/lib/ledgerTools.ts';
import { chunkHash, planReindex } from '../server/search.ts';
import type { Transaction } from '../src/types.ts';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: over.id ?? `t${Math.random().toString(36).slice(2, 8)}`,
  merchant: 'Big Bazaar',
  category: 'Groceries',
  date: '2026-10-06',
  amount: -100,
  iconName: 'shopping_basket',
  type: 'discretionary',
  ...over,
});

const ledger = (transactions: Transaction[]) => ({
  transactions,
  subscriptions: [],
  investments: [],
  incomeSources: [],
  loans: [],
  currency: 'INR' as const,
});

describe('chunks', () => {
  it('gives every bill line its own chunk, pointing back at the transaction', () => {
    const chunks = buildChunks(
      ledger([
        tx({
          id: 'bill1',
          amount: -992,
          items: [
            { id: 'a', name: 'Milk 1L', qty: 6, unitPrice: 62 },
            { id: 'b', name: 'Bananas 1 dozen', qty: 1, unitPrice: 60 },
          ],
        }),
      ])
    );
    assert.deepEqual(
      chunks.map((c) => c.chunkId),
      ['tx:bill1', 'item:bill1:0', 'item:bill1:1']
    );
    const milk = chunks[1];
    assert.equal(milk.kind, 'line_item');
    assert.equal(milk.sourceId, 'bill1');
    assert.equal(milk.amount, -372);
    assert.match(milk.content, /Milk 1L: 6 x ₹62\.00 = ₹372\.00, bought at Big Bazaar on 6 October 2026/);
  });

  it('spells out the month so "October" questions match', () => {
    assert.equal(longDate('2026-03-09'), '9 March 2026');
  });

  it('never describes a transfer as spending', () => {
    const [chunk] = buildChunks(ledger([tx({ merchant: 'Ravi', amount: -5000, type: 'transfer', category: 'Other' })]));
    assert.match(chunk.content, /^Transferred out ₹5,000\.00 to Ravi/);
  });

  it('keeps only content words in a question', () => {
    assert.deepEqual(keywordsOf('Where did I buy milk in March?'), ['milk', 'march']);
  });
});

describe('keyword search (offline fallback)', () => {
  const data = buildDemoData();
  const chunks = buildChunks({ ...data, incomeSources: [], loans: [], currency: 'INR' });

  it('finds bill line items by product name', () => {
    const hits = keywordSearch(chunks, { query: 'where did I buy milk', limit: 5 });
    assert.ok(hits.length > 0);
    assert.equal(hits[0].kind, 'line_item');
    assert.match(hits[0].content, /^Milk/);
  });

  it('applies kind and date filters exactly', () => {
    const hits = keywordSearch(chunks, { query: 'milk', kinds: ['transaction'], dateFrom: '2999-01-01' });
    assert.equal(hits.length, 0);
  });

  it('returns nothing for a question with no content words', () => {
    assert.deepEqual(keywordSearch(chunks, { query: 'where did I' }), []);
  });
});

describe('summarizeSpending (exact totals)', () => {
  it('matches a hand-computed total over the whole demo ledger', () => {
    const { transactions } = buildDemoData();
    const expected =
      transactions
        .filter((t) => t.category === 'Groceries' && t.amount < 0 && t.type !== 'transfer')
        .reduce((sum, t) => sum + Math.round(-t.amount * 100), 0) / 100;
    const result = summarizeSpending(transactions, { categories: ['groceries'] });
    assert.ok('total' in result);
    assert.equal(result.total, expected);
  });

  it('sums in paise, so 0.1 + 0.2 is 0.3', () => {
    const result = summarizeSpending([tx({ amount: -0.1 }), tx({ amount: -0.2 })], {});
    assert.ok('total' in result);
    assert.equal(result.total, 0.3);
  });

  it('never counts transfers as spending, and splits money in from money out', () => {
    const rows = [tx({ amount: -500 }), tx({ amount: -5000, type: 'transfer' }), tx({ amount: 2000, type: 'income' })];
    const out = summarizeSpending(rows, {});
    const income = summarizeSpending(rows, { direction: 'in' });
    assert.ok('total' in out && 'total' in income);
    assert.equal(out.total, 500);
    assert.equal(income.total, 2000);
  });

  it('matches merchants loosely and filters dates inclusively', () => {
    const rows = [
      tx({ merchant: 'Swiggy Instamart', date: '2026-03-01', amount: -300 }),
      tx({ merchant: 'swiggy', date: '2026-03-31', amount: -200 }),
      tx({ merchant: 'Swiggy', date: '2026-04-01', amount: -999 }),
      tx({ merchant: 'Zomato', date: '2026-03-15', amount: -400 }),
    ];
    const result = summarizeSpending(rows, { merchants: ['SWIGGY'], dateFrom: '2026-03-01', dateTo: '2026-03-31' });
    assert.ok('total' in result);
    assert.equal(result.count, 2);
    assert.equal(result.total, 500);
  });

  it('finds the cheapest unit price for an item across every bill', () => {
    const rows = [
      tx({ id: 'a', merchant: 'Big Bazaar', date: '2026-08-02', items: [{ id: '1', name: 'Milk 1L', qty: 8, unitPrice: 58 }] }),
      tx({ id: 'b', merchant: 'DMart', date: '2026-09-02', items: [{ id: '2', name: 'Amul Milk 1L', qty: 4, unitPrice: 56 }] }),
      tx({ id: 'c', merchant: 'Big Bazaar', date: '2026-10-02', items: [{ id: '3', name: 'Milk 1L', qty: 12, unitPrice: 62 }] }),
    ];
    const result = summarizeSpending(rows, { item: 'milk' });
    assert.ok('cheapest' in result);
    assert.equal(result.purchases, 3);
    assert.deepEqual([result.cheapest.merchant, result.cheapest.unitPrice, result.cheapest.transactionId], ['DMart', 56, 'b']);
    assert.equal(result.latest.unitPrice, 62);
    assert.equal(result.totalSpent, 8 * 58 + 4 * 56 + 12 * 62);
  });

  it('says so when nothing matches, rather than returning zero as an answer', () => {
    const result = summarizeSpending([tx({})], { merchants: ['Nowhere'] });
    assert.ok('count' in result && 'note' in result);
    assert.equal(result.count, 0);
  });
});

describe('reindex planning', () => {
  const chunks = buildChunks(ledger([tx({ id: 'keep' }), tx({ id: 'edit', amount: -50 })]));
  const indexed = new Map(chunks.map((c) => [c.chunkId, chunkHash(c)]));

  it('does nothing when nothing changed', () => {
    const plan = planReindex(chunks, indexed);
    assert.equal(plan.changed.length, 0);
    assert.equal(plan.stale.length, 0);
  });

  it('re-embeds only what changed and prunes what was deleted', () => {
    const next = buildChunks(ledger([tx({ id: 'edit', amount: -75 }), tx({ id: 'new' })]));
    const plan = planReindex(next, indexed);
    assert.deepEqual(plan.changed.map((c) => c.chunk.chunkId).sort(), ['tx:edit', 'tx:new']);
    assert.deepEqual(plan.stale, ['tx:keep']);
  });
});
