-- Prepare public.soundscapes for real production content.
--
-- ⚠️ LIVE SUPABASE. This migration is unusual for this repo: it contains ONE
-- destructive/type-changing step (Steps 1-2 below), which is safe ONLY
-- because Step 0 (run separately, before this file) confirmed every existing
-- row is known test/dummy data (catalogue_ref S-009..S-029, all status =
-- 'live', 21 rows) and confirmed `soundscape_status` is used by no other
-- table/column. Steps 3-4 are ordinary additive changes.
--
-- RUN THIS BEFORE DEPLOYING ANY CODE THAT ASSUMES the new 9-stage status
-- pipeline or the new columns below. No application code changes are needed
-- for this migration itself (Controller/Soundscape.ts only ever filters on
-- status = 'live', which is unchanged).
--
-- ── STEP 1 — DELETE ALL TEST/DUMMY SOUNDSCAPES ──────────────────────────────
-- Removes the 21 sample rows (S-009 through S-029) inserted during earlier
-- development. Confirmed via OpenAPI metadata + row listing immediately
-- before running this file that no row deviates from that pattern.
delete from public.soundscapes;

-- ── STEP 2 — REPLACE THE STATUS PIPELINE (9 stages) ─────────────────────────
-- Table is now empty, so the enum swap touches zero rows. Old pipeline
-- (draft, master_review, tags_verified, release_approved, live, revised,
-- retired) is replaced with the client's production pipeline (Tag
-- Dictionary "Status" group, Database Key column).
begin;

create type public.soundscape_status_new as enum (
    'idea', 'briefed', 'generating', 'editing',
    'audio_qa', 'metadata_qa', 'app_qa', 'live', 'on_hold'
);

alter table public.soundscapes
    alter column status drop default;

alter table public.soundscapes
    alter column status type public.soundscape_status_new
    using status::text::public.soundscape_status_new;
    -- table is empty at this point, so this USING clause never actually runs
    -- against real data — included only so the ALTER is valid Postgres syntax.

alter table public.soundscapes
    alter column status set default 'idea'::public.soundscape_status_new;

drop type public.soundscape_status;

alter type public.soundscape_status_new rename to soundscape_status;

commit;

-- ── STEP 3 — ADD NEW COLUMNS (all additive) ──────────────────────────────────
-- Free text, no fixed enum — same precedent as `situation`/`perspective`/
-- `movement` — sourced from the client's Master Catalogue spreadsheet.
alter table public.soundscapes add column if not exists primary_sound_family text null;
alter table public.soundscapes add column if not exists exact_environment text null;
alter table public.soundscapes add column if not exists time_of_day text null;
alter table public.soundscapes add column if not exists weather text null;
alter table public.soundscapes add column if not exists setting_type text null;
alter table public.soundscapes add column if not exists rain_led boolean not null default false;
alter table public.soundscapes add column if not exists wind_led boolean not null default false;
alter table public.soundscapes add column if not exists wind_driven_foliage boolean not null default false;

comment on column public.soundscapes.primary_sound_family is
    'Free text, no fixed enum. Vocabulary comes from the Tag Dictionary '
    '"Sound Family" group (e.g. rail, vessels, aircraft, running_water, '
    'birds, rain) — snake_case, per that sheet''s "Database Key" column. '
    'Sourced from the client''s Master Catalogue spreadsheet.';

comment on column public.soundscapes.exact_environment is
    'Free text, no fixed enum — same precedent as situation/perspective/'
    'movement. Sourced from the client''s Master Catalogue spreadsheet.';

comment on column public.soundscapes.time_of_day is
    'Free text, no fixed enum — same precedent as situation/perspective/'
    'movement. Sourced from the client''s Master Catalogue spreadsheet.';

comment on column public.soundscapes.weather is
    'Free text, no fixed enum — same precedent as situation/perspective/'
    'movement. Sourced from the client''s Master Catalogue spreadsheet.';

comment on column public.soundscapes.setting_type is
    'Free text, no fixed enum — same precedent as situation/perspective/'
    'movement. Sourced from the client''s Master Catalogue spreadsheet.';

comment on column public.soundscapes.rain_led is
    'True when rain is the dominant sound layer. Sourced from the client''s '
    'Master Catalogue spreadsheet.';

comment on column public.soundscapes.wind_led is
    'True when wind is the dominant sound layer. Sourced from the client''s '
    'Master Catalogue spreadsheet.';

comment on column public.soundscapes.wind_driven_foliage is
    'True when wind-driven foliage (leaves/trees moving in wind) is present '
    'as a sound layer. Sourced from the client''s Master Catalogue spreadsheet.';

-- ── STEP 4 — RECONCILE `detail_level` ENUM ───────────────────────────────────
-- Confirmed via OpenAPI metadata that the current enum is
-- (minimal, balanced, rich) — 'gentle' is missing. Add it additively.
-- Must run as its own statement, outside any transaction block that also
-- uses the new value: Postgres requires ADD VALUE to commit before the new
-- value can be referenced.
alter type public.detail_level add value if not exists 'gentle';

-- ═════════════════════════════════════════════════════════════════════════
-- STEP 5 — VALUE-MAPPING REFERENCE for the future 130-row bulk import
-- (documentation only — nothing below this line is executed SQL; the import
-- script itself is a separate follow-up task once file_urls are ready)
-- ═════════════════════════════════════════════════════════════════════════
--
-- Main Category → mode:
--   "Relaxation" → 'relax'   (NOT 'relaxation' — the mode CHECK constraint
--                              only allows focus / relax / sleep)
--   (confirm the remaining category → focus/sleep mapping against the
--   Master Catalogue sheet when the import script is written)
--
-- Intensity → intensity (integer) — PROPOSED scale, confirm with the team
-- before the real import:
--   Very Soft = 1
--   Soft      = 2
--   Moderate  = 3
--   Strong    = 4
--
-- Detail Level → detail_level:
--   Minimal  → 'minimal'
--   Gentle   → 'gentle'   (added in Step 4 above)
--   Balanced → 'balanced'
--   Rich     → 'rich'
--
-- Animals / Instruments / Sound Family → use the Tag Dictionary sheet's
-- "Database Key" column (snake_case) as the canonical stored value, not the
-- raw "Customer Label" column.
--
-- duration_seconds: always 3600 for every real track, regardless of the
-- spreadsheet's "Duration Versions" column — per explicit client
-- instruction, only the 1-hour master ships.
--
-- science_label / science_note: leave NULL for now. The spreadsheet's
-- "Concept Evidence Level" and "Concept provenance" fields are a different
-- concept (creative/production provenance, not wellbeing-claim strength)
-- and were intentionally NOT mapped onto science_label this round.
-- science_label's CHECK constraint permits NULL (only rejects a
-- non-matching non-null value), so this is safe.
