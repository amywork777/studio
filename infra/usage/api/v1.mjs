// Studio's usage receiver, /v1/*: counts kept in Studio's own table (src/store.mjs). vercel.json rewrites every /v1 path to
// this one function, which keeps the path it was asked for, and the handler routes it.
import { handle } from "../src/handler.mjs";
import { clientOf, EVENTS_LIMIT, PASSWORD_LIMIT, rateLimiter } from "../src/limit.mjs";
import { databaseStore, missingSettings, settingsOf } from "../src/store.mjs";

// All three live as long as the instance: the store keeps health's answer a minute, and each limiter its own
// counts, /v1/forget's and /v1/events'.
let store;
const limiter = rateLimiter();
const eventsLimiter = rateLimiter(EVENTS_LIMIT);
const passwordLimiter = rateLimiter(PASSWORD_LIMIT);
const serve = (request) =>
  handle(request, (store ??= databaseStore(settingsOf(process.env))), {
    // Names only: what /v1/health reports missing, so a deploy without them fails its check.
    missing: missingSettings(process.env),
    // Where Vercel's edge places the request, from its IP address: passed on as a country, the address kept nowhere.
    country: request.headers.get("x-vercel-ip-country"),
    limiter,
    eventsLimiter,
    client: clientOf(request.headers),
    // The numbers page's password (`/`), set on the host as a sensitive variable; unset, the page is shut.
    password: process.env.NUMBERS_PASSWORD ?? "",
    passwordLimiter,
  });

export const GET = serve;
export const POST = serve;
