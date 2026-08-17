-- WP-4: Help centre (doc §5.3 R-09, §9.1, §9.2 — content updatable without an app release).

create table if not exists public.help_articles (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  category      text not null,
  title         text not null,
  body          text not null,
  sort_order    integer not null default 0,
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists set_updated_at_on_help_articles on public.help_articles;
create trigger set_updated_at_on_help_articles
before update on public.help_articles
for each row
execute function public.set_updated_at();

create index if not exists idx_help_articles_public_listing
  on public.help_articles (is_published, category, sort_order);
