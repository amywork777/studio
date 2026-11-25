/**
 * A Pro license key names its account and is signed with the host's `LICENSE_SECRET`:
 * `SPRO-<account id, 32 hex>-<signature>`. The database keeps no key, so a leaked table holds
 * none; the server can show the key again whenever the person proves the purchase (the checkout
 * page), and raising the account's `key_generation` turns every earlier key off.
 */
const PREFIX = "SPRO-";
const KEY = /^SPRO-([0-9a-f]{32})-([A-Za-z0-9_-]{43})$/;
const encoder = new TextEncoder();

const base64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function signature(secret, accountId, generation) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`studio-pro.${accountId}.${generation}`),
  );
  return base64url(signed);
}

/** The key for an account at its generation. */
export async function licenseKey(secret, accountId, generation) {
  const hex = accountId.replace(/-/g, "").toLowerCase();
  return `${PREFIX}${hex}-${await signature(secret, hex, generation)}`;
}

/** The account id a key names (with dashes, as the table keeps it), or null when it is no key. */
export function accountIdOf(key) {
  const match = KEY.exec(String(key ?? "").trim());
  if (!match) return null;
  const hex = match[1];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Whether `key` is the account's key at its generation, compared in constant time. */
export async function keyMatches(secret, key, accountId, generation) {
  const expected = encoder.encode(await licenseKey(secret, accountId, generation));
  const given = encoder.encode(String(key ?? "").trim());
  if (expected.length !== given.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1)
    difference |= expected[index] ^ given[index];
  return difference === 0;
}

/** The key a request carries: `Authorization: Bearer` (Claude Code's auth token) or `x-api-key`. */
export function keyOf(headers) {
  const bearer = /^Bearer\s+(\S+)\s*$/i.exec(headers.get("authorization") ?? "");
  return bearer?.[1] ?? headers.get("x-api-key")?.trim() ?? null;
}

/** The hex SHA-256 of a claim secret, as the checkout carries it and the table keeps it. */
export async function claimHashOf(secret) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(secret)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
