/**
 * Why Studio's CAD tools did not start, for the two causes a person can do something about. The
 * server says each in its own words, which reach the viewer when a part will not open and the
 * plugin's row when its tools could not be listed (`PluginHost.connect`'s "did not start: ..."):
 *
 * - the engine's port is taken (`CAD_ENGINE_PORT`, one per computer: `studioEngine.ts`), which
 *   text-to-cad's engine refuses by name (`daemon.py`'s `PortHeld`). Another person signed in on
 *   this computer with Studio open holds it, or a copy of Studio that has not let go;
 * - the tools were not up inside the start limit (`studio-app-plugin.py`'s `startup_timeout_sec`).
 *   The engine goes on starting after the wait gives up, so a later try finds it.
 *
 * Null for every other failure, which keeps the words it had.
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
