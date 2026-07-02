-- Halcyon - HealthConnect Integration
-- Paste this into the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.health_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('apple', 'google')),
  is_connected boolean not null default false,
  permissions jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_connections_user_provider_unique unique (user_id, provider)
);

create or replace function public.set_health_connections_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_health_connections_updated_at on public.health_connections;

create trigger set_health_connections_updated_at
before update on public.health_connections
for each row
execute function public.set_health_connections_updated_at();

alter table public.health_connections enable row level security;

create policy "Users can read their health connections"
on public.health_connections
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their health connections"
on public.health_connections
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their health connections"
on public.health_connections
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);