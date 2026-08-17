create table user_notification_settings (
  user_id                  bigint primary key references users(id) on delete cascade,
  reminders_enabled       boolean not null default false,
  new_collection_alerts   boolean not null default false,
  updated_at               timestamptz not null default now()
);
