/**
 * What T3 Code's desktop build changes when handed the Studio bundle (`T3CODE_DESKTOP_STUDIO_BUNDLE`):
 * the bundle is copied to the app's resources, which `apps/desktop/src/studio/studioAppBundle.ts`
 * reads on each start. Everything else is T3 Code's own build.
 */

/** Studio's own identity, apart from T3 Code's, so the two can be installed side by side. */
export const STUDIO_APP_ID = "com.amywork777.studio";
export const STUDIO_PRODUCT_NAME = "Studio";
/** The app's package name, the one its updater names its download folder by (`studioPackageJson`). */
export const STUDIO_PACKAGE_NAME = "text-to-cad-studio";
/** Whose app it is, for the copyright line in Finder's Get Info. */
export const STUDIO_OWNER = "Amy Zhou";
/** Studio's icon, from text-to-cad's brand kit (`brand/README.md`). */
export const STUDIO_MAC_ICON_PNG = "brand/app-icon.png";
/** The same icon at the sizes Windows draws it, 16 to 256 pixels: the brand kit's favicon. */
export const STUDIO_WIN_ICON_ICO = "brand/favicon.ico";
/** The bundle's folder, in the app's Resources and in the build's staged resources. */
export const STUDIO_RESOURCES_DIR = "studio";
/** What a signed Studio's programs may do under the hardened runtime, from the repository's root. */
export const STUDIO_ENTITLEMENTS = "scripts/studio-app.entitlements.plist";
/**
 * Where Studio finds its updates: the releases of the public repository that holds only the
 * download, where `latest-mac.yml` names the newest Mac zip and `latest.yml` the newest Windows
 * installer.
 */
export const STUDIO_UPDATE_FEED = Object.freeze({
  provider: "github",
  owner: "amywork777",
  repo: "studio-download",
  releaseType: "release",
});

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};

/**
 * T3 Code's staged package.json, renamed Studio. Electron names the app from it before any code
 * runs, macOS keys saved secrets by that name ("<name> Safe Storage") and electron-builder its
 * updater folder ("<name>-updater"), so as `t3code` Studio would open T3 Code's keychain item and
 * the two apps would empty each other's downloaded updates.
 */
export function studioPackageJson<T extends object>(
  packageJson: T,
): T & { readonly name: string; readonly productName: string } {
  return { ...packageJson, name: STUDIO_PACKAGE_NAME, productName: STUDIO_PRODUCT_NAME };
}

/**
 * T3 Code's electron-builder config, made Studio's: its name, id, copyright and artifact name, the
 * bundle as a resource, and on a Mac a plain DMG with none of T3 Code's link schemes or its claim
 * to be a web browser. Windows keeps T3 Code's installer under Studio's name.
 *
 * A signed Mac build (a Developer ID certificate, then notarized) updates itself: a zip beside the
 * DMG for the updater, Studio's own feed (`STUDIO_UPDATE_FEED`), and the hardened runtime
 * notarization needs, with the entitlements the app and the programs it carries run under
 * (`entitlementsPath`). An unsigned Mac build is signed ad hoc, since an Apple silicon Mac runs only
 * signed code, without the hardened runtime, and has no feed: macOS installs no update to an app
 * signed ad hoc, so a new version is a new download. Windows installs updates to an unsigned app
 * too, so every Windows build carries the feed.
 */
export function studioBuildConfig(
  config: Readonly<Record<string, unknown>>,
  input: {
    readonly platform: "mac" | "linux" | "win";
    readonly version: string;
    readonly signed: boolean;
    readonly entitlementsPath: string;
  },
): Record<string, unknown> {
  const next = record(config);
  if (input.signed || input.platform === "win") next.publish = [{ ...STUDIO_UPDATE_FEED }];
  else delete next.publish;
  next.appId = STUDIO_APP_ID;
  next.productName = STUDIO_PRODUCT_NAME;
  // Otherwise it is built from the package's author, T3 Tools.
  next.copyright = `Copyright © ${STUDIO_OWNER}`;
  next.artifactName = "Studio-${version}-${arch}.${ext}";
  next.extraResources = [
    ...(Array.isArray(next.extraResources) ? next.extraResources : []),
    { from: `apps/desktop/prod-resources/${STUDIO_RESOURCES_DIR}`, to: STUDIO_RESOURCES_DIR },
  ];
  // Out of app.asar, as T3 Code keeps its other staged resources: packed there as well, the app
  // carried the CAD tools' Python twice.
  next.files = [
    ...(Array.isArray(next.files) ? next.files : []),
    `!apps/desktop/prod-resources/${STUDIO_RESOURCES_DIR}`,
    `!apps/desktop/prod-resources/${STUDIO_RESOURCES_DIR}/**/*`,
  ];
  if (input.platform !== "mac") return next;
  const mac = record(next.mac);
  const extendInfo = record(mac.extendInfo);
  delete extendInfo.CFBundleDocumentTypes;
  next.mac = {
    ...mac,
    target: input.signed ? ["dmg", "zip"] : ["dmg"],
    category: "public.app-category.graphics-design",
    extendInfo: {
      ...extendInfo,
      NSLocalNetworkUsageDescription:
        "Studio talks to its own CAD tools and AI agents on this Mac.",
      NSScreenCaptureUsageDescription:
        "Studio captures the active window when you use the window capture shortcut.",
    },
    protocols: [],
    ...(input.signed
      ? {
          hardenedRuntime: true,
          entitlements: input.entitlementsPath,
          entitlementsInherit: input.entitlementsPath,
        }
      : { identity: "-", hardenedRuntime: false }),
  };
  if (next.dmg !== undefined) {
    const dmg = record(next.dmg);
    delete dmg.background;
    next.dmg = { ...dmg, title: `Studio ${input.version}` };
  }
  return next;
}
