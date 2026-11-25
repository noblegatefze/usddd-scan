begin;
create table public.fund_authenticator_rate_limits (
  bucket text not null,
  window_id bigint not null,
  attempts integer not null,
  primary key (bucket, window_id)
);
create index fund_authenticator_rate_limits_window_idx
  on public.fund_authenticator_rate_limits (window_id);
alter table public.fund_authenticator_rate_limits enable row level security;
revoke all on public.fund_authenticator_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.fund_authenticator_rate_limits to service_role;

create function public.fund_authenticator_allow_attempt(p_bucket text, p_limit integer)
returns boolean language plpgsql set search_path = '' as $$
declare
  current_window bigint := floor(extract(epoch from now()) / 300);
  attempt_count integer;
begin
  insert into public.fund_authenticator_rate_limits as limits (bucket, window_id, attempts)
  values (p_bucket, current_window, 1)
  on conflict (bucket, window_id) do update set attempts = limits.attempts + 1
  returning attempts into attempt_count;
  return attempt_count <= p_limit;
end;
$$;
revoke all on function public.fund_authenticator_allow_attempt(text, integer)
  from public, anon, authenticated;
grant execute on function public.fund_authenticator_allow_attempt(text, integer) to service_role;
commit;
