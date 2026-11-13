/**
 * text-to-cad's app capability (page protocol 9): `cad_http` reaches the viewer's routes only with
 * the capability tool results carry in UI-only `_meta`. Studio's UI asks those routes with no view
 * open, using the capability from a launch that scope's server answered. Agents' calls
 * (`callAgentTool`) never carry it.
 */
import { isRecord } from "@t3tools/plugins";

/** Where a tool result carries the capability: `_meta`, which a host never shows the model. */
export const CAPABILITY_META = "dev.texttocad/httpToken";
/** The header a `cad_http` call carries it in. */
export const CAPABILITY_HEADER = "x-cad-app";
/** The route tool the capability is for. */
export const HTTP_TOOL = "cad_http";
/** The app-only tool whose launch delivers one with nothing shown: the CAD home's. */
export const LAUNCH_TOOL = "cad_home";

/** The capability a tool result delivers, or null. */
export function readCapability(result: unknown): string | null {
  const meta = isRecord(result) ? result._meta : undefined;
  const token = isRecord(meta) ? meta[CAPABILITY_META] : undefined;
  return typeof token === "string" && token !== "" ? token : null;
}

/** Whether a request is a `cad_http` call that carries no capability of its own. */
export function wantsCapability(method: string, params: unknown): boolean {
  if (method !== "tools/call" || !isRecord(params) || params.name !== HTTP_TOOL) return false;
  const args = isRecord(params.arguments) ? params.arguments : {};
  const headers = isRecord(args.headers) ? args.headers : {};
  return !Object.keys(headers).some((name) => name.toLowerCase() === CAPABILITY_HEADER);
}

/** The `cad_http` call's params, carrying `token`. */
export function withCapability(params: Record<string, unknown>, token: string) {
  const args = isRecord(params.arguments) ? params.arguments : {};
  const headers = isRecord(args.headers) ? args.headers : {};
  return { ...params, arguments: { ...args, headers: { ...headers, [CAPABILITY_HEADER]: token } } };
}

/** Whether a tool call answered with an error (`isError`). */
export function isErrorResult(result: unknown): boolean {
  return isRecord(result) && result.isError === true;
}

/** A tool result without the capability in its `_meta`, as an agent is given it. */
export function withoutCapability(result: unknown): unknown {
  if (!isRecord(result) || !isRecord(result._meta) || !(CAPABILITY_META in result._meta)) {
    return result;
  }
  const { [CAPABILITY_META]: _capability, ...meta } = result._meta;
  return { ...result, _meta: meta };
}
