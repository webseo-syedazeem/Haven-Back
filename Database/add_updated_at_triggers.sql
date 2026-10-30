-- Auto-set updated_at = now() on every UPDATE for all public tables that have
-- the column. Re-runnable: drops any prior trigger of the same name first.
--
-- Active Passage tables with updated_at:
--   collections, remote_config, soundscapes, support_requests,
--   user_notification_settings,
--   user_playback_settings, user_playlists, user_sound_preferences, users
--
-- user_subscriptions does not exist in the live schema and is not included.
--
-- Note: public.users already had trigger set_users_updated_at from users.sql.
-- This migration replaces it with the consistent set_updated_at_on_users name.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- users: drop legacy name from Database/users.sql, then create consistent name
drop trigger if exists set_users_updated_at on public.users;
drop trigger if exists set_updated_at_on_users on public.users;
create trigger set_updated_at_on_users
before update on public.users
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_soundscapes on public.soundscapes;
create trigger set_updated_at_on_soundscapes
before update on public.soundscapes
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_collections on public.collections;
create trigger set_updated_at_on_collections
before update on public.collections
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_user_playlists on public.user_playlists;
create trigger set_updated_at_on_user_playlists
before update on public.user_playlists
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_user_sound_preferences on public.user_sound_preferences;
create trigger set_updated_at_on_user_sound_preferences
before update on public.user_sound_preferences
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_user_playback_settings on public.user_playback_settings;
create trigger set_updated_at_on_user_playback_settings
before update on public.user_playback_settings
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_user_notification_settings on public.user_notification_settings;
create trigger set_updated_at_on_user_notification_settings
before update on public.user_notification_settings
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_support_requests on public.support_requests;
create trigger set_updated_at_on_support_requests
before update on public.support_requests
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_remote_config on public.remote_config;
create trigger set_updated_at_on_remote_config
before update on public.remote_config
for each row
execute function public.set_updated_at();
