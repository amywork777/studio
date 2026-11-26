import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { homeLayout, readGetStartedFolded, writeGetStartedFolded } from "./homeStart";

/** This device's storage, as the page has it. */
function storage(values = new Map<string, string>()) {
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe("Home's layout", () => {
  it("starts someone with no projects on the start page", () => {
    expect(homeLayout({ loaded: true, projects: 0 })).toBe("start");
  });

  it("shows the projects of someone who has some", () => {
    expect(homeLayout({ loaded: true, projects: 3 })).toBe("projects");
  });

  it("keeps the start page away until the list arrives", () => {
    // Someone with projects would otherwise see the start page flash first.
    expect(homeLayout({ loaded: false, projects: 0 })).toBe("projects");
  });
});

describe("the Get started strip's fold", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is open the first time", () => {
    vi.stubGlobal("localStorage", storage());
    expect(readGetStartedFolded()).toBe(false);
  });

  it("is remembered on this device", () => {
    vi.stubGlobal("localStorage", storage());
    writeGetStartedFolded(true);
    expect(readGetStartedFolded()).toBe(true);
    writeGetStartedFolded(false);
    expect(readGetStartedFolded()).toBe(false);
  });

  it("reads as open when storage is off", () => {
    const blocked = () => {
      throw new Error("Storage is off");
    };
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });
    expect(readGetStartedFolded()).toBe(false);
    expect(() => writeGetStartedFolded(true)).not.toThrow();
  });
});
