import { describe, expect, it } from "vite-plus/test";

import {
  STUDIO_APP_ID,
  STUDIO_UPDATE_FEED,
  studioBuildConfig,
  studioPackageJson,
} from "./studio-app.ts";

const t3Config = {
  appId: "com.t3tools.t3code",
  productName: "T3 Code (Alpha)",
  artifactName: "T3-Code-${version}-${arch}.${ext}",
  extraResources: [
    { from: "apps/desktop/prod-resources/resource-monitor", to: "resource-monitor" },
  ],
  publish: [{ provider: "github" }],
  mac: {
    target: ["dmg", "zip"],
    icon: "icon.icns",
    extendInfo: {
      NSLocalNetworkUsageDescription: "T3 Code connects to devices on your local network.",
      CFBundleDocumentTypes: [{ CFBundleTypeName: "Web page" }],
    },
    protocols: [{ name: "T3 Code", schemes: ["t3code", "t3code-dev"] }],
  },
  dmg: { title: "T3 Code 0.0.45 Installer", background: "dmg/dmg-background-latest.png" },
};

/** T3 Code's config for a Windows build: no Mac settings, its installer and Windows's own. */
const t3WinConfig = {
  appId: "com.t3tools.t3code",
  productName: "T3 Code (Alpha)",
  artifactName: "T3-Code-${version}-${arch}.${ext}",
  extraResources: [
    { from: "apps/desktop/prod-resources/resource-monitor", to: "resource-monitor" },
  ],
  publish: [{ provider: "github" }],
  npmRebuild: false,
  nsis: { differentialPackage: true },
  win: {
    target: ["nsis"],
    icon: "icon.ico",
    signExts: [".node", ".dll"],
    signAndEditExecutable: true,
  },
};

const entitlementsPath = "/repo/scripts/studio-app.entitlements.plist";
const unsigned = { platform: "mac", version: "0.1.0", signed: false, entitlementsPath } as const;
const signed = { platform: "mac", version: "0.1.2", signed: true, entitlementsPath } as const;

describe("studioBuildConfig", () => {
  it("names and identifies the app as Studio, apart from T3 Code", () => {
    const config = studioBuildConfig(t3Config, unsigned);
    expect(config.appId).toBe(STUDIO_APP_ID);
    expect(config.productName).toBe("Studio");
    expect(config.artifactName).toBe("Studio-${version}-${arch}.${ext}");
    expect(config.dmg).toEqual({ title: "Studio 0.1.0" });
    expect(config.copyright).toBe("Copyright © Amy Zhou");
    expect(JSON.stringify(config)).not.toContain("T3 Code");
  });

  it("carries the bundle as a resource, beside T3 Code's own", () => {
    const config = studioBuildConfig(t3Config, unsigned);
    expect(config.extraResources).toEqual([
      { from: "apps/desktop/prod-resources/resource-monitor", to: "resource-monitor" },
      { from: "apps/desktop/prod-resources/studio", to: "studio" },
    ]);
  });

  it("is a plain DMG with no update feed, no link schemes and no web-browser claim", () => {
    const config = studioBuildConfig(t3Config, unsigned);
    const mac = config.mac as Record<string, unknown>;
    expect(config.publish).toBeUndefined();
    expect(mac.target).toEqual(["dmg"]);
    expect(mac.protocols).toEqual([]);
    expect(mac.extendInfo).not.toHaveProperty("CFBundleDocumentTypes");
    expect(mac.icon).toBe("icon.icns");
  });

  it("signs ad hoc without the hardened runtime unless signing was asked for", () => {
    const adHoc = studioBuildConfig(t3Config, unsigned);
    expect(adHoc.mac).toMatchObject({ identity: "-", hardenedRuntime: false });
    const built = studioBuildConfig(t3Config, signed);
    expect(built.mac).not.toHaveProperty("identity");
    expect(built.mac).toMatchObject({ hardenedRuntime: true });
  });

  it("updates itself when signed: the download repository's feed, a zip for the updater, its entitlements", () => {
    const built = studioBuildConfig(t3Config, signed);
    expect(built.publish).toEqual([STUDIO_UPDATE_FEED]);
    expect(STUDIO_UPDATE_FEED).toMatchObject({
      provider: "github",
      owner: "amywork777",
      repo: "studio-download",
    });
    expect(built.mac).toMatchObject({
      target: ["dmg", "zip"],
      entitlements: entitlementsPath,
      entitlementsInherit: entitlementsPath,
    });
    expect(built.dmg).toEqual({ title: "Studio 0.1.2" });
  });

  it("updates itself on Windows unsigned, with T3 Code's installer under Studio's name", () => {
    const built = studioBuildConfig(t3WinConfig, { ...unsigned, platform: "win" });
    expect(built.publish).toEqual([STUDIO_UPDATE_FEED]);
    expect(built.productName).toBe("Studio");
    expect(built.artifactName).toBe("Studio-${version}-${arch}.${ext}");
    expect(built.win).toEqual(t3WinConfig.win);
    expect(built.nsis).toEqual({ differentialPackage: true });
    expect(built).not.toHaveProperty("mac");
    expect(built.extraResources).toContainEqual({
      from: "apps/desktop/prod-resources/studio",
      to: "studio",
    });
    expect(JSON.stringify(built)).not.toContain("T3 Code");
  });

  it("leaves T3 Code's config as it was", () => {
    const before = JSON.stringify(t3Config);
    studioBuildConfig(t3Config, unsigned);
    expect(JSON.stringify(t3Config)).toBe(before);
  });
});

describe("studioPackageJson", () => {
  // Electron starts the app under its product name, and its keychain item takes it; the updater's
  // download folder takes the package's name.
  it("names the app Studio, apart from T3 Code's keychain item and update downloads", () => {
    const t3 = { name: "t3code", version: "0.1.1", main: "apps/desktop/dist-electron/boot.cjs" };
    expect(studioPackageJson(t3)).toEqual({
      ...t3,
      name: "text-to-cad-studio",
      productName: "Studio",
    });
  });
});
