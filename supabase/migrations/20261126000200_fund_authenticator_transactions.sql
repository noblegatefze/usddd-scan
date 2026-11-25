begin;

create function public.fund_finish_authenticator_enrollment(
  p_challenge_hash text, p_step bigint, p_token_hash text
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  enrollment public.fund_authenticator_enrollments%rowtype;
  enrolled_user uuid;
begin
  delete from public.fund_authenticator_enrollments
  where challenge_hash = p_challenge_hash and expires_at > now()
  returning * into enrollment;
  if not found then return null; end if;

  insert into public.fund_authenticator_credentials (
    terminal_user_id, encrypted_secret, last_accepted_step
  ) values (
    enrollment.terminal_user_id, enrollment.encrypted_secret, p_step
  )
  on conflict (terminal_user_id) do nothing
  returning terminal_user_id into enrolled_user;
  if enrolled_user is null then return null; end if;

  insert into public.fund_authenticator_sessions (terminal_user_id, token_hash, expires_at)
  values (enrolled_user, p_token_hash, now() + interval '8 hours');

  return enrolled_user;
end;
$$;

create function public.fund_consume_authenticator_code(
  p_user uuid, p_expected_secret text, p_step bigint, p_token_hash text
) returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.fund_authenticator_credentials
  set last_accepted_step = p_step
  where terminal_user_id = p_user
    and encrypted_secret = p_expected_secret
    and last_accepted_step < p_step;
  if not found then return false; end if;

  insert into public.fund_authenticator_sessions (terminal_user_id, token_hash, expires_at)
  values (p_user, p_token_hash, now() + interval '8 hours');

  return true;
end;
$$;

revoke all on function public.fund_finish_authenticator_enrollment(text, bigint, text)
  from public, anon, authenticated;
revoke all on function public.fund_consume_authenticator_code(uuid, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.fund_finish_authenticator_enrollment(text, bigint, text)
  to service_role;
grant execute on function public.fund_consume_authenticator_code(uuid, text, bigint, text)
  to service_role;

commit;
