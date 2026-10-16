-- Removes the permanent-downloads feature's tables from the database.
--
-- CONTEXT: there is no separate "share" feature in the database — the app's
-- only Share UI was a client-side native share sheet (react-native `Share`)
-- that never touched the backend, so nothing here drops a share table. This
-- migration only removes `public.user_downloads` and
-- `public.user_download_settings`, which existed solely for the removed
-- "download a soundscape for offline listening" feature.
--
-- EXECUTION ORDER:
--   1. Run Section 0 (read-only) first and review its output. It tells you
--      the row counts about to be lost, every FK pointing at these two
--      tables, and whether anything other than the two known triggers
--      (`set_updated_at_on_user_downloads`, `set_updated_at_on_user_download_settings`,
--      both from Database/add_updated_at_triggers.sql) references them — a
--      view, a PL/pgSQL function body, an RLS policy. The repo search found
--      none, but the live schema can drift from the repo, so confirm here
--      before trusting that.
--   2. If Section 0 surfaces a dependent function/view/policy not listed in
--      Section 1 below, add it to Section 1 and fix it there FIRST — DROP
--      TABLE does not fail at parse time for a PL/pgSQL body that still
--      references the table, only the next time that function runs, so this
--      step is the only thing standing between a clean drop and a 500 the
--      next time something calls the stale function.
--   3. Only after Section 1 (if anything was added) is applied and confirmed
--      clean, run Section 2 inside its own transaction. It is written so
--      that nothing outside the two target tables is touched, and nothing
--      uses CASCADE.
--   4. The backend (Controller/Auth.ts DeleteAccount, Controller/Account.ts
--      ExportAccountData, Routes/Downloads.ts, Controller/Downloads.ts,
--      Controller/Preferences.ts, Utils/CacheHelper.ts) has already been
--      updated in this change to stop reading/writing these two tables —
--      deploy that backend change before or together with this migration,
--      never after, or DeleteAccount will start failing on the dropped
--      tables.

-- ============================================================================
-- Section 0 — pre-check (read-only; run this first and review the output)
-- ============================================================================

-- Row counts about to be lost.
select 'user_downloads' as table_name, count(*) as row_count from public.user_downloads
union all
select 'user_download_settings', count(*) from public.user_download_settings;

-- Foreign keys pointing at, or declared on, either table (expect: none other
-- than each table's own user_id -> users.id FK, which goes away with it).
select
    tc.table_schema,
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_schema  as foreign_table_schema,
    ccu.table_name    as foreign_table_name,
    ccu.column_name   as foreign_column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
    on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and (
    tc.table_name in ('user_downloads', 'user_download_settings')
    or ccu.table_name in ('user_downloads', 'user_download_settings')
  );

-- Views whose definition mentions either table.
select schemaname, viewname
from pg_views
where definition ilike '%user_downloads%' or definition ilike '%user_download_settings%';

-- Functions whose body mentions either table (PL/pgSQL only fails at runtime,
-- not at DROP time, so anything listed here must be fixed in Section 1 below
-- before Section 2 runs).
select n.nspname as schema_name, p.proname as function_name, p.oid::regprocedure as signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and (p.prosrc ilike '%user_downloads%' or p.prosrc ilike '%user_download_settings%');

-- RLS policies on either table.
select schemaname, tablename, policyname, qual, with_check
from pg_policies
where tablename in ('user_downloads', 'user_download_settings');

-- Triggers on either table (expect exactly the two updated_at triggers from
-- add_updated_at_triggers.sql — these are dropped automatically with their
-- table, no separate action needed).
select event_object_table, trigger_name
from information_schema.triggers
where event_object_table in ('user_downloads', 'user_download_settings');

-- ============================================================================
-- Section 1 — update dependents first
-- ============================================================================
--
-- The repo-wide search behind this migration (Controller/*.ts, Routes/*.ts,
-- Database/*.sql) found no view, function or RLS policy whose body reads or
-- writes `user_downloads` or `user_download_settings` — only the two
-- updated_at triggers named above, which are attached directly to the tables
-- and are dropped automatically along with them in Section 2. There is
-- nothing to create or replace here.
--
-- If Section 0's live-schema queries above found something this repo search
-- did not (a function added directly in the Supabase SQL editor, for
-- example), add its fixed `create or replace function ...` here, preserving
-- its full current body minus the user_downloads/user_download_settings
-- parts, before running Section 2.

-- ============================================================================
-- Section 2 — drop
-- ============================================================================

begin;

drop table if exists public.user_downloads;
drop table if exists public.user_download_settings;

notify pgrst, 'reload schema';

commit;

-- ----------------------------------------------------------------------------
-- Optional — columns on a SHARED table kept only for the removed feature.
-- The repo search found none: no soundscapes.share_count, no
-- soundscapes.download_count or similar on a table this migration does not
-- drop outright. Nothing is commented out here because nothing qualified.
-- ----------------------------------------------------------------------------
