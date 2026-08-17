-- WP-1: persistent player state + Continue Listening (doc §6.4, §4 Home).
-- Safely re-runnable: guarded table/column creation, trigger drop-then-create.

create table if not exists public.user_player_state (
  user_id            bigint primary key references public.users(id) on delete cascade,
  soundscape_id      uuid references public.soundscapes(id) on delete set null,
  position_seconds   integer not null default 0,
  duration_seconds   integer,
  queue              jsonb not null default '[]'::jsonb,
  timer_minutes      integer,
  updated_at         timestamptz not null default now()
);

drop trigger if exists set_updated_at_on_user_player_state on public.user_player_state;
create trigger set_updated_at_on_user_player_state
before update on public.user_player_state
for each row
execute function public.set_updated_at();

-- Continue Listening needs progress + completion on each play history row.
alter table public.user_play_history add column if not exists position_seconds integer not null default 0;
alter table public.user_play_history add column if not exists completed boolean not null default false;
alter table public.user_play_history add column if not exists listened_seconds integer not null default 0;

create index if not exists idx_user_play_history_continue_listening
  on public.user_play_history (user_id, completed, played_at desc);
