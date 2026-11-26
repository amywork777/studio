-- Studio Pro's accounts and AI usage (infra/pro/src/store.mjs writes them). Run once in the
-- Supabase project's SQL editor. No prompt, answer, file or picture is ever kept: a usage row is
-- the account, the model, token counts and what they cost.

create table if not exists public.pro_accounts (
  id uuid primary key default gen_random_uuid(),
  email text,
  stripe_customer text not null unique,
  stripe_subscription text not null,
  plan text not null,                           -- 'starter' or 'pro'
  status text not null,                         -- the Stripe subscription's status
  period_end timestamptz,
  checked_at timestamptz not null default now(), -- when Stripe was last asked about the subscription
  key_generation integer not null default 1,    -- raise it to turn the account's license key off
  cap_usd numeric(10, 2),                       -- own monthly cap, held a week's share at a time; null: plan's
  created_at timestamptz not null default now()
);

-- One row per Upgrade click: the app's secret, hashed, and the checkout it opened.
create table if not exists public.pro_claims (
  claim_hash text primary key,
  session_id text not null unique,
  plan text not null,
  account_id uuid references public.pro_accounts (id),
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

create table if not exists public.pro_usage (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.pro_accounts (id),
  at timestamptz not null default now(),
  provider text not null,                       -- 'openrouter'
  model text not null,
  input_tokens integer not null default 0,      -- uncached input
  cache_write_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  output_tokens integer not null default 0,
  web_searches integer not null default 0,
  cost_usd numeric(12, 6) not null,
  cost_source text not null default 'openrouter' -- 'openrouter': its reported cost; 'tokens': its listed prices times the tokens
);

create index if not exists pro_usage_account_at on public.pro_usage (account_id, at);

-- Only the server's service role key reaches these: row-level security on, and no policy for anyone else.
alter table public.pro_accounts enable row level security;
alter table public.pro_claims enable row level security;
alter table public.pro_usage enable row level security;

-- What an account's AI has cost Studio this week, from Monday 00:00 UTC: the number the cap is held to.
create or replace function public.pro_week_spend(account uuid)
returns numeric
language sql
stable
security invoker
as $$
  select coalesce(sum(cost_usd), 0)
  from public.pro_usage
  where account_id = account and at >= date_trunc('week', now() at time zone 'utc') at time zone 'utc';
$$;
revoke execute on function public.pro_week_spend(uuid) from public, anon, authenticated;
grant execute on function public.pro_week_spend(uuid) to service_role;

-- Each Pro account's week so far, for the owner to read in the SQL editor: cost against revenue.
create or replace view public.pro_week_usage with (security_invoker = true) as
  select a.email, a.plan, a.status, count(u.id) as requests,
         coalesce(sum(u.cost_usd), 0) as cost_usd
  from public.pro_accounts a
  left join public.pro_usage u
    on u.account_id = a.id and u.at >= date_trunc('week', now() at time zone 'utc') at time zone 'utc'
  group by a.id
  order by cost_usd desc;
