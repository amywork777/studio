-- Reviews: the person who checked in a Version asks teammates (a customer too, as a Viewer) to
-- review it; each reviewer approves or requests changes, anyone on the team may comment, and an
-- Admin releases an approved Version as the next revision letter. As in the first migration,
-- people read through RLS and every change goes through a function that checks the caller first.

alter table public.team_project_versions add column released_rev text;

create table public.team_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  version int not null,
  requested_by uuid references auth.users (id) on delete set null,
  requested_email text not null,
  created_at timestamptz not null default now(),
  unique (project_id, version),
  foreign key (project_id, version)
    references public.team_project_versions (project_id, version) on delete cascade
);

create table public.team_review_people (
  review_id uuid not null references public.team_reviews (id) on delete cascade,
  email text not null check (email = lower(email)),
  decision text check (decision in ('approved', 'changes')),
  decided_at timestamptz,
  primary key (review_id, email)
);

create table public.team_review_comments (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.team_reviews (id) on delete cascade,
  by_email text not null,
  body text not null check (char_length(body) between 1 and 2000),
  at timestamptz not null default now()
);

create index team_review_comments_review on public.team_review_comments (review_id);

-- The team a review belongs to. Security definer so policies can ask without recursing.
create function public.review_team (p_review uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.team_id from public.team_reviews r
  join public.team_projects p on p.id = r.project_id
  where r.id = p_review
$$;

alter table public.team_reviews enable row level security;
alter table public.team_review_people enable row level security;
alter table public.team_review_comments enable row level security;

create policy "members read reviews" on public.team_reviews
  for select to authenticated using (
    exists (
      select 1 from public.team_projects p
      where p.id = project_id and public.team_role (p.team_id) is not null
    )
  );
create policy "members read reviewers" on public.team_review_people
  for select to authenticated using (public.team_role (public.review_team (review_id)) is not null);
create policy "members read review comments" on public.team_review_comments
  for select to authenticated using (public.team_role (public.review_team (review_id)) is not null);

-- Asks for a review of the project's latest Version. Reviewers are people on the team, never the
-- one asking; a Version is reviewed once.
create function public.request_review (p_project uuid, p_version int, p_reviewers text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  row public.team_projects;
  wanted text[];
  r uuid;
begin
  select * into row from public.team_projects where id = p_project;
  if row.id is null then raise exception 'not-found'; end if;
  perform public.require_role (row.team_id, array['admin', 'editor']);
  if p_version <> row.version then
    raise exception 'changed-elsewhere' using detail = row.version::text;
  end if;
  select coalesce(array_agg(distinct lower(trim(e))), '{}') into wanted
    from unnest(p_reviewers) e where lower(trim(e)) <> public.caller_email ();
  if cardinality(wanted) = 0 then raise exception 'no-reviewers'; end if;
  if exists (
    select 1 from unnest(wanted) e
    where not exists (
      select 1 from public.team_members m where m.team_id = row.team_id and lower(m.email) = e
    )
  ) then
    raise exception 'not-on-team';
  end if;
  if exists (select 1 from public.team_reviews where project_id = p_project and version = p_version) then
    raise exception 'already-in-review';
  end if;
  insert into public.team_reviews (project_id, version, requested_by, requested_email)
    values (p_project, p_version, auth.uid (), public.caller_email ())
    returning id into r;
  insert into public.team_review_people (review_id, email) select r, e from unnest(wanted) e;
  return r;
end;
$$;

-- Anyone on the team may comment, Viewers included.
create function public.comment_review (p_review uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c uuid;
begin
  if public.team_role (public.review_team (p_review)) is null then raise exception 'not-allowed'; end if;
  if nullif(trim(p_body), '') is null then raise exception 'empty'; end if;
  insert into public.team_review_comments (review_id, by_email, body)
    values (p_review, public.caller_email (), trim(p_body))
    returning id into c;
  return c;
end;
$$;

-- A reviewer's decision, which they may change until the Version is released.
create function public.decide_review (p_review uuid, p_decision text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_decision not in ('approved', 'changes') then raise exception 'not-allowed'; end if;
  if public.team_role (public.review_team (p_review)) is null then raise exception 'not-allowed'; end if;
  if exists (
    select 1 from public.team_reviews r
    join public.team_project_versions v on v.project_id = r.project_id and v.version = r.version
    where r.id = p_review and v.released_rev is not null
  ) then
    raise exception 'already-released';
  end if;
  update public.team_review_people set decision = p_decision, decided_at = now()
    where review_id = p_review and email = public.caller_email ();
  if not found then raise exception 'not-a-reviewer'; end if;
end;
$$;

-- An Admin releases a Version every reviewer approved, as the project's next revision letter.
create function public.release_version (p_project uuid, p_version int) returns text
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
  update public.team_project_versions set released_rev = rev
    where project_id = p_project and version = p_version;
  return rev;
end;
$$;

revoke all on function public.request_review, public.comment_review, public.decide_review,
  public.release_version from public, anon;
grant execute on function public.request_review, public.comment_review, public.decide_review,
  public.release_version to authenticated;
