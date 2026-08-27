-- Access by approval, replacing the signup block from 003.
--
-- 003 refused the signup outright, which rolls the transaction back — so there
-- was no way to record who had asked. Here signup succeeds, but an account
-- sees nothing and can call nothing until it is approved. The request is
-- captured for free: it is the profile row itself.
--
-- Run in the Supabase SQL editor. Safe to re-run.

-- 003 (deleted) blocked signups with a trigger; this drops it, so running
-- this file is safe whether or not that one was ever run.
drop trigger if exists on_auth_user_signup_allowlist on auth.users;
drop function if exists public.enforce_signup_allowlist();

create table if not exists public.allowed_emails (
  email text primary key,
  note text,
  -- Admins can approve other people; everyone else just has access.
  is_admin boolean not null default false,
  added_at timestamptz not null default now()
);

alter table public.allowed_emails enable row level security;
-- No policies: RLS with none means deny. Only the service role and the
-- security-definer functions below can touch this table.

alter table public.profiles add column if not exists approved boolean not null default false;
alter table public.profiles add column if not exists requested_at timestamptz not null default now();

insert into public.allowed_emails (email, note, is_admin)
values ('nlhrithik123@gmail.com', 'owner', true)
on conflict (email) do update set is_admin = true;

-- Anyone already in the project keeps their access.
update public.profiles set approved = true
where approved = false
  and lower(email) in (select lower(email) from public.allowed_emails);

/** True when the caller is an admin. Used by every function below. */
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.allowed_emails a
    join auth.users u on lower(u.email) = lower(a.email)
    where u.id = auth.uid() and a.is_admin
  );
$$;

/**
 * New accounts arrive pending unless their address was invited ahead of time.
 * Replaces the handle_new_user from schema.sql.
 */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, approved)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    exists (select 1 from public.allowed_emails where lower(email) = lower(new.email))
  )
  on conflict (id) do nothing;
  return new;
end $$;

/** Who is waiting. Admin-only; everyone else gets an empty set. */
create or replace function public.pending_accounts()
returns table (email text, display_name text, requested_at timestamptz)
language sql
stable
security definer set search_path = public
as $$
  select p.email, p.display_name, p.requested_at
  from public.profiles p
  where p.approved = false and public.is_admin()
  order by p.requested_at desc;
$$;

/** Everyone who currently has access, so it can be taken away again. */
create or replace function public.approved_accounts()
returns table (email text, is_admin boolean, added_at timestamptz)
language sql
stable
security definer set search_path = public
as $$
  select a.email, a.is_admin, a.added_at
  from public.allowed_emails a
  where public.is_admin()
  order by a.added_at desc;
$$;

/** Lets someone in. Adds them to the allowlist and flips their profile. */
create or replace function public.approve_account(target_email text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can approve accounts.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.allowed_emails (email, note)
  values (lower(target_email), 'approved from the app')
  on conflict (email) do nothing;

  update public.profiles set approved = true where lower(email) = lower(target_email);
end $$;

/** Takes access away. Their rows stay; they simply cannot get back in. */
create or replace function public.revoke_account(target_email text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can revoke access.' using errcode = 'insufficient_privilege';
  end if;

  -- An admin removing their own access would leave nobody able to approve.
  if exists (
    select 1 from public.allowed_emails
    where lower(email) = lower(target_email) and is_admin
  ) then
    raise exception 'Admins cannot be revoked from the app.';
  end if;

  delete from public.allowed_emails where lower(email) = lower(target_email);
  update public.profiles set approved = false where lower(email) = lower(target_email);
end $$;

revoke all on function public.pending_accounts() from public;
revoke all on function public.approved_accounts() from public;
revoke all on function public.approve_account(text) from public;
revoke all on function public.revoke_account(text) from public;
revoke all on function public.is_admin() from public;

grant execute on function public.pending_accounts() to authenticated;
grant execute on function public.approved_accounts() to authenticated;
grant execute on function public.approve_account(text) to authenticated;
grant execute on function public.revoke_account(text) to authenticated;
grant execute on function public.is_admin() to authenticated;
