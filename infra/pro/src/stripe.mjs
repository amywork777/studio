/**
 * The few Stripe calls Pro needs, over its REST API with `fetch` (handed in for tests): make a
 * Checkout session, read one back, and read a subscription. Test mode or
 * live is the key's own: `sk_test_...` charges nothing.
 */
const API = "https://api.stripe.com/v1";
const TIMEOUT_MS = 10_000;

/** Stripe's form encoding, nested keys as `a[b][0]`. */
export function formOf(value, prefix = "", out = new URLSearchParams()) {
  if (value === undefined || value === null) return out;
  if (typeof value === "object") {
    for (const [key, inner] of Object.entries(value))
      formOf(inner, prefix ? `${prefix}[${key}]` : key, out);
  } else out.append(prefix, String(value));
  return out;
}

/** @param {{ key: string, fetch?: typeof fetch }} options */
export function stripeClient({ key, fetch: send = fetch }) {
  const call = async (method, path, body) => {
    const response = await send(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      body: body ? formOf(body).toString() : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const answer = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(`stripe answered ${response.status}`), {
        code: `stripe_${response.status}`,
        stripe: answer?.error?.code,
      });
    }
    return answer;
  };
  return {
    /** A subscription checkout for one price, tied to the app's claim by `client_reference_id`. */
    checkout({ price, claimHash, plan, successUrl, cancelUrl, email }) {
      return call("POST", "/checkout/sessions", {
        mode: "subscription",
        line_items: [{ price, quantity: 1 }],
        client_reference_id: claimHash,
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: "true",
        customer_email: email,
        metadata: { plan },
        subscription_data: { metadata: { plan } },
      });
    },
    session: (id) => call("GET", `/checkout/sessions/${encodeURIComponent(id)}`),
    subscription: (id) => call("GET", `/subscriptions/${encodeURIComponent(id)}`),
  };
}

/** Whether a subscription's status lets the AI run: paid, on trial, or a payment being retried. */
export const STATUS_RUNS = new Set(["active", "trialing", "past_due"]);

/** Whether a finished Checkout session paid for a subscription. */
export const sessionPaid = (session) =>
  session?.status === "complete" &&
  (session.payment_status === "paid" || session.payment_status === "no_payment_required") &&
  typeof session.subscription === "string";
