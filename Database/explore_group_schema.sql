-- WP-6: Explore groupings (doc §4 Explore). Only the grouping dimension + a public
-- read; curated collection content is populated later alongside real soundscape data.

alter table public.collections add column if not exists explore_group text;

do $$
begin
    alter table public.collections
        add constraint collections_explore_group_check
        check (explore_group is null or explore_group in (
            'nature', 'indoor', 'travel', 'animals', 'instruments', 'weather', 'situation', 'editorial'
        ));
exception
    when duplicate_object then null;
end $$;

create index if not exists idx_collections_explore_group
  on public.collections (explore_group, sort_order)
  where is_published = true;
