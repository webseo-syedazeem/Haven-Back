-- Add onboarding completion flag and an atomic onboarding save helper.
--
-- SAFE TO RUN ON THE LIVE DATABASE BEFORE DEPLOYING CODE:
--   * additive/idempotent table change only
--   * no drops, renames, or type changes
--   * NOT NULL with a constant default, which Postgres 11+ applies without
--     rewriting the table
--
-- The auth-sync trigger in users.sql does not write onboarding_completed, so
-- unrelated auth profile syncs cannot reset it.

begin;

alter table public.users
    add column if not exists onboarding_completed boolean not null default false;

comment on column public.users.onboarding_completed is
    'True after POST /api/onboarding successfully saves the user''s onboarding answers. '
    'Default false for new accounts; not touched by auth profile sync.';

create or replace function public.save_user_onboarding_completion(
    p_user_id bigint,
    p_goals text[],
    p_starting_mode text,
    p_situation text,
    p_completed_at timestamptz,
    p_preference_updates jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_onboarding public.user_onboarding%rowtype;
    v_existing_preferences public.user_sound_preferences%rowtype;
    v_preferences public.user_sound_preferences%rowtype;
    v_preference_updates jsonb := coalesce(p_preference_updates, '{}'::jsonb);
    v_has_preference_updates boolean := coalesce(p_preference_updates, '{}'::jsonb) <> '{}'::jsonb;
begin
    insert into public.user_onboarding (
        user_id,
        goals,
        starting_mode,
        situation,
        completed,
        completed_at,
        updated_at
    )
    values (
        p_user_id,
        p_goals,
        p_starting_mode,
        p_situation,
        true,
        p_completed_at,
        p_completed_at
    )
    on conflict (user_id)
    do update set
        goals = excluded.goals,
        starting_mode = excluded.starting_mode,
        situation = excluded.situation,
        completed = true,
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at
    returning *
    into v_onboarding;

    update public.users
    set onboarding_completed = true
    where id = p_user_id;

    if not found then
        raise exception 'User profile not found' using errcode = 'P0002';
    end if;

    if v_has_preference_updates then
        select *
        into v_existing_preferences
        from public.user_sound_preferences
        where user_id = p_user_id;

        insert into public.user_sound_preferences (
            user_id,
            preferred_environments,
            preferred_sounds,
            preferred_animals,
            preferred_instruments,
            excluded_sounds,
            detail_preference,
            typical_duration,
            intensity_preference,
            updated_at
        )
        values (
            p_user_id,
            case
                when v_preference_updates ? 'preferred_environments'
                    then array(select jsonb_array_elements_text(v_preference_updates -> 'preferred_environments'))
                else coalesce(v_existing_preferences.preferred_environments, '{}'::text[])
            end,
            case
                when v_preference_updates ? 'preferred_sounds'
                    then array(select jsonb_array_elements_text(v_preference_updates -> 'preferred_sounds'))
                else coalesce(v_existing_preferences.preferred_sounds, '{}'::text[])
            end,
            case
                when v_preference_updates ? 'preferred_animals'
                    then array(select jsonb_array_elements_text(v_preference_updates -> 'preferred_animals'))
                else coalesce(v_existing_preferences.preferred_animals, '{}'::text[])
            end,
            case
                when v_preference_updates ? 'preferred_instruments'
                    then array(select jsonb_array_elements_text(v_preference_updates -> 'preferred_instruments'))
                else coalesce(v_existing_preferences.preferred_instruments, '{}'::text[])
            end,
            case
                when v_preference_updates ? 'excluded_sounds'
                    then array(select jsonb_array_elements_text(v_preference_updates -> 'excluded_sounds'))
                else coalesce(v_existing_preferences.excluded_sounds, '{}'::text[])
            end,
            case
                when v_preference_updates ? 'detail_preference'
                    then v_preference_updates ->> 'detail_preference'
                else v_existing_preferences.detail_preference
            end,
            case
                when v_preference_updates ? 'typical_duration'
                    then v_preference_updates ->> 'typical_duration'
                else v_existing_preferences.typical_duration
            end,
            case
                when v_preference_updates ? 'intensity_preference'
                    then (v_preference_updates ->> 'intensity_preference')::integer
                else v_existing_preferences.intensity_preference
            end,
            p_completed_at
        )
        on conflict (user_id)
        do update set
            preferred_environments = excluded.preferred_environments,
            preferred_sounds = excluded.preferred_sounds,
            preferred_animals = excluded.preferred_animals,
            preferred_instruments = excluded.preferred_instruments,
            excluded_sounds = excluded.excluded_sounds,
            detail_preference = excluded.detail_preference,
            typical_duration = excluded.typical_duration,
            intensity_preference = excluded.intensity_preference,
            updated_at = excluded.updated_at
        returning *
        into v_preferences;
    else
        select *
        into v_preferences
        from public.user_sound_preferences
        where user_id = p_user_id;
    end if;

    return jsonb_build_object(
        'onboarding', to_jsonb(v_onboarding),
        'preferences', coalesce(
            to_jsonb(v_preferences),
            jsonb_build_object(
                'user_id', p_user_id,
                'preferred_environments', jsonb_build_array(),
                'preferred_sounds', jsonb_build_array(),
                'preferred_animals', jsonb_build_array(),
                'preferred_instruments', jsonb_build_array(),
                'excluded_sounds', jsonb_build_array(),
                'detail_preference', null,
                'typical_duration', null,
                'intensity_preference', null,
                'updated_at', null
            )
        )
    );
end;
$$;

commit;
