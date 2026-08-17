-- WP-3: onboarding capture — goals (O7), starting mode (O8), situation (O9).
-- Environment/sounds/exclusions/detail/duration answers already live in
-- user_sound_preferences via PUT /api/preferences/sound; this table only adds
-- what that endpoint does not cover.

create table if not exists public.user_onboarding (
  user_id        bigint primary key references public.users(id) on delete cascade,
  goals          text[] not null default '{}',
  starting_mode  text,
  situation      text,
  completed      boolean not null default false,
  completed_at   timestamptz,
  updated_at     timestamptz not null default now()
);

do $$
begin
    alter table public.user_onboarding
        add constraint user_onboarding_starting_mode_check
        check (starting_mode is null or starting_mode in ('sleep', 'relax', 'focus'));
exception
    when duplicate_object then null;
end $$;

drop trigger if exists set_updated_at_on_user_onboarding on public.user_onboarding;
create trigger set_updated_at_on_user_onboarding
before update on public.user_onboarding
for each row
execute function public.set_updated_at();
