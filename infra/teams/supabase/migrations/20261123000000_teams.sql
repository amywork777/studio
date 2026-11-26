-- Studio Teams: who is on which team, the projects a team shares, who has each one checked out,
-- and every check-in. People read through RLS; every change goes through a function below, which
-- checks the caller's role, so no table has an insert, update or delete policy.

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  -- Admins and Editors take a seat; Viewers are free.
  seats int not null default 3 check (seats >= 1),
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table public.team_invites (
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('admin', 'editor', 'viewer')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, email)
);

create table public.team_projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  -- 0 until the first check-in lands.
  version int not null default 0,
  head text,
  bundle text,
  checked_out_by uuid references auth.users (id) on delete set null,
  checked_out_email text,
  checked_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_project_versions (
  project_id uuid not null references public.team_projects (id) on delete cascade,
  version int not null,
  head text not null,
  bundle text not null,
  by_user uuid references auth.users (id) on delete set null,
  by_email text not null,
  note text check (note is null or char_length(note) <= 500),
  at timestamptz not null default now(),
  primary key (project_id, version)
);

create index team_members_user on public.team_members (user_id);
create index team_projects_team on public.team_projects (team_id);

-- The caller's role on a team, or null. Security definer so policies can ask without recursing.
create function public.team_role (p_team uuid) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.team_members where team_id = p_team and user_id = auth.uid()
$$;

create function public.caller_email () returns text
language sql stable set search_path = '' as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.team_projects enable row level security;
alter table public.team_project_versions enable row level security;

create policy "members read their teams" on public.teams
  for select to authenticated using (public.team_role (id) is not null);
create policy "members read their teammates" on public.team_members
  for select to authenticated using (public.team_role (team_id) is not null);
create policy "admins read invites" on public.team_invites
  for select to authenticated using (public.team_role (team_id) = 'admin');
create policy "members read team projects" on public.team_projects
  for select to authenticated using (public.team_role (team_id) is not null);
create policy "members read check-ins" on public.team_project_versions
  for select to authenticated using (
    exists (
      select 1 from public.team_projects p
      where p.id = project_id and public.team_role (p.team_id) is not null
    )
  );

-- Fails unless the caller has one of `allowed` on the team.
create function public.require_role (p_team uuid, allowed text[]) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  r text := public.team_role (p_team);
begin
  if r is null or not (r = any (allowed)) then
    raise exception 'not-allowed' using detail = coalesce(r, 'none');
  end if;
  return r;
end;
$$;

-- Fails when giving `p_role` to one more person would pass the team's paid seats.
create function public.require_seat (p_team uuid, p_role text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  used int;
  total int;
begin
  if p_role = 'viewer' then return; end if;
  select seats into total from public.teams where id = p_team;
  select (select count(*) from public.team_members where team_id = p_team and role <> 'viewer')
       + (select count(*) from public.team_invites where team_id = p_team and role <> 'viewer')
    into used;
  if used >= total then
    raise exception 'seats-full' using detail = total::text;
  end if;
end;
$$;

create function public.create_team (p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  t uuid;
begin
  if auth.uid () is null then raise exception 'not-allowed'; end if;
  insert into public.teams (name) values (trim(p_name)) returning id into t;
  insert into public.team_members (team_id, user_id, email, role)
    values (t, auth.uid (), public.caller_email (), 'admin');
  return t;
end;
$$;

-- Adds someone who already signed in straight away; anyone else joins on their first sign-in.
create function public.invite_member (p_team uuid, p_email text, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e text := lower(trim(p_email));
  existing uuid;
begin
  perform public.require_role (p_team, array['admin']);
  if p_role not in ('admin', 'editor', 'viewer') then raise exception 'not-allowed'; end if;
  if exists (select 1 from public.team_members m join auth.users u on u.id = m.user_id
             where m.team_id = p_team and lower(u.email) = e) then
    return;
  end if;
  delete from public.team_invites where team_id = p_team and email = e;
  perform public.require_seat (p_team, p_role);
  select id into existing from auth.users where lower(email) = e;
  if existing is null then
    insert into public.team_invites (team_id, email, role, invited_by)
      values (p_team, e, p_role, auth.uid ());
  else
    insert into public.team_members (team_id, user_id, email, role)
      values (p_team, existing, e, p_role);
  end if;
end;
$$;

create function public.accept_invites () returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if auth.uid () is null then return 0; end if;
  with taken as (
    delete from public.team_invites where email = public.caller_email () returning team_id, role
  )
  insert into public.team_members (team_id, user_id, email, role)
    select team_id, auth.uid (), public.caller_email (), role from taken
    on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Takes someone off the team, or withdraws an invite; their check-outs are let go.
-- Anyone may leave a team themselves; the last admin may not.
create function public.remove_member (p_team uuid, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e text := lower(trim(p_email));
  target uuid;
begin
  if e <> public.caller_email () then
    perform public.require_role (p_team, array['admin']);
  end if;
  delete from public.team_invites where team_id = p_team and email = e;
  select user_id into target from public.team_members where team_id = p_team and lower(email) = e;
  if target is null then return; end if;
  if (select role from public.team_members where team_id = p_team and user_id = target) = 'admin'
     and (select count(*) from public.team_members where team_id = p_team and role = 'admin') = 1 then
    raise exception 'last-admin';
  end if;
  update public.team_projects
    set checked_out_by = null, checked_out_email = null, checked_out_at = null
    where team_id = p_team and checked_out_by = target;
  delete from public.team_members where team_id = p_team and user_id = target;
end;
$$;

-- A new team project, checked out to whoever shared it until their first check-in.
create function public.share_project (p_team uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p uuid;
begin
  perform public.require_role (p_team, array['admin', 'editor']);
  insert into public.team_projects (team_id, name, checked_out_by, checked_out_email, checked_out_at)
    values (p_team, trim(p_name), auth.uid (), public.caller_email (), now())
    returning id into p;
  return p;
end;
$$;

create function public.check_out (p_project uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  row public.team_projects;
begin
  select * into row from public.team_projects where id = p_project for update;
  if row.id is null then raise exception 'not-found'; end if;
  perform public.require_role (row.team_id, array['admin', 'editor']);
  if row.checked_out_by is not null and row.checked_out_by <> auth.uid () then
    raise exception 'checked-out' using detail = row.checked_out_email;
  end if;
  update public.team_projects
    set checked_out_by = auth.uid (), checked_out_email = public.caller_email (), checked_out_at = now()
    where id = p_project;
end;
$$;

-- Lets a check-out go: the holder's own, or anyone's when an admin takes it back.
create function public.release_project (p_project uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  row public.team_projects;
begin
  select * into row from public.team_projects where id = p_project for update;
  if row.id is null then raise exception 'not-found'; end if;
  if row.checked_out_by is distinct from auth.uid () then
    perform public.require_role (row.team_id, array['admin']);
  end if;
  update public.team_projects
    set checked_out_by = null, checked_out_email = null, checked_out_at = null
    where id = p_project;
end;
$$;

-- Records a new Version of the project. `p_base` is the version the caller started from, so a
-- check-in on top of someone else's newer one is refused rather than lost.
create function public.check_in (
  p_project uuid, p_base int, p_head text, p_bundle text, p_note text, p_keep boolean
) returns int
language plpgsql security definer set search_path = '' as $$
declare
  row public.team_projects;
  v_next int;
begin
  select * into row from public.team_projects where id = p_project for update;
  if row.id is null then raise exception 'not-found'; end if;
  perform public.require_role (row.team_id, array['admin', 'editor']);
  if row.checked_out_by is distinct from auth.uid () then
    raise exception 'checked-out' using detail = coalesce(row.checked_out_email, '');
  end if;
  if row.version <> p_base then
    raise exception 'changed-elsewhere' using detail = row.version::text;
  end if;
  if p_bundle not like row.team_id::text || '/' || row.id::text || '/%' then
    raise exception 'not-allowed';
  end if;
  v_next := row.version + 1;
  insert into public.team_project_versions (project_id, version, head, bundle, by_user, by_email, note)
    values (p_project, v_next, p_head, p_bundle, auth.uid (), public.caller_email (), nullif(trim(p_note), ''));
  update public.team_projects
    set version = v_next, head = p_head, bundle = p_bundle, updated_at = now(),
        checked_out_by = case when p_keep then auth.uid () end,
        checked_out_email = case when p_keep then public.caller_email () end,
        checked_out_at = case when p_keep then now() end
    where id = p_project;
  return v_next;
end;
$$;

-- What the caller sees on sign-in: each team with their role, its people and, for admins, invites.
create function public.my_teams () returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'seats', t.seats,
    'role', me.role,
    'members', (select jsonb_agg(jsonb_build_object('email', m.email, 'role', m.role) order by m.joined_at)
                from public.team_members m where m.team_id = t.id),
    'invites', case when me.role = 'admin' then
                 (select coalesce(jsonb_agg(jsonb_build_object('email', i.email, 'role', i.role) order by i.created_at), '[]'::jsonb)
                  from public.team_invites i where i.team_id = t.id)
               else '[]'::jsonb end
  ) order by t.created_at), '[]'::jsonb)
  from public.teams t
  join public.team_members me on me.team_id = t.id and me.user_id = auth.uid ()
$$;

revoke all on function public.require_role, public.require_seat from public, anon, authenticated;
revoke all on function public.create_team, public.invite_member, public.accept_invites,
  public.remove_member, public.share_project, public.check_out, public.release_project,
  public.check_in, public.my_teams from public, anon;
grant execute on function public.create_team, public.invite_member, public.accept_invites,
  public.remove_member, public.share_project, public.check_out, public.release_project,
  public.check_in, public.my_teams to authenticated;

-- Each check-in's files, at <team>/<project>/<file>: members read, Admins and Editors add.
insert into storage.buckets (id, name, public) values ('projects', 'projects', false);

create function public.bundle_team (object_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

create policy "members read project files" on storage.objects
  for select to authenticated using (
    bucket_id = 'projects' and public.team_role (public.bundle_team (name)) is not null
  );
create policy "editors add project files" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'projects' and public.team_role (public.bundle_team (name)) in ('admin', 'editor')
  );
