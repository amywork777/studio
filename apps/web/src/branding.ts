import type { DesktopAppBranding } from "@t3tools/contracts";
import {
  formatAppDisplayName,
  resolveHostedAppChannelLabel,
  resolveWebAppStageLabel,
} from "./branding.logic";

function readInjectedDesktopAppBranding(): DesktopAppBranding | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.desktopBridge?.getAppBranding() ?? null;
}

const injectedDesktopAppBranding = readInjectedDesktopAppBranding();
const hostedAppChannel = import.meta.env.VITE_HOSTED_APP_CHANNEL?.trim().toLowerCase();

export const HOSTED_APP_CHANNEL =
  hostedAppChannel === "latest" || hostedAppChannel === "nightly" ? hostedAppChannel : null;
export const HOSTED_APP_CHANNEL_LABEL = resolveHostedAppChannelLabel(HOSTED_APP_CHANNEL);
export const APP_BASE_NAME =
  injectedDesktopAppBranding?.baseName ?? (import.meta.env.VITE_APP_BASE_NAME || "T3 Code");
export const APP_STAGE_LABEL =
  injectedDesktopAppBranding?.stageLabel ??
  resolveWebAppStageLabel({
    hostedAppChannel: HOSTED_APP_CHANNEL,
    development: import.meta.env.DEV,
  });
export const APP_DISPLAY_NAME =
  injectedDesktopAppBranding?.displayName ??
  formatAppDisplayName({ baseName: APP_BASE_NAME, stageLabel: APP_STAGE_LABEL });
export const APP_VERSION = import.meta.env.APP_VERSION || "0.0.0";
/** A fork's mark in place of the T3 wordmark (`apps/web/vite/brand.ts`); null for T3 Code. */
export const APP_MARK_URL = import.meta.env.VITE_APP_MARK_URL || null;
/** The words beside the wordmark: "Code" after T3's, a fork's whole name after its mark. */
export const APP_WORDMARK_SUFFIX = APP_MARK_URL === null ? "Code" : APP_BASE_NAME;
export const DESKTOP_DOWNLOAD_URL = "https://texttocad.studio";
// Redirects to the App Store or Google Play to match the phone that opens it.
export const MOBILE_APP_URL = "https://t3.codes/mobile";
