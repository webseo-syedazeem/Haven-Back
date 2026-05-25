create table if not exists public.user_soundscape_mixes (
    id uuid primary key default gen_random_uuid(),
    user_id integer references public.users(id) on delete cascade,
    name text not null,
    soundscape_ids uuid[],
    volumes jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists idx_user_soundscape_mixes_user_id
    on public.user_soundscape_mixes(user_id);
