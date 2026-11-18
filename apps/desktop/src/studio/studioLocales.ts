import { appName } from "@t3tools/shared/appName";

/** A fork named with `VITE_APP_BASE_NAME` (Studio) ships English only, its first locale. */
export function brandLocales(locales: ReadonlyArray<string>): ReadonlyArray<string> {
  return appName() === "T3 Code" ? locales : locales.slice(0, 1);
}
