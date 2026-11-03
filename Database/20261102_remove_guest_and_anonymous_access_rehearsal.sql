-- SAFE, SINGLE-STATEMENT REHEARSAL.
-- This avoids temporary tables and does not depend on the SQL editor keeping a
-- multi-statement session open. Run the COMPLETE DO statement. The lockdown is
-- applied inside a PL/pgSQL subtransaction and deliberately rolled back after
-- all checks pass. A successful run prints PASS/ROLLBACK notices and persists
-- no table, grant, or RLS changes.

do $$
declare
  target text;
  targets constant text[] := array[
    'analytics_events', 'collection_soundscapes', 'collections', 'help_articles',
    'notifications_log', 'remote_config', 'soundscape_tag_events', 'soundscapes',
    'soundscapes_backup_oct30', 'support_requests', 'user_device_tokens',
    'user_favourites', 'user_notification_settings', 'user_onboarding',
    'user_play_history', 'user_playback_settings', 'user_player_state',
    'user_playlist_items', 'user_playlists', 'user_sound_preferences', 'users'
  ];
begin
  -- Read-only prerequisites. A real failure is allowed to escape so the SQL
  -- editor clearly reports which prerequisite is not satisfied.
  foreach target in array targets loop
    if to_regclass(format('public.%I', target)) is null then
      raise exception 'Rehearsal stopped: public.% does not exist', target;
    end if;
  end loop;

  if not exists (
    select 1 from pg_roles where rolname = 'service_role' and rolbypassrls
  ) then
    raise exception 'Rehearsal stopped: service_role is missing or does not bypass RLS';
  end if;

  raise notice 'PRECHECK PASS: all 21 tables exist and service_role bypasses RLS';

  -- An EXCEPTION block is a PostgreSQL subtransaction. The intentional PGR01
  -- exception at the end rolls back every ALTER/REVOKE below before it is
  -- caught, even when the SQL editor auto-commits the surrounding statement.
  begin
    foreach target in array targets loop
      execute format('alter table public.%I enable row level security', target);
      execute format('alter table public.%I force row level security', target);
      execute format('revoke all on table public.%I from anon', target);
      execute format('revoke all on table public.%I from authenticated', target);
    end loop;

    foreach target in array targets loop
      if has_table_privilege('anon', format('public.%I', target), 'SELECT')
         or has_table_privilege('anon', format('public.%I', target), 'INSERT,UPDATE,DELETE')
         or has_table_privilege('authenticated', format('public.%I', target), 'SELECT')
         or has_table_privilege('authenticated', format('public.%I', target), 'INSERT,UPDATE,DELETE') then
        raise exception 'Rehearsal failed: anon/authenticated still has a privilege on public.%', target;
      end if;

      if not has_table_privilege('service_role', format('public.%I', target), 'SELECT') then
        raise exception 'Rehearsal failed: service_role cannot SELECT public.%', target;
      end if;

      if not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = target
          and c.relrowsecurity
          and c.relforcerowsecurity
      ) then
        raise exception 'Rehearsal failed: RLS flags are not enabled/forced on public.%', target;
      end if;
    end loop;

    raise notice 'LOCKDOWN CHECK PASS: anon/authenticated denied; service_role retained; RLS enabled/forced';
    raise exception using
      errcode = 'PGR01',
      message = 'intentional rehearsal rollback';
  exception
    when sqlstate 'PGR01' then
      raise notice 'ROLLBACK PASS: all rehearsal ALTER/REVOKE changes were undone';
  end;

  raise notice 'REHEARSAL COMPLETE: safe to continue with staging API tests; no database changes persisted';
end $$;

