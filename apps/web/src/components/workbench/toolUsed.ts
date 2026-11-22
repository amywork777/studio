import { TOOLBOX_ACTIONS, type HardwareAction } from "./hardwareActions";

/** The line, on its own or after a draft, which the composer joins to a job with a space. */
const TOOL_LINE = /(?:^|\s+)Tool: ([^\n]+)\n+/g;

/**
 * A job a tool started, opening on the line that names the tool. The chat draws that line as a chip
 * (`toolUsed`); the agent reads it, and a client that doesn't know it shows it as it stands.
 */
export function withToolLine(tool: string, prompt: string): string {
  return `Tool: ${tool}\n\n${prompt}`;
}

/**
 * The tools a message came from, and the message without their lines; null for one typed by hand.
 * The lines are read wherever they sit, since a press lands after the person's draft, and only a
 * real tool's name counts, so a sentence that happens to say "Tool:" stays a sentence.
 */
export function toolUsed(text: string): {
  readonly tools: ReadonlyArray<HardwareAction>;
  /** What the person wrote before the first press, if anything. */
  readonly words: string;
  readonly message: string;
} | null {
  const tools: HardwareAction[] = [];
  let words = "";
  const message = text.replace(TOOL_LINE, (line, name: string, at: number) => {
    const tool = TOOLBOX_ACTIONS.find((action) => action.label === name);
    if (tool === undefined) return line;
    if (tools.length === 0) words = text.slice(0, at).trim();
    if (!tools.includes(tool)) tools.push(tool);
    return "\n\n";
  });
  return tools.length === 0 ? null : { tools, words, message: message.trim() };
}

/** What a chat a tool opened is titled from: the person's words, else the tool. */
export function chatTitleText(text: string): string {
  const used = toolUsed(text);
  if (used === null) return text;
  return used.words === "" ? used.tools[0]!.label : used.words;
}
