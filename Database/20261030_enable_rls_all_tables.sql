-- Audit C-4 — Enable Row Level Security on every public table.
--
-- WHY: Supabase exposes every `public` table over PostgREST to the `anon` and
-- `authenticated` roles, and the anon key is public (it ships in client apps).
-- Without RLS, anyone holding that key can read every user's rows and, worse,
-- write to tables such as user_* directly. This backend only ever touches the
-- database with the SERVICE ROLE key, which BYPASSES RLS, so turning RLS on with
-- no policies ("deny all" for anon/authenticated) locks out direct client access
-- without affecting the API at all.
--
-- BEFORE APPLYING: confirm nothing legitimately queries these tables directly
-- with the anon key (the mobile app uses Supabase only for auth and goes through
-- this API for all data). For any table a client *does* read directly, add an
-- owner policy instead of leaving it deny-all — example at the bottom.
--
-- This migration is idempotent: enabling RLS on a table that already has it is a
-- no-op.

do $$
declare
    r record;
begin
    for r in
        select c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'          -- ordinary tables only
    loop
        execute format('alter table public.%I enable row level security;', r.relname);
        -- force RLS so even the table owner is subject to it; the service role
        -- (used by this backend) still bypasses RLS entirely.
        execute format('alter table public.%I force row level security;', r.relname);
    end loop;
end $$;

-- Verification (run after applying):
--   select relname, relrowsecurity, relforcerowsecurity
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind = 'r' order by relname;
--
-- Example owner policy, ONLY for a table a client queries directly with the
-- anon key (not needed for API-only tables, which stay deny-all):
--
--   create policy "own rows" on public.user_favourites
--     for all to authenticated
--     using  (user_id = (select id from public.users where auth_user_id = auth.uid()))
--     with check (user_id = (select id from public.users where auth_user_id = auth.uid()));
