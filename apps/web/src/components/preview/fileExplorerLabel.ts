import type { ExecutionEnvironmentPlatformOs, FileManagerRevealKind } from "@t3tools/contracts";

import { isEngineeringInterface } from "../workbench/studioInterface";

/** Studio says "Show in Finder", as its project menu and file pages do; T3 says "Reveal". */
const verb = () => (isEngineeringInterface() ? "Show" : "Reveal");

export function revealInFileExplorerLabel(platform: string): string {
  const normalized = platform.toLowerCase();
  if (normalized.includes("mac")) return `${verb()} in Finder`;
  if (normalized.includes("win")) return `${verb()} in File Explorer`;
  return `${verb()} in Files`;
}

export function revealInFileExplorerLabelForOs(os: ExecutionEnvironmentPlatformOs): string {
  if (os === "darwin") return `${verb()} in Finder`;
  if (os === "windows") return `${verb()} in File Explorer`;
  return `${verb()} in Files`;
}

export function revealInFileExplorerLabelForKind(kind: FileManagerRevealKind): string {
  if (kind === "finder") return `${verb()} in Finder`;
  if (kind === "file-explorer") return `${verb()} in File Explorer`;
  return `${verb()} in Files`;
}
