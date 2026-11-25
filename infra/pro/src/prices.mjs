/**
 * The models Studio Pro runs, by OpenRouter slug, with OpenRouter's listed prices in dollars per
 * million tokens (its /api/v1/models, checked 2026-11-25). A model not here is refused. The cost
 * kept is the one OpenRouter reports with the answer; these prices only stand in when it reports none.
 */
export const MODELS = {
  "anthropic/claude-opus-5.5": { input: 4, output: 20, cacheRead: 0.2 },
  "anthropic/claude-sonnet-5.5": { input: 2, output: 10, cacheRead: 0.1 },
  "anthropic/claude-haiku-5.5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "anthropic/claude-fable-5.2": { input: 8, output: 40, cacheRead: 0.2 },
  "openai/gpt-6.2-astra": { input: 8, output: 40, cacheRead: 0.4 },
};
const WEB_SEARCH_USD = 0.01;

/**
 * The OpenRouter slug for a model as Claude Code sends it: Anthropic's own id (`claude-opus-5-5`,
 * with a date or `[1m]` after it) or a slug Studio offers itself (`openai/gpt-6.2-astra`).
 */
export function modelOf(model, models = MODELS) {
  if (typeof model !== "string") return undefined;
  const id = model.toLowerCase().replace(/\[1m\]$/, "");
  if (models[id]) return { slug: id, ...models[id] };
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d))?(?:-\d{8})?$/.exec(id);
  if (!match) return undefined;
  const slug = `anthropic/claude-${match[1]}-${match[2]}${match[3] === undefined ? "" : `.${match[3]}`}`;
  return models[slug] ? { slug, ...models[slug] } : undefined;
}

const count = (value) => (Number.isFinite(value) && value > 0 ? value : 0);

/**
 * What a call cost, from a Messages API usage block: OpenRouter's own `cost` when it reports one
 * (`source: "openrouter"`), else its listed prices times the tokens (`source: "tokens"`). Cache
 * writes are 1.25x input for the 5-minute cache and 2x for the hour.
 */
export function costOf(price, usage) {
  const written1h = count(usage?.cache_creation?.ephemeral_1h_input_tokens);
  const written = count(usage?.cache_creation_input_tokens);
  const written5m = usage?.cache_creation
    ? count(usage.cache_creation.ephemeral_5m_input_tokens)
    : written;
  const tokens = {
    input: count(usage?.input_tokens),
    cacheWrite: Math.max(written, written5m + written1h),
    cacheRead: count(usage?.cache_read_input_tokens),
    output: count(usage?.output_tokens),
    webSearches: count(usage?.server_tool_use?.web_search_requests),
  };
  if (Number.isFinite(usage?.cost) && usage.cost >= 0)
    return { tokens, usd: usage.cost, source: "openrouter" };
  const usd =
    (tokens.input * price.input +
      written5m * price.input * 1.25 +
      written1h * price.input * 2 +
      tokens.cacheRead * price.cacheRead +
      tokens.output * price.output) /
      1_000_000 +
    tokens.webSearches * WEB_SEARCH_USD;
  return { tokens, usd, source: "tokens" };
}
