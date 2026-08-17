create or replace function public.search_soundscapes(search_query text)
returns setof public.soundscapes
language sql
stable
security invoker
set search_path = public
as $$
    select s.*
    from public.soundscapes as s
    where s.status = 'live'
      and nullif(btrim(search_query), '') is not null
      and (
          s.title ilike '%' || search_query || '%'
          or s.subcategory ilike '%' || search_query || '%'
          or exists (
              select 1
              from unnest(coalesce(s.contains, array[]::text[])) as item(value)
              where item.value ilike '%' || search_query || '%'
          )
          or exists (
              select 1
              from unnest(coalesce(s.does_not_contain, array[]::text[])) as item(value)
              where item.value ilike '%' || search_query || '%'
          )
          or exists (
              select 1
              from unnest(coalesce(s.animals, array[]::text[])) as item(value)
              where item.value ilike '%' || search_query || '%'
          )
          or exists (
              select 1
              from unnest(coalesce(s.instruments, array[]::text[])) as item(value)
              where item.value ilike '%' || search_query || '%'
          )
          or exists (
              select 1
              from unnest(coalesce(s.sound_sources, array[]::text[])) as item(value)
              where item.value ilike '%' || search_query || '%'
          )
          or exists (
              select 1
              from unnest(coalesce(s.search_keywords, array[]::text[])) as item(value)
              where item.value ilike '%' || search_query || '%'
          )
      )
    order by s.sort_score desc, s.title asc;
$$;

revoke execute on function public.search_soundscapes(text) from public;
grant execute on function public.search_soundscapes(text) to service_role;