-- Additive columns for the WP backend gap closure (reminder sync, structured
-- audio-problem reasons, server-enforced analytics consent).
--
-- SAFE TO RUN ON THE LIVE DATABASE. Every statement is:
--   * additive        — ADD COLUMN only, no drops, renames or type changes
--   * idempotent      — IF NOT EXISTS, so re-running is a no-op
--   * non-blocking    — nullable, or NOT NULL with a constant default, which
--                       Postgres 11+ applies without rewriting the table
--
-- RUN THIS BEFORE DEPLOYING THE CODE. The controllers select and write these
-- columns, so deploying first would break preferences reads against the old
-- schema.

begin;

-- ── Gap 2: wind-down reminder time ───────────────────────────────────────────
-- Persistence and cross-device sync only. Reminders are still scheduled locally
-- on the device; there is no server-side scheduler, and no timezone column,
-- so this value is a wall-clock time as the user set it.
alter table public.user_notification_settings
    add column if not exists reminder_time time without time zone null;

comment on column public.user_notification_settings.reminder_time is
    'Wall-clock time of the user''s wind-down reminder, for cross-device sync. '
    'Scheduling happens on the device; the server does not send this reminder.';

-- ── Gap 3: structured reason on audio problem reports ────────────────────────
-- Nullable and shared by every support_request type; only
-- report_audio_problem populates it today. `message` is unchanged and still
-- carries the free-text detail.
alter table public.support_requests
    add column if not exists reason text null;

comment on column public.support_requests.reason is
    'Optional structured reason for a report_audio_problem submission '
    '(e.g. "Audio cuts out"). Null for other request types.';

-- ── Gap 4: analytics consent ─────────────────────────────────────────────────
-- Opt-in: false matches the client default, so no existing user is opted in by
-- this migration. The auth-sync trigger (sync_auth_user_to_public_users) only
-- writes name, email, is_verified and last_sign_in_at on conflict, so it will
-- never overwrite this column.
alter table public.users
    add column if not exists analytics_enabled boolean not null default false;

comment on column public.users.analytics_enabled is
    'User consent for anonymous usage analytics. Off by default; '
    'POST /api/analytics/events drops authenticated events while false.';

commit;

-- ── Verification (run separately, read-only) ─────────────────────────────────
-- select table_name, column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where (table_schema, table_name, column_name) in (
--     ('public', 'user_notification_settings', 'reminder_time'),
--     ('public', 'support_requests',           'reason'),
--     ('public', 'users',                      'analytics_enabled')
-- )
-- order by table_name;
