# Usage receiver

Studio's usage counts go here and nowhere else. It is a Vercel project of its own (Root
Directory `infra/usage`), built the way text-to-cad's `api.texttocad.dev` is: a single function,
no npm dependencies, no build. Like Backplane's receiver, it keeps the counts in a database of
Studio's own rather than an analytics service. That database is a Supabase project's Postgres,
reached through its REST API (`src/store.mjs`). It checks every batch against the contract in
[`src/events.mjs`](src/events.mjs) before keeping anything. Studio's builds name only this
receiver's address, and only the receiver holds the database key.

- `POST /v1/events`: one batch, schema 1:
  `{schema, install, version, platform, arch, mode, events: [{id, event, at, properties}]}`
  → `204` once the rows are kept. `install` is the install's random id. Each `event` must be one
  of README.md's "Usage data" list (a test holds the two together). Each property must be one that
  event carries (`PROPERTIES` in `src/events.mjs`), whose value is a number, a boolean or a short
  word: a path, a line break or anything longer is refused. Anything outside the contract is `400`
  and keeps nothing. Each event is one row of
  `usage_events` (schema.sql), keyed by its own id, so a batch sent again adds nothing. Beside
  the batch's context it keeps the country Vercel places the request in (`x-vercel-ip-country`),
  never the address. Each instance allows 120 batches a minute per client address
  (`EVENTS_LIMIT` in `src/limit.mjs`): Studio sends at most one batch a second, so that is twice
  what one Studio can send. Past that it answers `429` with `Retry-After` and keeps nothing, and
  Studio keeps the batch and tries it again, five times in all.
- `POST /v1/forget`: `{install}` → `204` once every row under that id is deleted. Studio calls
  this when Share usage data is turned off, and keeps asking until it gets a `2xx`. Each instance
  allows 5 calls per 10 minutes per client address and per install id (`src/limit.mjs`, copied
  from text-to-cad); past that it answers `429` with `Retry-After`.
- `GET /` (the site's root, `?days=7`, `14`, `30` or `90`): the numbers page, a page of what the two
  views below say (installs per day, and how often each event happened), with nothing finer: no install
  id, property, version or country. The browser asks for its password (any user name), which is the
  sensitive variable `NUMBERS_PASSWORD` on the Vercel project; without it the page answers `503`. Each
  instance allows 10 wrong passwords per address every 10 minutes (`PASSWORD_LIMIT` in `src/limit.mjs`).
- `GET /v1/health`: → `200`, or `503` naming a missing setting or the database's status when the
  table does not answer to the key.

A `POST` with an `Origin` header (any browser) is refused, and the receiver keeps no IP address.

## Set it up

1. Create a Supabase project and run [`schema.sql`](schema.sql) in its SQL editor. It makes the
   table, with row-level security on and no policy, so only the service role key reaches it. It
   also makes two views to read: `usage_daily_installs` (installs per day) and
   `usage_daily_events` (what got used each day, and by how many installs).
2. Create a Vercel project from this repository with Root Directory `infra/usage` and framework
   "Other". `vercel.json` turns off deploy-on-push, so it deploys only when asked.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the Vercel project. Deploy with
   `vercel deploy --prod` from `infra/usage`, then check that `GET <url>/v1/health` answers
   `{"ok":true}`.
4. Give Studio the address: the repository variable `STUDIO_USAGE_URL` (read by the Windows build)
   and the default in `scripts/build-studio-app.sh`. A build made with `STUDIO_USAGE_URL=` (empty)
   sends nothing.

It runs at https://studio-usage.vercel.app: the Vercel project `studio-usage` on Amy's personal
Vercel (`amy-zhous-projects-45e75853`), over the Supabase project `studio-usage`
(`mlkacarkcdxquuspekdr`, Amy's personal org). The database password is in Amy's Keychain as
"Supabase studio-usage db password". Redeploy with `vercel deploy --prod` from here.

To set or change the page's password, from here (it asks for the value, then the deploy makes it live):

```bash
vercel env add NUMBERS_PASSWORD production --sensitive --force && vercel deploy --prod
```

To see the numbers in a terminal instead, from a machine logged in to the Supabase CLI (`supabase login`). It prints
installs and event counts per day, and nothing else:

```bash
node infra/usage/numbers.mjs        # the last 14 days
node infra/usage/numbers.mjs 30
```

```bash
node --test infra/usage/src/*.test.mjs
```
