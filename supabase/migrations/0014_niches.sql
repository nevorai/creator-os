-- 0014_niches.sql
--
-- Nevorai Creator, D1 (2026-10-24): niches. A creator picks many niches (plan caps the count);
-- Orbit research rows (sources, watchlist, ideas, news) can be tagged by niche.
--
--   niches        catalogue of 19 niches (service-only table, read through niche_catalogue())
--   niche_packs   per niche: default RSS sources, seed handles, pillars, hints (service-only)
--   tenant_niches the niches a creator picked (tenant policies, plan cap "niches", default 2)
--   niche_id      nullable tag on sources, watchlist_accounts, ideas, news_stories (null = all niches)
--
-- Run AFTER 0013, in the Nevorai OS SQL Editor. One transaction.

begin;

create table if not exists creator_os.niches (
  key    text primary key check (key ~ '^[a-z][a-z0-9-]{1,40}$'),
  name   text not null,
  sort   integer not null default 100,
  active boolean not null default true
);

create table if not exists creator_os.niche_packs (
  niche_key text primary key references creator_os.niches(key) on delete cascade,
  sources   jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  handles   jsonb not null default '[]'::jsonb check (jsonb_typeof(handles) = 'array'),
  pillars   jsonb not null default '[]'::jsonb check (jsonb_typeof(pillars) = 'array'),
  hints     jsonb not null default '[]'::jsonb check (jsonb_typeof(hints) = 'array')
);

alter table creator_os.niches enable row level security;
alter table creator_os.niche_packs enable row level security;
revoke all on table creator_os.niches, creator_os.niche_packs from public, anon, authenticated;
grant all on creator_os.niches, creator_os.niche_packs to service_role;

insert into creator_os.niches (key, name, sort) values
 ('health','Health',10),('fitness','Fitness',20),('astrology','Astrology',30),
 ('spirituality','Spirituality',40),('trading-finance','Trading and finance',50),
 ('business','Business',60),('politics','Politics',70),('news','News and current affairs',80),
 ('education-exams','Education and exams',90),('tech-ai','Tech and AI',100),
 ('comedy','Comedy',110),('beauty','Beauty',120),('fashion','Fashion',130),
 ('food','Food',140),('travel','Travel',150),('parenting','Parenting',160),
 ('motivation','Motivation',170),('devotional','Devotional',180),('regional-news','Regional news',190)
on conflict (key) do nothing;

-- Packs: only feeds that are well known. Empty is fine; handles are filled in D2.
insert into creator_os.niche_packs (niche_key, sources, hints) values
 ('news', '[{"name":"The Hindu - National","url":"https://www.thehindu.com/news/national/feeder/default.rss"},{"name":"Times of India - Top stories","url":"https://timesofindia.indiatimes.com/rssfeedstopstories.cms"}]', '[]'),
 ('politics', '[{"name":"The Hindu - National","url":"https://www.thehindu.com/news/national/feeder/default.rss"},{"name":"Times of India - Top stories","url":"https://timesofindia.indiatimes.com/rssfeedstopstories.cms"}]', '[]'),
 ('trading-finance', '[{"name":"Economic Times - Markets","url":"https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms"}]', '["Never promise returns. No tips presented as advice."]'),
 ('business', '[{"name":"Economic Times - Top stories","url":"https://economictimes.indiatimes.com/rssfeedstopstories.cms"}]', '[]'),
 ('tech-ai', '[{"name":"TechCrunch","url":"https://techcrunch.com/feed/"}]', '[]'),
 ('health', '[]', '["No cure or treatment claims. Say what a doctor should confirm."]')
on conflict (niche_key) do nothing;
insert into creator_os.niche_packs (niche_key) select key from creator_os.niches on conflict do nothing;

-- The browser's one door to the catalogue (signed-in only).
create or replace function creator_os.niche_catalogue()
returns table (key text, name text, sources jsonb, handles jsonb, pillars jsonb, hints jsonb)
language sql stable security definer set search_path = ''
as $$
  select n.key, n.name, p.sources, p.handles, p.pillars, p.hints
  from creator_os.niches n left join creator_os.niche_packs p on p.niche_key = n.key
  where n.active order by n.sort;
$$;
revoke all on function creator_os.niche_catalogue() from public, anon;
grant execute on function creator_os.niche_catalogue() to authenticated, service_role;

-- What a creator picked.
create table if not exists creator_os.tenant_niches (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default creator_os.active_tenant() references creator_os.tenants(id) on delete cascade,
  niche_key   text references creator_os.niches(key),
  custom_name text check (custom_name is null or length(custom_name) between 2 and 60),
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  check ((niche_key is not null) <> (custom_name is not null)),
  unique (tenant_id, niche_key)
);
create unique index if not exists tenant_niches_custom_idx on creator_os.tenant_niches (tenant_id, lower(custom_name));
create index if not exists tenant_niches_tenant_idx on creator_os.tenant_niches (tenant_id);

alter table creator_os.tenant_niches enable row level security;
create policy tenant_niches_t_read on creator_os.tenant_niches for select to authenticated
  using (tenant_id = (select creator_os.active_tenant()));
create policy tenant_niches_t_ins on creator_os.tenant_niches for insert to authenticated
  with check (tenant_id = (select creator_os.active_tenant()) and (select creator_os.can_write(tenant_id)));
create policy tenant_niches_t_upd on creator_os.tenant_niches for update to authenticated
  using (tenant_id = (select creator_os.active_tenant()) and (select creator_os.can_write(tenant_id)))
  with check (tenant_id = (select creator_os.active_tenant()) and (select creator_os.can_write(tenant_id)));
create policy tenant_niches_t_del on creator_os.tenant_niches for delete to authenticated
  using (tenant_id = (select creator_os.active_tenant()) and (select creator_os.can_write(tenant_id)));
revoke all on table creator_os.tenant_niches from anon, authenticated;
grant select, insert, update, delete on creator_os.tenant_niches to authenticated;
grant all on creator_os.tenant_niches to service_role;

create trigger tenant_niches_limit before insert on creator_os.tenant_niches
  for each row execute function creator_os.enforce_limit('niches', '2');

-- Adarsh: 20 niches, and his own two.
update creator_os.tenants set limits = limits || '{"niches":20}'::jsonb where slug = 'adarsh';
insert into creator_os.tenant_niches (tenant_id, niche_key, is_primary)
select id, 'politics', true from creator_os.tenants where slug = 'adarsh' on conflict do nothing;
insert into creator_os.tenant_niches (tenant_id, niche_key, is_primary)
select id, 'news', false from creator_os.tenants where slug = 'adarsh' on conflict do nothing;

-- Tag on research rows (null = applies to all niches, which is what every existing row is).
alter table creator_os.sources            add column if not exists niche_id uuid references creator_os.tenant_niches(id) on delete set null;
alter table creator_os.watchlist_accounts add column if not exists niche_id uuid references creator_os.tenant_niches(id) on delete set null;
alter table creator_os.ideas              add column if not exists niche_id uuid references creator_os.tenant_niches(id) on delete set null;
alter table creator_os.news_stories       add column if not exists niche_id uuid references creator_os.tenant_niches(id) on delete set null;
create index if not exists sources_niche_idx            on creator_os.sources (niche_id);
create index if not exists watchlist_accounts_niche_idx on creator_os.watchlist_accounts (niche_id);
create index if not exists ideas_niche_idx              on creator_os.ideas (niche_id);
create index if not exists news_stories_niche_idx       on creator_os.news_stories (niche_id);

-- Last guard: every content policy (now including tenant_niches) must be tenant-scoped.
do $$
declare bad text;
begin
  select string_agg(tablename || '.' || policyname, ', ') into bad
  from pg_policies
  where schemaname = 'creator_os'
    and tablename in ('reels','watchlist_accounts','sources','brand_brain','employees','app_settings',
      'news_stories','watchlist_posts','studio_sessions','formats','reel_formats','ideas','manager_messages','manager_proposals','tenant_niches')
    and (coalesce(qual,'') || coalesce(with_check,'')) not like '%active_tenant()%';
  if bad is not null then
    raise exception 'Policies not tenant-scoped: %. Nothing was changed.', bad;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
