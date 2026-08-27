-- Liquid — cloud schema.
--
-- Run this once in the Supabase SQL editor (Dashboard > SQL > New query).
-- Safe to re-run: every statement is guarded.
--
-- The shape mirrors src/types.ts, with one difference that matters: nothing
-- here stores a running total. `due.received` and `loan.repaid` are summed
-- from the transactions that point at them, so two devices that were offline
-- at the same time merge by appending rows instead of overwriting a number.

-- ============================ TABLES ============================

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  display_name text,
  -- Settings live as one row per person; the app treats them as a blob.
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id text not null,
  user_id uuid not null references auth.users on delete cascade,
  merchant text not null,
  category text not null,
  date date not null,
  amount numeric(14, 2) not null,
  icon_name text,
  note text,
  type text not null check (type in ('discretionary', 'fixed', 'income', 'transfer')),
  payment_method text,
  items jsonb,
  source_id text,
  receipt_id text,
  origin text,
  -- The links that replace stored counters.
  due_id text,
  loan_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.subscriptions (
  id text not null,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  plan text,
  category text,
  kind text not null check (kind in ('subscription', 'recharge')),
  cost numeric(14, 2) not null,
  billing_period text not null check (billing_period in ('mo', 'yr')),
  next_renewal date not null,
  cycle_start date not null,
  status text not null check (status in ('active', 'paused', 'cancelled')),
  image_url text,
  accent text,
  notes text,
  auto_log boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.investments (
  id text not null,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  symbol text,
  asset_class text not null,
  units numeric(20, 8) not null default 0,
  avg_cost numeric(14, 4) not null default 0,
  current_price numeric(14, 4) not null default 0,
  opened_date date not null,
  price_updated_at date not null,
  notes text,
  accent text,
  ipo jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.income_sources (
  id text not null,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  kind text not null,
  payer text,
  payer_contact text,
  amount numeric(14, 2) not null,
  frequency text not null check (frequency in ('mo', 'qtr', 'yr')),
  due_day smallint not null check (due_day between 1 and 31),
  start_date date not null,
  end_date date,
  status text not null check (status in ('active', 'ended')),
  deposit_held numeric(14, 2),
  notes text,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Periods are materialised so their ids stay stable across devices. `received`
-- is deliberately absent: it is summed from transactions.due_id.
create table if not exists public.income_dues (
  id text not null,
  user_id uuid not null references auth.users on delete cascade,
  source_id text not null,
  period_key text not null,
  due_date date not null,
  expected numeric(14, 2) not null,
  -- Authored only when a period is forgiven; everything else is derived.
  waived boolean not null default false,
  note text,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, source_id, period_key)
);

-- `repaid` is absent for the same reason: it is summed from transactions.loan_id.
create table if not exists public.loans (
  id text not null,
  user_id uuid not null references auth.users on delete cascade,
  person text not null,
  direction text not null check (direction in ('lent', 'borrowed')),
  principal numeric(14, 2) not null,
  date date not null,
  expected_back date,
  written_off boolean not null default false,
  note text,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.categories (
  id text not null,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  kind text not null check (kind in ('expense', 'income')),
  icon_name text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- One row per account per month, so the server can cap funded Gemini calls.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  month text not null,
  calls integer not null default 0,
  primary key (user_id, month)
);

-- ======================= ROW LEVEL SECURITY =======================
--
-- The whole isolation story is these policies: the database refuses to return
-- another account's rows, so a frontend bug cannot leak one person's rent to
-- another. Every table is owner-only, no exceptions, no shared rows.

alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.investments enable row level security;
alter table public.income_sources enable row level security;
alter table public.income_dues enable row level security;
alter table public.loans enable row level security;
alter table public.categories enable row level security;
alter table public.ai_usage enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'transactions', 'subscriptions', 'investments',
    'income_sources', 'income_dues', 'loans', 'categories'
  ] loop
    execute format($f$
      drop policy if exists "own rows" on public.%I;
      create policy "own rows" on public.%I
        for all
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id);
    $f$, t, t);
  end loop;
end $$;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Usage is readable by its owner but only the server (service role, which
-- bypasses RLS) may increment it, so nobody can reset their own counter.
drop policy if exists "read own usage" on public.ai_usage;
create policy "read own usage" on public.ai_usage
  for select using (auth.uid() = user_id);

-- ============================ INDEXES ============================

create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);
create index if not exists transactions_due_idx on public.transactions (user_id, due_id) where due_id is not null;
create index if not exists transactions_loan_idx on public.transactions (user_id, loan_id) where loan_id is not null;
create index if not exists dues_user_source_idx on public.income_dues (user_id, source_id);
create unique index if not exists categories_user_name_idx on public.categories (user_id, lower(name));

-- ======================== NEW ACCOUNTS ========================
--
-- A profile row appears the moment someone signs in with Google.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===================== DELETE MY ACCOUNT =====================
--
-- Every table cascades from auth.users, so removing the user removes the data.
-- Exposed as an RPC the signed-in person can call on themselves.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
