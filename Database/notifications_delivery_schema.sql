-- WP-5: notifications delivery infrastructure (doc §9.1, R-07).
-- Reminders/new-collection-alert settings already exist and remain default-off
-- in user_notification_settings; this file only adds device registration and a
-- delivery log.

create table if not exists public.user_device_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      bigint not null references public.users(id) on delete cascade,
  token        text not null,
  platform     text not null,
  created_at   timestamptz not null default now(),
  unique (user_id, token)
);

do $$
begin
    alter table public.user_device_tokens
        add constraint user_device_tokens_platform_check
        check (platform in ('ios', 'android', 'web'));
exception
    when duplicate_object then null;
end $$;

create index if not exists idx_user_device_tokens_user on public.user_device_tokens (user_id);

create table if not exists public.notifications_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      bigint references public.users(id) on delete set null,
  title        text not null,
  body         text not null,
  type         text not null,
  data         jsonb not null default '{}'::jsonb,
  status       text not null default 'queued',
  created_at   timestamptz not null default now()
);

do $$
begin
    alter table public.notifications_log
        add constraint notifications_log_type_check
        check (type in ('reminder', 'new_collection'));
exception
    when duplicate_object then null;
end $$;

do $$
begin
    alter table public.notifications_log
        add constraint notifications_log_status_check
        check (status in ('queued', 'sent', 'failed'));
exception
    when duplicate_object then null;
end $$;

create index if not exists idx_notifications_log_user on public.notifications_log (user_id, created_at desc);
