// Shared client code imports "gt-i18n"; Studio's build resolves that to this module
// (`apps/web/vite/brand.ts`). gt-react re-exports the same gt-i18n functions.
export {
  declareVar,
  decodeMsg,
  decodeOptions,
  decodeVars,
  derive,
  getDefaultLocale,
  getLocaleProperties,
  getLocales,
  getVersionId,
  msg,
  resolveCanonicalLocale,
} from "gt-react";
export { gtFallback, mFallback } from "./studioGtReact";
