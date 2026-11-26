-- What a browser needs to review a Version without Studio: the Version's model and drawing files,
-- comments pinned to a spot on a model, replies, and which later Version resolved a comment.

alter table public.team_project_versions add column released_at timestamptz;

-- A Version's viewable files (models and drawings), kept beside its bundle in Storage.
create table public.team_version_files (
  project_id uuid not null,
  version int not null,
  path text not null check (char_length(path) between 1 and 400),
  object text not null,
  size bigint not null check (size >= 0),
  primary key (project_id, version, path),
  foreign key (project_id, version)
    references public.team_project_versions (project_id, version) on delete cascade
);

alter table public.team_version_files enable row level security;
create policy "members read version files" on public.team_version_files
  for select to authenticated using (
    exists (
      select 1 from public.team_projects p
      where p.id = project_id and public.team_role (p.team_id) is not null
    )
  );

-- Only the person who checked a Version in records its files, and only under its project's folder.
create function public.record_version_files (p_project uuid, p_version int, p_files jsonb) returns int
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
    where f.object not like row.team_id::text || '/' || row.id::text || '/%'
       or f.path is null or f.size is null
  ) then
    raise exception 'not-allowed';
  end if;
  insert into public.team_version_files (project_id, version, path, object, size)
    select p_project, p_version, f.path, f.object, f.size
    from jsonb_to_recordset(p_files) as f(path text, object text, size bigint)
    on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

alter table public.team_review_comments
  add column anchor jsonb check (anchor is null or (jsonb_typeof(anchor) = 'object' and octet_length(anchor::text) < 2048)),
  add column reply_to uuid references public.team_review_comments (id) on delete cascade,
  add column resolved_in int;

-- Comments may now pin a spot ({"file": "parts/arm.stl", "point": [x, y, z]}) or answer another
-- comment in the same review.
drop function public.comment_review (uuid, text);
create function public.comment_review (
  p_review uuid, p_body text, p_anchor jsonb default null, p_reply_to uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c uuid;
begin
  if public.team_role (public.review_team (p_review)) is null then raise exception 'not-allowed'; end if;
  if nullif(trim(p_body), '') is null then raise exception 'empty'; end if;
  if p_anchor is not null and (jsonb_typeof(p_anchor) <> 'object' or coalesce(jsonb_typeof(p_anchor -> 'file'), '') <> 'string') then
    raise exception 'not-allowed';
  end if;
  if p_reply_to is not null and not exists (
    select 1 from public.team_review_comments where id = p_reply_to and review_id = p_review
  ) then
    raise exception 'not-found';
  end if;
  insert into public.team_review_comments (review_id, by_email, body, anchor, reply_to)
    values (p_review, public.caller_email (), trim(p_body), p_anchor, p_reply_to)
    returning id into c;
  return c;
end;
$$;

-- An Admin or Editor marks a comment resolved by a later Version of the same project.
create function public.resolve_comment (p_comment uuid, p_version int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  rv public.team_reviews;
begin
  select r.* into rv from public.team_reviews r
    join public.team_review_comments c on c.review_id = r.id
    where c.id = p_comment;
  if rv.id is null then raise exception 'not-found'; end if;
  perform public.require_role (public.review_team (rv.id), array['admin', 'editor']);
  if p_version <= rv.version or not exists (
    select 1 from public.team_project_versions where project_id = rv.project_id and version = p_version
  ) then
    raise exception 'not-allowed';
  end if;
  update public.team_review_comments set resolved_in = p_version where id = p_comment;
end;
$$;

-- Release now records when, for the project's activity.
create or replace function public.release_version (p_project uuid, p_version int) returns text
language plpgsql security definer set search_path = '' as $$
declare
  row public.team_projects;
  ver public.team_project_versions;
  r uuid;
  rev text;
begin
  select * into row from public.team_projects where id = p_project for update;
  if row.id is null then raise exception 'not-found'; end if;
  perform public.require_role (row.team_id, array['admin']);
  select * into ver from public.team_project_versions where project_id = p_project and version = p_version;
  if ver.version is null then raise exception 'not-found'; end if;
  if ver.released_rev is not null then raise exception 'already-released'; end if;
  select id into r from public.team_reviews where project_id = p_project and version = p_version;
  if r is null or exists (
    select 1 from public.team_review_people where review_id = r and decision is distinct from 'approved'
  ) then
    raise exception 'not-approved';
  end if;
  select chr(65 + count(*)::int) into rev
    from public.team_project_versions where project_id = p_project and released_rev is not null;
  update public.team_project_versions set released_rev = rev, released_at = now()
    where project_id = p_project and version = p_version;
  return rev;
end;
$$;

revoke all on function public.record_version_files, public.comment_review, public.resolve_comment
  from public, anon;
grant execute on function public.record_version_files, public.comment_review, public.resolve_comment
  to authenticated;
