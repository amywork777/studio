import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";

import { anthropicCost, openaiCost, openaiPrices, priceOf } from "./prices.mjs";

NodeTest.test(
  "finds a model's price by its id, with a date or context suffix, longest name first",
  () => {
    NodeAssert.equal(priceOf("claude-opus-5-5")?.name, "claude-opus-5-5");
    NodeAssert.equal(priceOf("claude-opus-5")?.name, "claude-opus-5");
    NodeAssert.equal(priceOf("claude-haiku-4-5-20251001")?.name, "claude-haiku-4-5");
    NodeAssert.equal(priceOf("claude-sonnet-5-5[1m]")?.name, "claude-sonnet-5-5");
    NodeAssert.equal(priceOf("claude-opus-5-55"), undefined);
    NodeAssert.equal(priceOf("gpt-6"), undefined);
    NodeAssert.equal(priceOf(undefined), undefined);
  },
);

NodeTest.test("prices a Claude turn's input, both cache lifetimes, output and searches", () => {
  const { tokens, usd } = anthropicCost(priceOf("claude-opus-5-5"), {
    input_tokens: 1000,
    cache_creation_input_tokens: 30_000,
    cache_creation: { ephemeral_5m_input_tokens: 20_000, ephemeral_1h_input_tokens: 10_000 },
    cache_read_input_tokens: 1_000_000,
    output_tokens: 8000,
    server_tool_use: { web_search_requests: 2 },
  });
  NodeAssert.deepEqual(tokens, {
    input: 1000,
    cacheWrite: 30_000,
    cacheRead: 1_000_000,
    output: 8000,
    webSearches: 2,
  });
  // 1000*4 + 20000*5 + 10000*8 + 1e6*0.2 + 8000*20, per million, plus two searches.
  NodeAssert.equal(usd.toFixed(6), (0.004 + 0.1 + 0.08 + 0.2 + 0.16 + 0.02).toFixed(6));
});

NodeTest.test("a cache write without its split counts as the 5-minute cache", () => {
  const { usd } = anthropicCost(priceOf("claude-sonnet-5-5"), {
    cache_creation_input_tokens: 1_000_000,
  });
  NodeAssert.equal(usd, 2.5);
});

NodeTest.test("Haiku 5.5 charges its higher rate past 100K prompt tokens", () => {
  const price = priceOf("claude-haiku-5-5");
  NodeAssert.equal(anthropicCost(price, { input_tokens: 100_000 }).usd, 0.01);
  NodeAssert.equal(anthropicCost(price, { input_tokens: 200_000 }).usd, 0.1);
});

NodeTest.test(
  "OpenAI prices come only from the host's table, and cached input is its own rate",
  () => {
    const prices = openaiPrices(
      JSON.stringify({
        "gpt-x": { input: 2, cachedInput: 0.5, output: 8 },
        broken: { input: "a" },
      }),
    );
    NodeAssert.deepEqual(Object.keys(prices), ["gpt-x"]);
    NodeAssert.deepEqual(openaiPrices("not json"), {});
    const { tokens, usd } = openaiCost(priceOf("gpt-x", prices), {
      input_tokens: 1_000_000,
      input_tokens_details: { cached_tokens: 800_000 },
      output_tokens: 100_000,
    });
    NodeAssert.equal(tokens.input, 200_000);
    NodeAssert.equal(usd, 1.6);
  },
);
