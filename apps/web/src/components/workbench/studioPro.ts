import type { ProviderInstanceConfig } from "@t3tools/contracts";

/**
 * Studio Pro is the Claude instance pointed at Studio Pro's server (`infra/pro`): Claude Code's
 * endpoint, the license key as its secret auth token, and the account id the Pro row reads use by
 * (the app cannot read a secret back). Leaving Pro takes the three away.
 */
const STUDIO_PRO_SERVER: string =
  import.meta.env.VITE_STUDIO_PRO_URL || "https://studio-pro.vercel.app";
const BASE_URL = "ANTHROPIC_BASE_URL";
const TOKEN = "ANTHROPIC_AUTH_TOKEN";
const ACCOUNT = "STUDIO_PRO_ACCOUNT";
const PRO_VARIABLES = new Set([BASE_URL, TOKEN, ACCOUNT]);

export type StudioProPlan = "monthly" | "founding";

/** The two ways to pay, as Checkout charges them (`STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_FOUNDING`). */
export const STUDIO_PRO_PLANS: ReadonlyArray<{
  readonly plan: StudioProPlan;
  readonly name: string;
  readonly price: string;
  readonly detail: string;
}> = [
  { plan: "monthly", name: "Monthly", price: "$49 a month", detail: "Cancel any time." },
  {
    plan: "founding",
    name: "Founding member",
    price: "$290 a year",
    detail: "For Studio's first engineers: about half the monthly price.",
  },
];

/** The account id a license key names (`SPRO-<32 hex>-<signature>`), or null for anything else. */
export function proAccountOf(key: string): string | null {
  const match = /^SPRO-([0-9a-f]{32})-[A-Za-z0-9_-]{43}$/.exec(key);
  if (!match?.[1]) return null;
  const hex = match[1];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A key as it was pasted: spaces, line breaks and quotes dropped. */
export const normalizedProKey = (text: string): string => text.replace(/[\s"'`]+/g, "");

const variable = (instance: ProviderInstanceConfig, name: string) =>
  (instance.environment ?? []).find((entry) => entry.name === name);

/** Whether the Claude instance runs on Studio Pro, and which account when it does. */
export function proAccountIn(
  instance: ProviderInstanceConfig,
  server = STUDIO_PRO_SERVER,
): string | null {
  const base = variable(instance, BASE_URL)?.value;
  const account = variable(instance, ACCOUNT)?.value;
  return base === `${server}/anthropic` && typeof account === "string" && account.length > 0
    ? account
    : null;
}

/** The Claude instance on a Pro key: its other variables kept, and Pro's three in place. */
export function proInstance(
  instance: ProviderInstanceConfig,
  key: string,
  server = STUDIO_PRO_SERVER,
): ProviderInstanceConfig {
  const account = proAccountOf(key);
  if (account === null) throw new Error("That is not a Studio Pro license key.");
  return {
    ...instance,
    enabled: true,
    environment: [
      ...(instance.environment ?? []).filter((entry) => !PRO_VARIABLES.has(entry.name)),
      { name: BASE_URL, value: `${server}/anthropic`, sensitive: false },
      { name: TOKEN, value: key, sensitive: true },
      { name: ACCOUNT, value: account, sensitive: false },
    ],
  };
}

/** The Claude instance off Pro: back on the person's own Claude sign-in. */
export function instanceWithoutPro(instance: ProviderInstanceConfig): ProviderInstanceConfig {
  return {
    ...instance,
    environment: (instance.environment ?? []).filter((entry) => !PRO_VARIABLES.has(entry.name)),
  };
}

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

/**
 * A new claim for one Upgrade click: a secret this app keeps, and its hash, which rides on the
 * checkout. Only the app holding the secret can take the key the payment buys.
 */
export async function newProClaim(): Promise<{ secret: string; hash: string }> {
  const secret = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const hash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)));
  return { secret, hash };
}

export const proUpgradeUrl = (plan: StudioProPlan, claimHash: string, server = STUDIO_PRO_SERVER) =>
  `${server}/v1/upgrade?plan=${plan}&claim=${claimHash}`;

export const proManageUrl = (server = STUDIO_PRO_SERVER) => `${server}/v1/manage`;

const UNREACHABLE = "Could not reach Studio Pro. Check the internet connection and try again.";

const messageOf = async (response: Response, fallback: string) => {
  const body: unknown = await response.json().catch(() => null);
  const error =
    body !== null && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  return typeof error === "string" && error.length < 300 ? error : fallback;
};

export type ProClaim =
  | { readonly kind: "waiting" }
  | { readonly kind: "paid"; readonly key: string }
  | { readonly kind: "failed"; readonly message: string };

/** Asks whether the checkout this claim opened is paid; once it is, the answer holds the key. */
export async function checkProClaim(
  secret: string,
  request: typeof fetch = fetch,
  server = STUDIO_PRO_SERVER,
): Promise<ProClaim> {
  try {
    const response = await request(`${server}/v1/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ claim: secret }),
    });
    // Before the browser reaches Checkout, the claim is not there yet: still waiting.
    if (response.status === 202 || response.status === 404) return { kind: "waiting" };
    if (!response.ok)
      return {
        kind: "failed",
        message: await messageOf(response, "Studio Pro could not sign in."),
      };
    const body = (await response.json()) as { key?: unknown };
    return typeof body.key === "string" && proAccountOf(body.key) !== null
      ? { kind: "paid", key: body.key }
      : { kind: "failed", message: "Studio Pro could not sign in." };
  } catch {
    return { kind: "waiting" };
  }
}

export type ProUsage = {
  readonly plan: StudioProPlan;
  readonly runs: boolean;
  readonly refused: string | null;
  readonly usedPercent: number;
  readonly resetsAt: string;
};

/** The plan and this month's share used, for the Pro row; a sentence when it can't be read. */
export async function readProUsage(
  account: string,
  request: typeof fetch = fetch,
  server = STUDIO_PRO_SERVER,
): Promise<ProUsage | { readonly message: string }> {
  try {
    const response = await request(`${server}/v1/usage?account=${encodeURIComponent(account)}`);
    if (!response.ok)
      return { message: await messageOf(response, "Studio Pro could not read this month's use.") };
    return (await response.json()) as ProUsage;
  } catch {
    return { message: UNREACHABLE };
  }
}

/** The Pro row's line: the plan, then what is used, or why it has stopped. */
export function proUsageLine(usage: ProUsage, now = new Date()): string {
  const plan = usage.plan === "founding" ? "Founding member" : "Monthly";
  if (!usage.runs && usage.refused) return `${plan}. ${usage.refused}`;
  const resets = new Date(usage.resetsAt);
  const day = resets.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    ...(resets.getUTCFullYear() === now.getUTCFullYear() ? {} : { year: "numeric" }),
  });
  return `${plan}. ${usage.usedPercent}% of this month's AI used; it starts again ${day}.`;
}
