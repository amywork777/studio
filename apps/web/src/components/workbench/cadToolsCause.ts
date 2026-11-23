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

/**
 * A view that did not open, as a failure card says it: what was not done ("Not opened: Base"),
 * why in plain words, and the one thing to do. A cause a person can act on is said and retried;
 * any other is the CAD tools' own, so the agent is asked to fix it with the reason as it came.
 */
export function viewFailure(
  message: string,
  name: string,
): { readonly headline: string; readonly why: string; readonly action: "retry" | "ask" } {
  const headline = `Not opened: ${name}`;
  if (/outside the thread's workspace/i.test(message)) {
    return {
      headline,
      why: "The model view only opens files in this chat's folder.",
      action: "retry",
    };
  }
  const cause = cadToolsCause(message);
  if (cause !== null) return { headline, why: cause, action: "retry" };
  return { headline, why: "The CAD tools couldn't read it.", action: "ask" };
}

/** What the agent is asked when a view did not open: the file, and the reason as it came. */
export function viewFailureRequest(name: string, message: string): string {
  return `The model view couldn't open ${name}. Find out why and fix it. The error was:\n${message.trim()}`;
}
