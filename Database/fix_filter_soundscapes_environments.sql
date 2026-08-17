-- Fix environment matching in public.filter_soundscapes.
-- Broadens p_environments to OR-match across contains, sound_sources, subcategory,
-- one_line_description, perspective, and movement (O10 "Desired environment" vocabulary).
-- Full function body is replaced; run this in the Supabase SQL editor.

create or replace function public.filter_soundscapes(
    p_modes text[] default null,
    p_environments text[] default null,
    p_contains text[] default null,
    p_avoids text[] default null,
    p_animals text[] default null,
    p_instruments text[] default null,
    p_detail_levels text[] default null,
    p_min_duration_seconds integer default null,
    p_max_duration_seconds integer default null,
    p_sort text default 'recommended'
)
returns setof public.soundscapes
language sql
stable
security invoker
set search_path = public
as $$
    select s.*
    from public.soundscapes as s
    where s.status = 'live'
      and (
          p_modes is null
          or array_length(p_modes, 1) is null
          or s.mode = any (p_modes)
      )
      and (
          p_environments is null
          or array_length(p_environments, 1) is null
          or exists (
              select 1
              from unnest(p_environments) as env(value)
              where coalesce(s.subcategory, '') ilike '%' || env.value || '%'
                 or coalesce(s.one_line_description, '') ilike '%' || env.value || '%'
                 or coalesce(s.perspective, '') ilike '%' || env.value || '%'
                 or coalesce(s.movement, '') ilike '%' || env.value || '%'
                 or exists (
                     select 1
                     from unnest(coalesce(s.contains, array[]::text[])) as item(value)
                     where item.value ilike '%' || env.value || '%'
                 )
                 or exists (
                     select 1
                     from unnest(coalesce(s.sound_sources, array[]::text[])) as item(value)
                     where item.value ilike '%' || env.value || '%'
                 )
          )
      )
      and (
          p_contains is null
          or array_length(p_contains, 1) is null
          or exists (
              select 1
              from unnest(p_contains) as wanted(value)
              where exists (
                  select 1
                  from unnest(coalesce(s.contains, array[]::text[])) as item(value)
                  where item.value ilike '%' || wanted.value || '%'
              )
          )
      )
      and (
          p_avoids is null
          or array_length(p_avoids, 1) is null
          or not exists (
              select 1
              from unnest(p_avoids) as avoided(value)
              where not exists (
                  select 1
                  from unnest(coalesce(s.does_not_contain, array[]::text[])) as item(value)
                  where item.value ilike '%' || avoided.value || '%'
              )
          )
      )
      and (
          p_animals is null
          or array_length(p_animals, 1) is null
          or exists (
              select 1
              from unnest(p_animals) as wanted(value)
              where exists (
                  select 1
                  from unnest(coalesce(s.animals, array[]::text[])) as item(value)
                  where item.value ilike '%' || wanted.value || '%'
              )
          )
      )
      and (
          p_instruments is null
          or array_length(p_instruments, 1) is null
          or exists (
              select 1
              from unnest(p_instruments) as wanted(value)
              where exists (
                  select 1
                  from unnest(coalesce(s.instruments, array[]::text[])) as item(value)
                  where item.value ilike '%' || wanted.value || '%'
              )
          )
      )
      and (
          p_detail_levels is null
          or array_length(p_detail_levels, 1) is null
          or s.detail_level = any (p_detail_levels)
      )
      and (
          p_min_duration_seconds is null
          or s.duration_seconds >= p_min_duration_seconds
      )
      and (
          p_max_duration_seconds is null
          or s.duration_seconds <= p_max_duration_seconds
      )
    order by
        case
            when coalesce(nullif(btrim(p_sort), ''), 'recommended') = 'most_played' then (
                select count(*)::double precision
                from public.user_play_history as ph
                where ph.soundscape_id = s.id
            )
            when coalesce(nullif(btrim(p_sort), ''), 'recommended') = 'most_saved' then (
                select count(*)::double precision
                from public.user_favourites as fav
                where fav.soundscape_id = s.id
            )
            when coalesce(nullif(btrim(p_sort), ''), 'recommended') = 'recently_added' then
                extract(epoch from s.created_at)
            when coalesce(nullif(btrim(p_sort), ''), 'recommended') = 'longest' then
                coalesce(s.duration_seconds, 0)::double precision
            when coalesce(nullif(btrim(p_sort), ''), 'recommended') = 'highest_detail' then
                case s.detail_level
                    when 'rich' then 3
                    when 'balanced' then 2
                    when 'minimal' then 1
                    else 0
                end::double precision
            when coalesce(nullif(btrim(p_sort), ''), 'recommended') in ('a_z', 'shortest', 'lowest_intensity') then
                null
            else
                coalesce(s.sort_score, 0)::double precision
        end desc nulls last,
        case
            when coalesce(nullif(btrim(p_sort), ''), 'recommended') = 'shortest' then
                coalesce(s.duration_seconds, 2147483647)
            when coalesce(nullif(btrim(p_sort), ''), 'recommended') = 'lowest_intensity' then
                coalesce(s.intensity, 2147483647)
            else
                null
        end asc nulls last,
        case
            when coalesce(nullif(btrim(p_sort), ''), 'recommended') = 'a_z' then s.title
            else null
        end asc nulls last,
        s.sort_score desc nulls last,
        s.title asc;
$$;

revoke execute on function public.filter_soundscapes(
    text[], text[], text[], text[], text[], text[], text[], integer, integer, text
) from public;

grant execute on function public.filter_soundscapes(
    text[], text[], text[], text[], text[], text[], text[], integer, integer, text
) to service_role;
