# Studio Pro server

Studio Pro is Studio's AI, paid for with Studio: Pro runs on Studio's own OpenRouter key, so nobody
pays for both a Claude subscription and Studio. One key covers Claude, which Pro starts on since it
is the best at CAD, GPT, Gemini and the open models OpenRouter carries. This is the server that sells it and runs
it. It is a Vercel project of its own (Root Directory `infra/pro`), built like
[`infra/usage`](../usage/README.md): one function, no npm dependencies, no build, over a Supabase
database reached through its REST API. Bringing your own Claude or Codex sign-in stays the free
way and never touches this server.

**How the app uses it.** Studio Pro is the Claude instance with three variables
(`apps/web/src/components/workbench/studioPro.ts`): Claude Code's `ANTHROPIC_BASE_URL`, pointed
at `<server>/anthropic`, the license key as its `ANTHROPIC_AUTH_TOKEN` (kept as a secret), and
`STUDIO_PRO_ACCOUNT`, the account id the Pro row reads its month by. It also adds GPT-6.2 Astra to
the instance's models, beside Claude's own. Claude Code then sends every model call here, pictures
and PDF drawings included, and this server passes it to OpenRouter's Anthropic Messages endpoint
(`https://openrouter.ai/api/v1/messages`) on Studio's key, under OpenRouter's name for the model
(`claude-opus-5-5` becomes `anthropic/claude-opus-5.5`). Leaving Pro takes all of it away.

**Models.** `MODELS` in [`src/prices.mjs`](src/prices.mjs) lists what Pro runs: Claude Opus, Sonnet,
Haiku and Fable, and GPT-6.2 Astra. Anything else is refused. To offer another OpenRouter model, add
its slug and listed prices there, and to `PRO_MODELS` in `studioPro.ts` so it shows in Studio's
model list. OpenRouter says Claude Code is only guaranteed to work with Anthropic's models; GPT
through it has not been tried with a live key yet.

**Upgrade.** Welcome's Studio Pro row, Settings → AI agents → Claude, and the chat's "no agent"
card each open the same dialog. It makes a secret, opens
`/v1/upgrade?plan=…&claim=<its SHA-256>` in the browser, which goes on to Stripe Checkout, and
asks `/v1/claim` with the secret every 3 seconds. Once Stripe says the checkout is paid, the claim
answers the license key and the app signs in by itself. The page Checkout returns to shows the same
key for another computer (Settings, Studio Pro, I have a license key).

## Routes

- `GET /v1/upgrade?plan=monthly|founding&claim=<64 hex>`: makes a Checkout session and redirects to it.
- `POST /v1/claim {claim}`: `202` while unpaid, `200 {key, email, plan}` once paid, `410` after a day.
- `GET /v1/welcome?session_id=`, `GET /v1/cancelled`: the pages Checkout returns to.
- `GET /v1/usage?account=`: the plan, whether the AI runs, and the share of the month used. No
  email and no amounts, since an account id proves nothing about who asks.
- `GET /v1/manage`: redirects to Stripe's billing login (`STRIPE_PORTAL_LOGIN_URL`), which signs
  the person in by email to change their card or plan, or cancel.
- `POST /anthropic/v1/messages`, `POST /anthropic/v1/messages/count_tokens`,
  `GET /anthropic/v1/models`: Claude Code's calls, passed to OpenRouter, for a key whose
  subscription is active and whose month is under its cap. A key OpenRouter refuses, or credits run
  out (`402`), reads to the person as "Studio Pro's AI is not set up yet".
- `GET /v1/health`: `200`, or `503` naming each missing setting or the database's status.

**Keys.** A license key is `SPRO-<account id>-<HMAC>` signed with `LICENSE_SECRET`. The database
keeps no key. Raising an account's `key_generation` turns its key off; the checkout page shows
the new one.

**Subscriptions.** There is no webhook. The claim reads the Checkout session from Stripe, and each
account's subscription status is read again from Stripe at most every 6 hours, on its next request.
`active`, `trialing` and `past_due` run; anything else is told it has ended.

**What it keeps.** One `pro_usage` row per model call: account, model, token counts and what they
cost Studio. The cost is OpenRouter's own `usage.cost` from the answer (`cost_source`
`openrouter`). When an answer carries none, it is the tokens times OpenRouter's listed prices in
`MODELS` (`cost_source` `tokens`), so it is never mistaken for a reported figure. Never a prompt, answer, file or picture, and no log line quotes one.
`pro_month_usage` (a view) shows each account's month against revenue.

**Limits.** Each account's AI may cost Studio so much a calendar month (UTC), then Claude Code
shows "You have used this month's Studio Pro AI…". Fast mode and models not in `MODELS` are
refused. A request body may be at most 4.5 MB, Vercel's limit for a function, and an answer may
take at most 5 minutes. A very long chat with many drawings can pass 4.5 MB, and Claude Code then
shows "This chat is too long for Studio Pro". The handler is a plain `fetch` handler, so moving it to
a Cloudflare Worker, which takes 100 MB, means changing only `api/v1.mjs`.

## The cap, and why $25

Measured from Studio's own Claude turns (seven turns on Opus 5.5 that designed parts, from Studio's
local database, priced at Anthropic's rates on 2026-11-25, which OpenRouter lists unchanged per
token): a turn reads about 1.3M tokens from
cache, writes about 34K to it and writes about 9K out. A turn costs **$0.61 on Opus 5.5**, $0.31 on
Sonnet 5.5 and $0.02 on Haiku 5.5. Cache reads are 43% of that, output 30% and cache writes 27%.

| A month of                                     | Opus 5.5 | Sonnet 5.5 |
| ---------------------------------------------- | -------- | ---------- |
| 100 turns (a few projects)                     | $61      | $31        |
| 300 turns (15 working days of 20, Dave's pace) | $184     | $92        |
| 600 turns (Dave's heaviest weeks)              | $368     | $184       |

The turn counts are assumptions; the cost per turn is measured. $49 a month is $46.94 after
Stripe's published US fees (2.9% + $0.30 a card payment, 0.7% for Billing; check them against the
account). So **$49 cannot include a working engineer's month on Opus**: it pays for about 75 Opus
turns or 150 Sonnet turns before Studio loses money.

- **Monthly, $49:** the cap is **$25** of AI (about 40 Opus turns or 80 Sonnet turns), which keeps
  at least $21.94 a month (47% of the payout) for Studio whoever subscribes.
- **Founding, $290 a year** ($23.27 a month after fees): the cap is **$15**, keeping at least
  $8.27 a month (36%).
- Someone who reaches the cap goes on with their own Claude sign-in, or Amy raises their own cap
  (`cap_usd` on their row). A heavy-use plan priced against the 300-turn month ($199 with a $120 cap
  keeps 37%) would serve Dave; Claude Max at $100 to $200 is what he would compare it with.

OpenRouter also charges a fee when credits are bought; check its current rate and take that share
off what each plan keeps. GPT-6.2 Astra costs twice Opus 5.5 per token ($8 and $40 a million), so a
month on it reaches the cap in about half as many turns.

To change a plan's cap, set `CAP_MONTHLY_USD` or `CAP_FOUNDING_USD` on the Vercel project and
deploy again.

## Set it up (test mode, no charge)

Amy makes these once:

1. **Stripe** (test mode): two Products with one recurring Price each, "Studio Pro" at $49 a month
   and "Studio Pro founding" at $290 a year; in Settings → Billing → Customer portal, turn on the
   portal's login link. Note the two `price_…` ids, the test secret key `sk_test_…` and the
   `https://billing.stripe.com/p/login/test_…` link.
2. **OpenRouter:** an account with credits, and an API key (`sk-or-v1-…`) named "Studio Pro",
   with a credit limit on the key as the backstop. Under the account's provider settings, put
   Anthropic first for Anthropic's models: OpenRouter says Claude Code is only guaranteed to work
   with Anthropic as the provider.
3. **Supabase:** run [`schema.sql`](schema.sql) in the SQL editor of `studio-usage` (it adds three
   tables beside the usage counts) or of a new project.
4. **Vercel:** a project named exactly `texttocad-studio-pro` from this repository, Root Directory `infra/pro`, framework
   "Other". Then from this folder, entering each value when asked:

   ```bash
   for name in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY STRIPE_SECRET_KEY STRIPE_PRICE_MONTHLY \
     STRIPE_PRICE_FOUNDING STRIPE_PORTAL_LOGIN_URL LICENSE_SECRET OPENROUTER_API_KEY; do
     vercel env add "$name" production --sensitive
   done
   vercel deploy --prod
   ```

   `LICENSE_SECRET` is any long random string (`openssl rand -base64 48`). Changing it turns
   every key off. `GET https://texttocad-studio-pro.vercel.app/v1/health` answers `{"ok":true}` once all is set.

   The app has that address built in (`STUDIO_PRO_SERVER` in `studioPro.ts`), so the project's
   name must give exactly that URL. `studio-pro.vercel.app` is someone else's site: a Pro build
   pointed at a name Studio doesn't hold would send keys and chats to whoever holds it.

**First live call:** after one Pro turn, read its `pro_usage` row. `cost_source` `openrouter`
means OpenRouter's reported cost is what the cap counts. `tokens` means its stream carried none,
and the cap is counting listed prices instead.

**Before charging anyone:** Vercel's Hobby plan is for non-commercial use only, so a server that
takes payments needs Vercel Pro ($20 a month). Supabase's free plan pauses a project after a week
without requests; Supabase Pro ($25 a month) does not. Going live is then Stripe's live key and live
prices in the same variables.

```bash
node --test infra/pro/src/*.test.mjs
```
