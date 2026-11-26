-- Viewers (often a customer) get a reviewed Version's models and drawings, never the project's
-- scripts or history; teams have a storage limit and people a limit on teams; Admins delete
-- projects and teams, and anyone deletes their own account. Billing sets a team's seats and
-- storage through set_team_plan, which only the service role may call.

-- Bundle paths are for Admins and Editors: direct reads leave the column out, and
-- project_bundle hands it over by role. Columns added to these tables later need a grant here.
revoke select on public.team_projects from anon, authenticated;
grant select (id, team_id, name, version, head, checked_out_by, checked_out_email, checked_out_at,
  created_at, updated_at) on public.team_projects to authenticated;
revoke select on public.team_project_versions from anon, authenticated;
grant select (project_id, version, head, by_user, by_email, note, at, released_rev, released_at)
  on public.team_project_versions to authenticated;

create function public.project_bundle (p_project uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  row public.team_projects;
begin
  select * into row from public.team_projects where id = p_project;
  if row.id is null then raise exception 'not-found'; end if;
  perform public.require_role (row.team_id, array['admin', 'editor']);
  return row.bundle;
end;
$$;

-- The files a browser may show for review, by extension. Everything else is the project itself.
create function public.is_review_path (p_path text) returns boolean
language sql immutable set search_path = '' as $$
  select lower(p_path) ~ '\.(stl|glb|pdf|png)$'
$$;

-- A Viewer reads a Storage object only when it is a review file recorded for a Version.
create function public.is_review_object (p_object text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_version_files f where f.object = p_object)
    and public.is_review_path (p_object)
$$;

drop policy "members read project files" on storage.objects;
create policy "editors read project files" on storage.objects
  for select to authenticated using (
    bucket_id = 'projects' and public.team_role (public.bundle_team (name)) in ('admin', 'editor')
  );
create policy "viewers read review files" on storage.objects
  for select to authenticated using (
    bucket_id = 'projects' and public.team_role (public.bundle_team (name)) = 'viewer'
    and public.is_review_object (name)
  );
-- Admins clear a project's or team's files before deleting it; anyone clears their own upload
-- that the hub refused. Storage only deletes through its API, never from SQL.
create policy "admins delete project files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'projects' and public.team_role (public.bundle_team (name)) = 'admin'
  );
-- A checked-in bundle the project's latest one replaced: the latest carries all its history.
create function public.is_superseded_bundle (p_object text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_project_versions v
    join public.team_projects p on p.id = v.project_id
    where v.bundle = p_object and p.bundle is distinct from p_object
  )
$$;

create policy "editors delete superseded bundles" on storage.objects
  for delete to authenticated using (
    bucket_id = 'projects' and public.team_role (public.bundle_team (name)) in ('admin', 'editor')
    and public.is_superseded_bundle (name)
  );
create policy "uploaders delete their own files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'projects' and owner_id = auth.uid ()::text
    and public.team_role (public.bundle_team (name)) in ('admin', 'editor')
  );

-- One object in this bucket is at most 200 MB, whatever the plan allows.
update storage.buckets set file_size_limit = 209715200 where id = 'projects';

-- Only review files are recorded for a Version, and only in that Version's own folder.
create or replace function public.record_version_files (p_project uuid, p_version int, p_files jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  row public.team_projects;
  n int;
begin
  select * into row from public.team_projects where id = p_project;
  if row.id is null then raise exception 'not-found'; end if;
  perform public.require_role (row.team_id, array['admin', 'editor']);
  if not exists (
    select 1 from public.team_project_versions
    where project_id = p_project and version = p_version and by_user = auth.uid ()
  ) then
    raise exception 'not-allowed';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_files) as f(path text, object text, size bigint)
    where f.path is null or f.size is null or not public.is_review_path (f.path)
       or f.object is distinct from row.team_id::text || '/' || row.id::text || '/v' || p_version::text || '/' || f.path
  ) then
    raise exception 'not-allowed';
  end if;
  perform public.require_storage (row.team_id);
  insert into public.team_version_files (project_id, version, path, object, size)
    select p_project, p_version, f.path, f.object, f.size
    from jsonb_to_recordset(p_files) as f(path text, object text, size bigint)
    on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Storage: what a team's files take, against what its plan allows.
alter table public.teams add column storage_limit bigint not null default 1073741824
  check (storage_limit >= 0);

create function public.team_bytes (p_team uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
  from storage.objects o
  where o.bucket_id = 'projects' and o.name like p_team::text || '/%'
$$;

-- Fails once the team's files pass its limit. Called after an upload lands, so the upload counts.
create function public.require_storage (p_team uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  cap bigint;
begin
  select storage_limit into cap from public.teams where id = p_team;
  if public.team_bytes (p_team) > cap then
    raise exception 'storage-full' using detail = cap::text;
  end if;
end;
$$;

create or replace function public.check_in (
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
  -- A bundle sits at the project's top level, never among a Version's review files.
  if p_bundle not like row.team_id::text || '/' || row.id::text || '/%'
     or p_bundle like row.team_id::text || '/' || row.id::text || '/%/%' then
    raise exception 'not-allowed';
  end if;
  perform public.require_storage (row.team_id);
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

-- A person makes at most this many teams of their own (as Admin); joining others' is not limited.
create function public.max_own_teams () returns int
language sql immutable set search_path = '' as $$ select 3 $$;

create or replace function public.create_team (p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  t uuid;
begin
  if auth.uid () is null then raise exception 'not-allowed'; end if;
  if (select count(*) from public.team_members where user_id = auth.uid () and role = 'admin')
     >= public.max_own_teams () then
    raise exception 'too-many-teams' using detail = public.max_own_teams ()::text;
  end if;
  insert into public.teams (name) values (trim(p_name)) returning id into t;
  insert into public.team_members (team_id, user_id, email, role)
    values (t, auth.uid (), public.caller_email (), 'admin');
  return t;
end;
$$;

-- my_teams also says what the team's files take and may take.
create or replace function public.my_teams () returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'seats', t.seats,
    'role', me.role,
    'storageUsed', public.team_bytes (t.id),
    'storageLimit', t.storage_limit,
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

-- The Storage objects under a team, or one of its projects, for its Admin to delete first.
create function public.team_objects (p_team uuid, p_project uuid default null) returns setof text
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_role (p_team, array['admin']);
  return query
    select o.name from storage.objects o
    where o.bucket_id = 'projects'
      and o.name like p_team::text || '/' || coalesce(p_project::text || '/', '') || '%';
end;
$$;

-- Deletes a project and everything recorded about it. Its files go first, through Storage.
create function public.delete_project (p_project uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  row public.team_projects;
begin
  select * into row from public.team_projects where id = p_project for update;
  if row.id is null then raise exception 'not-found'; end if;
  perform public.require_role (row.team_id, array['admin']);
  if exists (select 1 from public.team_objects (row.team_id, row.id)) then
    raise exception 'files-left';
  end if;
  delete from public.team_projects where id = p_project;
end;
$$;

-- Deletes a team, its projects, people and invites. Its files go first, through Storage.
create function public.delete_team (p_team uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_role (p_team, array['admin']);
  if exists (select 1 from public.team_objects (p_team)) then
    raise exception 'files-left';
  end if;
  delete from public.teams where id = p_team;
end;
$$;

-- Deletes the caller's account. A team they are the only Admin of either has nobody else, and
-- must be deleted first, or has others, and needs another Admin first.
create function public.delete_account () returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid ();
begin
  if me is null then raise exception 'not-allowed'; end if;
  if exists (
    select 1 from public.team_members m
    where m.user_id = me and m.role = 'admin'
      and not exists (select 1 from public.team_members o
                      where o.team_id = m.team_id and o.role = 'admin' and o.user_id <> me)
      and exists (select 1 from public.team_members o where o.team_id = m.team_id and o.user_id <> me)
  ) then
    raise exception 'last-admin';
  end if;
  if exists (
    select 1 from public.team_members m
    where m.user_id = me
      and not exists (select 1 from public.team_members o where o.team_id = m.team_id and o.user_id <> me)
  ) then
    raise exception 'teams-left';
  end if;
  delete from public.team_invites where email = public.caller_email ();
  delete from auth.users where id = me;
end;
$$;

-- Billing's hook: a paid plan sets a team's seats and storage. Only the service role calls it.
create function public.set_team_plan (p_team uuid, p_seats int, p_storage_limit bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.teams set seats = p_seats, storage_limit = p_storage_limit where id = p_team;
  if not found then raise exception 'not-found'; end if;
end;
$$;

revoke all on function public.is_review_object, public.team_bytes, public.require_storage,
  public.set_team_plan from public, anon, authenticated;
grant execute on function public.set_team_plan to service_role;
revoke all on function public.project_bundle, public.team_objects, public.delete_project,
  public.delete_team, public.delete_account from public, anon;
grant execute on function public.project_bundle, public.team_objects, public.delete_project,
  public.delete_team, public.delete_account to authenticated;
-- Storage's policies call these as the signed-in person.
revoke all on function public.is_superseded_bundle from public, anon;
grant execute on function public.is_review_object, public.is_superseded_bundle to authenticated;
