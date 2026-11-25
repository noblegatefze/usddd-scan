begin;

create table public.fund_authenticator_credentials (
  terminal_user_id uuid primary key,
  encrypted_secret text not null,
  last_accepted_step bigint not null check (last_accepted_step >= 0),
  enrolled_at timestamptz not null default now()
);

create table public.fund_authenticator_enrollments (
  challenge_hash text primary key check (challenge_hash ~ '^[0-9a-f]{64}$'),
  terminal_user_id uuid not null,
  encrypted_secret text not null,
  expires_at timestamptz not null
);
create index fund_authenticator_enrollments_expiry_idx
  on public.fund_authenticator_enrollments (expires_at);

create table public.fund_authenticator_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  terminal_user_id uuid not null
    references public.fund_authenticator_credentials (terminal_user_id) on delete cascade,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > verified_at)
);
create index fund_authenticator_sessions_owner_idx
  on public.fund_authenticator_sessions (terminal_user_id);
create index fund_authenticator_sessions_expiry_idx
  on public.fund_authenticator_sessions (expires_at);

alter table public.fund_authenticator_credentials enable row level security;
alter table public.fund_authenticator_enrollments enable row level security;
alter table public.fund_authenticator_sessions enable row level security;

revoke all on public.fund_authenticator_credentials,
  public.fund_authenticator_enrollments,
  public.fund_authenticator_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.fund_authenticator_credentials,
  public.fund_authenticator_enrollments,
  public.fund_authenticator_sessions to service_role;

commit;
