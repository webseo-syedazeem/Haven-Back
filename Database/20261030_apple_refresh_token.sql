-- App Store Guideline 5.1.1(v): store the Apple refresh token obtained from the
-- Sign-in-with-Apple authorization-code exchange, so account deletion can revoke
-- it via Apple's /auth/revoke endpoint. Written only by the backend (service
-- role); never exposed to clients (RLS on `users` already restricts row access,
-- and the API never selects this column into any client response).

alter table public.users
    add column if not exists apple_refresh_token text;

comment on column public.users.apple_refresh_token is
    'Apple Sign-in refresh token from the auth-code exchange; used to revoke the Apple token on account deletion (App Store 5.1.1(v)). Backend/service-role only.';
