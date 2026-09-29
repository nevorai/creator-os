-- Check for migration 0012 (owner-only access). Run in the Nevorai OS SQL Editor
-- AFTER 0012. It changes nothing: it pretends to be a random logged-in user and
-- then Adarsh, counts what each can see, and its one write test is undone.
-- Every row of the result should say OK.

drop table if exists pg_temp.creator_os_check;
create temp table creator_os_check (step int, what text, result text, ok boolean);

do $$
declare
  t record;
  j record;
  n bigint;
  tables_total int := 0;
  tables_locked int := 0;
  admin_rows bigint := 0;
  stranger_rows bigint := 0;
  owner_rows bigint := 0;
  changed bigint := 0;
  stranger_is_owner boolean;
  owner_is_owner boolean;
  owners_list text := 'blocked';
  tok text;
  payload text;
  key_role text;
  stranger text := jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text;
  owner text := jsonb_build_object('sub', '32dc9eb8-4c68-47c0-8440-cdbcea9ca35c', 'role', 'authenticated')::text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'creator_os' and c.relkind in ('r', 'p') and c.relname <> 'owners'
  loop
    tables_total := tables_total + 1;
    if exists (
      select 1 from pg_policies
      where schemaname = 'creator_os' and tablename = t.relname and policyname = t.relname || '_owner_all'
    ) and not exists (
      select 1 from pg_policies
      where schemaname = 'creator_os' and tablename = t.relname and policyname <> t.relname || '_owner_all'
    ) then
      tables_locked := tables_locked + 1;
    end if;

    execute format('select count(*) from creator_os.%I', t.relname) into n;
    admin_rows := admin_rows + n;

    perform set_config('request.jwt.claims', stranger, true);
    set local role authenticated;
    execute format('select count(*) from creator_os.%I', t.relname) into n;
    reset role;
    stranger_rows := stranger_rows + n;

    perform set_config('request.jwt.claims', owner, true);
    set local role authenticated;
    execute format('select count(*) from creator_os.%I', t.relname) into n;
    reset role;
    owner_rows := owner_rows + n;
  end loop;

  perform set_config('request.jwt.claims', stranger, true);
  set local role authenticated;
  select creator_os.is_owner() into stranger_is_owner;
  reset role;

  perform set_config('request.jwt.claims', owner, true);
  set local role authenticated;
  select creator_os.is_owner() into owner_is_owner;
  reset role;

  -- Stranger tries to change the keys row. Undone either way.
  begin
    perform set_config('request.jwt.claims', stranger, true);
    set local role authenticated;
    update creator_os.app_settings set id = id;
    get diagnostics changed = row_count;
    raise exception 'undo';
  exception when others then
    null;
  end;
  reset role;

  -- Stranger tries to read the owners list directly.
  begin
    perform set_config('request.jwt.claims', stranger, true);
    set local role authenticated;
    execute 'select count(*) from creator_os.owners' into n;
    owners_list := 'OPEN: ' || n || ' rows';
  exception when others then
    null;
  end;
  reset role;

  insert into creator_os_check values
    (1, 'Tables with owner-only policy', tables_locked || ' of ' || tables_total, tables_locked = tables_total and tables_total > 0),
    (2, 'Random logged-in user: rows visible', stranger_rows::text, stranger_rows = 0),
    (3, 'Random logged-in user: rows changed in app_settings', changed::text, changed = 0),
    (4, 'Random logged-in user: owners list', owners_list, owners_list = 'blocked'),
    (5, 'Random logged-in user: is_owner()', stranger_is_owner::text, stranger_is_owner = false),
    (6, 'Adarsh: rows visible', owner_rows || ' of ' || admin_rows, owner_rows = admin_rows),
    (7, 'Adarsh: is_owner()', owner_is_owner::text, owner_is_owner = true);

  -- Which key each scheduled job sends (the role inside it, never the key itself).
  -- scrape-watchlist and fetch-rss now only accept the service_role key.
  for j in select jobname, command, active from cron.job where jobname like 'creator-os-%' order by jobname loop
    tok := substring(j.command from 'Bearer ([A-Za-z0-9_.-]+)');
    begin
      payload := translate(split_part(tok, '.', 2), '-_', '+/');
      payload := payload || repeat('=', (4 - length(payload) % 4) % 4);
      key_role := convert_from(decode(payload, 'base64'), 'utf8')::jsonb ->> 'role';
    exception when others then
      key_role := case when tok like 'sb_secret_%' then 'service_role' else 'unreadable' end;
    end;
    insert into creator_os_check values (
      8, 'Scheduled job ' || j.jobname,
      coalesce(key_role, 'no key') || ' key, ' || case when j.active then 'on' else 'off' end,
      key_role = 'service_role' and j.active
    );
  end loop;
end $$;

select what, result, case when ok then 'OK' else 'PROBLEM' end as status
from creator_os_check
order by step, what;
