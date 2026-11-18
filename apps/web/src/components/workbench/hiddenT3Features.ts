import { STUDIO_INTERFACE_AVAILABLE } from "./studioInterface";

/**
 * T3 Code's own products and services, which a Studio user never sees in any interface. Each T3
 * file that offers one asks here in one line (a route guard, a list filter, a gate it already has),
 * and T3's code for it stays. Without Studio's brand (`STUDIO_INTERFACE_AVAILABLE`) T3 shows them all.
 */
export type T3Feature =
  /** The Issues page and the issue panel beside a chat. */
  | "issues"
  /** T3 Connect: its relay and tunnels, T3 Chat, the phone app, guest links (`hasCloudPublicConfig`). */
  | "connect"
  /** SnapShots window capture, with its GNOME extension and capture helpers. */
  | "snapShot"
  /** "Enjoying T3 Code?": a star for T3's GitHub repository. */
  | "starPrompt"
  /** Links to a prompt on T3's hosted app, app.t3.codes. */
  | "promptLinks"
  /** Triage, where an agent files an issue on T3's repository; Studio's is Report a problem. */
  | "triage"
  /** T3's own docs and FAQ. */
  | "docs";

/** Every one of them: Studio offers none of T3's own products. */
const HIDDEN_T3_FEATURES: ReadonlySet<T3Feature> = new Set<T3Feature>([
  "issues",
  "connect",
  "snapShot",
  "starPrompt",
  "promptLinks",
  "triage",
  "docs",
]);

export function t3FeatureHidden(feature: T3Feature): boolean {
  return STUDIO_INTERFACE_AVAILABLE && HIDDEN_T3_FEATURES.has(feature);
}

/** Settings pages that are a hidden feature's: left out of the sidebar and search, and redirected. */
const T3_SETTINGS_SECTIONS: ReadonlyMap<string, T3Feature> = new Map([
  ["/settings/snap-shot", "snapShot"],
]);

export function t3SettingsSectionHidden(path: string): boolean {
  const feature = T3_SETTINGS_SECTIONS.get(path);
  return feature !== undefined && t3FeatureHidden(feature);
}

/**
 * T3 products that only hidden features name: what Studio's copy may still say after
 * `brandCopy`, since nothing shows it (`brandCopy.test.ts`).
 */
export const HIDDEN_T3_PRODUCT_NAMES: ReadonlyArray<string> = ["T3 Connect", "T3 Chat"];
