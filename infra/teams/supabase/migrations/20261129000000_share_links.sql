-- Share link without a team: what a person shares by link lives on a team of their own, made the
-- first time they share. It is not one of the teams they make (max_own_teams).
alter table public.teams
  add column personal_owner uuid unique references auth.users (id) on delete cascade;

-- The caller's own team for shared links, made on first use.
create function public.personal_team () returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  t uuid;
begin
  if auth.uid () is null then raise exception 'not-allowed'; end if;
  select id into t from public.teams where personal_owner = auth.uid ();
  if t is not null then return t; end if;
  insert into public.teams (name, personal_owner) values ('Shared links', auth.uid ())
    on conflict (personal_owner) do nothing
    returning id into t;
  if t is null then
    select id into t from public.teams where personal_owner = auth.uid ();
    return t;
  end if;
  insert into public.team_members (team_id, user_id, email, role)
    values (t, auth.uid (), public.caller_email (), 'admin');
  return t;
end;
$$;

create or replace function public.create_team (p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  t uuid;
begin
  if auth.uid () is null then raise exception 'not-allowed'; end if;
  if (select count(*) from public.team_members m join public.teams tm on tm.id = m.team_id
      where m.user_id = auth.uid () and m.role = 'admin' and tm.personal_owner is null)
     >= public.max_own_teams () then
    raise exception 'too-many-teams' using detail = public.max_own_teams ()::text;
  end if;
  insert into public.teams (name) values (trim(p_name)) returning id into t;
  insert into public.team_members (team_id, user_id, email, role)
    values (t, auth.uid (), public.caller_email (), 'admin');
  return t;
end;
$$;

revoke all on function public.personal_team from public, anon;
grant execute on function public.personal_team to authenticated;
