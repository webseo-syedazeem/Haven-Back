-- H-04 remediation: anonymize personal data in support_requests and analytics_events
-- on account deletion.
--
-- This migration is INFORMATIONAL — the actual anonymization is now performed
-- by DeleteAccount in Controller/Auth.ts before deleting the users row. Running
-- this script against an existing database back-fills anonymization for any rows
-- that were already orphaned (user_id = null) before this fix was deployed, where
-- the contact_email / subject / message may still contain personal data from an
-- account that has since been deleted.
--
-- Safe to run more than once: UPDATE WHERE ... is idempotent.

begin;

-- Back-fill: anonymize support_requests rows where the user has already been
-- deleted (user_id is null) but personal fields were not cleared.
update public.support_requests
set
    contact_email = null,
    subject       = '[deleted]',
    message       = '[deleted]'
where user_id is null
  and (
      contact_email is not null
      or (subject is not null and subject <> '[deleted]')
      or message <> '[deleted]'
  );

-- Back-fill: clear session_id and event_data from analytics_events rows where
-- the user has already been deleted.
update public.analytics_events
set
    event_data = '{}'::jsonb,
    session_id = null
where user_id is null
  and (
      event_data <> '{}'::jsonb
      or session_id is not null
  );

commit;

-- Verification: confirm no orphaned rows retain personal data.
select
    count(*) filter (where contact_email is not null)  as support_with_email,
    count(*) filter (where subject <> '[deleted]' and subject is not null) as support_with_subject,
    count(*) filter (where message <> '[deleted]')     as support_with_message
from public.support_requests
where user_id is null;

select
    count(*) filter (where event_data <> '{}'::jsonb) as analytics_with_data,
    count(*) filter (where session_id is not null)     as analytics_with_session_id
from public.analytics_events
where user_id is null;
