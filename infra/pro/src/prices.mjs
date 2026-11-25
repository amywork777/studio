/**
 * Anthropic's published API rates in dollars per million tokens (checked 2026-11-25). A model with
 * no price here is refused, never guessed. Cache writes are 1.25x input for the 5-minute cache and
 * 2x for the hour; a web search is $10 per thousand.
 */
export const ANTHROPIC_PRICES = {
  "claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-7": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-6": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3 },
  // Past 100K prompt tokens, Haiku 5.5 is $0.50 / $2.50.
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    above: { tokens: 100_000, input: 0.5, output: 2.5, cacheRead: 0.05 },
  },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
};
const WEB_SEARCH_USD = 0.01;

/**
 * The price row for a model id as Claude Code sends it: exact, or with a date or `[1m]` suffix
 * (`claude-haiku-4-5-20251001`); a newer model the table lacks, such as `claude-opus-5-6`, has none.
 */
export function priceOf(model, prices = ANTHROPIC_PRICES) {
  if (typeof model !== "string") return undefined;
  const id = model.toLowerCase().replace(/\[1m\]$/, "");
  const names = Object.keys(prices).sort((a, b) => b.length - a.length);
  const name = names.find(
    (known) =>
      id === known || (id.startsWith(`${known}-`) && /^\d{8}$/.test(id.slice(known.length + 1))),
  );
  return name === undefined ? undefined : { name, ...prices[name] };
}

const count = (value) => (Number.isFinite(value) && value > 0 ? value : 0);

/**
 * A Messages API usage block in dollars. `input_tokens` is the uncached part only; cache writes
 * split by lifetime when `cache_creation` says so, and count as the 5-minute cache when it does not.
 */
export function anthropicCost(row, usage) {
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
  const prompt = tokens.input + tokens.cacheWrite + tokens.cacheRead;
  const price = row.above && prompt > row.above.tokens ? row.above : row;
  const usd =
    (tokens.input * price.input +
      written5m * price.input * 1.25 +
      written1h * price.input * 2 +
      tokens.cacheRead * price.cacheRead +
      tokens.output * price.output) /
      1_000_000 +
    tokens.webSearches * WEB_SEARCH_USD;
  return { tokens, usd };
}

/**
 * OpenAI's prices are not kept here: the host names them in `OPENAI_PRICES`, a JSON map of model to
 * `{input, cachedInput, output}` dollars per million, copied from OpenAI's pricing page. Unset, the
 * OpenAI route carries no model.
 */
export function openaiPrices(value) {
  try {
    const parsed = JSON.parse(value ?? "{}");
    const prices = {};
    for (const [model, row] of Object.entries(parsed)) {
      if ([row?.input, row?.cachedInput, row?.output].every((n) => Number.isFinite(n) && n >= 0))
        prices[model] = { input: row.input, cacheRead: row.cachedInput, output: row.output };
    }
    return prices;
  } catch {
    return {};
  }
}

/** A Responses API usage block in dollars: `input_tokens` includes the cached part. */
export function openaiCost(price, usage) {
  const cached = count(usage?.input_tokens_details?.cached_tokens);
  const tokens = {
    input: Math.max(0, count(usage?.input_tokens) - cached),
    cacheWrite: 0,
    cacheRead: cached,
    output: count(usage?.output_tokens),
    webSearches: 0,
  };
  const usd =
    (tokens.input * price.input + cached * price.cacheRead + tokens.output * price.output) /
    1_000_000;
  return { tokens, usd };
}
