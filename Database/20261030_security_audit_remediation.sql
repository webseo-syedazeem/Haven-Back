-- Component/reference migration. For production deployment, run
-- 20261030_app_store_audit_all_in_one.sql instead of this file.
begin;

revoke all on function public.save_user_onboarding_completion(bigint,text,text[],text[],integer,text,text[],text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.save_user_onboarding_completion(bigint,text,text[],text[],integer,text,text[],text,timestamptz,jsonb) to service_role;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

create or replace function public.sync_auth_user_to_public_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (auth_user_id, name, email, is_verified, last_sign_in_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'username', new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.email_confirmed_at, new.confirmed_at) is not null or coalesce((new.raw_user_meta_data ->> 'email_verified')::boolean, false),
    new.last_sign_in_at
  )
  on conflict (auth_user_id) do update set
    name = coalesce(nullif(public.users.name, ''), excluded.name),
    email = excluded.email,
    is_verified = excluded.is_verified,
    last_sign_in_at = excluded.last_sign_in_at;
  return new;
end;
$$;

revoke all on function public.sync_auth_user_to_public_users() from public, anon, authenticated;

commit;
