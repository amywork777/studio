import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { hasCloudPublicConfig } from "../../cloud/publicConfig";
import { Route as IssuesRoute } from "../../routes/_chat.issues";
import { Route as SettingsRoute } from "../../routes/_chat.settings";
import { Route as ApproveAgentRoute } from "../../routes/approve-agent";
import { Route as ConnectRoute } from "../../routes/connect";
import { Route as ConnectAgentRoute } from "../../routes/connect-agent";
import { Route as GuestRoute } from "../../routes/guest";
import { Route as PairRoute } from "../../routes/pair";
import { buildThreadActionMenuItems, type ThreadActionMenuState } from "../threadActionMenu.logic";
import { settingsNavGroups, settingsRowHidden } from "./engineeringSettings";
import { withoutT3ThreadLink } from "./hiddenT3Features";

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
const HOME = { options: { to: "/", replace: true } };
const GENERAL = { options: { to: "/settings/general", replace: true } };
const REMOTE_SECTIONS = ["/settings/connections", "/settings/access"];
const pairWith = (status: string) => ({ context: { authGateState: { status, auth: {} } } });

/** The ids of a thread menu's Copy submenu. */
function copyMenuIds(): string[] {
  const state: ThreadActionMenuState = {
    canOperate: true,
    branch: null,
    projectFilter: null,
    isPinned: false,
    isSettled: false,
    autoSettleEnabled: false,
    isSnoozed: false,
    canSnoozeNow: false,
    isRegeneratingTitle: false,
    isRunning: false,
    supports: {
      settlement: false,
      autoSettleOptOut: false,
      snooze: false,
      pinning: false,
      titleRegeneration: false,
    },
    snoozePresets: [],
  };
  const copy = buildThreadActionMenuItems(state).find((item) => item.id === "copy");
  return (copy?.children ?? []).map((item) => item.id);
}

const threadTarget = { kind: "thread" } as const;
const pullRequestTarget = { kind: "pull-request" } as const;

describe("T3 Code's own products in Studio", () => {
  it("sends /issues to Home and the SnapShots settings to General", async () => {
    expect(await thrownBy(IssuesRoute.options.beforeLoad, {})).toMatchObject(HOME);
    expect(
      await thrownBy(SettingsRoute.options.beforeLoad, at("/settings/snap-shot")),
    ).toMatchObject(GENERAL);
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

  it("sends the pages for other computers and apps Home, and their settings to General", async () => {
    for (const route of [ConnectAgentRoute, GuestRoute, ApproveAgentRoute, ConnectRoute]) {
      expect(await thrownBy(route.options.beforeLoad, {})).toMatchObject(HOME);
    }
    // A link to add another computer goes Home; this window's own sign-in to its server stays.
    expect(await thrownBy(PairRoute.options.beforeLoad, pairWith("hosted-pairing"))).toMatchObject(
      HOME,
    );
    expect(await thrownBy(PairRoute.options.beforeLoad, pairWith("requires-auth"))).toBeNull();
    for (const path of REMOTE_SECTIONS) {
      expect(await thrownBy(SettingsRoute.options.beforeLoad, at(path))).toMatchObject(GENERAL);
    }
  });

  it("lists no Environments or Sharing & access page, linked environments or t3 command", () => {
    const entries = [{ to: "/settings/general" }, ...REMOTE_SECTIONS.map((to) => ({ to }))];
    for (const engineering of [true, false]) {
      expect(settingsNavGroups(entries, engineering).main).toEqual([{ to: "/settings/general" }]);
      expect(settingsRowHidden("linked-environments-beta", engineering)).toBe(true);
      expect(settingsRowHidden("cli-command", engineering)).toBe(true);
    }
  });

  it("copies no thread link and keeps Copy PR link", () => {
    expect(withoutT3ThreadLink(threadTarget)).toBeNull();
    expect(withoutT3ThreadLink(pullRequestTarget)).toBe(pullRequestTarget);
    expect(copyMenuIds()).not.toContain("copy-thread");
  });

  it("leaves T3 Code's own build as it is", async () => {
    brand.studio = false;
    expect(await thrownBy(IssuesRoute.options.beforeLoad, {})).toBeNull();
    expect(await thrownBy(SettingsRoute.options.beforeLoad, at("/settings/snap-shot"))).toBeNull();
    expect(settingsNavGroups([{ to: "/settings/snap-shot" }], false).main).toHaveLength(1);
    expect(cloudWithKeys()).toBe(true);
    for (const route of [ConnectAgentRoute, GuestRoute]) {
      expect(await thrownBy(route.options.beforeLoad, {})).toBeNull();
    }
    expect(await thrownBy(PairRoute.options.beforeLoad, pairWith("hosted-pairing"))).toBeNull();
    for (const path of REMOTE_SECTIONS) {
      expect(await thrownBy(SettingsRoute.options.beforeLoad, at(path))).toBeNull();
      expect(settingsNavGroups([{ to: path }], false).main).toHaveLength(1);
    }
    expect(settingsRowHidden("linked-environments-beta", false)).toBe(false);
    expect(settingsRowHidden("cli-command", false)).toBe(false);
    expect(withoutT3ThreadLink(threadTarget)).toBe(threadTarget);
    expect(copyMenuIds()).toContain("copy-thread");
  });
});
