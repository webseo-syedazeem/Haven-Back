create type support_request_type as enum ('contact_support', 'report_audio_problem', 'request_soundscape');
create type support_request_status as enum ('open', 'in_review', 'resolved', 'closed');

create table support_requests (
  id                uuid primary key default gen_random_uuid(),
  user_id           bigint references users(id) on delete set null,
  type              support_request_type not null,
  subject           text,
  message           text not null,
  soundscape_id     uuid references soundscapes(id) on delete set null,
  contact_email     text,
  status            support_request_status not null default 'open',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_support_requests_user on support_requests (user_id, created_at desc);
create index idx_support_requests_type_status on support_requests (type, status);
