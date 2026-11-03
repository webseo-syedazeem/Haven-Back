-- READ-ONLY FINAL VERIFICATION.
-- Safe to run in the production Supabase SQL Editor after the lockdown
-- migration. This query does not change tables, grants, policies, or data.

with expected(table_name) as (
  values
    ('analytics_events'), ('collection_soundscapes'), ('collections'), ('help_articles'),
    ('notifications_log'), ('remote_config'), ('soundscape_tag_events'), ('soundscapes'),
    ('soundscapes_backup_oct30'), ('support_requests'), ('user_device_tokens'),
    ('user_favourites'), ('user_notification_settings'), ('user_onboarding'),
    ('user_play_history'), ('user_playback_settings'), ('user_player_state'),
    ('user_playlist_items'), ('user_playlists'), ('user_sound_preferences'), ('users')
), checks as (
  select
    e.table_name,
    c.oid is not null as table_exists,
    coalesce(c.relrowsecurity, false) as rls_enabled,
    coalesce(c.relforcerowsecurity, false) as rls_forced,
    coalesce(has_table_privilege('anon', c.oid, 'SELECT'), false) as anon_select,
    coalesce(has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE'), false) as anon_write,
    coalesce(has_table_privilege('authenticated', c.oid, 'SELECT'), false) as authenticated_select,
    coalesce(has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE'), false) as authenticated_write,
    coalesce(has_table_privilege('service_role', c.oid, 'SELECT'), false) as service_role_select,
    coalesce((select rolbypassrls from pg_roles where rolname = 'service_role'), false) as service_role_bypasses_rls
  from expected e
  left join pg_namespace n on n.nspname = 'public'
  left join pg_class c
    on c.relnamespace = n.oid
   and c.relname = e.table_name
   and c.relkind in ('r', 'p')
), results as (
  select
    *,
    table_exists
      and rls_enabled
      and rls_forced
      and not anon_select
      and not anon_write
      and not authenticated_select
      and not authenticated_write
      and service_role_select
      and service_role_bypasses_rls as table_pass
  from checks
)
select
  table_name,
  table_exists,
  rls_enabled,
  rls_forced,
  anon_select,
  anon_write,
  authenticated_select,
  authenticated_write,
  service_role_select,
  service_role_bypasses_rls,
  table_pass,
  case when bool_and(table_pass) over () then 'PASS: ALL 21 TABLES LOCKED DOWN'
       else 'FAIL: REVIEW FALSE COLUMNS'
  end as overall_result
from results
order by table_name;

