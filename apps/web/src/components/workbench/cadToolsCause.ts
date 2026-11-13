/**
 * Why the CAD tools did not start, for the two causes a person can act on: the engine's port is
 * held (one per computer, `PortHeld` in `daemon.py`), or the tools missed the start limit
 * (`startup_timeout_sec`) and keep starting, so a later try finds them. Null for any other failure.
 */
export const CAD_TOOLS_IN_USE = "Another copy of Studio on this computer is using the CAD tools.";
export const CAD_TOOLS_STARTING = "The CAD tools are still starting. Try again in a moment.";

/** The engine's refusal of a port another process holds, as text-to-cad words it. */
const PORT_HELD = /\bport \d+ is held by\b/;
/** A start that ran past its limit: the MCP client's request-timeout code on the first request. */
const START_TIMED_OUT = /\bdid not start: MCP error -32001\b/;

export function cadToolsCause(message: string | null | undefined): string | null {
  if (!message) return null;
  if (PORT_HELD.test(message)) return CAD_TOOLS_IN_USE;
  if (START_TIMED_OUT.test(message)) return CAD_TOOLS_STARTING;
  return null;
}
