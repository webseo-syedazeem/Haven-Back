-- Add preview_url to public.soundscapes: a short (~1 minute) preview clip,
-- distinct from the full 1-hour master in file_url.
--
-- SAFE TO RUN ON THE LIVE DATABASE. Additive only:
--   * ADD COLUMN IF NOT EXISTS — idempotent, re-running is a no-op
--   * nullable, no default — existing rows are unaffected
--
-- RUN THIS BEFORE DEPLOYING THE CODE. The new /previews/* streaming route and
-- the admin update endpoint reference this column.

alter table public.soundscapes
    add column if not exists preview_url text null;

comment on column public.soundscapes.preview_url is
    'URL to a short (~1 minute) preview clip of this soundscape, manually cut '
    'in Audacity and uploaded to public/previews/ alongside the full file in '
    'public/soundscapes/. Nullable — not every soundscape will have one '
    'immediately. Distinct from file_url (the full master).';
