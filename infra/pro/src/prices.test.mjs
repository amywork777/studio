import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";

import { costOf, modelOf } from "./prices.mjs";

NodeTest.test(
  "names Claude Code's model as OpenRouter does, and refuses one Studio does not offer",
  () => {
    NodeAssert.equal(modelOf("claude-opus-5-5")?.slug, "anthropic/claude-opus-5.5");
    NodeAssert.equal(modelOf("claude-sonnet-5-5[1m]")?.slug, "anthropic/claude-sonnet-5.5");
    NodeAssert.equal(modelOf("claude-haiku-5-5-20261001")?.slug, "anthropic/claude-haiku-5.5");
    NodeAssert.equal(modelOf("openai/gpt-6.2-astra")?.slug, "openai/gpt-6.2-astra");
    NodeAssert.equal(modelOf("anthropic/claude-opus-5.5")?.slug, "anthropic/claude-opus-5.5");
    for (const other of [
      "claude-opus-5-6",
      "claude-opus-5-55",
      "claude-opus-5",
      "openai/gpt-6.2-astra-pro",
      "gpt-6.2-astra",
      undefined,
    ])
      NodeAssert.equal(modelOf(other), undefined, String(other));
  },
);

const USAGE = {
  input_tokens: 1000,
  cache_creation_input_tokens: 30_000,
  cache_creation: { ephemeral_5m_input_tokens: 20_000, ephemeral_1h_input_tokens: 10_000 },
  cache_read_input_tokens: 1_000_000,
  output_tokens: 8000,
  server_tool_use: { web_search_requests: 2 },
};

NodeTest.test("keeps the cost OpenRouter reports, with the tokens it was for", () => {
  const { tokens, usd, source } = costOf(modelOf("claude-opus-5-5"), { ...USAGE, cost: 0.5123 });
  NodeAssert.equal(source, "openrouter");
  NodeAssert.equal(usd, 0.5123);
  NodeAssert.deepEqual(tokens, {
    input: 1000,
    cacheWrite: 30_000,
    cacheRead: 1_000_000,
    output: 8000,
    webSearches: 2,
  });
});

NodeTest.test("with no reported cost, prices the tokens at OpenRouter's listed rates", () => {
  const { usd, source } = costOf(modelOf("claude-opus-5-5"), USAGE);
  NodeAssert.equal(source, "tokens");
  // 1000*4 + 20000*5 + 10000*8 + 1e6*0.2 + 8000*20, per million, plus two searches.
  NodeAssert.equal(usd.toFixed(6), (0.004 + 0.1 + 0.08 + 0.2 + 0.16 + 0.02).toFixed(6));
  NodeAssert.equal(
    costOf(modelOf("claude-sonnet-5-5"), { cache_creation_input_tokens: 1_000_000 }).usd,
    2.5,
  );
});
