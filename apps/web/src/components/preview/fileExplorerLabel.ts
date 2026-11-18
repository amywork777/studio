import type { ExecutionEnvironmentPlatformOs, FileManagerRevealKind } from "@t3tools/contracts";
import { msg } from "gt-react";

import { m, type MessageResolver } from "~/i18n/messages";
import { isEngineeringInterface } from "../workbench/studioInterface";

// Studio says "Show in Finder", as its project menu and file pages do; T3 says "Reveal".

/** Components pass `useMessages()` so labels follow a language switch. */
export function revealInFileExplorerLabel(platform: string, resolve: MessageResolver = m): string {
  const normalized = platform.toLowerCase();
  const show = isEngineeringInterface();
  if (normalized.includes("mac"))
    return show ? resolve(msg("Show in Finder")) : resolve(msg("Reveal in Finder"));
  if (normalized.includes("win"))
    return show ? resolve(msg("Show in File Explorer")) : resolve(msg("Reveal in File Explorer"));
  return show ? resolve(msg("Show in Files")) : resolve(msg("Reveal in Files"));
}

export function revealInFileExplorerLabelForOs(
  os: ExecutionEnvironmentPlatformOs,
  resolve: MessageResolver = m,
): string {
  const show = isEngineeringInterface();
  if (os === "darwin")
    return show ? resolve(msg("Show in Finder")) : resolve(msg("Reveal in Finder"));
  if (os === "windows")
    return show ? resolve(msg("Show in File Explorer")) : resolve(msg("Reveal in File Explorer"));
  return show ? resolve(msg("Show in Files")) : resolve(msg("Reveal in Files"));
}

export function revealInFileExplorerLabelForKind(
  kind: FileManagerRevealKind,
  resolve: MessageResolver = m,
): string {
  const show = isEngineeringInterface();
  if (kind === "finder")
    return show ? resolve(msg("Show in Finder")) : resolve(msg("Reveal in Finder"));
  if (kind === "file-explorer")
    return show ? resolve(msg("Show in File Explorer")) : resolve(msg("Reveal in File Explorer"));
  return show ? resolve(msg("Show in Files")) : resolve(msg("Reveal in Files"));
}
