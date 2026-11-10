/**
 * A failed build's reason as one line. Studio's CAD service gives a build's last two lines run
 * together (`cad/edit/service.py`, `_last_said`), which for a script that raised are the line of
 * code it stopped on and then the error: `part.py: w = widht * 2 NameError: name 'widht' is not
 * defined`. The code line is a piece of a traceback, so only the error stays, after the script's
 * name: `part.py: NameError: name 'widht' is not defined`. A reason with no Python error in it
 * (the service's own words) is left as it is.
 */

/** The script's name as the service puts it before the reason. */
const SCRIPT = /^(\S+\.py): /;
/**
 * Where a Python error's last line starts: its type (dotted for one from a module), then a colon
 * or the end. The first one counts, so an error whose message names another keeps its message; the
 * code line before it writes a raised type with a bracket, never a colon.
 */
const ERROR =
  /(?:^|\s)((?:[A-Za-z_]\w*\.)*[A-Za-z_]\w*(?:Error|Exception|Warning|Exit|Interrupt)(?::\s|$))/;

export function buildErrorLine(reason: string): string {
  const lines = reason
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const last = lines.at(-1);
  if (last === undefined) return reason;
  const script = SCRIPT.exec(lines[0]!)?.[1];
  const prefix = script === undefined ? "" : `${script}: `;
  const said = lines.length === 1 ? last.slice(prefix.length) : last;
  const found = ERROR.exec(said);
  // More than one line and no error named: the last line is still the one that says why.
  if (found === null) return lines.length === 1 ? last : `${prefix}${said}`;
  return `${prefix}${said.slice(found.index + found[0].length - found[1]!.length)}`;
}
