-- Passage guest-mode removal: deny all direct PostgREST access to application
-- tables. The backend uses service_role and performs JWT/ownership checks.
-- Review in a transaction-capable SQL editor before applying to production.
begin;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'analytics_events', 'collection_soundscapes', 'collections', 'help_articles',
    'notifications_log', 'remote_config', 'soundscape_tag_events', 'soundscapes',
    'soundscapes_backup_oct30', 'support_requests', 'user_device_tokens',
    'user_favourites', 'user_notification_settings', 'user_onboarding',
    'user_play_history', 'user_playback_settings', 'user_player_state',
    'user_playlist_items', 'user_playlists', 'user_sound_preferences', 'users'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('revoke all on table public.%I from authenticated', table_name);
  end loop;
end $$;

-- The public catalogue previously exposed file_url and preview_url to the anon
-- key. Catalogue access now goes through the authenticated Passage API.
-- Service-role access remains unchanged; service_role bypasses RLS.

commit;

-- Verification (anon-key REST request must be denied and return no data,
-- normally as HTTP 401/403 rather than a successful empty result):
--   /rest/v1/soundscapes?select=id,file_url,preview_url&limit=1
-- Authenticated app functionality is verified through the API, not direct REST.
