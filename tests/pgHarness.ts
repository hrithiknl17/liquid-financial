/**
 * An in-memory Postgres (PGlite, WebAssembly) with pgvector and just enough of
 * Supabase — auth.users, auth.uid(), the anon/authenticated roles — to run
 * supabase/migrations/005_ledger_search.sql unmodified.
 *
 * Shared by the SQL tests and the retrieval eval, so both exercise the real
 * migration rather than a re-implementation of it.
 */
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATION = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../supabase/migrations/005_ledger_search.sql');

export async function startDatabase(userIds: string[]) {
  const db = new PGlite({ extensions: { vector } });
  await db.exec(`
    create schema auth;
    create schema extensions;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon;
    create role authenticated;
    grant usage on schema public, auth, extensions to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  for (const id of userIds) await db.query('insert into auth.users values ($1)', [id]);
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'));
  // Supabase grants table privileges to these roles by default; RLS is what limits them.
  await db.exec('grant select, insert, update, delete on public.ledger_chunks to authenticated;');

  /** Runs one statement as a signed-in user, the way PostgREST does. */
  async function asUser<T = Record<string, unknown>>(userId: string, sql: string, params: unknown[] = []) {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
    try {
      return await db.query<T>(sql, params);
    } finally {
      await db.exec('reset role');
    }
  }

  return { db, asUser, migration: fs.readFileSync(MIGRATION, 'utf8') };
}

export const toVector = (values: number[]) => `[${values.join(',')}]`;
