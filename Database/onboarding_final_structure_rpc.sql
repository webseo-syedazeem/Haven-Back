-- ============================================================================
-- public.save_user_onboarding_completion — FINAL structure
-- ============================================================================
-- Rewires the onboarding RPC onto the FINAL, confirmed-live shape of
-- public.user_onboarding. This file supersedes and replaces every earlier
-- onboarding migration in this repo (all of them were deleted in the same
-- commit, because each carried a different, now-wrong column vocabulary):
--   onboarding_schema.sql
--   onboarding_completed_flag.sql
--   fix_onboarding_completion_case_type.sql
--   onboarding_rename_columns_drop_recreate.sql
--
-- ⚠️ NO DDL IS PERFORMED ON public.user_onboarding BY THIS FILE.
-- The table already exists in its final form. Confirmed live, column for
-- column, via Supabase's REST OpenAPI metadata
-- (GET {SUPABASE_URL}/rest/v1/ -> definitions.user_onboarding) before this
-- file was written:
--
--   user_id          bigint       not null, PK, FK -> public.users(id) on delete cascade
--   mode_breakers    text[]       not null default '{}'
--   mode             text         null, CHECK (mode is null or mode in ('sleep','relax','focus'))
--   completed        boolean      not null default false
--   completed_at     timestamptz  null
--   updated_at       timestamptz  not null default now(), maintained by
--                                 trigger set_updated_at_on_user_onboarding
--   calming_moments  text         null
--   user_goals       text         null
--   mode_areas       text[]       not null default '{}'
--   target_minutes   integer      null
--   main_goal        text         null
--   relax_causes     text[]       not null default '{}'
--
-- public.users.onboarding_completed (boolean not null default false) also
-- already exists and is likewise NOT altered here — only written to, below.
--
-- ---------------------------------------------------------------------------
-- PER-MODE FIELD OWNERSHIP (enforced by the frontend and by what the
-- controllers forward, not by a DB constraint — the RPC persists exactly what
-- it is given):
--   all modes   : mode, user_goals
--   focus/sleep : mode_breakers[], mode_areas[], target_minutes
--   relax       : main_goal, relax_causes[], calming_moments
-- A mode never populates the other family's fields; they stay at '{}' / null.
-- ---------------------------------------------------------------------------
--
-- SAFE TO RUN ON THE LIVE DATABASE BEFORE DEPLOYING CODE:
--   * touches exactly one function, no tables
--   * idempotent — re-running it produces the same single function
--
-- The old function's parameter list is NOT a prefix of the new one, so
-- `create or replace` alone would leave the previous signature in place as an
-- overload and make PostgREST's /rpc/save_user_onboarding_completion
-- ambiguous. Every overload is therefore dropped first.

begin;

do $migrate$
declare
    v_signature text;
begin
    -- regprocedure renders the fully schema-qualified name plus its argument types,
    -- which is exactly what DROP FUNCTION needs and is independent of search_path.
    for v_signature in
        select p.oid::regprocedure::text
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'save_user_onboarding_completion'
    loop
        execute format('drop function %s', v_signature);
    end loop;
end
$migrate$;

create function public.save_user_onboarding_completion(
    p_user_id bigint,
    p_mode text,
    p_user_goals text default null,
    p_mode_breakers text[] default '{}'::text[],
    p_mode_areas text[] default '{}'::text[],
    p_target_minutes integer default null,
    p_main_goal text default null,
    p_relax_causes text[] default '{}'::text[],
    p_calming_moments text default null,
    p_completed_at timestamptz default now(),
    p_preference_updates jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
    v_onboarding public.user_onboarding%rowtype;
    v_existing_preferences public.user_sound_preferences%rowtype;
    v_preferences public.user_sound_preferences%rowtype;
    v_completed_at timestamptz := coalesce(p_completed_at, now());
    v_preference_updates jsonb := coalesce(p_preference_updates, '{}'::jsonb);
    v_has_preference_updates boolean := coalesce(p_preference_updates, '{}'::jsonb) <> '{}'::jsonb;
begin
    -- Full overwrite of every onboarding answer on each submission, matching the
    -- behaviour of every previous version of this function. The three text[]
    -- columns are NOT NULL, so a null argument is normalised to '{}' rather than
    -- being allowed to violate the constraint.
    insert into public.user_onboarding (
        user_id,
        mode,
        user_goals,
        mode_breakers,
        mode_areas,
        target_minutes,
        main_goal,
        relax_causes,
        calming_moments,
        completed,
        completed_at,
        updated_at
    )
    values (
        p_user_id,
        p_mode,
        p_user_goals,
        coalesce(p_mode_breakers, '{}'::text[]),
        coalesce(p_mode_areas, '{}'::text[]),
        p_target_minutes,
        p_main_goal,
        coalesce(p_relax_causes, '{}'::text[]),
        p_calming_moments,
        true,
        v_completed_at,
        v_completed_at
    )
    on conflict (user_id)
    do update set
        mode = excluded.mode,
        user_goals = excluded.user_goals,
        mode_breakers = excluded.mode_breakers,
        mode_areas = excluded.mode_areas,
        target_minutes = excluded.target_minutes,
        main_goal = excluded.main_goal,
        relax_causes = excluded.relax_causes,
        calming_moments = excluded.calming_moments,
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

    -- == UNCHANGED from the previous version ==============================
    -- Sound Preferences / Sounds to Avoid live on user_sound_preferences and
    -- are entirely unrelated to the onboarding redesign above. This block is a
    -- verbatim carry-over; PUT /api/preferences/sound remains their real owner.
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
                    then (v_preference_updates ->> 'detail_preference')::public.detail_level
                else v_existing_preferences.detail_preference
            end,
            case
                when v_preference_updates ? 'typical_duration'
                    then v_preference_updates ->> 'typical_duration'
                else v_existing_preferences.typical_duration
            end,
            case
                when v_preference_updates ? 'intensity_preference'
                    then (v_preference_updates ->> 'intensity_preference')::smallint
                else v_existing_preferences.intensity_preference
            end,
            v_completed_at
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
    -- == end unchanged block ==============================================

    -- `onboarding` is to_jsonb of the whole row, so it carries all 8 data
    -- columns (mode, user_goals, mode_breakers, mode_areas, target_minutes,
    -- main_goal, relax_causes, calming_moments) plus the bookkeeping ones.
    return jsonb_build_object(
        'onboarding', to_jsonb(v_onboarding),
        'preferences', coalesce(
            to_jsonb(v_preferences),
            jsonb_build_object(
                'user_id', p_user_id,
                'preferred_environments', jsonb_build_array(),
                'preferred_sounds', jsonb_build_array(),
                'preferred_animals', jsonb_build_array(),
                'excluded_sounds', jsonb_build_array(),
                'preferred_instruments', jsonb_build_array(),
                'detail_preference', null,
                'typical_duration', null,
                'intensity_preference', null,
                'updated_at', null
            )
        )
    );
end;
$fn$;

commit;

-- Supabase normally reloads PostgREST's schema cache automatically after DDL. If
-- /rpc/save_user_onboarding_completion still advertises the old parameter names
-- afterwards, run this to force it:
notify pgrst, 'reload schema';
