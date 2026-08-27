-- Closes signup to an allowlist.
--
-- ALLOWED_EMAILS in the server environment only gates the API endpoints; the
-- sign-in itself is handled by Supabase, which knows nothing about it. Without
-- this, anyone with a Google account can create one here — harmless to your
-- data thanks to row level security, but it leaves other people's financial
-- records sitting in your project.
--
-- Run in the Supabase SQL editor. Safe to re-run.

create table if not exists public.allowed_emails (
  email text primary key,
  note text,
  added_at timestamptz not null default now()
);

-- Nobody but the service role may read or change this list. No policies are
-- created, and RLS with no policy means "deny", which is what we want.
alter table public.allowed_emails enable row level security;

-- Put yourself on it first, or the next line locks you out of your own project.
insert into public.allowed_emails (email, note)
values ('nlhrithik123@gmail.com', 'owner')
on conflict (email) do nothing;

/**
 * Refuses accounts for addresses that are not on the list.
 *
 * An empty list allows everyone, deliberately: a table that has not been
 * filled in yet should not silently lock the owner out of their own project.
 */
create or replace function public.enforce_signup_allowlist()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (select count(*) from public.allowed_emails) = 0 then
    return new;
  end if;

  if exists (select 1 from public.allowed_emails where lower(email) = lower(new.email)) then
    return new;
  end if;

  raise exception 'This address is not invited to Liquid yet.'
    using errcode = 'insufficient_privilege';
end $$;

drop trigger if exists on_auth_user_signup_allowlist on auth.users;
create trigger on_auth_user_signup_allowlist
  before insert on auth.users
  for each row execute function public.enforce_signup_allowlist();

-- To invite someone later:
--   insert into public.allowed_emails (email, note) values ('friend@gmail.com', 'beta');
-- To open signup to everyone, empty the table:
--   delete from public.allowed_emails;
