-- 0013_attack.sql: attacks the tenant isolation as a signed-out visitor, a stranger,
-- another tenant's owner, a spoofed header and a plain viewer. Run AFTER 0013 on a
-- scratch copy (it creates test users and tenants and rolls everything back at the end).
-- Every line must print PASS.
begin;
create temp table results(label text, ok boolean);
grant all on results to public;

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-0000000000b0','bob@x.com'),
 ('00000000-0000-0000-0000-0000000000c0','carol@x.com'),
 ('00000000-0000-0000-0000-0000000000e0','eve@x.com');
insert into creator_os.tenants(id,slug,name,limits) values
 ('00000000-0000-0000-0000-000000000002','bobby','Bobby','{"watchlist":3,"seats":5,"ai_credits":300}');
insert into creator_os.tenant_members values
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000b0','owner'),
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000c0','viewer');
insert into creator_os.tenant_profile(tenant_id) values ('00000000-0000-0000-0000-000000000002');
select creator_os.seed_tenant('00000000-0000-0000-0000-000000000002');

create or replace function pg_temp.try(label text, as_role text, uid text, hdr text, stmt text, want text)
returns void language plpgsql as $f$
declare got text; n bigint;
begin
  execute format('set local role %I', as_role);
  perform set_config('request.jwt.claim.sub', coalesce(uid,''), true);
  perform set_config('request.headers', coalesce(hdr,'{}'), true);
  begin
    if want like 'rows=%' and stmt ~* '^\s*(update|delete)' then
      execute stmt; get diagnostics n = row_count;
      got := 'rows=' || n;
    elsif want like 'rows=%' then
      execute 'select count(*) from (' || stmt || ') q' into n;
      got := 'rows=' || n;
    else
      execute stmt; got := 'ok';
    end if;
  exception when others then got := 'denied';
  end;
  reset role;
  insert into results values (label || '  [' || got || ' want ' || want || ']', got = want);
end $f$;

-- ids
\set T1 '(select id from creator_os.tenants where slug=''adarsh'')'
\set ADA '32dc9eb8-4c68-47c0-8440-cdbcea9ca35c'
\set BOB 00000000-0000-0000-0000-0000000000b0
\set CAR 00000000-0000-0000-0000-0000000000c0
\set EVE 00000000-0000-0000-0000-0000000000e0
\set T2 00000000-0000-0000-0000-000000000002

-- signed-out visitor
select pg_temp.try('anon cannot read reels','anon',null,null,'select 1 from creator_os.reels','denied');
select pg_temp.try('anon cannot read tenants','anon',null,null,'select 1 from creator_os.tenants','denied');
select pg_temp.try('anon cannot call feed','anon',null,null,'select creator_os.kaizen_tenant_feed()','denied');
select pg_temp.try('anon cannot call pulse','anon',null,null,'select creator_os.kaizen_pulse()','denied');
select pg_temp.try('anon cannot spend AI credit','anon',null,null,'select creator_os.use_ai_credit(gen_random_uuid())','denied');
select pg_temp.try('anon CAN resolve a host','anon',null,null,'select * from creator_os.tenant_by_host(''creator.nevorai.com'')','rows=1');
select pg_temp.try('anon unknown host gives nothing','anon',null,null,'select * from creator_os.tenant_by_host(''nobody.creator.nevorai.com'')','rows=0');

-- stranger (signed in, no tenant)
select pg_temp.try('stranger sees no reels','authenticated',:'EVE',null,'select 1 from creator_os.reels','rows=0');
select pg_temp.try('stranger cannot insert reel','authenticated',:'EVE',null,'insert into creator_os.reels(tenant_id) values ((select id from creator_os.tenants where slug=''adarsh''))','denied');
select pg_temp.try('stranger sees no tenants','authenticated',:'EVE',null,'select 1 from creator_os.tenants','rows=0');

-- Adarsh: own data intact
select pg_temp.try('adarsh sees his 7 reels','authenticated',:'ADA',null,'select 1 from creator_os.reels','rows=7');
select pg_temp.try('adarsh sees his employees','authenticated',:'ADA',null,'select 1 from creator_os.employees','rows=14');

select pg_temp.try('anon cannot list a team','anon',null,null,'select * from creator_os.team_list()','denied');
select pg_temp.try('stranger team list is empty','authenticated',:'EVE',null,'select * from creator_os.team_list()','rows=0');
select pg_temp.try('bob team list shows only his 2','authenticated',:'BOB',null,'select * from creator_os.team_list()','rows=2');
select pg_temp.try('bob header-spoof team list empty','authenticated',:'BOB',(select '{"x-tenant-id":"'||id||'"}' from creator_os.tenants where slug='adarsh'),'select * from creator_os.team_list()','rows=0');

-- other tenant's owner
select pg_temp.try('bob sees none of adarsh reels','authenticated',:'BOB',null,'select 1 from creator_os.reels','rows=0');
select pg_temp.try('bob sees his seeded employees','authenticated',:'BOB',null,'select 1 from creator_os.employees','rows=14');
select pg_temp.try('bob cannot insert into adarsh tenant','authenticated',:'BOB',null,'insert into creator_os.reels(tenant_id) values ((select id from creator_os.tenants where slug=''adarsh''))','denied');
select pg_temp.try('bob insert defaults to his tenant','authenticated',:'BOB',null,'insert into creator_os.sources(name,url) values (''n'',''http://u'')','ok');
select pg_temp.try('bob cannot update adarsh reels','authenticated',:'BOB',null,'update creator_os.reels set notes=''pwn'' returning 1','rows=0');
select pg_temp.try('bob cannot delete adarsh brand brain','authenticated',:'BOB',null,'delete from creator_os.brand_brain where id=1 and tenant_id=(select id from creator_os.tenants where slug=''adarsh'') returning 1','rows=0');
select pg_temp.try('bob header-spoof to adarsh gets nothing','authenticated',:'BOB',(select '{"x-tenant-id":"'||id||'"}' from creator_os.tenants where slug='adarsh'),'select 1 from creator_os.reels','rows=0');
select pg_temp.try('bob header-spoof cannot write','authenticated',:'BOB',(select '{"x-tenant-id":"'||id||'"}' from creator_os.tenants where slug='adarsh'),'insert into creator_os.sources(tenant_id,name,url) values ((select id from creator_os.tenants where slug=''adarsh''),''n'',''u'')','denied');
select pg_temp.try('bob sees only his tenant row','authenticated',:'BOB',null,'select 1 from creator_os.tenants','rows=1');
select pg_temp.try('bob cannot read kaizen_subscription_id','authenticated',:'BOB',null,'select kaizen_subscription_id from creator_os.tenants','denied');
select pg_temp.try('bob cannot change plan','authenticated',:'BOB',null,'update creator_os.tenants set limits=''{"watchlist":9999}''','denied');
select pg_temp.try('bob cannot make himself member of adarsh','authenticated',:'BOB',null,'insert into creator_os.tenant_members values ((select id from creator_os.tenants where slug=''adarsh''),''00000000-0000-0000-0000-0000000000b0'',''owner'')','denied');
select pg_temp.try('bob cannot read secrets','authenticated',:'BOB',null,'select 1 from creator_os.tenant_secrets','denied');
select pg_temp.try('bob cannot read platform keys','authenticated',:'BOB',null,'select 1 from creator_os.platform_settings','denied');
select pg_temp.try('bob cannot read kaizen_events','authenticated',:'BOB',null,'select 1 from creator_os.kaizen_events','denied');
select pg_temp.try('bob cannot call feed','authenticated',:'BOB',null,'select creator_os.kaizen_tenant_feed()','denied');
select pg_temp.try('bob cannot spend AI credit','authenticated',:'BOB',null,'select creator_os.use_ai_credit(''00000000-0000-0000-0000-000000000002'')','denied');
select pg_temp.try('bob cannot read owners list','authenticated',:'BOB',null,'select 1 from creator_os.owners','denied');
select pg_temp.try('bob can edit his profile','authenticated',:'BOB',null,'update creator_os.tenant_profile set niche=''health'' returning 1','rows=1');
select pg_temp.try('watchlist limit: 3 ok','authenticated',:'BOB',null,'insert into creator_os.watchlist_accounts(handle) values (''a''),(''b''),(''c'')','ok');
select pg_temp.try('watchlist limit: 4th refused','authenticated',:'BOB',null,'insert into creator_os.watchlist_accounts(handle) values (''d'')','denied');
select pg_temp.try('same handle allowed in another tenant','authenticated',:'ADA',null,'insert into creator_os.watchlist_accounts(handle) values (''a'')','ok');

-- plain viewer
select pg_temp.try('viewer can read','authenticated',:'CAR',null,'select 1 from creator_os.employees','rows=14');
select pg_temp.try('viewer cannot insert','authenticated',:'CAR',null,'insert into creator_os.sources(name,url) values (''v'',''u'')','denied');
select pg_temp.try('viewer cannot update','authenticated',:'CAR',null,'update creator_os.employees set enabled=false returning 1','rows=0');
select pg_temp.try('viewer cannot edit profile','authenticated',:'CAR',null,'update creator_os.tenant_profile set niche=''x'' returning 1','rows=0');
select pg_temp.try('viewer sees teammates only in own tenant','authenticated',:'CAR',null,'select 1 from creator_os.tenant_members','rows=2');

-- suspended tenant is read-only
update creator_os.tenants set status='suspended', suspended_by='billing' where id=:'T2';
select pg_temp.try('suspended: still reads','authenticated',:'BOB',null,'select 1 from creator_os.employees','rows=14');
select pg_temp.try('suspended: writes refused','authenticated',:'BOB',null,'insert into creator_os.sources(name,url) values (''s'',''u'')','denied');
update creator_os.tenants set status='active', suspended_by=null where id=:'T2';

-- Kaizen doors work for the service role
select pg_temp.try('service feed lists both tenants','service_role',null,null,'select jsonb_array_elements(creator_os.kaizen_tenant_feed()->''tenants'')','rows=2');
select pg_temp.try('service pulse answers','service_role',null,null,'select jsonb_array_elements(creator_os.kaizen_pulse()->''signals'')','rows=2');
select pg_temp.try('AI credit: spend within cap','service_role',null,null,'select 1 where creator_os.use_ai_credit(''00000000-0000-0000-0000-000000000002'', 300)','rows=1');
select pg_temp.try('AI credit: over the cap refused','service_role',null,null,'select 1 where creator_os.use_ai_credit(''00000000-0000-0000-0000-000000000002'', 1)','rows=0');

select case when ok then 'PASS ' else 'FAIL ' end || label from results order by ok, label;
select 'TOTAL fails: ' || count(*) filter (where not ok) from results;
rollback;
