-- Move persisted Passage asset URLs from the retired apex host to the API
-- subdomain. This migration is idempotent: rows already using
-- api.passagesounds.app do not match the old-host expression.

begin;

select
  count(*) filter (
    where artwork_url ~* '^(https?://)?(www\.)?passagesounds\.app([/?#]|$)'
  ) as artwork_urls_to_update,
  count(*) filter (
    where file_url ~* '^(https?://)?(www\.)?passagesounds\.app([/?#]|$)'
  ) as file_urls_to_update,
  count(*) filter (
    where preview_url ~* '^(https?://)?(www\.)?passagesounds\.app([/?#]|$)'
  ) as preview_urls_to_update
from public.soundscapes;

with updated as (
  update public.soundscapes
  set
    artwork_url = case
      when artwork_url ~* '^(https?://)?(www\.)?passagesounds\.app([/?#]|$)'
        then regexp_replace(
          artwork_url,
          '^(https?://)?(www\.)?passagesounds\.app([/?#]|$)',
          'https://api.passagesounds.app\3',
          'i'
        )
      else artwork_url
    end,
    file_url = case
      when file_url ~* '^(https?://)?(www\.)?passagesounds\.app([/?#]|$)'
        then regexp_replace(
          file_url,
          '^(https?://)?(www\.)?passagesounds\.app([/?#]|$)',
          'https://api.passagesounds.app\3',
          'i'
        )
      else file_url
    end,
    preview_url = case
      when preview_url ~* '^(https?://)?(www\.)?passagesounds\.app([/?#]|$)'
        then regexp_replace(
          preview_url,
          '^(https?://)?(www\.)?passagesounds\.app([/?#]|$)',
          'https://api.passagesounds.app\3',
          'i'
        )
      else preview_url
    end
  where
    artwork_url ~* '^(https?://)?(www\.)?passagesounds\.app([/?#]|$)'
    or file_url ~* '^(https?://)?(www\.)?passagesounds\.app([/?#]|$)'
    or preview_url ~* '^(https?://)?(www\.)?passagesounds\.app([/?#]|$)'
  returning id
)
select count(*) as soundscape_rows_updated
from updated;

do $$
begin
  if exists (
    select 1
    from public.soundscapes
    where
      artwork_url ~* '^(https?://)?(www\.)?passagesounds\.app([/?#]|$)'
      or file_url ~* '^(https?://)?(www\.)?passagesounds\.app([/?#]|$)'
      or preview_url ~* '^(https?://)?(www\.)?passagesounds\.app([/?#]|$)'
  ) then
    raise exception 'Old passagesounds.app URLs remain; transaction rolled back';
  end if;
end
$$;

commit;

select
  count(*) filter (
    where artwork_url ~* '^(https?://)?(www\.)?passagesounds\.app([/?#]|$)'
  ) as old_artwork_urls,
  count(*) filter (
    where file_url ~* '^(https?://)?(www\.)?passagesounds\.app([/?#]|$)'
  ) as old_file_urls,
  count(*) filter (
    where preview_url ~* '^(https?://)?(www\.)?passagesounds\.app([/?#]|$)'
  ) as old_preview_urls
from public.soundscapes;
