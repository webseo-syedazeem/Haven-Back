-- Passage remote-config QA seed
-- TEST DATA ONLY. Run in Supabase SQL Editor, verify the app/admin flow, then
-- use the cleanup block at the bottom before publishing real testimonials.
-- Re-running is safe: fixed keys are upserted and testimonial IDs stay stable.

begin;

-- Preserve the value that existed before the first QA run. ON CONFLICT DO
-- NOTHING is important: a second run must not overwrite the original backup
-- with the QA data from the first run.
insert into public.remote_config (key, value, is_verified, updated_at)
select
    'qa_backup_home_testimonials_20261030',
    jsonb_build_object(
        'original_value', value::jsonb,
        'original_is_verified', is_verified
    ),
    false,
    now()
from public.remote_config
where key = 'home_testimonials'
on conflict (key) do nothing;

-- The mobile app consumes this exact key. All names and quotes explicitly say
-- QA so this content cannot be mistaken for a genuine customer endorsement.
insert into public.remote_config (key, value, is_verified, updated_at)
values (
    'home_testimonials',
    $json$
    {
      "testimonials": [
        {
          "id": "qa-focus-01",
          "mode": "focus",
          "name": "Focus QA One",
          "role": "Internal Passage Test",
          "quote": "QA test: the first Focus testimonial and its remote avatar loaded correctly.",
          "avatar_url": "https://i.pravatar.cc/256?img=12",
          "consent_confirmed": true
        },
        {
          "id": "qa-focus-02",
          "mode": "focus",
          "name": "Focus QA Two",
          "role": "Internal Passage Test",
          "quote": "QA test: Focus mode filtering returned the second matching testimonial.",
          "avatar_url": "https://i.pravatar.cc/256?img=32",
          "consent_confirmed": true
        },
        {
          "id": "qa-sleep-01",
          "mode": "sleep",
          "name": "Sleep QA One",
          "role": "Internal Passage Test",
          "quote": "QA test: the first Sleep testimonial is visible only in the Sleep flow.",
          "avatar_url": "https://i.pravatar.cc/256?img=47",
          "consent_confirmed": true
        },
        {
          "id": "qa-sleep-02",
          "mode": "sleep",
          "name": "Sleep QA Two",
          "role": "Internal Passage Test",
          "quote": "QA test: the Sleep card layout handles a second remote-config record.",
          "avatar_url": "https://i.pravatar.cc/256?img=16",
          "consent_confirmed": true
        },
        {
          "id": "qa-relax-01",
          "mode": "relax",
          "name": "Relax QA One",
          "role": "Internal Passage Test",
          "quote": "QA test: the first Relax testimonial and HTTPS avatar loaded correctly.",
          "avatar_url": "https://i.pravatar.cc/256?img=25",
          "consent_confirmed": true
        },
        {
          "id": "qa-relax-02",
          "mode": "relax",
          "name": "Relax QA Two",
          "role": "Internal Passage Test",
          "quote": "QA test: Relax mode filtering returned the correct second card.",
          "avatar_url": "https://i.pravatar.cc/256?img=49",
          "consent_confirmed": true
        }
      ]
    }
    $json$,
    true,
    now()
), (
    'qa_test_banner',
    $json$
    {
      "enabled": true,
      "environment": "qa",
      "title": "Remote config QA is active",
      "message": "This record verifies nested text, booleans, arrays and image URLs.",
      "image_url": "https://picsum.photos/seed/passage-banner/1200/600",
      "cta": { "label": "Open Passage", "route": "/welcome" },
      "tags": ["remote-config", "qa", "verified"]
    }
    $json$,
    true,
    now()
), (
    'qa_feature_cards',
    $json$
    {
      "enabled": true,
      "cards": [
        {
          "id": "qa-card-focus",
          "mode": "focus",
          "title": "Focus QA Card",
          "description": "Tests a nested card with an image and mode value.",
          "image_url": "https://picsum.photos/seed/passage-focus/800/800"
        },
        {
          "id": "qa-card-sleep",
          "mode": "sleep",
          "title": "Sleep QA Card",
          "description": "Tests a second nested object in the cards array.",
          "image_url": "https://picsum.photos/seed/passage-sleep/800/800"
        },
        {
          "id": "qa-card-relax",
          "mode": "relax",
          "title": "Relax QA Card",
          "description": "Tests Relax filtering and another HTTPS image.",
          "image_url": "https://picsum.photos/seed/passage-relax/800/800"
        }
      ]
    }
    $json$,
    true,
    now()
)
on conflict (key) do update set
    value = excluded.value,
    is_verified = excluded.is_verified,
    updated_at = now();

commit;

-- Verification result: expect three verified QA/public keys. The backup, when
-- present, stays unverified and therefore never appears through the public API.
select
    key,
    is_verified,
    jsonb_typeof(value::jsonb) as value_type,
    case
        when key = 'home_testimonials'
            then jsonb_array_length((value::jsonb) -> 'testimonials')
        when key = 'qa_feature_cards'
            then jsonb_array_length((value::jsonb) -> 'cards')
        else null
    end as item_count,
    updated_at
from public.remote_config
where key in (
    'home_testimonials',
    'qa_test_banner',
    'qa_feature_cards',
    'qa_backup_home_testimonials_20261030'
)
order by key;

-- CLEANUP AFTER TESTING
-- Run this block separately after you finish QA. It restores the original
-- testimonials when a backup exists and removes all QA-only keys.
--
-- begin;
-- do $cleanup$
-- begin
--   if exists (
--     select 1 from public.remote_config
--     where key = 'qa_backup_home_testimonials_20261030'
--   ) then
--     update public.remote_config target
--     set value = (backup.value::jsonb) -> 'original_value',
--         is_verified = coalesce(
--           ((backup.value::jsonb) ->> 'original_is_verified')::boolean,
--           false
--         ),
--         updated_at = now()
--     from public.remote_config backup
--     where target.key = 'home_testimonials'
--       and backup.key = 'qa_backup_home_testimonials_20261030';
--   else
--     delete from public.remote_config
--     where key = 'home_testimonials'
--       and (value::jsonb -> 'testimonials' -> 0 ->> 'id') = 'qa-focus-01';
--   end if;
--
--   delete from public.remote_config
--   where key in (
--     'qa_test_banner',
--     'qa_feature_cards',
--     'qa_backup_home_testimonials_20261030'
--   );
-- end;
-- $cleanup$;
-- commit;
