-- Source: soundscapes_rows (4).csv, inspected 2026-10-23: 110 rows.
-- 40 focus, 45 sleep, 25 relax. Every supplied reference and hex is unique.
-- Scene-led colours; existing warm-white Play text has contrast >= 4.5:1.
-- Updates existing rows only. Existing updated_at trigger will run on changed rows.
-- Apply before deploying the colour editor. Existing API caches must expire or
-- be invalidated via the application's existing soundscape invalidation flow.
BEGIN;
ALTER TABLE public.soundscapes ADD COLUMN IF NOT EXISTS colour text;

DO $migration$
DECLARE
  supplied jsonb := $colours$[
    {"catalogue_ref": "P-F030", "colour": "#52704B", "title": "Distant Garden Birdsong"},
    {"catalogue_ref": "P-R040", "colour": "#4E708D", "title": "Cable Car over the Alps"},
    {"catalogue_ref": "P-R042", "colour": "#916047", "title": "Wooden Sailing Boat"},
    {"catalogue_ref": "P-S042", "colour": "#23768A", "title": "Underwater at the Great Barrier Reef"},
    {"catalogue_ref": "P-S046", "colour": "#426B85", "title": "Waves in a Portuguese Sea Cave"},
    {"catalogue_ref": "P-F056", "colour": "#42734D", "title": "Birdsong in the New Forest"},
    {"catalogue_ref": "P-S053", "colour": "#4B7284", "title": "Gentle Rain"},
    {"catalogue_ref": "P-S002", "colour": "#42658A", "title": "Norwegian Ferry Cabin at Night"},
    {"catalogue_ref": "P-F028", "colour": "#856930", "title": "Bees in a Clover Field"},
    {"catalogue_ref": "P-F032", "colour": "#90634C", "title": "Bubbling Mud Pools"},
    {"catalogue_ref": "P-S006", "colour": "#436F73", "title": "Night on a Houseboat"},
    {"catalogue_ref": "P-S033", "colour": "#507189", "title": "Alpine Stream beneath the Snow"},
    {"catalogue_ref": "P-S017", "colour": "#547246", "title": "Summer Crickets in Tuscany"},
    {"catalogue_ref": "P-S050", "colour": "#636E7B", "title": "White Noise"},
    {"catalogue_ref": "P-R008", "colour": "#427163", "title": "Louisiana Swamp at Dusk"},
    {"catalogue_ref": "P-R015", "colour": "#326C82", "title": "Atlantic Waves below Irish Cliffs"},
    {"catalogue_ref": "P-F004", "colour": "#5D6E87", "title": "Small Airplane Cabin"},
    {"catalogue_ref": "P-S037", "colour": "#396F5C", "title": "Wind through Pine Trees"},
    {"catalogue_ref": "P-R044", "colour": "#38748B", "title": "Seal Calls beneath Antarctic Ice"},
    {"catalogue_ref": "P-R010", "colour": "#6A723B", "title": "Summer Meadow Grasshoppers"},
    {"catalogue_ref": "P-S055", "colour": "#606384", "title": "Distant Rolling Thunder"},
    {"catalogue_ref": "P-F044", "colour": "#656C82", "title": "Airport Terminal"},
    {"catalogue_ref": "P-S012", "colour": "#965D3C", "title": "Wood Stove in a Cabin"},
    {"catalogue_ref": "P-F002", "colour": "#596B86", "title": "Swiss Train Tunnel"},
    {"catalogue_ref": "P-S032", "colour": "#5C7080", "title": "Quiet Cave Drips"},
    {"catalogue_ref": "P-R016", "colour": "#26787D", "title": "Gentle Waves in the Bahamas"},
    {"catalogue_ref": "P-S001", "colour": "#4B6089", "title": "Night Train through Siberia"},
    {"catalogue_ref": "P-S010", "colour": "#5B6F7F", "title": "Air Conditioner"},
    {"catalogue_ref": "P-S004", "colour": "#506A8E", "title": "Airplane Cabin"},
    {"catalogue_ref": "P-S023", "colour": "#2C718E", "title": "Beach at Night in the Maldives"},
    {"catalogue_ref": "P-R014", "colour": "#A25843", "title": "Wind through a Utah Canyon"},
    {"catalogue_ref": "P-S029", "colour": "#356D77", "title": "Slow River at Night"},
    {"catalogue_ref": "P-R007", "colour": "#34765A", "title": "Tree Frogs in Puerto Rico"},
    {"catalogue_ref": "P-R001", "colour": "#597143", "title": "Dawn in an Ancient Forest"},
    {"catalogue_ref": "P-R003", "colour": "#3D776C", "title": "Costa Rican Cloud Forest"},
    {"catalogue_ref": "P-S061", "colour": "#53698B", "title": "Distant Highway in the Rain"},
    {"catalogue_ref": "P-S041", "colour": "#A25038", "title": "Glowing Embers"},
    {"catalogue_ref": "P-S034", "colour": "#337779", "title": "Bubbling Icelandic Hot Spring"},
    {"catalogue_ref": "P-R043", "colour": "#8F643C", "title": "Inside a Dutch Windmill"},
    {"catalogue_ref": "P-F033", "colour": "#337682", "title": "Icelandic Meltwater"},
    {"catalogue_ref": "P-S054", "colour": "#5D6F84", "title": "Rain on a Tin Roof"},
    {"catalogue_ref": "P-F036", "colour": "#806B3A", "title": "Rustling Reeds"},
    {"catalogue_ref": "P-R009", "colour": "#32634F", "title": "Borneo Jungle at Night"},
    {"catalogue_ref": "P-S016", "colour": "#64724E", "title": "Rain on a Canvas Tent"},
    {"catalogue_ref": "P-R006", "colour": "#826572", "title": "Cranes over a Winter Marsh"},
    {"catalogue_ref": "P-S048", "colour": "#89634E", "title": "Brown Noise"},
    {"catalogue_ref": "P-F054", "colour": "#4B7849", "title": "Rustling Bamboo Forest in Kyoto"},
    {"catalogue_ref": "P-F010", "colour": "#8D6539", "title": "French Watermill"},
    {"catalogue_ref": "P-R017", "colour": "#616F7F", "title": "Waves on a Pebble Beach"},
    {"catalogue_ref": "P-F053", "colour": "#497383", "title": "Ocean Waves on Pebbles"},
    {"catalogue_ref": "P-S060", "colour": "#855C47", "title": "Below Deck on a Wooden Ship"},
    {"catalogue_ref": "P-F057", "colour": "#5A707D", "title": "White Noise for Focus"},
    {"catalogue_ref": "P-R018", "colour": "#317872", "title": "Tidal Rock Pools"},
    {"catalogue_ref": "P-S025", "colour": "#3D7180", "title": "Canadian Lake Waves"},
    {"catalogue_ref": "P-F051", "colour": "#487852", "title": "Forest Wind and Morning Birds"},
    {"catalogue_ref": "P-F045", "colour": "#77677C", "title": "Train Station Waiting Room"},
    {"catalogue_ref": "P-F041", "colour": "#956148", "title": "Bustling Parisian Cafe"},
    {"catalogue_ref": "P-S003", "colour": "#526580", "title": "Overnight Coach"},
    {"catalogue_ref": "P-S015", "colour": "#646B90", "title": "Rain on a Paris Bedroom Window"},
    {"catalogue_ref": "P-F026", "colour": "#7D6C38", "title": "Cicadas in Provence"},
    {"catalogue_ref": "P-F034", "colour": "#726B78", "title": "Limestone Cave Drips"},
    {"catalogue_ref": "P-S014", "colour": "#A2593E", "title": "Fireplace in a Scottish Cottage"},
    {"catalogue_ref": "P-F031", "colour": "#5C716E", "title": "Yellowstone Steam Vent"},
    {"catalogue_ref": "P-F048", "colour": "#8D6456", "title": "Coffee Shop in the Rain"},
    {"catalogue_ref": "P-F037", "colour": "#98513E", "title": "Cottage Fireplace Embers"},
    {"catalogue_ref": "P-S024", "colour": "#597081", "title": "Pebble Beach Waves"},
    {"catalogue_ref": "P-S028", "colour": "#39756B", "title": "Stream in the Scottish Highlands"},
    {"catalogue_ref": "P-S051", "colour": "#567278", "title": "Box Fan"},
    {"catalogue_ref": "P-F035", "colour": "#3F6F7E", "title": "Cornish Sea Cave"},
    {"catalogue_ref": "P-R005", "colour": "#656C88", "title": "Bird Calls across a Scottish Lake"},
    {"catalogue_ref": "P-S047", "colour": "#267285", "title": "Scuba Dive at the Great Barrier Reef"},
    {"catalogue_ref": "P-S021", "colour": "#84666A", "title": "Distant Doves"},
    {"catalogue_ref": "P-S043", "colour": "#447388", "title": "Melting Glacier Ice"},
    {"catalogue_ref": "P-F052", "colour": "#5C6A91", "title": "Spring Thunderstorm"},
    {"catalogue_ref": "P-F046", "colour": "#8B6255", "title": "Cosy Bookstore"},
    {"catalogue_ref": "P-F019", "colour": "#527281", "title": "Waves beyond the Dunes"},
    {"catalogue_ref": "P-S019", "colour": "#4D755A", "title": "Distant Frogs"},
    {"catalogue_ref": "P-S058", "colour": "#9B5E3A", "title": "Autumn Wind"},
    {"catalogue_ref": "P-F038", "colour": "#925840", "title": "Wood Stove in a Japanese Cabin"},
    {"catalogue_ref": "P-F017", "colour": "#2F796B", "title": "Forest Cascade"},
    {"catalogue_ref": "P-R045", "colour": "#36786A", "title": "Water through Mangrove Roots"},
    {"catalogue_ref": "P-S044", "colour": "#58648C", "title": "Space Station Sleep Pod"},
    {"catalogue_ref": "P-S052", "colour": "#876842", "title": "Tibetan Singing Bowls"},
    {"catalogue_ref": "P-R002", "colour": "#367A56", "title": "Australian Rainforest at Dawn"},
    {"catalogue_ref": "P-F043", "colour": "#5D707F", "title": "Busy Open-Plan Office"},
    {"catalogue_ref": "P-F058", "colour": "#33647B", "title": "Inside an Arctic Submarine"},
    {"catalogue_ref": "P-F047", "colour": "#78687B", "title": "Art Museum Gallery"},
    {"catalogue_ref": "P-R011", "colour": "#537562", "title": "Breeze through Eucalyptus Trees"},
    {"catalogue_ref": "P-S007", "colour": "#57708A", "title": "Antarctic Station Bedroom"},
    {"catalogue_ref": "P-F012", "colour": "#65667D", "title": "Air through a Lava Cave"},
    {"catalogue_ref": "P-F021", "colour": "#4C6D77", "title": "Waves on Volcanic Rock"},
    {"catalogue_ref": "P-S056", "colour": "#5F6E86", "title": "Blizzard outside an Alpine Cabin"},
    {"catalogue_ref": "P-S059", "colour": "#34694F", "title": "Amazon Jungle at Night"},
    {"catalogue_ref": "P-R013", "colour": "#9B5E3E", "title": "Desert Wind over Sand Dunes"},
    {"catalogue_ref": "P-R019", "colour": "#40776D", "title": "Lake Waves beneath a Willow"},
    {"catalogue_ref": "P-F024", "colour": "#886734", "title": "Rustling Aspen Leaves"},
    {"catalogue_ref": "P-S049", "colour": "#905F71", "title": "Pink Noise"},
    {"catalogue_ref": "P-R012", "colour": "#9C5D3F", "title": "Autumn Beech Forest"},
    {"catalogue_ref": "P-S030", "colour": "#3E7487", "title": "Distant Waterfall"},
    {"catalogue_ref": "P-R041", "colour": "#8A6550", "title": "Paddle-Steamer Cabin"},
    {"catalogue_ref": "P-F055", "colour": "#2E705E", "title": "Rainforest Canopy in Borneo"},
    {"catalogue_ref": "P-S009", "colour": "#646C7C", "title": "Ceiling Fan"},
    {"catalogue_ref": "P-F049", "colour": "#43726A", "title": "Gentle Morning Rain"},
    {"catalogue_ref": "P-F042", "colour": "#806650", "title": "Quiet University Library"},
    {"catalogue_ref": "P-F050", "colour": "#306E89", "title": "Rushing Alpine Stream"},
    {"catalogue_ref": "P-F001", "colour": "#4E6B8C", "title": "Bullet Train through Japan"},
    {"catalogue_ref": "P-R004", "colour": "#5F7044", "title": "Springtime Marsh"},
    {"catalogue_ref": "P-F003", "colour": "#366F79", "title": "Riverboat on the Danube"},
    {"catalogue_ref": "P-S057", "colour": "#435C70", "title": "Nighttime Forest"},
    {"catalogue_ref": "P-F018", "colour": "#2D6D65", "title": "Deep Forest River"}
  ]$colours$::jsonb;
  missing_refs text[];
  changed_count integer;
BEGIN
  IF jsonb_array_length(supplied) <> 110
     OR (SELECT count(DISTINCT x.catalogue_ref) FROM jsonb_to_recordset(supplied) AS x(catalogue_ref text)) <> 110
     OR (SELECT count(DISTINCT x.colour) FROM jsonb_to_recordset(supplied) AS x(colour text)) <> 110
     OR EXISTS (SELECT 1 FROM jsonb_to_recordset(supplied) AS x(colour text) WHERE x.colour IS NULL OR x.colour !~ '^#[0-9A-F]{6}$') THEN
    RAISE EXCEPTION 'Expected 110 unique references and valid unique colours';
  END IF;

  SELECT array_agg(x.catalogue_ref ORDER BY x.catalogue_ref) INTO missing_refs
  FROM jsonb_to_recordset(supplied) AS x(catalogue_ref text)
  LEFT JOIN public.soundscapes s USING (catalogue_ref)
  WHERE s.id IS NULL;
  IF missing_refs IS NOT NULL THEN
    RAISE EXCEPTION 'Missing soundscapes: %. No changes committed.', missing_refs;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.soundscapes'::regclass AND conname = 'soundscapes_colour_hex_check') THEN
    ALTER TABLE public.soundscapes ADD CONSTRAINT soundscapes_colour_hex_check
      CHECK (colour IS NULL OR colour ~ '^#[0-9A-Fa-f]{6}$');
  END IF;

  UPDATE public.soundscapes s SET colour = x.colour
  FROM jsonb_to_recordset(supplied) AS x(catalogue_ref text, colour text)
  WHERE s.catalogue_ref = x.catalogue_ref AND s.colour IS DISTINCT FROM x.colour;
  GET DIAGNOSTICS changed_count = ROW_COUNT;

  IF (SELECT count(*) FROM public.soundscapes s
      JOIN jsonb_to_recordset(supplied) AS x(catalogue_ref text, colour text)
      ON s.catalogue_ref = x.catalogue_ref AND s.colour = x.colour) <> 110 THEN
    RAISE EXCEPTION 'Colour verification failed. No changes committed.';
  END IF;
  RAISE NOTICE 'Verified 110 supplied soundscapes with 110 unique colours; % rows updated.', changed_count;
END
$migration$;
COMMIT;
