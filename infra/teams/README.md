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
  `teams.seats` (3 for a new team, until billing sets it).
- **Projects:** `team_projects` and `team_project_versions`. Each check-in is one git bundle of the
  project's history in the private Storage bucket `projects`, at `<team>/<project>/<file>`.
  `check_in` takes it only from the person holding the check-out and only on top of the Version they
  started from, so a check-in never lands over someone else's.
- **Who may do what:** members read their team's rows and files; every change goes through a
  `security definer` function in
  [`supabase/migrations/20261123000000_teams.sql`](supabase/migrations/20261123000000_teams.sql)
  that checks the caller's role first. No table has an insert, update or delete policy.

Studio finds the hub from two variables on its server: `STUDIO_TEAMS_URL` (the project's API URL)
and `STUDIO_TEAMS_KEY` (its public anon or publishable key, which is safe to ship). Without them
the Team section and Share with team do not appear.

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
rule: seats, roles, check-out and check-in, and that an outsider sees and gets nothing.

## The real one

Supabase project `studio-teams` (`bkzigrvifxdsahgiaijx`, West US), in amywork777's Org on the free
plan. App builds point at it by default (`scripts/build-studio-app.sh`). Its database password is in
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
