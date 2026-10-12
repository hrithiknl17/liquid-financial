-- Ledger search: the retrieval index behind Ask Liquid.
--
-- Every transaction, bill line item, Vault plan, holding, income source and
-- loan becomes one short text chunk with a 768-d Gemini embedding. Search is
-- hybrid: vector similarity (meaning — "food delivery" finds Swiggy) fused
-- with full-text match (exact words — a merchant name, "Milk 1L") by
-- reciprocal rank fusion.
--
-- Who can read what is enforced here, not in the server:
--   - Chunks are readable only by their owner (RLS on auth.uid()).
--   - search_ledger() runs as the caller (security invoker), so the server
--     calls it with the user's own token and the database scopes the rows.
--   - Nobody writes chunks except the server's indexer (service role), which
--     derives them from the user's rows in the tables above. A browser cannot
--     plant text into anyone's index, including its own.
--
-- Run in the Supabase SQL editor after schema.sql. Safe to re-run.

create extension if not exists vector with schema extensions;

create table if not exists public.ledger_chunks (
  user_id uuid not null references auth.users on delete cascade,
  -- Stable per source: 'tx:<id>', 'item:<tx id>:<n>', 'sub:<id>', ...
  chunk_id text not null,
  kind text not null check (kind in ('transaction', 'line_item', 'vault_plan', 'holding', 'income_source', 'loan')),
  -- The row this chunk was derived from, so an answer can cite and open it.
  source_id text not null,
  content text not null,
  -- Structured copies of the fields people filter on, so filters are exact
  -- rather than left to similarity.
  entry_date date,
  amount numeric(14, 2),
  category text,
  merchant text,
  metadata jsonb not null default '{}'::jsonb,
  -- sha256 of content + embedding model. The indexer re-embeds a chunk only
  -- when this changes, so a re-sync of unchanged data costs nothing.
  content_hash text not null,
  embedding extensions.vector(768) not null,
  fts tsvector generated always as (to_tsvector('simple', content)) stored,
  updated_at timestamptz not null default now(),
  primary key (user_id, chunk_id)
);

alter table public.ledger_chunks enable row level security;

drop policy if exists "read own chunks" on public.ledger_chunks;
create policy "read own chunks" on public.ledger_chunks
  for select using (auth.uid() = user_id);
-- No insert/update/delete policies: with RLS on, that means deny. Only the
-- service role (which bypasses RLS) writes, from the server's indexer.

create index if not exists ledger_chunks_fts_idx on public.ledger_chunks using gin (fts);
create index if not exists ledger_chunks_user_kind_date_idx on public.ledger_chunks (user_id, kind, entry_date);

-- Deliberately no HNSW/IVFFlat index on `embedding`. Every search is scoped to
-- one account, and an approximate index ranks the whole table first and
-- filters afterwards, so a user among many would get fewer (or zero) results.
-- An exact scan of one account's rows, reached through the primary key, is
-- correct and takes milliseconds at personal-ledger sizes (thousands of
-- chunks). Past ~100k chunks per account, add an HNSW index and turn on
-- pgvector >= 0.8 iterative scans.

/**
 * Hybrid search over the caller's own chunks.
 *
 * query_embedding  the question, embedded with task type RETRIEVAL_QUERY
 * keywords         the question's content words; matched as prefixes, OR-ed
 * keyword_weight   how much an exact-word match counts next to meaning
 *                  (1 = equal). 0.25 came out best in eval/search-eval.ts:
 *                  equal weight let generic words ("bill") outrank meaning.
 * filters          optional, applied before ranking so they are exact
 *
 * Returns at most match_count rows (capped at 50), best first, with both
 * component scores so the caller can see why something matched.
 */
create or replace function public.search_ledger(
  query_embedding extensions.vector(768),
  keywords text[] default null,
  match_count int default 20,
  kinds text[] default null,
  date_from date default null,
  date_to date default null,
  category_filter text default null,
  keyword_weight double precision default 0.25
)
returns table (
  chunk_id text,
  kind text,
  source_id text,
  content text,
  entry_date date,
  amount numeric,
  category text,
  merchant text,
  metadata jsonb,
  similarity double precision,
  keyword_rank double precision,
  score double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with scoped as (
    select c.*
    from public.ledger_chunks c
    where c.user_id = auth.uid()
      and (kinds is null or c.kind = any (kinds))
      and (date_from is null or c.entry_date >= date_from)
      and (date_to is null or c.entry_date <= date_to)
      and (category_filter is null or lower(c.category) = lower(category_filter))
  ),
  query as (
    select to_tsquery('simple', string_agg(term || ':*', ' | ')) as q
    from (
      select distinct regexp_replace(lower(w), '[^[:alnum:]]', '', 'g') as term
      from unnest(coalesce(keywords, array[]::text[])) as w
    ) t
    where length(term) > 1
  ),
  semantic as (
    select s.chunk_id,
           1 - (s.embedding <=> query_embedding) as similarity,
           row_number() over (order by s.embedding <=> query_embedding) as rnk
    from scoped s
    order by s.embedding <=> query_embedding
    limit 50
  ),
  keyword as (
    select s.chunk_id,
           ts_rank_cd(s.fts, query.q) as krank,
           row_number() over (order by ts_rank_cd(s.fts, query.q) desc) as rnk
    from scoped s, query
    where query.q is not null and s.fts @@ query.q
    order by krank desc
    limit 50
  ),
  -- Weighted reciprocal rank fusion (k = 60): robust to the two scores living
  -- on different scales, and a hit in both lists outranks a hit in one.
  fused as (
    select coalesce(se.chunk_id, kw.chunk_id) as chunk_id,
           coalesce(1.0 / (60 + se.rnk), 0) + coalesce(keyword_weight / (60 + kw.rnk), 0) as score,
           se.similarity,
           kw.krank
    from semantic se
    full outer join keyword kw on kw.chunk_id = se.chunk_id
  )
  select s.chunk_id, s.kind, s.source_id, s.content, s.entry_date, s.amount, s.category,
         s.merchant, s.metadata, f.similarity, f.krank, f.score
  from fused f
  join scoped s on s.chunk_id = f.chunk_id
  order by f.score desc
  limit least(greatest(match_count, 1), 50);
$$;

revoke all on function public.search_ledger(extensions.vector, text[], int, text[], date, date, text, double precision) from public, anon;
grant execute on function public.search_ledger(extensions.vector, text[], int, text[], date, date, text, double precision) to authenticated;
