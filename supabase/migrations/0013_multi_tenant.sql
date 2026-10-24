-- 0013_multi_tenant.sql
--
-- Nevorai Creator, slice 1 (2026-10-24): Creator OS becomes multi-tenant.
-- One codebase, one database; every row belongs to a tenant (a creator) and every
-- policy is scoped by tenant_id and by the caller's role in that tenant.
--
-- What it does
--   1. tenants, tenant_profile, tenant_members (owner | editor | viewer), tenant_secrets,
--      platform_settings, ai_usage, brand_chat, kaizen_events.
--   2. Adds tenant_id to the 14 existing tables, gives everything that exists today to
--      tenant #1 (Adarsh, slug "adarsh", billed by hand, never by Kaizen).
--   3. Replaces the 14 owner-only policies with tenant policies (read = any member,
--      write = owner or editor of an ACTIVE tenant).
--   4. Plan limits are enforced in the database (watchlist, sources, seats).
--   5. kaizen_tenant_feed() and kaizen_pulse(): the two read-only doors for Kaizen.
--
-- Safe for the live app: the old screens keep working for Adarsh without a code change,
-- because tenant_id defaults to the caller's active tenant and the singleton tables
-- (brand_brain, app_settings) keep their "id = 1" column (one row per tenant now).
--
-- Run once, in full, in the Nevorai OS SQL Editor. One transaction: if anything fails,
-- nothing changes. Run BEFORE deploying the new edge functions.

begin;

do $$
begin
  if not exists (select 1 from auth.users where id = '32dc9eb8-4c68-47c0-8440-cdbcea9ca35c') then
    raise exception 'Owner account is missing from auth.users. Nothing was changed.';
  end if;
end $$;

-- ── Core tables ─────────────────────────────────────────────────────────────

create table if not exists creator_os.tenants (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique
                         check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'
                                and slug not in ('www','app','api','admin','billing','dash','creator','login','auth','mail','static','assets','media','status')),
  name                   text not null check (length(name) between 1 and 120),
  custom_domain          text unique check (custom_domain is null or custom_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  -- active = everything works; suspended = billing paused (read-only); ended = cancelled (read-only).
  status                 text not null default 'active' check (status in ('active','suspended','ended')),
  suspended_by           text check (suspended_by in ('billing','nevorai')),
  plan_key               text not null default 'none',
  limits                 jsonb not null default '{}'::jsonb check (pg_column_size(limits) < 2048),
  billing_source         text not null default 'kaizen' check (billing_source in ('kaizen','manual')),
  kaizen_subscription_id text unique,
  trial_ends_at          timestamptz,
  created_at             timestamptz not null default now()
);

create table if not exists creator_os.tenant_profile (
  tenant_id     uuid primary key references creator_os.tenants(id) on delete cascade,
  display_name  text,
  niche         text,
  handle        text,
  language      text check (language in ('english','hindi','hinglish')),
  about         text,
  onboarded_at  timestamptz,
  updated_at    timestamptz not null default now()
);

create table if not exists creator_os.tenant_members (
  tenant_id uuid not null references creator_os.tenants(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null check (role in ('owner','editor','viewer')),
  added_at  timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index if not exists tenant_members_user_idx on creator_os.tenant_members (user_id);

-- Keys never reach the browser: no policies, no grants. Edge functions (service_role) only.
create table if not exists creator_os.tenant_secrets (
  tenant_id         uuid primary key references creator_os.tenants(id) on delete cascade,
  anthropic_api_key text,
  gemini_api_key    text,
  updated_at        timestamptz not null default now()
);

create table if not exists creator_os.platform_settings (
  id                 smallint primary key default 1 check (id = 1),
  anthropic_api_key  text,
  gemini_api_key     text,
  template_tenant_id uuid references creator_os.tenants(id),
  updated_at         timestamptz not null default now()
);
insert into creator_os.platform_settings (id) values (1) on conflict do nothing;

-- One row per tenant per month: how many AI calls it used. Caps come from tenants.limits.
create table if not exists creator_os.ai_usage (
  tenant_id uuid not null references creator_os.tenants(id) on delete cascade,
  month     date not null,
  credits   integer not null default 0,
  primary key (tenant_id, month)
);

-- The brand-training conversation: the creator pastes transcripts and answers questions.
create table if not exists creator_os.brand_chat (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references creator_os.tenants(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null check (length(content) between 1 and 40000),
  created_at timestamptz not null default now()
);
create index if not exists brand_chat_tenant_idx on creator_os.brand_chat (tenant_id, created_at);

-- Every Kaizen call, once per (subscription, action, minute-bucket dedupe key).
create table if not exists creator_os.kaizen_events (
  id                     bigserial primary key,
  kaizen_subscription_id text,
  action                 text not null,
  tenant_id              uuid,
  ok                     boolean not null,
  code                   text,
  at                     timestamptz not null default now()
);

-- ── Tenant #1: Adarsh ───────────────────────────────────────────────────────

insert into creator_os.tenants (slug, name, custom_domain, status, plan_key, limits, billing_source)
values ('adarsh', 'Adarsh Chaturvedi', 'creator.nevorai.com', 'active', 'founder',
        '{"watchlist":100,"sources":50,"seats":5,"ai_credits":100000}', 'manual')
on conflict (slug) do nothing;

insert into creator_os.tenant_profile (tenant_id, display_name, niche, language, onboarded_at)
select id, 'Adarsh Chaturvedi', 'Politics, current affairs, reservation', 'hinglish', now()
from creator_os.tenants where slug = 'adarsh'
on conflict do nothing;

insert into creator_os.tenant_members (tenant_id, user_id, role)
select id, '32dc9eb8-4c68-47c0-8440-cdbcea9ca35c', 'owner' from creator_os.tenants where slug = 'adarsh'
on conflict do nothing;

-- His AI keys move out of app_settings (readable by every member) into tenant_secrets.
insert into creator_os.tenant_secrets (tenant_id, anthropic_api_key, gemini_api_key)
select t.id, a.anthropic_api_key, a.gemini_api_key
from creator_os.tenants t, creator_os.app_settings a
where t.slug = 'adarsh'
on conflict (tenant_id) do nothing;

update creator_os.platform_settings
set template_tenant_id = (select id from creator_os.tenants where slug = 'adarsh')
where id = 1 and template_tenant_id is null;

-- ── Helpers (security definer, so RLS on the tables they read cannot loop) ──

-- The tenant the caller is working in. The browser sends x-tenant-id; it only counts if the
-- caller is a member. With no header, a caller who belongs to exactly one tenant gets that one.
create or replace function creator_os.active_tenant()
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  hdr text;
  t uuid;
  n int;
begin
  begin
    hdr := (current_setting('request.headers', true)::json ->> 'x-tenant-id');
  exception when others then
    hdr := null;
  end;
  if hdr ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select m.tenant_id into t from creator_os.tenant_members m
    where m.user_id = (select auth.uid()) and m.tenant_id = hdr::uuid;
    return t;
  end if;
  select count(*), (array_agg(m.tenant_id))[1] into n, t
  from creator_os.tenant_members m where m.user_id = (select auth.uid());
  if n = 1 then return t; end if;
  return null;
end;
$$;

-- May the caller change data in tenant t? Owner or editor, and the tenant must be active.
create or replace function creator_os.can_write(t uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from creator_os.tenant_members m
    join creator_os.tenants x on x.id = m.tenant_id
    where m.tenant_id = t and m.user_id = (select auth.uid())
      and m.role in ('owner','editor') and x.status = 'active'
  );
$$;

create or replace function creator_os.is_tenant_owner(t uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from creator_os.tenant_members m
    join creator_os.tenants x on x.id = m.tenant_id
    where m.tenant_id = t and m.user_id = (select auth.uid()) and m.role = 'owner' and x.status = 'active'
  );
$$;

create or replace function creator_os.my_tenant_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select tenant_id from creator_os.tenant_members where user_id = (select auth.uid());
$$;

revoke all on function creator_os.active_tenant(), creator_os.can_write(uuid),
  creator_os.is_tenant_owner(uuid), creator_os.my_tenant_ids() from public, anon;
grant execute on function creator_os.active_tenant(), creator_os.can_write(uuid),
  creator_os.is_tenant_owner(uuid), creator_os.my_tenant_ids() to authenticated, service_role;

-- A signed-out visitor's one door: "which creator is this web address?" Returns the public
-- face only (name, slug, id). The id alone gives no access: membership is still checked.
create or replace function creator_os.tenant_by_host(h text)
returns table (id uuid, slug text, name text)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.slug, t.name from creator_os.tenants t
  where t.status <> 'ended'
    and (t.custom_domain = lower(h)
         or (lower(h) like '%.creator.nevorai.com' and t.slug = split_part(lower(h), '.', 1)))
  limit 1;
$$;
revoke all on function creator_os.tenant_by_host(text) from public;
grant execute on function creator_os.tenant_by_host(text) to anon, authenticated, service_role;
grant usage on schema creator_os to anon;

-- Spend one AI credit for tenant t this month. Returns false (and spends nothing) when the cap is reached.
create or replace function creator_os.use_ai_credit(t uuid, n integer default 1)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  cap integer;
  m date := date_trunc('month', now())::date;
  used integer;
begin
  select coalesce((limits ->> 'ai_credits')::integer, 300) into cap from creator_os.tenants where id = t;
  if cap is null then return false; end if;
  insert into creator_os.ai_usage (tenant_id, month, credits) values (t, m, 0) on conflict do nothing;
  update creator_os.ai_usage set credits = credits + n
  where tenant_id = t and month = m and credits + n <= cap
  returning credits into used;
  return used is not null;
end;
$$;
revoke all on function creator_os.use_ai_credit(uuid, integer) from public, anon, authenticated;
grant execute on function creator_os.use_ai_credit(uuid, integer) to service_role;

-- Plan limits live in the database, so no client can skip them.
create or replace function creator_os.enforce_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  key text := tg_argv[0];
  dflt integer := tg_argv[1]::integer;
  cap integer;
  have integer;
begin
  select coalesce((limits ->> key)::integer, dflt) into cap from creator_os.tenants where id = new.tenant_id;
  execute format('select count(*) from %I.%I where tenant_id = $1', tg_table_schema, tg_table_name)
    into have using new.tenant_id;
  if have >= coalesce(cap, dflt) then
    raise exception 'Plan limit reached: % allows % %.', 'this plan', coalesce(cap, dflt), key
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- The team list with emails (auth.users is not readable by the browser). Members of the active workspace only.
create or replace function creator_os.team_list()
returns table (user_id uuid, email text, role text, added_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.user_id, u.email::text, m.role, m.added_at
  from creator_os.tenant_members m join auth.users u on u.id = m.user_id
  where m.tenant_id = (select creator_os.active_tenant())
  order by m.added_at;
$$;
revoke all on function creator_os.team_list() from public, anon;
grant execute on function creator_os.team_list() to authenticated, service_role;

-- Find a login by email (for provisioning and adding team members). Service role only.
create or replace function creator_os.user_id_by_email(e text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(e) limit 1;
$$;
revoke all on function creator_os.user_id_by_email(text) from public, anon, authenticated;
grant execute on function creator_os.user_id_by_email(text) to service_role;

-- Seed a new tenant: the staff rows from the template tenant (prompts stay empty so the
-- shared, niche-neutral prompts in the edge functions apply), an empty Brand Brain and settings row.
create or replace function creator_os.seed_tenant(t uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare tmpl uuid;
begin
  select template_tenant_id into tmpl from creator_os.platform_settings where id = 1;
  insert into creator_os.brand_brain (tenant_id, id) values (t, 1) on conflict do nothing;
  insert into creator_os.app_settings (tenant_id, id) values (t, 1) on conflict do nothing;
  if tmpl is not null then
    insert into creator_os.employees (tenant_id, code, name, desk, prompt, provider, model, schedule, enabled)
    select t, e.code, e.name, e.desk, null, e.provider, e.model, e.schedule, e.enabled
    from creator_os.employees e where e.tenant_id = tmpl
    on conflict do nothing;
  end if;
end;
$$;
revoke all on function creator_os.seed_tenant(uuid) from public, anon, authenticated;
grant execute on function creator_os.seed_tenant(uuid) to service_role;

-- ── tenant_id on the 14 existing tables ─────────────────────────────────────

do $$
declare
  t record;
  p record;
  c record;
  adarsh uuid := (select id from creator_os.tenants where slug = 'adarsh');
  tbls text[] := array['reels','watchlist_accounts','sources','brand_brain','employees','app_settings',
    'news_stories','watchlist_posts','studio_sessions','formats','reel_formats','ideas',
    'manager_messages','manager_proposals'];
  nm text;
begin
  foreach nm in array tbls loop
    execute format('alter table creator_os.%I add column if not exists tenant_id uuid references creator_os.tenants(id) on delete cascade', nm);
    execute format('update creator_os.%I set tenant_id = $1 where tenant_id is null', nm) using adarsh;
    execute format('alter table creator_os.%I alter column tenant_id set not null', nm);
    execute format('alter table creator_os.%I alter column tenant_id set default creator_os.active_tenant()', nm);
    execute format('create index if not exists %I on creator_os.%I (tenant_id)', nm || '_tenant_idx', nm);
    -- old owner-only policies go; new ones follow below
    for p in select policyname from pg_policies where schemaname = 'creator_os' and tablename = nm loop
      execute format('drop policy %I on creator_os.%I', p.policyname, nm);
    end loop;
  end loop;

  -- Unique-per-whole-database becomes unique-per-tenant.
  for c in
    select con.conname, rel.relname, att.attname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = con.conkey[1]
    where n.nspname = 'creator_os' and con.contype = 'u' and array_length(con.conkey, 1) = 1
      and rel.relname in ('employees','watchlist_accounts','formats','news_stories','watchlist_posts')
  loop
    execute format('alter table creator_os.%I drop constraint %I', c.relname, c.conname);
    execute format('alter table creator_os.%I add constraint %I unique (tenant_id, %I)', c.relname, c.relname || '_tenant_' || c.attname || '_key', c.attname);
  end loop;
end $$;

-- Singletons: one row per tenant, the old id = 1 column stays so existing code keeps working.
alter table creator_os.brand_brain drop constraint if exists brand_brain_pkey;
alter table creator_os.brand_brain drop constraint if exists brand_brain_id_check;
alter table creator_os.brand_brain add primary key (tenant_id);
alter table creator_os.app_settings drop constraint if exists app_settings_pkey;
alter table creator_os.app_settings drop constraint if exists app_settings_id_check;
alter table creator_os.app_settings add primary key (tenant_id);

-- Keys leave app_settings for good (the set/not-set flags stay for the Settings screen).
alter table creator_os.app_settings drop column if exists anthropic_api_key;
alter table creator_os.app_settings drop column if exists gemini_api_key;

-- ── Policies ────────────────────────────────────────────────────────────────

do $$
declare nm text;
begin
  foreach nm in array array['reels','watchlist_accounts','sources','brand_brain','employees','app_settings',
    'news_stories','watchlist_posts','studio_sessions','formats','reel_formats','ideas',
    'manager_messages','manager_proposals'] loop
    execute format('alter table creator_os.%I enable row level security', nm);
    execute format('create policy %I on creator_os.%I for select to authenticated using (tenant_id = (select creator_os.active_tenant()))', nm || '_t_read', nm);
    execute format('create policy %I on creator_os.%I for insert to authenticated with check (tenant_id = (select creator_os.active_tenant()) and (select creator_os.can_write(tenant_id)))', nm || '_t_ins', nm);
    execute format('create policy %I on creator_os.%I for update to authenticated using (tenant_id = (select creator_os.active_tenant()) and (select creator_os.can_write(tenant_id))) with check (tenant_id = (select creator_os.active_tenant()) and (select creator_os.can_write(tenant_id)))', nm || '_t_upd', nm);
    execute format('create policy %I on creator_os.%I for delete to authenticated using (tenant_id = (select creator_os.active_tenant()) and (select creator_os.can_write(tenant_id)))', nm || '_t_del', nm);
    execute format('revoke all on table creator_os.%I from anon', nm);
  end loop;
end $$;

-- tenants: members see their own tenants, only safe columns, never write.
alter table creator_os.tenants enable row level security;
create policy tenants_member_read on creator_os.tenants for select to authenticated
  using (id in (select creator_os.my_tenant_ids()));
revoke all on table creator_os.tenants from anon, authenticated;
grant select (id, slug, name, custom_domain, status, plan_key, limits, trial_ends_at, created_at)
  on creator_os.tenants to authenticated;
grant all on creator_os.tenants to service_role;

-- tenant_profile: members read, owners edit.
alter table creator_os.tenant_profile enable row level security;
create policy tenant_profile_read on creator_os.tenant_profile for select to authenticated
  using (tenant_id in (select creator_os.my_tenant_ids()));
create policy tenant_profile_upd on creator_os.tenant_profile for update to authenticated
  using ((select creator_os.is_tenant_owner(tenant_id))) with check ((select creator_os.is_tenant_owner(tenant_id)));
revoke all on table creator_os.tenant_profile from anon, authenticated;
grant select on creator_os.tenant_profile to authenticated;
grant update (display_name, niche, handle, language, about, updated_at) on creator_os.tenant_profile to authenticated;
grant all on creator_os.tenant_profile to service_role;

-- tenant_members: members see their team. Adding/removing goes through the tenant-admin function.
alter table creator_os.tenant_members enable row level security;
create policy tenant_members_read on creator_os.tenant_members for select to authenticated
  using (tenant_id in (select creator_os.my_tenant_ids()));
revoke all on table creator_os.tenant_members from anon, authenticated;
grant select on creator_os.tenant_members to authenticated;
grant all on creator_os.tenant_members to service_role;

-- ai_usage and brand_chat
alter table creator_os.ai_usage enable row level security;
create policy ai_usage_read on creator_os.ai_usage for select to authenticated
  using (tenant_id in (select creator_os.my_tenant_ids()));
revoke all on table creator_os.ai_usage from anon, authenticated;
grant select on creator_os.ai_usage to authenticated;
grant all on creator_os.ai_usage to service_role;

alter table creator_os.brand_chat enable row level security;
create policy brand_chat_read on creator_os.brand_chat for select to authenticated
  using (tenant_id = (select creator_os.active_tenant()));
revoke all on table creator_os.brand_chat from anon, authenticated;
grant select on creator_os.brand_chat to authenticated;
grant all on creator_os.brand_chat to service_role;

-- Service-only tables: RLS on, no policy, no grant to the browser roles.
alter table creator_os.tenant_secrets enable row level security;
alter table creator_os.platform_settings enable row level security;
alter table creator_os.kaizen_events enable row level security;
revoke all on table creator_os.tenant_secrets, creator_os.platform_settings, creator_os.kaizen_events from anon, authenticated;
grant all on creator_os.tenant_secrets, creator_os.platform_settings, creator_os.kaizen_events to service_role;
grant usage, select on all sequences in schema creator_os to service_role;

-- Limits (defaults apply when a plan does not say).
create trigger watchlist_accounts_limit before insert on creator_os.watchlist_accounts
  for each row execute function creator_os.enforce_limit('watchlist', '10');
create trigger sources_limit before insert on creator_os.sources
  for each row execute function creator_os.enforce_limit('sources', '10');
create trigger tenant_members_limit before insert on creator_os.tenant_members
  for each row execute function creator_os.enforce_limit('seats', '1');

-- Platform admin (creator_os.owners, i.e. Adarsh) is unchanged and is not a content door:
-- he reads a creator's content only if he is a member of that tenant.

-- ── Kaizen's two read-only doors ────────────────────────────────────────────

create or replace function creator_os.kaizen_tenant_feed()
returns jsonb
language sql stable security definer set search_path = creator_os, auth, pg_temp
as $$
  select jsonb_build_object(
    'v', 1,
    'app', 'creator',
    'tenants', coalesce((
      select jsonb_agg(row order by created desc) from (
        select t.created_at as created, jsonb_build_object(
          'ref', t.id::text,
          'slug', t.slug,
          'name', t.name,
          'owner_name', p.display_name,
          'owner_email', (select u.email from tenant_members m join auth.users u on u.id = m.user_id
                          where m.tenant_id = t.id and m.role = 'owner' order by m.added_at limit 1),
          'owner_phone', null,
          'url', case when t.custom_domain is not null then 'https://' || t.custom_domain
                      else 'https://' || t.slug || '.creator.nevorai.com' end,
          'status', case t.status when 'active' then 'active' when 'suspended' then 'paused' else 'ended' end,
          'kind', 'creator',
          'created_at', t.created_at
        ) as row
        from tenants t left join tenant_profile p on p.tenant_id = t.id
        order by t.created_at desc limit 1000
      ) s
    ), '[]'::jsonb)
  );
$$;

-- Saved-things signals: drafts the creators saved, and stories the nightly job stored.
create or replace function creator_os.kaizen_pulse()
returns jsonb
language sql stable security definer set search_path = creator_os, pg_temp
as $$
  select jsonb_build_object('v', 1, 'app', 'creator', 'signals', jsonb_build_array(
    jsonb_build_object('key', 'studio_sessions',
      'last_at', (select max(created_at) from studio_sessions),
      'n_24h', (select count(*) from studio_sessions where created_at > now() - interval '24 hours'),
      'n_prev_7d', (select count(*) from studio_sessions where created_at <= now() - interval '24 hours' and created_at > now() - interval '8 days')),
    jsonb_build_object('key', 'news_stories',
      'last_at', (select max(fetched_at) from news_stories),
      'n_24h', (select count(*) from news_stories where fetched_at > now() - interval '24 hours'),
      'n_prev_7d', (select count(*) from news_stories where fetched_at <= now() - interval '24 hours' and fetched_at > now() - interval '8 days'))
  ));
$$;

revoke all on function creator_os.kaizen_tenant_feed(), creator_os.kaizen_pulse() from public, anon, authenticated;
grant execute on function creator_os.kaizen_tenant_feed(), creator_os.kaizen_pulse() to service_role;

-- Old single-owner gate stays only as the platform-admin list.
-- Last guard: every content policy must be tenant-scoped.
do $$
declare bad text;
begin
  select string_agg(tablename || '.' || policyname, ', ') into bad
  from pg_policies
  where schemaname = 'creator_os'
    and tablename in ('reels','watchlist_accounts','sources','brand_brain','employees','app_settings',
      'news_stories','watchlist_posts','studio_sessions','formats','reel_formats','ideas','manager_messages','manager_proposals')
    and (coalesce(qual,'') || coalesce(with_check,'')) not like '%active_tenant()%';
  if bad is not null then
    raise exception 'Policies not tenant-scoped: %. Nothing was changed.', bad;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
