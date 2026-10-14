-- Passage: set artwork_url for the 27 Sleep soundscapes inserted via Passage_Insert_27_Sleep_Soundscapes.sql.
-- Images were generated, corrected to 1254x1254 WebP, and are already deployed at:
-- public/passage_soundscape_images_webp/ -> served as https://thehappyapp.co.uk/passage_soundscape_images_webp/<file>
-- Safe to re-run: matches by catalogue_ref and always sets the same value.

begin;

update public.soundscapes as s
set artwork_url = v.artwork_url
from (
  values
    ('P-S009', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S009-ceiling-fan.webp'),
    ('P-S010', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S010-air-conditioner.webp'),
    ('P-S015', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S015-rain-on-a-paris-bedroom-window.webp'),
    ('P-S016', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S016-rain-on-a-canvas-tent.webp'),
    ('P-S017', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S017-summer-crickets-in-tuscany.webp'),
    ('P-S019', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S019-distant-frogs.webp'),
    ('P-S023', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S023-beach-at-night-in-the-maldives.webp'),
    ('P-S024', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S024-pebble-beach-waves.webp'),
    ('P-S025', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S025-canadian-lake-waves.webp'),
    ('P-S028', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S028-stream-in-the-scottish-highlands.webp'),
    ('P-S029', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S029-slow-river-at-night.webp'),
    ('P-S030', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S030-distant-waterfall.webp'),
    ('P-S033', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S033-alpine-stream-beneath-the-snow.webp'),
    ('P-S042', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S042-underwater-at-the-great-barrier-reef.webp'),
    ('P-S046', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S046-waves-in-a-portuguese-sea-cave.webp'),
    ('P-S047', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S047-scuba-dive-at-the-great-barrier-reef.webp'),
    ('P-S048', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S048-brown-noise.webp'),
    ('P-S050', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S050-white-noise.webp'),
    ('P-S051', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S051-box-fan.webp'),
    ('P-S052', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S052-tibetan-singing-bowls.webp'),
    ('P-S053', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S053-gentle-rain.webp'),
    ('P-S054', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S054-rain-on-a-tin-roof.webp'),
    ('P-S055', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S055-distant-rolling-thunder.webp'),
    ('P-S056', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S056-blizzard-outside-an-alpine-cabin.webp'),
    ('P-S057', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S057-nighttime-forest.webp'),
    ('P-S058', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S058-autumn-wind.webp'),
    ('P-S059', 'https://thehappyapp.co.uk/passage_soundscape_images_webp/P-S059-amazon-jungle-at-night.webp')
) as v (catalogue_ref, artwork_url)
where s.catalogue_ref = v.catalogue_ref;

commit;

-- Verify after commit:
-- select catalogue_ref, title, artwork_url from public.soundscapes
-- where catalogue_ref in (
--   'P-S009','P-S010','P-S015','P-S016','P-S017','P-S019','P-S023','P-S024','P-S025','P-S028',
--   'P-S029','P-S030','P-S033','P-S042','P-S046','P-S047','P-S048','P-S050','P-S051','P-S052',
--   'P-S053','P-S054','P-S055','P-S056','P-S057','P-S058','P-S059'
-- )
-- order by catalogue_ref;
