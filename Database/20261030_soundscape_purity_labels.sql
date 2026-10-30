-- Component/reference migration. For production deployment, run
-- 20261030_app_store_audit_all_in_one.sql instead of this file.
BEGIN;

-- Editorial labels describe the audio itself, not a promised health outcome.
update public.collections
set title = 'Low-Detail Soundscapes', updated_at = now()
where title in ('Anxiety Relief', 'Stress Relief');

update public.collections
set title = 'Spacious Soundscapes', updated_at = now()
where title in ('Calm Your Mind', 'Reduce Anxiety');

COMMIT;
