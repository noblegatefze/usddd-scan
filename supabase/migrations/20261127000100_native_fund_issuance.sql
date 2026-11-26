-- Issue the owner-bound address and its encrypted key in one transaction.
create or replace function public.fund_issue_explorer_address(
  p_owner uuid, p_ref text, p_address text, p_min numeric, p_max numeric, p_encrypted_key text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  position public.fund_positions%rowtype;
begin
  if not exists (select 1 from public.fund_authenticator_credentials where terminal_user_id = p_owner) then
    raise exception 'Explorer owner required';
  end if;

  insert into public.fund_positions
    (terminal_user_id, position_ref, issued_deposit_address, chain, token, expected_min_usdt, expected_max_usdt, status, locked)
  values (p_owner, p_ref, p_address, 'bsc', 'usdt', p_min, p_max, 'awaiting_funds', true)
  on conflict (position_ref) do nothing
  returning * into position;

  if found then
    insert into public.fund_deposit_keys(position_id, enc_privkey)
    values (position.id, p_encrypted_key);
  else
    select * into position from public.fund_positions where position_ref = p_ref and terminal_user_id = p_owner;
    if not found then
      raise exception 'Position reference conflict';
    end if;
  end if;

  return jsonb_build_object(
    'id', position.id, 'ref', position.position_ref, 'deposit_address', position.issued_deposit_address,
    'chain', position.chain, 'token', position.token, 'min_usdt', position.expected_min_usdt,
    'max_usdt', position.expected_max_usdt, 'status', position.status, 'created_at', position.created_at
  );
end;
$$;

revoke all on function public.fund_issue_explorer_address(uuid,text,text,numeric,numeric,text)
  from public, anon, authenticated;
grant execute on function public.fund_issue_explorer_address(uuid,text,text,numeric,numeric,text)
  to service_role;
