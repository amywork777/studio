// The desktop's part of hiding T3 Code's own products in Studio (the web's is
// `apps/web/src/components/workbench/hiddenT3Features.ts`): each T3 file calls one of these once.
import type { ClientSettings } from "@t3tools/contracts";
import { appName } from "@t3tools/shared/appName";

/** A fork named with `VITE_APP_BASE_NAME` (Studio) hides T3's products; T3 Code itself keeps them. */
function hidesT3Products(): boolean {
  return appName() !== "T3 Code";
}

/** SnapShots stays off whatever was saved: no capture shortcut, no capture helpers. */
export function withoutT3SnapShot(settings: ClientSettings): ClientSettings {
  return hidesT3Products() && settings.snapShotEnabled
    ? { ...settings, snapShotEnabled: false }
    : settings;
}

/** Where a person gets another version: Studio's downloads, not T3 Code's releases. */
export function releasesUrl(t3ReleasesUrl: string): string {
  return hidesT3Products() ? "https://github.com/amywork777/studio-download/releases" : t3ReleasesUrl;
}
