import { ProviderDriverKind, type ProviderInstanceConfig } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  checkProClaim,
  instanceWithoutOwnKey,
  instanceWithoutPro,
  ownKeyIn,
  ownKeyInstance,
  newProClaim,
  proAccountIn,
  proAccountOf,
  proInstance,
  proUsageLine,
} from "./studioPro";

const SERVER = "https://pro.example";
const KEY = `SPRO-0b7e4c5a3c2d4f6e9a1b2c3d4e5f6a7b-${"a".repeat(43)}`;
const ACCOUNT = "0b7e4c5a-3c2d-4f6e-9a1b-2c3d4e5f6a7b";
const claude: ProviderInstanceConfig = {
  driver: ProviderDriverKind.make("claudeAgent"),
  config: { homePath: "~/.claude-work", customModels: ["claude-own-model"] },
  environment: [
    { name: "HTTPS_PROXY", value: "http://proxy", sensitive: false },
    { name: "ANTHROPIC_AUTH_TOKEN", value: "old", sensitive: true },
  ],
};

describe("Studio Pro on the Claude instance", () => {
  it("points Claude at Pro with the key kept secret and GPT beside it, and leaving gives the person's setup back", () => {
    const pro = proInstance(claude, KEY, SERVER);
    expect(pro.environment).toEqual([
      { name: "HTTPS_PROXY", value: "http://proxy", sensitive: false },
      { name: "ANTHROPIC_BASE_URL", value: `${SERVER}/anthropic`, sensitive: false },
      { name: "ANTHROPIC_AUTH_TOKEN", value: KEY, sensitive: true },
      { name: "STUDIO_PRO_ACCOUNT", value: ACCOUNT, sensitive: false },
    ]);
    expect(pro.config).toEqual({
      homePath: "~/.claude-work",
      customModels: ["claude-own-model", { slug: "openai/gpt-6.2-astra", name: "GPT-6.2 Astra" }],
    });
    // Signing in twice adds GPT once.
    expect(proInstance(pro, KEY, SERVER).config).toEqual(pro.config);
    expect(proAccountIn(pro, SERVER)).toBe(ACCOUNT);
    expect(proAccountIn(claude, SERVER)).toBeNull();
    // Another endpoint the person set is theirs, not Pro.
    expect(proAccountIn(pro, "https://elsewhere.example")).toBeNull();
    expect(instanceWithoutPro(pro).environment).toEqual([
      { name: "HTTPS_PROXY", value: "http://proxy", sensitive: false },
    ]);
    expect(instanceWithoutPro(pro).config).toEqual(claude.config);
  });

  it("runs Claude on the person's own Anthropic or OpenRouter key instead of Pro, and back", () => {
    const anthropicKey = `sk-ant-api03-${"b".repeat(40)}`;
    const openrouterKey = `sk-or-v1-${"c".repeat(64)}`;
    const pro = proInstance(claude, KEY, SERVER);

    const own = ownKeyInstance(pro, anthropicKey);
    expect(own.environment).toEqual([
      { name: "HTTPS_PROXY", value: "http://proxy", sensitive: false },
      { name: "ANTHROPIC_API_KEY", value: anthropicKey, sensitive: true },
    ]);
    expect(own.config).toEqual(claude.config);
    expect(proAccountIn(own, SERVER)).toBeNull();
    // As the app reads it back, with the secret's value redacted.
    expect(
      ownKeyIn({
        ...own,
        environment: [
          { name: "ANTHROPIC_API_KEY", value: "", sensitive: true, valueRedacted: true },
        ],
      }),
    ).toBe("anthropic");

    const viaOpenRouter = ownKeyInstance(own, openrouterKey);
    expect(viaOpenRouter.environment).toEqual([
      { name: "HTTPS_PROXY", value: "http://proxy", sensitive: false },
      { name: "ANTHROPIC_BASE_URL", value: "https://openrouter.ai/api", sensitive: false },
      { name: "ANTHROPIC_AUTH_TOKEN", value: openrouterKey, sensitive: true },
      { name: "ANTHROPIC_API_KEY", value: "", sensitive: false },
    ]);
    expect(ownKeyIn(viaOpenRouter)).toBe("openrouter");
    expect(ownKeyIn(pro)).toBeNull();

    // Pro after an own key drops that key, so Claude Code is not left choosing between two.
    expect(proInstance(own, KEY, SERVER).environment).toEqual(pro.environment);
    expect(instanceWithoutOwnKey(viaOpenRouter).environment).toEqual([
      { name: "HTTPS_PROXY", value: "http://proxy", sensitive: false },
    ]);
    expect(() => ownKeyInstance(claude, KEY)).toThrow();
  });

  it("takes only a Pro key", () => {
    expect(proAccountOf(KEY)).toBe(ACCOUNT);
    expect(proAccountOf("sk-ant-api03-abc")).toBeNull();
    expect(() => proInstance(claude, "STUDIO-ABCD-EFGH-JKLM", SERVER)).toThrow();
  });
});

describe("Studio Pro's checkout claim", () => {
  it("is a fresh secret each time, with its SHA-256 for the checkout", async () => {
    const first = await newProClaim();
    const second = await newProClaim();
    expect(first.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.secret).not.toBe(second.secret);
  });

  it("waits until the checkout is paid, then answers the key", async () => {
    const answers = [
      new Response(JSON.stringify({ error: "Studio has not opened a checkout for this yet." }), {
        status: 404,
      }),
      new Response(JSON.stringify({ pending: true }), { status: 202 }),
      Response.json({ key: KEY, plan: "starter" }),
      new Response(JSON.stringify({ error: "This checkout has expired. Choose Upgrade again." }), {
        status: 410,
      }),
    ];
    const request = async () => answers.shift() ?? Response.error();
    expect(await checkProClaim("s", request, SERVER)).toEqual({ kind: "waiting" });
    expect(await checkProClaim("s", request, SERVER)).toEqual({ kind: "waiting" });
    expect(await checkProClaim("s", request, SERVER)).toEqual({ kind: "paid", key: KEY });
    expect(await checkProClaim("s", request, SERVER)).toEqual({
      kind: "failed",
      message: "This checkout has expired. Choose Upgrade again.",
    });
  });
});

describe("the Pro row's line", () => {
  it("says the share used and the Monday it refills, or why it stopped", () => {
    const now = new Date("2026-12-03T12:00:00Z");
    const usage = {
      plan: "starter" as const,
      runs: true,
      refused: null,
      usedPercent: 12,
      resetsAt: "2026-12-07T00:00:00.000Z",
    };
    expect(proUsageLine(usage, now)).toBe(
      "Starter. 12% of this week's AI used; it refills Mon, Dec 7.",
    );
    expect(proUsageLine({ ...usage, plan: "pro", resetsAt: "2027-01-04T00:00:00.000Z" }, now)).toBe(
      "Pro. 12% of this week's AI used; it refills Mon, Jan 4, 2027.",
    );
    expect(
      proUsageLine({ ...usage, plan: "pro", runs: false, refused: "It has ended." }, now),
    ).toBe("Pro. It has ended.");
    expect(proUsageLine({ ...usage, addedUsd: 9.5 }, now)).toBe(
      "Starter. 12% of this week's AI used; it refills Mon, Dec 7. $9.50 of added AI left.",
    );
  });
});
