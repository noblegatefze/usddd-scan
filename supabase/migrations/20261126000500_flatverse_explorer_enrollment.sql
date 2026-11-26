begin;

create table public.flatverse_explorer_enrollments (
  challenge_hash text primary key check (challenge_hash ~ '^[0-9a-f]{64}$'),
  account_id uuid not null unique,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  encrypted_secret text not null,
  expires_at timestamptz not null
);
create index flatverse_explorer_enrollments_expiry_idx
  on public.flatverse_explorer_enrollments (expires_at);

alter table public.flatverse_explorer_enrollments enable row level security;
revoke all on public.flatverse_explorer_enrollments from public, anon, authenticated;
grant select, insert, delete on public.flatverse_explorer_enrollments to service_role;

-- The server verifies the six-digit code before calling this transaction.
create function public.flatverse_finish_explorer_enrollment(
  p_challenge_hash text, p_step bigint, p_token_hash text
) returns uuid
language plpgsql set search_path = ''
as $$
declare
  enrollment public.flatverse_explorer_enrollments%rowtype;
begin
  delete from public.flatverse_explorer_enrollments
  where challenge_hash = p_challenge_hash and expires_at > now()
  returning * into enrollment;

  if not found then return null; end if;
  if not public.flatverse_reserve_explorer_username(enrollment.username, enrollment.account_id) then
    return null;
  end if;

  insert into public.fund_authenticator_credentials (
    terminal_user_id, encrypted_secret, last_accepted_step
  ) values (enrollment.account_id, enrollment.encrypted_secret, p_step);

  insert into public.fund_authenticator_sessions (terminal_user_id, token_hash, expires_at)
  values (enrollment.account_id, p_token_hash, now() + interval '8 hours');

  return enrollment.account_id;
end;
$$;

revoke all on function public.flatverse_finish_explorer_enrollment(text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.flatverse_finish_explorer_enrollment(text, bigint, text)
  to service_role;

commit;
