-- Passage App Store audit: production database migration (all-in-one)
-- Run ONLY this file in the Supabase SQL Editor for the 2026-10-30 audit fixes.
-- Safe to run more than once: columns use IF NOT EXISTS, catalogue updates are
-- naturally idempotent, functions use CREATE OR REPLACE, and grants are repeatable.
-- The transaction rolls back every change if any statement fails.

begin;

-- 1. Columns required by the deployed preferences/support/analytics code.
alter table if exists public.user_notification_settings
    add column if not exists reminder_time time without time zone null;

alter table if exists public.support_requests
    add column if not exists reason text null;

alter table if exists public.users
    add column if not exists analytics_enabled boolean not null default false;

comment on column public.user_notification_settings.reminder_time is
    'Wall-clock wind-down reminder time. Scheduling happens on the device.';
comment on column public.support_requests.reason is
    'Optional structured reason for an audio-problem support request.';
comment on column public.users.analytics_enabled is
    'Optional product analytics consent. Off by default.';

-- 2. Do not overwrite a name the person edited in Passage when auth metadata
-- is refreshed by Google, Apple, or Supabase.
create or replace function public.sync_auth_user_to_public_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
    insert into public.users (
        auth_user_id,
        name,
        email,
        is_verified,
        last_sign_in_at
    )
    values (
        new.id,
        coalesce(
            new.raw_user_meta_data ->> 'name',
            new.raw_user_meta_data ->> 'username',
            new.raw_user_meta_data ->> 'full_name',
            split_part(new.email, '@', 1)
        ),
        new.email,
        coalesce(new.email_confirmed_at, new.confirmed_at) is not null
            or coalesce((new.raw_user_meta_data ->> 'email_verified')::boolean, false),
        new.last_sign_in_at
    )
    on conflict (auth_user_id)
    do update set
        name = coalesce(nullif(public.users.name, ''), excluded.name),
        email = excluded.email,
        is_verified = excluded.is_verified,
        last_sign_in_at = excluded.last_sign_in_at;

    return new;
end;
$function$;

revoke all on function public.sync_auth_user_to_public_users()
    from public, anon, authenticated;

-- 3. Lock every overload of the backend-only onboarding completion RPC.
-- Dynamic lookup means this block is safe if the RPC is absent or its exact
-- parameter signature differs between environments.
do $permissions$
declare
    function_signature text;
    function_count integer := 0;
begin
    for function_signature in
        select p.oid::regprocedure::text
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'save_user_onboarding_completion'
    loop
        function_count := function_count + 1;
        execute format(
            'revoke all on function %s from public, anon, authenticated',
            function_signature
        );
        execute format(
            'grant execute on function %s to service_role',
            function_signature
        );
    end loop;

    if function_count = 0 then
        raise notice 'save_user_onboarding_completion is not installed; no RPC grant needed';
    end if;
end;
$permissions$;

-- New public-schema functions created later are private by default. Explicit
-- grants can still be added to genuinely public functions when required.
alter default privileges in schema public
    revoke execute on functions from public;
alter default privileges in schema public
    revoke execute on functions from anon, authenticated;

-- 4. Replace health-outcome collection labels with audio-descriptive labels.
update public.collections
set title = 'Low-Detail Soundscapes', updated_at = now()
where title in ('Anxiety Relief', 'Stress Relief');

update public.collections
set title = 'Spacious Soundscapes', updated_at = now()
where title in ('Calm Your Mind', 'Reduce Anxiety');

commit;

-- Read-only verification output. These queries do not change data.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where (table_schema, table_name, column_name) in (
    ('public', 'user_notification_settings', 'reminder_time'),
    ('public', 'support_requests', 'reason'),
    ('public', 'users', 'analytics_enabled')
)
order by table_name, column_name;

select p.oid::regprocedure::text as function_signature,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'save_user_onboarding_completion';
