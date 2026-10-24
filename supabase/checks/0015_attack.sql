-- 0015_attack.sql: run AFTER 0013 + 0014 + 0015 on a scratch copy; every line must print PASS.
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
\set EVE 00000000-0000-0000-0000-0000000000e0
insert into creator_os.ideas(tenant_id,topic) values ('00000000-0000-0000-0000-000000000002','bob idea'),((select id from creator_os.tenants where slug='adarsh'),'adarsh idea');
select pg_temp.try('anon cannot call brief','anon',null,null,'select creator_os.today_brief()','denied');
select pg_temp.try('bob brief has only his idea','authenticated',:'BOB',null,'select 1 from (select jsonb_array_elements(creator_os.today_brief()->''ideas'') i) q where i->>''topic''=''bob idea''','rows=1');
select pg_temp.try('bob brief has none of adarsh ideas','authenticated',:'BOB',null,'select 1 from (select jsonb_array_elements(creator_os.today_brief()->''ideas'') i) q where i->>''topic''=''adarsh idea''','rows=0');
select pg_temp.try('bob header-spoof brief is empty','authenticated',:'BOB',format('{"x-tenant-id":"%s"}',(select id from creator_os.tenants where slug='adarsh')),'select 1 from (select jsonb_array_elements(creator_os.today_brief()->''ideas'') i) q','rows=0');
select pg_temp.try('stranger brief is empty','authenticated',:'EVE',null,'select 1 from (select jsonb_array_elements(creator_os.today_brief()->''ideas'') i) q','rows=0');
select pg_temp.try('viewer can read brief','authenticated',:'CAR',null,'select creator_os.today_brief()','ok');
select pg_temp.try('bob cannot write package_text on adarsh session','authenticated',:'BOB',null,'update creator_os.studio_sessions set package_text=''x''','rows=0');
select case when ok then 'PASS ' else 'FAIL ' end || label from results order by ok, label;
select 'TOTAL fails: ' || count(*) filter (where not ok) from results;
rollback;
