-- 0012_owner_only_access.sql
--
-- Security fix, 2026-09-29. Creator OS lives in the shared Nevorai OS project
-- (wxgfaaaboftzsazknbvl), where other apps' people can log in too: AdsPro and
-- Meta review accounts today, Academy OS students and coaches next. Until now
-- every creator_os policy was "to authenticated using (true)", so ANY of those
-- logins could read, change or delete all Creator OS data, including the
-- Anthropic and Gemini keys in app_settings.
--
-- After this runs, only accounts listed in creator_os.owners (Adarsh,
-- teamnevorai, 32dc9eb8-4c68-47c0-8440-cdbcea9ca35c) can touch any row.
-- Edge functions use the service_role key and are unaffected; they check
-- creator_os.is_owner() themselves (supabase/functions/_shared/owner.ts).
--
-- Run once, in full, in the Nevorai OS SQL Editor. It is one transaction:
-- if anything fails, nothing changes.

begin;

-- Refuse to run (and change nothing) if the owner account is missing, so this
-- can never lock Adarsh out of his own data.
do $$
begin
  if not exists (select 1 from auth.users where id = '32dc9eb8-4c68-47c0-8440-cdbcea9ca35c') then
    raise exception 'Owner account 32dc9eb8-4c68-47c0-8440-cdbcea9ca35c is not in auth.users. Nothing was changed.';
  end if;
end $$;

-- Who may use Creator OS. No policies and no grants: only is_owner() (and the
-- service_role) can read it, and nobody can add themselves through the API.
create table if not exists creator_os.owners (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table creator_os.owners enable row level security;
revoke all on table creator_os.owners from public, anon, authenticated;
grant all on table creator_os.owners to service_role;

insert into creator_os.owners (user_id)
values ('32dc9eb8-4c68-47c0-8440-cdbcea9ca35c')
on conflict do nothing;

create or replace function creator_os.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from creator_os.owners where user_id = (select auth.uid()));
$$;
revoke all on function creator_os.is_owner() from public, anon;
grant execute on function creator_os.is_owner() to authenticated;

-- Every creator_os table: drop whatever policies it has (policies are OR'd, so
-- one leftover "using (true)" would undo the fix) and give it a single
-- owner-only policy. "(select ...)" makes Postgres check once per query, not
-- once per row.
do $$
declare
  t record;
  p record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'creator_os' and c.relkind in ('r', 'p') and c.relname <> 'owners'
  loop
    for p in select policyname from pg_policies where schemaname = 'creator_os' and tablename = t.relname loop
      execute format('drop policy %I on creator_os.%I', p.policyname, t.relname);
    end loop;
    execute format('alter table creator_os.%I enable row level security', t.relname);
    execute format(
      'create policy %I on creator_os.%I for all to authenticated '
      'using ((select creator_os.is_owner())) with check ((select creator_os.is_owner()))',
      t.relname || '_owner_all', t.relname
    );
    execute format('revoke all on table creator_os.%I from anon', t.relname);
  end loop;
end $$;

-- Last guard before commit: no creator_os policy may be anything but owner-only.
do $$
declare
  bad text;
begin
  select string_agg(tablename || '.' || policyname, ', ') into bad
  from pg_policies
  where schemaname = 'creator_os'
    and (policyname not like '%\_owner\_all' or qual not like '%is_owner()%' or with_check not like '%is_owner()%');
  if bad is not null then
    raise exception 'Policies still not owner-only: %. Nothing was changed.', bad;
  end if;
end $$;

commit;
