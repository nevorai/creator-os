-- local-setup.sql: a scratch Postgres that looks enough like Supabase to run the creator_os
-- migrations and the attack files. Never run on the live database.
--
--   createdb creator_test
--   psql creator_test -v ON_ERROR_STOP=1 -f supabase/checks/local-setup.sql
--   for f in supabase/migrations/00{04..14}*.sql; do psql creator_test -v ON_ERROR_STOP=1 -q -f "$f"; done
--   psql creator_test -v ON_ERROR_STOP=1 -q -f supabase/checks/0013_attack.sql   -- every line PASS
--   psql creator_test -v ON_ERROR_STOP=1 -q -f supabase/checks/0014_attack.sql   -- every line PASS
--
-- What it fakes: the three API roles, auth.users + auth.uid(), and pg_cron / pg_net (0004 and 0009
-- schedule jobs; here cron.schedule and net.http_post just return a number).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant anon, authenticated, service_role to current_user;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- pg_cron / pg_net stand-ins (the real extensions are not installable here).
create schema if not exists cron;
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint
  language sql as $$ select 1::bigint $$;
create or replace function cron.unschedule(job_name text) returns boolean language sql as $$ select true $$;
create schema if not exists net;
create or replace function net.http_post(url text, headers jsonb default '{}'::jsonb, body jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
  returns bigint language sql as $$ select 1::bigint $$;
-- "create extension if not exists pg_cron" must not fail: the migrations only need the schemas above.
create or replace function pg_temp.noop() returns void language sql as $$ select $$;

-- The owner account the migrations check for.
insert into auth.users (id, email) values ('32dc9eb8-4c68-47c0-8440-cdbcea9ca35c', 'teamnevorai@local.test')
on conflict do nothing;
