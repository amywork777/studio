// Studio Pro's server on Vercel: vercel.json sends every path to this one function, and the
// handler (src/handler.mjs) routes it. Every key it holds is the host's, never Studio's builds'.
import { DEFAULT_CAPS, proServer } from "../src/handler.mjs";
import { rateLimiter } from "../src/limit.mjs";
import { databaseStore, missingSettings } from "../src/store.mjs";
import { stripeClient } from "../src/stripe.mjs";

const env = process.env;
const capOf = (value, fallback) => (Number(value) > 0 ? Number(value) : fallback);
const serve = proServer({
  store: databaseStore({ url: env.SUPABASE_URL ?? "", key: env.SUPABASE_SERVICE_ROLE_KEY ?? "" }),
  stripe: stripeClient({ key: env.STRIPE_SECRET_KEY ?? "" }),
  config: {
    licenseSecret: env.LICENSE_SECRET ?? "",
    openrouterKey: env.OPENROUTER_API_KEY,
    prices: { starter: env.STRIPE_PRICE_STARTER, pro: env.STRIPE_PRICE_PRO },
    caps: {
      starter: capOf(env.CAP_STARTER_USD, DEFAULT_CAPS.starter),
      pro: capOf(env.CAP_PRO_USD, DEFAULT_CAPS.pro),
    },
    portalLoginUrl: env.STRIPE_PORTAL_LOGIN_URL,
    missing: missingSettings(env),
  },
  limiter: rateLimiter(),
});

const handle = (request) =>
  serve(request, { client: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "" });

export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
