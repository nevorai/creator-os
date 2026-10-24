-- 0015_orbit_per_niche.sql
-- Nevorai Creator D2 (2026-10-24): packaging + shoot card on a Studio session, and ONE-trip Today brief.
-- Run AFTER 0014. One transaction.
begin;

alter table creator_os.studio_sessions add column if not exists package_text text;
alter table creator_os.studio_sessions add column if not exists shoot_text text;
alter table creator_os.studio_sessions add column if not exists niche_id uuid references creator_os.tenant_niches(id) on delete set null;

-- The morning brief for the active workspace, in a single database trip.
-- security invoker: the caller's row-level security still applies, and every read is also pinned to the active tenant.
create or replace function creator_os.today_brief()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with t as (select creator_os.active_tenant() as id)
  select jsonb_build_object(
    'niches', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'key', n.niche_key, 'custom', n.custom_name, 'primary', n.is_primary) order by n.is_primary desc, n.created_at)
                        from creator_os.tenant_niches n where n.tenant_id = (select id from t)), '[]'::jsonb),
    'ideas', coalesce((select jsonb_agg(to_jsonb(i)) from (
                        select id, topic, why_now, confidence, niche_id from creator_os.ideas
                        where tenant_id = (select id from t) and status = 'new' order by created_at desc limit 6) i), '[]'::jsonb),
    'outliers', coalesce((select jsonb_agg(to_jsonb(o)) from (
                        select p.id, p.post_url, p.caption, p.views, p.outlier_ratio, a.handle
                        from creator_os.watchlist_posts p join creator_os.watchlist_accounts a on a.id = p.account_id
                        where p.tenant_id = (select id from t) and p.is_outlier
                        order by p.fetched_at desc, p.outlier_ratio desc nulls last limit 6) o), '[]'::jsonb),
    'news', coalesce((select jsonb_agg(to_jsonb(s)) from (
                        select id, title, url, published_at, niche_id from creator_os.news_stories
                        where tenant_id = (select id from t) order by fetched_at desc limit 8) s), '[]'::jsonb),
    'board', coalesce((select jsonb_object_agg(production_status, c) from (
                        select production_status, count(*) c from creator_os.studio_sessions
                        where tenant_id = (select id from t) group by 1) b), '{}'::jsonb),
    'counts', jsonb_build_object(
      'news_24h', (select count(*) from creator_os.news_stories where tenant_id = (select id from t) and fetched_at > now() - interval '24 hours'),
      'outliers_7d', (select count(*) from creator_os.watchlist_posts where tenant_id = (select id from t) and is_outlier and fetched_at > now() - interval '7 days'),
      'watching', (select count(*) from creator_os.watchlist_accounts where tenant_id = (select id from t) and active),
      'sources', (select count(*) from creator_os.sources where tenant_id = (select id from t) and active))
  );
$$;
revoke all on function creator_os.today_brief() from public, anon;
grant execute on function creator_os.today_brief() to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
