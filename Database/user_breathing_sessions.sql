create extension if not exists pgcrypto;

create table if not exists public.user_breathing_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id bigint not null references public.users(id) on delete cascade,
    type text not null,
    total_duration_seconds integer not null,
    completed_duration_seconds integer,
    completed boolean not null default false,
    cycles_data jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists user_breathing_sessions_user_id_created_at_idx
on public.user_breathing_sessions (user_id, created_at desc);
