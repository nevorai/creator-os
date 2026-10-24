-- 0014_attack.sql: run AFTER 0013 + 0014 on the scratch copy. Every line must print PASS. Rolls back.
begin;
create temp table results(label text, ok boolean);
grant all on results to public;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-0000000000b0','bob@x.com'),
 ('00000000-0000-0000-0000-0000000000c0','carol@x.com'),
 ('00000000-0000-0000-0000-0000000000e0','eve@x.com');
insert into creator_os.tenants(id,slug,name,limits) values
 ('00000000-0000-0000-0000-000000000002','bobby','Bobby','{"seats":5,"niches":2}');
insert into creator_os.tenant_members values
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000b0','owner'),
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000c0','viewer');
insert into creator_os.tenant_profile(tenant_id) values ('00000000-0000-0000-0000-000000000002');

create or replace function pg_temp.try(label text, as_role text, uid text, hdr text, stmt text, want text)
returns void language plpgsql as $f$
declare got text; n bigint;
begin
  execute format('set local role %I', as_role);
  perform set_config('request.jwt.claim.sub', coalesce(uid,''), true);
  perform set_config('request.headers', coalesce(hdr,'{}'), true);
  begin
    if want like 'rows=%' and stmt ~* '^\s*(update|delete)' then
      execute stmt; get diagnostics n = row_count; got := 'rows=' || n;
    elsif want like 'rows=%' then
      execute 'select count(*) from (' || stmt || ') q' into n; got := 'rows=' || n;
    else execute stmt; got := 'ok';
    end if;
  exception when others then got := 'denied';
  end;
  reset role;
  insert into results values (label || '  [' || got || ' want ' || want || ']', got = want);
end $f$;

\set ADA '32dc9eb8-4c68-47c0-8440-cdbcea9ca35c'
\set BOB 00000000-0000-0000-0000-0000000000b0
\set CAR 00000000-0000-0000-0000-0000000000c0
\set EVE 00000000-0000-0000-0000-0000000000e0

select pg_temp.try('anon cannot read niches','anon',null,null,'select 1 from creator_os.niches','denied');
select pg_temp.try('anon cannot read packs','anon',null,null,'select 1 from creator_os.niche_packs','denied');
select pg_temp.try('anon cannot call catalogue','anon',null,null,'select * from creator_os.niche_catalogue()','denied');
select pg_temp.try('anon cannot read tenant_niches','anon',null,null,'select 1 from creator_os.tenant_niches','denied');
select pg_temp.try('signed-in cannot read niches table','authenticated',:'BOB',null,'select 1 from creator_os.niches','denied');
select pg_temp.try('signed-in cannot read packs table','authenticated',:'BOB',null,'select 1 from creator_os.niche_packs','denied');
select pg_temp.try('signed-in can read catalogue (19)','authenticated',:'BOB',null,'select * from creator_os.niche_catalogue()','rows=19');
select pg_temp.try('signed-in cannot edit catalogue','authenticated',:'BOB',null,'update creator_os.niches set active=false','denied');
select pg_temp.try('adarsh sees his 2 niches','authenticated',:'ADA',null,'select 1 from creator_os.tenant_niches','rows=2');
select pg_temp.try('bob sees none of adarsh niches','authenticated',:'BOB',null,'select 1 from creator_os.tenant_niches','rows=0');
select pg_temp.try('stranger sees no niches','authenticated',:'EVE',null,'select 1 from creator_os.tenant_niches','rows=0');
select pg_temp.try('bob picks niche 1','authenticated',:'BOB',null,'insert into creator_os.tenant_niches(niche_key,is_primary) values (''health'',true)','ok');
select pg_temp.try('bob adds custom niche 2','authenticated',:'BOB',null,'insert into creator_os.tenant_niches(custom_name) values (''Bonsai'')','ok');
select pg_temp.try('bob 3rd niche refused by plan cap','authenticated',:'BOB',null,'insert into creator_os.tenant_niches(niche_key) values (''food'')','denied');
select pg_temp.try('bob duplicate niche refused','authenticated',:'BOB',null,'insert into creator_os.tenant_niches(niche_key) values (''health'')','denied');
select pg_temp.try('bob cannot insert into adarsh tenant','authenticated',:'BOB',null,'insert into creator_os.tenant_niches(tenant_id,niche_key) values ((select id from creator_os.tenants where slug=''adarsh''),''food'')','denied');
select pg_temp.try('bob header-spoof reads nothing','authenticated',:'BOB',format('{"x-tenant-id":"%s"}',(select id from creator_os.tenants where slug='adarsh')),'select 1 from creator_os.tenant_niches','rows=0');
select pg_temp.try('bob cannot delete adarsh niches','authenticated',:'BOB',null,'delete from creator_os.tenant_niches where tenant_id=(select id from creator_os.tenants where slug=''adarsh'')','rows=0');
select pg_temp.try('viewer can read niches','authenticated',:'CAR',null,'select 1 from creator_os.tenant_niches','rows=2');
select pg_temp.try('viewer cannot insert niche','authenticated',:'CAR',null,'insert into creator_os.tenant_niches(niche_key) values (''food'')','denied');
select pg_temp.try('viewer cannot delete niche','authenticated',:'CAR',null,'delete from creator_os.tenant_niches','rows=0');
select pg_temp.try('adarsh can add 3rd niche (cap 20)','authenticated',:'ADA',null,'insert into creator_os.tenant_niches(niche_key) values (''food'')','ok');

select case when ok then 'PASS ' else 'FAIL ' end || label from results order by ok, label;
select 'TOTAL fails: ' || count(*) filter (where not ok) from results;
rollback;
