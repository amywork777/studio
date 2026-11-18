import { nameApp } from "@t3tools/shared/appName";
import { brandCopy } from "@t3tools/shared/studioBrandCopy";
import { describe, expect, it } from "vite-plus/test";

import desktopEnglish from "../../../../../desktop/src/i18n/translations/en.json";
import webEnglish from "../../../i18n/translations/en.json";
import { HIDDEN_T3_PRODUCT_NAMES } from "../hiddenT3Features";

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
});
