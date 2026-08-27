-- Adds the table behind custom categories.
--
-- Run this in the Supabase SQL editor after the initial schema.sql.
-- Safe to re-run.

create table if not exists public.categories (
  id text not null,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  kind text not null check (kind in ('expense', 'income')),
  icon_name text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.categories enable row level security;

drop policy if exists "own rows" on public.categories;
create policy "own rows" on public.categories
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Two categories with the same name would produce duplicate entries in every
-- picker, so the database refuses them rather than trusting the UI to.
create unique index if not exists categories_user_name_idx
  on public.categories (user_id, lower(name));
