// The team hub as this page talks to it: the sign-in kept in this browser, the hub's tables and
// functions, and its files. The hub's rules decide what each signed-in person may see and do.

export const params = new URLSearchParams(location.search);
// A local test hub may stand in for the hosted one, and only ever a local one.
const LOCAL_HUB = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
const override = params.get("hub");
export const HUB =
  override !== null && LOCAL_HUB.test(override)
    ? { url: override, key: params.get("key") ?? "" }
    : window.STUDIO_HUB;
const SESSION_KEY = `studio-review:${HUB.url}`;

/** A link within this page, keeping a local test hub's address on it. */
export const href = (query = {}) => {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined) next.set(key, String(value));
  }
  if (override !== null && LOCAL_HUB.test(override)) {
    next.set("hub", HUB.url);
    next.set("key", HUB.key);
  }
  const text = next.toString();
  return text === "" ? "./" : `./?${text}`;
};

const storage = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    } catch {
      return null;
    }
  },
  set(value) {
    try {
      if (value === null) localStorage.removeItem(SESSION_KEY);
      else localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    } catch {}
  },
};
let session = storage.get();
const signedOut = new Set();
export const me = () => session;
export const onSignOut = (listener) => signedOut.add(listener);

const REFUSALS = {
  "not-allowed": "Your role on this project does not allow that.",
  "not-a-reviewer": "Only the people asked to review it can approve it.",
  "already-released": "This Version is already released.",
  empty: "Write a comment first.",
  "not-found": "That is no longer on the team.",
  "link-off": "This link was turned off. Ask whoever shared it for a new one.",
};
const words = (data) => {
  if (data?.error_code === "otp_expired")
    return "That code is wrong or has run out. Ask for a new one.";
  if (data?.error_code === "over_email_send_rate_limit")
    return "A code was just sent. Wait a minute, then ask again.";
  return REFUSALS[data?.message] ?? "The team hub refused that. Try again.";
};

export function signOut() {
  session = null;
  storage.set(null);
  for (const listener of signedOut) listener();
}

async function fresh() {
  if (session === null) throw new Error("Sign in first.");
  if (session.expiresAt - 90 > Date.now() / 1000) return session;
  const res = await fetch(`${HUB.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: HUB.key, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh }),
  });
  if (!res.ok) {
    signOut();
    throw new Error("Sign in again.");
  }
  const body = await res.json();
  session = {
    ...session,
    access: body.access_token,
    refresh: body.refresh_token,
    expiresAt: Date.now() / 1000 + body.expires_in,
  };
  storage.set(session);
  return session;
}

async function api(method, path, { json, auth = true } = {}) {
  const headers = { apikey: HUB.key };
  if (auth) headers.authorization = `Bearer ${(await fresh()).access}`;
  if (json !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${HUB.url}${path}`, {
    method,
    headers,
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  if (res.status === 401 && auth) {
    signOut();
    throw new Error("Sign in again.");
  }
  const text = await res.text();
  let data = null;
  try {
    data = text === "" ? null : JSON.parse(text);
  } catch {}
  if (!res.ok) throw new Error(words(data));
  return data;
}

export const select = (query) => api("GET", `/rest/v1/${query}`);
export const rpc = (fn, args = {}) => api("POST", `/rest/v1/rpc/${fn}`, { json: args });

// Downloads are kept for the page's life: a Version's files never change once checked in.
const blobs = new Map();
export function download(object) {
  if (!blobs.has(object)) {
    const load = (async () => {
      const res = await fetch(
        `${HUB.url}/storage/v1/object/authenticated/projects/${object.split("/").map(encodeURIComponent).join("/")}`,
        { headers: { apikey: HUB.key, authorization: `Bearer ${(await fresh()).access}` } },
      );
      if (!res.ok) throw new Error("This file could not be loaded.");
      return res.blob();
    })();
    load.catch(() => blobs.delete(object));
    blobs.set(object, load);
  }
  return blobs.get(object);
}

export async function sendCode(email) {
  await api("POST", "/auth/v1/otp", { json: { email, create_user: true }, auth: false });
}

export async function verifyCode(email, token) {
  const body = await api("POST", "/auth/v1/verify", {
    json: { type: "email", email, token },
    auth: false,
  });
  session = {
    access: body.access_token,
    refresh: body.refresh_token,
    expiresAt: Date.now() / 1000 + body.expires_in,
    email: body.user?.email ?? email,
  };
  storage.set(session);
  await rpc("accept_invites");
}
