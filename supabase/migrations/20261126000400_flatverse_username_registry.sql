begin;

lock table public.dd_terminal_users in share row exclusive mode;

create table public.flatverse_usernames (
  username_key text primary key check (username_key <> '' and username_key = lower(btrim(username_key))),
  display_name text not null,
  account_id uuid unique,
  source text not null check (source in ('legacy', 'explorer')),
  created_at timestamptz not null default now(),
  check (source = 'legacy' or account_id is not null)
);

alter table public.flatverse_usernames enable row level security;
revoke all on public.flatverse_usernames from public, anon, authenticated;
grant select on public.flatverse_usernames to service_role;

-- Reserve historical names even if two old accounts differ only by case.
-- A collision stays reserved and can be resolved through ownership review.
insert into public.flatverse_usernames (username_key, display_name, source)
select distinct on (lower(btrim(username))) lower(btrim(username)), username, 'legacy'
from public.dd_terminal_users
where btrim(username) <> ''
order by lower(btrim(username)), username, id;

create function public.flatverse_reserve_terminal_username()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare normalized text := lower(btrim(new.username));
begin
  if tg_op = 'UPDATE' and normalized = lower(btrim(old.username)) then
    return new;
  end if;

  insert into public.flatverse_usernames (username_key, display_name, source)
  values (normalized, new.username, 'legacy')
  on conflict (username_key) do nothing;

  if not found then
    raise unique_violation using message = 'That username is already reserved.';
  end if;
  return new;
end;
$$;

revoke all on function public.flatverse_reserve_terminal_username() from public, anon, authenticated;
create trigger flatverse_reserve_terminal_username
before insert or update of username on public.dd_terminal_users
for each row execute function public.flatverse_reserve_terminal_username();

create function public.flatverse_reserve_explorer_username(p_username text, p_account_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare chosen text := btrim(p_username);
begin
  if chosen is null or chosen !~ '^[A-Za-z0-9_]{3,24}$' or p_account_id is null then
    return false;
  end if;

  insert into public.flatverse_usernames (username_key, display_name, account_id, source)
  values (lower(chosen), chosen, p_account_id, 'explorer')
  on conflict do nothing;
  return found;
end;
$$;

revoke all on function public.flatverse_reserve_explorer_username(text, uuid) from public, anon, authenticated;
grant execute on function public.flatverse_reserve_explorer_username(text, uuid) to service_role;

commit;
