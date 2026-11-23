// @effect-diagnostics nodeBuiltinImport:off - reads the brand folder and index.html the build plugin reads.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { brandHtml, readBrand } from "../vite/brand";

const studioBrand = NodePath.join(import.meta.dirname, "..", "..", "..", "brand");
const indexHtml = NodeFS.readFileSync(
  NodePath.join(import.meta.dirname, "..", "index.html"),
  "utf8",
);

describe("brand plugin", () => {
  it("leaves T3 Code alone without a brand folder", () => {
    expect(readBrand(undefined)).toBeNull();
  });

  it("brands index.html with text-to-cad Studio's title, splash and theme", () => {
    const brand = readBrand(studioBrand)!;
    expect(brand.name).toBe("Studio");
    expect(brand.markUrl).toMatch(/^data:image\/svg\+xml;base64,/);

    const html = brandHtml(indexHtml, brand);
    expect(html).toContain("<title>Studio</title>");
    // The splash plays text-to-cad's animated mark under the app's name.
    expect(html).toMatch(
      /<img id="boot-shell-logo" src="data:image\/svg\+xml;base64,[^"]+" alt="Studio"/,
    );
    // The splash would otherwise flash T3's indigo before the app paints.
    expect(html).not.toContain('accent: "#4f46e5"');
    expect(html).not.toContain('accent: "#818cf8"');
    expect(html).toContain('accent: "#2c7197"');
    expect(html).not.toContain("#0a0a0a");
    // text-to-cad's palette, scoped so a theme the user picks keeps its own colors.
    expect(html).toContain("<style data-brand>");
    expect(html).toContain('html.dark:not([data-theme-id]), html.dark[data-theme-id=""]');
    expect(html).toContain("--primary: oklch(0.205 0 0);");
    expect(html).toContain("--ring: #2c7197;");
  });

  it("lays Studio out as a workbench and gives it hardware starters", () => {
    const brand = readBrand(studioBrand)!;
    expect(brand.layout).toBe("workbench");
    // This branch is hardware first: Check, Make and Document, point then ask, start from a part.
    expect(brand.focus).toBe("hardware");
    expect(brandHtml(indexHtml, brand)).toContain('<html lang="en" data-studio-focus="hardware">');
    expect(brand.starters.map((starter) => starter.prompt)).toContain("Route this board");
    // Every starter names the text-to-cad skill it needs, so none is offered without it.
    expect(brand.starters.every((starter) => starter.skill !== null)).toBe(true);
  });

  it("keeps the Welcome page's agent setup terminal when it hides terminal drawers", () => {
    const css = NodeFS.readFileSync(NodePath.join(studioBrand, "theme.css"), "utf8");
    // Without the exemption, Install and Sign in on the Welcome page open a terminal nobody sees.
    expect(css).toMatch(/\[data-thread-terminal-drawer\]:not\([^)]*\[data-agent-setup-terminal\]/);
  });

  it("collapses the model name only in the chat box, not in Settings' model pickers", () => {
    const css = NodeFS.readFileSync(NodePath.join(studioBrand, "theme.css"), "utf8");
    // Settings → Agents → New chats is where the engineering interface picks a model; its name must show.
    const rules = [...css.matchAll(/([^{}]*\[data-chat-provider-model-picker-label\][^{}]*)\{/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, selector = ""] of rules) {
      expect(selector.replace(/\s+/g, " ")).toContain(
        "[data-chat-composer-form] [data-chat-provider-model-picker-label]",
      );
    }
  });

  it("says which folder lacks brand.json", () => {
    expect(() => readBrand(import.meta.dirname)).toThrow(/has no brand\.json/);
  });
});
