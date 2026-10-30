-- Replace the retired soundscape asset/API hostname in every URL-bearing
-- column on public.soundscapes.
--
-- Handles all of these base forms:
--   https://thehappyapp.co.uk
--   http://thehappyapp.co.uk
--   https://www.thehappyapp.co.uk
--   http://www.thehappyapp.co.uk
--   thehappyapp.co.uk
--   www.thehappyapp.co.uk
--
-- The path, query string and fragment after the hostname are preserved. Every
-- migrated URL is normalised to HTTPS on https://passagesounds.app.

begin;

-- Show how many values will change in each column before the update.
select
  count(*) filter (
    where artwork_url ~* '^(https?://)?(www\.)?thehappyapp\.co\.uk([/?#]|$)'
  ) as artwork_urls_to_update,
  count(*) filter (
    where file_url ~* '^(https?://)?(www\.)?thehappyapp\.co\.uk([/?#]|$)'
  ) as file_urls_to_update,
  count(*) filter (
    where preview_url ~* '^(https?://)?(www\.)?thehappyapp\.co\.uk([/?#]|$)'
  ) as preview_urls_to_update
from public.soundscapes;

with updated as (
  update public.soundscapes
  set
    artwork_url = case
      when artwork_url ~* '^(https?://)?(www\.)?thehappyapp\.co\.uk([/?#]|$)'
        then regexp_replace(
          artwork_url,
          '^(https?://)?(www\.)?thehappyapp\.co\.uk([/?#]|$)',
          'https://passagesounds.app\3',
          'i'
        )
      else artwork_url
    end,
    file_url = case
      when file_url ~* '^(https?://)?(www\.)?thehappyapp\.co\.uk([/?#]|$)'
        then regexp_replace(
          file_url,
          '^(https?://)?(www\.)?thehappyapp\.co\.uk([/?#]|$)',
          'https://passagesounds.app\3',
          'i'
        )
      else file_url
    end,
    preview_url = case
      when preview_url ~* '^(https?://)?(www\.)?thehappyapp\.co\.uk([/?#]|$)'
        then regexp_replace(
          preview_url,
          '^(https?://)?(www\.)?thehappyapp\.co\.uk([/?#]|$)',
          'https://passagesounds.app\3',
          'i'
        )
      else preview_url
    end
  where
    artwork_url ~* '^(https?://)?(www\.)?thehappyapp\.co\.uk([/?#]|$)'
    or file_url ~* '^(https?://)?(www\.)?thehappyapp\.co\.uk([/?#]|$)'
    or preview_url ~* '^(https?://)?(www\.)?thehappyapp\.co\.uk([/?#]|$)'
  returning id
)
select count(*) as soundscape_rows_updated
from updated;

-- Abort the transaction instead of committing a partial migration if any URL
-- column still starts with the old hostname.
do $$
begin
  if exists (
    select 1
    from public.soundscapes
    where
      artwork_url ~* '^(https?://)?(www\.)?thehappyapp\.co\.uk([/?#]|$)'
      or file_url ~* '^(https?://)?(www\.)?thehappyapp\.co\.uk([/?#]|$)'
      or preview_url ~* '^(https?://)?(www\.)?thehappyapp\.co\.uk([/?#]|$)'
  ) then
    raise exception 'Old thehappyapp.co.uk URLs remain; transaction rolled back';
  end if;
end
$$;

commit;

-- Optional verification result after commit. All three values should be zero.
select
  count(*) filter (where artwork_url ilike '%thehappyapp.co.uk%') as old_artwork_urls,
  count(*) filter (where file_url ilike '%thehappyapp.co.uk%') as old_file_urls,
  count(*) filter (where preview_url ilike '%thehappyapp.co.uk%') as old_preview_urls
from public.soundscapes;
