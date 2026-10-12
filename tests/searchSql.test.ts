/**
 * The search migration, run for real (PGlite + pgvector): ranking, filters,
 * and above all who can see and write what.
 */
import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { startDatabase, toVector } from './pgHarness.ts';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const STRANGER = '33333333-3333-3333-3333-333333333333';

/** A unit vector along one axis (optionally tilted toward another), so similarity is predictable. */
const axis = (i: number, tilt?: number) => {
  const v = Array<number>(768).fill(0);
  v[i] = 1;
  if (tilt !== undefined) v[tilt] = 0.6;
  return toVector(v);
};

let env: Awaited<ReturnType<typeof startDatabase>>;

const search = (user: string, embedding: string, keywords: string[] | null, extra = '') =>
  env.asUser<{ chunk_id: string; similarity: number | null; keyword_rank: number | null }>(
    user,
    `select chunk_id, similarity, keyword_rank from public.search_ledger($1::extensions.vector, $2::text[], 10${extra})`,
    [embedding, keywords]
  );

before(async () => {
  env = await startDatabase([A, B]);
  const rows = [
    [A, 'item:t1:0', 'line_item', 't1', 'Milk 1L: 6 x ₹62 = ₹372, bought at Big Bazaar', '2026-10-06', -372, 'Groceries', 'Big Bazaar', axis(0)],
    [A, 'tx:t1', 'transaction', 't1', 'Spent ₹992 at Big Bazaar, category Groceries', '2026-10-06', -992, 'Groceries', 'Big Bazaar', axis(0, 1)],
    [A, 'tx:t2', 'transaction', 't2', 'Spent ₹430 at Swiggy, category Dining', '2026-09-12', -430, 'Dining', 'Swiggy', axis(2)],
    [B, 'item:x:0', 'line_item', 'x', 'Milk 1L: 2 x ₹99 = ₹198, bought at Secret Store', '2026-10-01', -198, 'Groceries', 'Secret Store', axis(0)],
  ];
  for (const row of rows) {
    await env.db.query(
      `insert into public.ledger_chunks (user_id, chunk_id, kind, source_id, content, entry_date, amount, category, merchant, content_hash, embedding)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'h', $10)`,
      row
    );
  }
});

describe('search_ledger', () => {
  it('can be re-run safely', async () => {
    await env.db.exec(env.migration);
  });

  it('ranks a chunk matching by meaning and by keyword first', async () => {
    const { rows } = await search(A, axis(0), ['where', 'did', 'buy', 'milk']);
    assert.equal(rows[0].chunk_id, 'item:t1:0');
    assert.ok(rows[0].similarity !== null && rows[0].keyword_rank !== null);
  });

  it('still finds an exact keyword with no semantic signal', async () => {
    const { rows } = await search(A, axis(5), ['swiggy']);
    assert.equal(rows[0].chunk_id, 'tx:t2');
  });

  it('applies kind and date filters before ranking', async () => {
    const { rows } = await search(A, axis(0), null, `, kinds => array['transaction'], date_from => '2026-10-01'`);
    assert.deepEqual(rows.map((r) => r.chunk_id), ['tx:t1']);
  });
});

describe('isolation (row-level security)', () => {
  it("never returns another account's chunks", async () => {
    const a = await search(A, axis(0), ['milk']);
    const b = await search(B, axis(0), ['milk']);
    assert.ok(!a.rows.some((r) => r.chunk_id === 'item:x:0'));
    assert.deepEqual(b.rows.map((r) => r.chunk_id), ['item:x:0']);
  });

  it('returns nothing to an account with no chunks', async () => {
    const { rows } = await search(STRANGER, axis(0), ['milk']);
    assert.equal(rows.length, 0);
  });

  it('refuses writes from a signed-in browser, even into its own index', async () => {
    await assert.rejects(
      env.asUser(A, `insert into public.ledger_chunks (user_id, chunk_id, kind, source_id, content, content_hash, embedding)
                     values ('${A}', 'tx:planted', 'transaction', 'p', 'planted text', 'h', '${axis(0)}')`),
      /row-level security/
    );
    const deleted = await env.asUser(A, `delete from public.ledger_chunks where user_id = '${A}'`);
    assert.equal(deleted.affectedRows, 0);
  });

  it("removes an account's index with the account", async () => {
    await env.db.query('delete from auth.users where id = $1', [A]);
    const { rows } = await env.db.query<{ n: number }>('select count(*)::int as n from public.ledger_chunks where user_id = $1', [A]);
    assert.equal(rows[0].n, 0);
  });
});
