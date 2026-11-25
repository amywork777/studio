-- The project hub in a browser: comments belong to a Version, whether or not anyone asked for a
-- review of it; an Admin's or Editor's comment reaches the desktop agent, an outside reviewer's only
-- once an Admin or Editor lets it; "Fix this" queues a comment for the agent; and a project's share
-- link lets anyone who signs in see that one project as a Viewer does (a guest).

-- Guests: people who opened a project's share link. They see that project and nothing else.
create table public.team_project_guests (
  project_id uuid not null references public.team_projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index team_project_guests_user on public.team_project_guests (user_id);

-- At most one link per project; turning it off deletes it and lets every guest go.
create table public.team_share_links (
  project_id uuid primary key references public.team_projects (id) on delete cascade,
  token text not null unique check (char_length(token) >= 32),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- The caller's role on a project: their team role, or 'viewer' for a guest, or null.
create function public.project_role (p_project uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select public.team_role (p.team_id) from public.team_projects p where p.id = p_project),
    (select 'viewer' from public.team_project_guests g
      where g.project_id = p_project and g.user_id = auth.uid ())
  )
$$;

-- The project a Storage object is under: <team>/<project>/...
create function public.object_project (object_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return split_part(object_name, '/', 2)::uuid;
exception when others then
  return null;
end;
$$;

-- Reading: a guest reads what a team Viewer reads, for their one project.
drop policy "members read team projects" on public.team_projects;
create policy "people read their projects" on public.team_projects
  for select to authenticated using (public.project_role (id) is not null);
drop policy "members read check-ins" on public.team_project_versions;
create policy "people read check-ins" on public.team_project_versions
  for select to authenticated using (public.project_role (project_id) is not null);
drop policy "members read version files" on public.team_version_files;
create policy "people read version files" on public.team_version_files
  for select to authenticated using (public.project_role (project_id) is not null);
drop policy "members read reviews" on public.team_reviews;
create policy "people read reviews" on public.team_reviews
  for select to authenticated using (public.project_role (project_id) is not null);
drop policy "members read reviewers" on public.team_review_people;
create policy "people read reviewers" on public.team_review_people
  for select to authenticated using (
    exists (select 1 from public.team_reviews r
            where r.id = review_id and public.project_role (r.project_id) is not null)
  );

create policy "guests read review files" on storage.objects
  for select to authenticated using (
    bucket_id = 'projects'
    and public.team_role (public.bundle_team (name)) is null
    and public.project_role (public.object_project (name)) = 'viewer'
    and public.is_review_object (name)
  );

alter table public.team_project_guests enable row level security;
alter table public.team_share_links enable row level security;
create policy "the team and the guest read guests" on public.team_project_guests
  for select to authenticated using (
    user_id = auth.uid () or public.project_role (project_id) in ('admin', 'editor')
  );
create policy "admins and editors read share links" on public.team_share_links
  for select to authenticated using (public.project_role (project_id) in ('admin', 'editor'));

-- Comments: each belongs to a Version, and to its review when there is one. `agent_sees` says the
-- desktop agent may read its words; `fix_at` queues it for the agent until a Version resolves it.
alter table public.team_review_comments
  add column project_id uuid references public.team_projects (id) on delete cascade,
  add column version int,
  add column agent_sees boolean not null default false,
  add column fix_by text,
  add column fix_at timestamptz;
update public.team_review_comments c
  set project_id = r.project_id, version = r.version
  from public.team_reviews r where r.id = c.review_id;
update public.team_review_comments c
  set agent_sees = true
  from public.team_projects p
  where p.id = c.project_id and exists (
    select 1 from public.team_members m
    where m.team_id = p.team_id and lower(m.email) = lower(c.by_email) and m.role in ('admin', 'editor')
  );
alter table public.team_review_comments
  alter column project_id set not null,
  alter column version set not null,
  alter column review_id drop not null,
  add foreign key (project_id, version)
    references public.team_project_versions (project_id, version) on delete cascade;
create index team_review_comments_version on public.team_review_comments (project_id, version);

drop policy "members read review comments" on public.team_review_comments;
create policy "people read comments" on public.team_review_comments
  for select to authenticated using (public.project_role (project_id) is not null);

-- A comment on a Version, a pin on one of its models, or a reply. Anyone who sees the project may.
create function public.comment_version (
  p_project uuid, p_version int, p_body text, p_anchor jsonb default null, p_reply_to uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r text := public.project_role (p_project);
  c uuid;
begin
  if r is null then raise exception 'not-allowed'; end if;
  if nullif(trim(p_body), '') is null then raise exception 'empty'; end if;
  if not exists (select 1 from public.team_project_versions where project_id = p_project and version = p_version) then
    raise exception 'not-found';
  end if;
  if p_anchor is not null and (jsonb_typeof(p_anchor) <> 'object' or coalesce(jsonb_typeof(p_anchor -> 'file'), '') <> 'string') then
    raise exception 'not-allowed';
  end if;
  if p_reply_to is not null and not exists (
    select 1 from public.team_review_comments
    where id = p_reply_to and project_id = p_project and version = p_version and reply_to is null
  ) then
    raise exception 'not-found';
  end if;
  insert into public.team_review_comments
      (review_id, project_id, version, by_email, body, anchor, reply_to, agent_sees)
    values (
      (select id from public.team_reviews where project_id = p_project and version = p_version),
      p_project, p_version, public.caller_email (), trim(p_body), p_anchor, p_reply_to,
      r in ('admin', 'editor'))
    returning id into c;
  return c;
end;
$$;

-- Studio's review calls keep working: a review comment is a comment on the review's Version.
create or replace function public.comment_review (
  p_review uuid, p_body text, p_anchor jsonb default null, p_reply_to uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  rv public.team_reviews;
begin
  select * into rv from public.team_reviews where id = p_review;
  if rv.id is null then raise exception 'not-allowed'; end if;
  return public.comment_version (rv.project_id, rv.version, p_body, p_anchor, p_reply_to);
end;
$$;

-- An Admin or Editor marks a comment resolved by a later Version of the same project.
create or replace function public.resolve_comment (p_comment uuid, p_version int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.team_review_comments;
begin
  select * into c from public.team_review_comments where id = p_comment;
  if c.id is null then raise exception 'not-found'; end if;
  if public.project_role (c.project_id) is null
     or public.project_role (c.project_id) not in ('admin', 'editor') then
    raise exception 'not-allowed';
  end if;
  if p_version <= c.version or not exists (
    select 1 from public.team_project_versions where project_id = c.project_id and version = p_version
  ) then
    raise exception 'not-allowed';
  end if;
  update public.team_review_comments set resolved_in = p_version where id = p_comment;
end;
$$;

-- The comment, when the caller may change what the agent does with it: an Admin or Editor.
create function public.agent_comment (p_comment uuid) returns public.team_review_comments
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.team_review_comments;
begin
  select * into c from public.team_review_comments where id = p_comment;
  if c.id is null then raise exception 'not-found'; end if;
  if coalesce(public.project_role (c.project_id), '') not in ('admin', 'editor') then
    raise exception 'not-allowed';
  end if;
  return c;
end;
$$;

-- Lets the agent read an outside reviewer's comment, or stops it; stopping takes it off the queue.
create function public.let_agent_see (p_comment uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.agent_comment (p_comment);
  update public.team_review_comments
    set agent_sees = p_on,
        fix_by = case when p_on then fix_by end,
        fix_at = case when p_on then fix_at end
    where id = p_comment;
end;
$$;

-- Queues a comment for the agent to fix, or takes it off. Queuing lets the agent read it.
create function public.queue_fix (p_comment uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.team_review_comments := public.agent_comment (p_comment);
begin
  if c.reply_to is not null or (p_on and c.resolved_in is not null) then
    raise exception 'not-allowed';
  end if;
  update public.team_review_comments
    set fix_by = case when p_on then public.caller_email () end,
        fix_at = case when p_on then now() end,
        agent_sees = agent_sees or p_on
    where id = p_comment;
end;
$$;

-- An Admin or Editor turns a project's share link on (the same link while it stays on) or off.
-- Off lets every guest go: nobody outside the team keeps seeing it.
create function public.share_link (p_project uuid, p_on boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare
  row public.team_projects;
  t text;
begin
  select * into row from public.team_projects where id = p_project;
  if row.id is null then raise exception 'not-found'; end if;
  perform public.require_role (row.team_id, array['admin', 'editor']);
  if not p_on then
    delete from public.team_share_links where project_id = p_project;
    delete from public.team_project_guests where project_id = p_project;
    return null;
  end if;
  insert into public.team_share_links (project_id, token, created_by)
    values (p_project, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), auth.uid ())
    on conflict (project_id) do nothing;
  select token into t from public.team_share_links where project_id = p_project;
  return t;
end;
$$;

-- Opening a share link signed in makes the caller a guest of that project (a teammate stays as is).
create function public.open_share_link (p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p uuid;
  t uuid;
begin
  if auth.uid () is null then raise exception 'not-allowed'; end if;
  select l.project_id, pr.team_id into p, t
    from public.team_share_links l join public.team_projects pr on pr.id = l.project_id
    where l.token = p_token;
  if p is null then raise exception 'link-off'; end if;
  if public.team_role (t) is null then
    insert into public.team_project_guests (project_id, user_id, email)
      values (p, auth.uid (), public.caller_email ())
      on conflict do nothing;
  end if;
  return p;
end;
$$;

-- An Admin or Editor lets a guest go; a guest may leave themselves.
create function public.remove_guest (p_project uuid, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e text := lower(trim(p_email));
  t uuid;
begin
  select team_id into t from public.team_projects where id = p_project;
  if t is null then raise exception 'not-found'; end if;
  if e <> public.caller_email () then
    perform public.require_role (t, array['admin', 'editor']);
  end if;
  delete from public.team_project_guests where project_id = p_project and lower(email) = e;
end;
$$;

revoke all on function public.project_role, public.agent_comment from public, anon;
grant execute on function public.project_role to authenticated;
revoke all on function public.agent_comment from authenticated;
revoke all on function public.comment_version, public.let_agent_see, public.queue_fix,
  public.share_link, public.open_share_link, public.remove_guest from public, anon;
grant execute on function public.comment_version, public.let_agent_see, public.queue_fix,
  public.share_link, public.open_share_link, public.remove_guest to authenticated;
