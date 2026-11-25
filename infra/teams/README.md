# Team hub

Studio Teams keeps a team's shared projects here: who is on which team, each project's latest
Version, who has it checked out, and every check-in. It is a Supabase project and nothing else.
Studio's server talks to it directly (`apps/server/src/studio/StudioTeams.ts`) as the person signed
in, and the database's row-level security and functions decide what that person may see and do.
There is no server of Studio's own to run.

- **Sign-in:** an emailed 6-digit code (Supabase Auth, `email` OTP). The email template
  (`supabase/templates/sign-in-code.html`) shows the code alone, because Studio has the person type
  it rather than follow a link.
- **Teams and seats:** `teams`, `team_members` (Admin, Editor, Viewer), `team_invites`. Admins and
  Editors use a paid seat, invited or joined; Viewers are free. `invite_member` refuses past
  `teams.seats` (3 for a new team, until billing sets it). A person makes at most 3 teams of their
  own (`max_own_teams`).
- **Projects:** `team_projects` and `team_project_versions`. Each check-in is one git bundle of the
  project's history in the private Storage bucket `projects`, at `<team>/<project>/<file>`.
  `check_in` takes it only from the person holding the check-out and only on top of the Version they
  started from, so a check-in never lands over someone else's.
- **Reviews:** `team_reviews`, `team_review_people`, `team_review_comments`. Whoever checks in a
  Version may ask teammates (Viewers too) to review it; each reviewer approves or requests changes,
  anyone on the team may comment or reply, and an Admin releases a Version every reviewer approved
  as the project's next revision letter (`team_project_versions.released_rev`: A, B, …). A comment
  may pin a spot on a model (`anchor`: `{"file", "point"}`), and a later Version may resolve it
  (`resolved_in`).
- **Files for browser review:** when a check-in asks for review, Studio uploads the Version's models
  and drawings (`.stl`, `.glb`, `.pdf`, `.png`) to `<team>/<project>/v<n>/<path>` and records them in
  `team_version_files`, so the review page can show them without the project's git bundle.
- **What Viewers see:** a Viewer is often a customer, so they get a reviewed Version's models and
  drawings and never the project itself. Storage lets a Viewer read only a file recorded in
  `team_version_files`, which takes only `.stl`, `.glb`, `.pdf` and `.png` in the Version's own
  `v<n>/` folder. Bundle paths are left out of direct reads (column grants on `team_projects` and
  `team_project_versions`); `project_bundle` hands one to Admins and Editors. A column added to
  either table needs its grant in a migration, or nobody reads it.
- **Storage limits:** each team has `storage_limit` bytes (1 GB to start); `check_in` and
  `record_version_files` refuse past it (`storage-full`), and Studio deletes its refused upload. A
  check-in's bundle carries every Version before it, so Studio deletes the bundle it replaces. One
  file is at most 200 MB (the bucket's `file_size_limit`).
- **Deleting:** an Admin deletes a project (`delete_project`) or a team (`delete_team`), and anyone
  deletes their own account (`delete_account`), refused while they are a team's only Admin with
  others on it, or are alone on a team that still exists. Storage deletes only through its API, so
  Studio deletes the files first (`team_objects` lists them) and the hub refuses to delete rows
  while files remain (`files-left`).
- **Billing's hook:** `set_team_plan(team, seats, storage_limit)`, which only the service role may
  call, is what a payment webhook calls. Nothing calls it yet.
- **Who may do what:** members read their team's rows and files; every change goes through a
  `security definer` function in
  [`supabase/migrations/20261123000000_teams.sql`](supabase/migrations/20261123000000_teams.sql)
  that checks the caller's role first. No table has an insert, update or delete policy.

## The hub in a browser

[`review/`](review) is a static page (no build step): Studio is where a project is built, and this
page is where everyone else sees it. Sign in with the emailed code to see each team's projects (a
card per project with its picture, latest Version, who changed it and who is editing), then a
project's model in 3D, its drawings and pictures, every Version, its review, and comments pinned to
a spot on the model. It is the Vercel project `studio-review`
(<https://studio-review-delta.vercel.app>), deployed with `vercel deploy --prod` from `review/`.
Studio's Copy review link (`?review=<id>`) and Open in browser (`?project=<id>`) point at it
(`STUDIO_REVIEW_URL`). For a local hub, open it as `?hub=http://127.0.0.1:54321&key=<anon key>`;
it accepts only a localhost hub that way.

- **What it shows:** only a Version's files recorded in `team_version_files`. Each check-in sends its
  models, drawings and pictures, plus a GLB of its first STEP files and a picture of the first
  (`.hub/`), which Studio makes with its own `cad`; a browser cannot read STEP. Scripts and history
  never come here.
- **Comments** belong to a Version (`comment_version`), whether or not anyone asked for a review;
  a review's comments are its Version's.
- **Share by link:** an Admin or Editor turns on a project's link (`share_link`). Whoever opens it
  and signs in becomes a guest of that one project (`open_share_link`, `team_project_guests`) and
  sees it as a Viewer does. Turning the link off lets every guest go; `remove_guest` lets one go.
  `project_role` is the role every read policy checks: the team role, or `viewer` for a guest.
- **Fix this:** an Admin or Editor queues a comment for the agent (`queue_fix`). Studio's Team strip
  then offers the queue to the project's chat, and `studio_team_review` lists it. A Version that
  answers it resolves it, which takes it off the queue.

## The agent's tools

`studio_team_review` and `studio_team_check_in` (`apps/server/src/studio/StudioTeamsTools.ts`) let a
chat's agent read the latest review and check the project in once it has addressed it, answering
each comment and asking the same reviewers again. Ask the agent to address comments, on a project's
review, hands the chat the open comments and these steps.

Comments may come from customers, so the agent reads a comment's words only when it may see it
(`agent_sees`): an Admin's or Editor's comment may be seen from the start, and an outside
reviewer's (a Viewer's or a guest's) only once an Admin or Editor turns on Let agent see this, or
presses Fix this, in the hub. `studio_team_review` gives the rest without their words. Ask the
agent to address comments starts with only those ticked, and every comment reaches the chat quoted
as JSON lines the agent is told are not instructions.

Studio finds the hub from two variables on its server: `STUDIO_TEAMS_URL` (the project's API URL)
and `STUDIO_TEAMS_KEY` (its public anon or publishable key, which is safe to ship). Without them
the Team section and Share with team do not appear. An app build has neither unless it is built
with `STUDIO_TEAMS=1` (`scripts/build-studio-app.sh`), so Teams is off in releases.

## Run it locally

Needs Docker. From this folder:

```bash
npx supabase start -x realtime,studio,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta
```

It applies the migration and prints the API URL and anon key. Sign-in emails land in Mailpit
(the `MAILPIT_URL` it prints). Point a Studio dev server at it:

```bash
STUDIO_TEAMS_URL=http://127.0.0.1:54321 STUDIO_TEAMS_KEY=<anon key> vp run studio
```

`npx supabase db reset` reapplies the migration on an empty database. After changing the
migration, `KEY=<anon key> node check-hub.mjs` signs four people in through Mailpit and tries every
rule: seats, roles, check-out and check-in, what a Viewer may download, storage limits, deleting,
and that an outsider sees and gets nothing. With `ADMIN_KEY=<service_role key>` it signs in without
email and also tries the billing hook and the storage limit.

## The real one

Supabase project `studio-teams` (`bkzigrvifxdsahgiaijx`, West US), in amywork777's Org on the free
plan. App builds made with `STUDIO_TEAMS=1` point at it (`scripts/build-studio-app.sh`). Its database password is in
the macOS keychain as "Studio Teams hub database". To check its rules without sending email:
`API=https://bkzigrvifxdsahgiaijx.supabase.co KEY=<publishable key> ADMIN_KEY=<service_role key> node check-hub.mjs`,
which deletes everything it made. The free plan pauses a project after a week with no use; the Pro
plan does not.

To make another one:

1. Create a Supabase project and link this folder to it (`npx supabase link`), then
   `npx supabase db push` to apply the migration.
2. In Authentication, Email: turn on email sign-in, and set the Magic Link and Confirm signup
   templates to `sign-in-code.html` with the subject "Your Studio sign-in code". Set up custom SMTP,
   since Supabase's own sender is limited to a few emails an hour.
3. Give Studio's builds the project's URL and anon key as `STUDIO_TEAMS_URL` and `STUDIO_TEAMS_KEY`.
