/**
 * Usage counts for CAD view actions: `cad_http` routes that change or open something, named by a
 * fixed event and nothing of the request. Reads, the build-state long poll and pending answers (202)
 * are not counted; a refused or failed one counts as `cad.action.failed` with its action.
 */
import { isRecord } from "@t3tools/plugins";

import { HTTP_TOOL } from "./appCapability.ts";

/** Each counted route and the event it records. */
export const CAD_USAGE_EVENTS: Readonly<Record<string, string>> = {
  "/api/v1/documents": "cad.model.opened",
  "/api/v1/local/edit/change": "cad.hand_edit",
  "/api/v1/local/sizes/set": "cad.size.changed",
  "/api/v1/local/sizes/add": "cad.size.added",
  "/api/v1/local/versions/compare": "cad.versions.compared",
  "/api/v1/local/versions/restore": "cad.version.restored",
};

/** A counted CAD action the CAD server refused or failed, by the event it would have been. */
export const CAD_ACTION_FAILED = "cad.action.failed";

export interface CadUsage {
  readonly event: string;
  readonly properties?: { readonly action: string };
}

/** What a plugin request and its result count as, or null for one that is not counted. */
export function cadUsageEvent(method: string, params: unknown, result: unknown): CadUsage | null {
  if (method !== "tools/call" || !isRecord(params) || params.name !== HTTP_TOOL) return null;
  const args = isRecord(params.arguments) ? params.arguments : {};
  if (args.method !== "POST" || typeof args.url !== "string") return null;
  const path = args.url.replace(/^[a-z]+:\/\/[^/]+/i, "").split(/[?#]/)[0];
  const action = CAD_USAGE_EVENTS[path ?? ""];
  if (action === undefined) return null;
  const reply = isRecord(result) ? result.structuredContent : null;
  const status = isRecord(reply) && typeof reply.status === "number" ? reply.status : null;
  if (status === 200 || status === 201) return { event: action };
  if (status !== null && status >= 400) return { event: CAD_ACTION_FAILED, properties: { action } };
  return null;
}
