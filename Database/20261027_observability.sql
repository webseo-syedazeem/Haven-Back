-- Safe to apply to an existing production database after analytics_events_schema.sql.
create index if not exists idx_analytics_events_session_created
    on public.analytics_events (session_id, created_at desc);

comment on table public.analytics_events is
    'Privacy-minimised product analytics. Never store check-in reflections, health answers, auth tokens, or free-form wellbeing text in event_data.';

