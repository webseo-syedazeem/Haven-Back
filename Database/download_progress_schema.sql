-- WP-7: download progress (doc §5.3).

alter table public.user_downloads add column if not exists progress_percent integer not null default 0;
alter table public.user_downloads add column if not exists downloaded_bytes bigint not null default 0;

do $$
begin
    alter table public.user_downloads
        add constraint user_downloads_progress_percent_check
        check (progress_percent >= 0 and progress_percent <= 100);
exception
    when duplicate_object then null;
end $$;
