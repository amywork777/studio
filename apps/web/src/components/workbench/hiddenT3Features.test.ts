import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { hasCloudPublicConfig } from "../../cloud/publicConfig";
import { Route as IssuesRoute } from "../../routes/_chat.issues";
import { Route as SettingsRoute } from "../../routes/_chat.settings";
import { settingsNavGroups } from "./engineeringSettings";

// Studio's brand hides T3's own products in every interface; T3 Code without it keeps them all.
const brand = vi.hoisted(() => ({ studio: true }));
vi.mock("./studioInterface", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./studioInterface")>()),
  get STUDIO_INTERFACE_AVAILABLE() {
    return brand.studio;
  },
}));
afterEach(() => {
  brand.studio = true;
});

/** What a route's `beforeLoad` throws, or null where it lets the page open. */
async function thrownBy(beforeLoad: unknown, args: unknown): Promise<unknown> {
  try {
    await (beforeLoad as (args: unknown) => unknown)(args);
    return null;
  } catch (thrown) {
    return thrown;
  }
}

/** `hasCloudPublicConfig` in a build given T3 Connect's keys. */
function cloudWithKeys(): boolean {
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k");
  vi.stubEnv("VITE_CLERK_JWT_TEMPLATE", "relay");
  vi.stubEnv("VITE_T3CODE_RELAY_URL", "https://relay.example.com");
  try {
    return hasCloudPublicConfig();
  } finally {
    vi.unstubAllEnvs();
  }
}

const at = (pathname: string) => ({ location: { pathname, hash: "" } });

describe("T3 Code's own products in Studio", () => {
  it("sends /issues to Home and the SnapShots settings to General", async () => {
    expect(await thrownBy(IssuesRoute.options.beforeLoad, {})).toMatchObject({
      options: { to: "/", replace: true },
    });
    expect(
      await thrownBy(SettingsRoute.options.beforeLoad, at("/settings/snap-shot")),
    ).toMatchObject({ options: { to: "/settings/general", replace: true } });
  });

  it("lists no SnapShots page in any interface's settings", () => {
    const entries = [{ to: "/settings/general" }, { to: "/settings/snap-shot" }];
    for (const engineering of [true, false]) {
      expect(settingsNavGroups(entries, engineering).main).toEqual([{ to: "/settings/general" }]);
    }
  });

  it("turns T3 Connect off whatever the build was given", () => {
    expect(cloudWithKeys()).toBe(false);
  });

  it("leaves T3 Code's own build as it is", async () => {
    brand.studio = false;
    expect(await thrownBy(IssuesRoute.options.beforeLoad, {})).toBeNull();
    expect(await thrownBy(SettingsRoute.options.beforeLoad, at("/settings/snap-shot"))).toBeNull();
    expect(settingsNavGroups([{ to: "/settings/snap-shot" }], false).main).toHaveLength(1);
    expect(cloudWithKeys()).toBe(true);
  });
});
