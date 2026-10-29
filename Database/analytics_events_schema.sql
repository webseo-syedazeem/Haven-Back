-- Minimal analytics event log for Passage (Section 9.1 / 10.2).
-- Client-driven event ingest only — run this in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.analytics_events (
    id uuid primary key default gen_random_uuid(),
    user_id bigint references public.users(id) on delete set null,
    session_id text,
    event_name text not null,
    event_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_analytics_events_name_created
    on public.analytics_events (event_name, created_at desc);

create index if not exists idx_analytics_events_user
    on public.analytics_events (user_id, created_at desc);

create index if not exists idx_analytics_events_session_created
    on public.analytics_events (session_id, created_at desc);

comment on table public.analytics_events is
    'Privacy-minimised product analytics. Never store check-in reflections, health answers, auth tokens, or free-form wellbeing text in event_data.';
