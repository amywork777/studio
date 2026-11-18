import { nameApp } from "@t3tools/shared/appName";
import { brandCopy } from "@t3tools/shared/studioBrandCopy";
import { describe, expect, it, vi } from "vite-plus/test";

import desktopEnglish from "../../../../../desktop/src/i18n/translations/en.json";
import webEnglish from "../../../i18n/translations/en.json";
import { HIDDEN_T3_PRODUCT_NAMES, t3FeatureHidden, type T3Feature } from "../hiddenT3Features";

// As Studio's build: its brand hides T3's own products.
vi.mock("../studioInterface", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../studioInterface")>()),
  STUDIO_INTERFACE_AVAILABLE: true,
}));

/** Every English source sentence of T3's web and desktop apps, as the i18n catalogs hold them. */
function englishSource(): string[] {
  const texts = new Set<string>();
  for (const value of [...Object.values(webEnglish), ...Object.values(desktopEnglish)]) {
    for (const part of Array.isArray(value) ? value : [value]) {
      if (typeof part === "string") texts.add(part);
    }
  }
  return [...texts];
}

/**
 * T3's sentences that only a hidden feature's screens show, so they may still name T3's `t3`
 * command: T3 Connect's diagnostics and pages, the screens for other computers (Environments,
 * linked environments, update steps for a server Studio does not run) and the `t3` command's own
 * row. Settings search terms count, as their rows are hidden too.
 */
const SHOWN_ONLY_BY_HIDDEN_FEATURES: ReadonlyArray<readonly [T3Feature, string]> = [
  ["connect", "On {host}, check Settings > Sharing & access or run `t3 connect status`."],
  ["connect", "Or run `t3 auth connect-device approve {code}` on {host}."],
  [
    "connect",
    "The link is missing its authorization request. Re-run `t3 connect` in your terminal and open the freshly printed URL.",
  ],
  ["connect", "beta share guest invite link teammate watch t3 connect tunnel"],
  ["connect", "managed tunnel cloud other devices remote tunnels limit t3 chat"],
  ["connect", "t3 connect devices approve deny trust revoke pairing code security account"],
  ["connect", "webhook automations offline queue mailbox t3 connect"],
  [
    "remoteAccess",
    "This environment was removed from T3 Connect. Run `t3 connect link` on the host to link it again.",
  ],
  ["remoteAccess", "Run `t3 connect link` on the host, then restart T3 Code there."],
  ["remoteAccess", "Add it to an agent, e.g. claude mcp add --transport http t3 {url}"],
  ["remoteAccess", "From Sharing & access there, or t3 pair"],
  ["remoteAccess", "add pair backend host code ssh config agent tunnel saved t3 connect"],
  ["remoteAccess", "Run `{command}` on {serverLabel}, then restart t3 with your usual options."],
  [
    "remoteAccess",
    "Stop t3 on {serverLabel}, then relaunch with `{command}` using the same subcommand and options. This does not update an installed t3 command.",
  ],
  ["cli", "The t3 command is unavailable."],
  ["cli", "Failed to load the t3 command state."],
  ["cli", "Could not add t3 to PATH"],
  ["cli", "Another t3 at {path} runs first in a new terminal. Remove it to use T3 Code's."],
  ["cli", "t3 command"],
];

describe("brandCopy", () => {
  it("puts the app's name in T3's text, in Studio's words where it rewords one", () => {
    nameApp("Studio");
    expect(brandCopy("Restart T3 Code on this device.")).toBe("Restart Studio on this device.");
    expect(brandCopy("{host} runs an older T3 Code")).toBe("{host} runs an older Studio");
    expect(brandCopy("Restart the T3 server on {label} so it runs {appVersion}")).toBe(
      "Restart the Studio server on {label} so it runs {appVersion}",
    );
    expect(brandCopy("T3 Connect is not available in this build.")).toBe(
      "Other apps cannot connect in this build.",
    );
    expect(brandCopy("Read a T3 thread")).toBe("Read a Studio thread");
    expect(brandCopy("See your agents, import projects, and set up your phone.")).toBe(
      "See your agents and import projects.",
    );
    expect(
      brandCopy("For example, t3 or t3/ produces t3/add-search. Leave empty for no prefix."),
    ).toBe("For example, studio or studio/ produces studio/add-search. Leave empty for no prefix.");
  });

  // A T3 merge that brings a sentence naming one of T3's own products fails here: hide the feature
  // that shows it (`hiddenT3Features.ts`), or reword the sentence in `studioBrandCopy.ts`.
  it("leaves no T3 name in Studio's copy outside the products Studio hides", () => {
    nameApp("Studio");
    const named = englishSource()
      .map(brandCopy)
      .filter((text) => {
        const rest = HIDDEN_T3_PRODUCT_NAMES.reduce((out, name) => out.replaceAll(name, ""), text);
        return /\bT3\b|t3\.codes|pingdotgg/.test(rest);
      });
    expect(named).toEqual([]);
  });

  // The same for T3's `t3` command and its `t3/` examples: reword the sentence, or hide the
  // feature that shows it and list the sentence above.
  it("names no `t3` command in Studio's copy outside the features Studio hides", () => {
    nameApp("Studio");
    const source = englishSource();
    const hidden = new Set(SHOWN_ONLY_BY_HIDDEN_FEATURES.map(([, text]) => text));
    for (const [feature, text] of SHOWN_ONLY_BY_HIDDEN_FEATURES) {
      expect(t3FeatureHidden(feature), feature).toBe(true);
      expect(source, "a listed sentence T3 no longer has").toContain(text);
    }
    const commands = source
      .filter((text) => !hidden.has(text))
      .map(brandCopy)
      .filter((text) => /\bt3 |\bt3\//.test(text));
    expect(commands).toEqual([]);
  });
});
