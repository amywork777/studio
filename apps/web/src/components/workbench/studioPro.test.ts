import { ProviderDriverKind, type ProviderInstanceConfig } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  checkProClaim,
  instanceWithoutPro,
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
  environment: [
    { name: "HTTPS_PROXY", value: "http://proxy", sensitive: false },
    { name: "ANTHROPIC_AUTH_TOKEN", value: "old", sensitive: true },
  ],
};

describe("Studio Pro on the Claude instance", () => {
  it("points Claude at Pro with the key kept secret, and leaving gives the person's setup back", () => {
    const pro = proInstance(claude, KEY, SERVER);
    expect(pro.environment).toEqual([
      { name: "HTTPS_PROXY", value: "http://proxy", sensitive: false },
      { name: "ANTHROPIC_BASE_URL", value: `${SERVER}/anthropic`, sensitive: false },
      { name: "ANTHROPIC_AUTH_TOKEN", value: KEY, sensitive: true },
      { name: "STUDIO_PRO_ACCOUNT", value: ACCOUNT, sensitive: false },
    ]);
    expect(proAccountIn(pro, SERVER)).toBe(ACCOUNT);
    expect(proAccountIn(claude, SERVER)).toBeNull();
    // Another endpoint the person set is theirs, not Pro.
    expect(proAccountIn(pro, "https://elsewhere.example")).toBeNull();
    expect(instanceWithoutPro(pro).environment).toEqual([
      { name: "HTTPS_PROXY", value: "http://proxy", sensitive: false },
    ]);
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
      Response.json({ key: KEY, plan: "monthly" }),
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
  it("says the share used and when it starts again, or why it stopped", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    const usage = {
      plan: "monthly" as const,
      runs: true,
      refused: null,
      usedPercent: 12,
      resetsAt: "2026-12-01T00:00:00.000Z",
    };
    expect(proUsageLine(usage, now)).toBe(
      "Monthly. 12% of this month's AI used; it starts again Dec 1.",
    );
    expect(
      proUsageLine({ ...usage, plan: "founding", runs: false, refused: "It has ended." }, now),
    ).toBe("Founding member. It has ended.");
  });
});
