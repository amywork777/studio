/**
 * The `iso-fits` job skill's own instructions and files, after its hand-off (`jobSkillFiles`): the
 * method, and `fits.py` with the table it reads (`fits.json`, written from `isoFits.ts`), so the
 * agent reads a fit's limits off ISO 286 rather than recalling them.
 */

import { ISO_FIT_PRESETS, isoFitsTable } from "./isoFits";

export const ISO_FITS_GUIDE = `## Read the limits, never recall them

Every number comes from this skill's \`fits.py\`, run with the \`cad\` environment's Python (any
Python 3 runs it; it needs nothing installed). The script is in this skill's folder:

\`\`\`sh
python <this skill's folder>/fits.py H7/g6 20       # a fit at Ø20 mm: hole, shaft, clearances
python <this skill's folder>/fits.py p6 12          # one tolerance class
python <this skill's folder>/fits.py presets        # the preferred fits, by what each is for
\`\`\`

Add \`--json\` for the same as JSON. It holds ISO 286-1's tables for nominal sizes over 0 up to
500 mm: holes and shafts c, d, e, f, g, h, js, k, m, n, p, r, s, t and u, grades IT4 to IT13. A
class it does not hold (a J hole, an a shaft, IT14) it refuses: say so, never fill one in.

## Pick the fit

- What the person names wins ("H7/p6", "a press fit", "it should slide"). A word, not a class:
  take the preset \`fits.py presets\` lists for it, and say which in plain words first, the
  classes after ("a sliding fit (H7/g6)").
- Nothing said: read what the two faces do (a pin that turns, a bearing seat, a dowel) and pick,
  then ask, with the choice made: "I used a press fit (H7/p6) for the bearing seat: keep it, or
  make it a transition fit (H7/k6) so it comes out by hand?"
- ISO 286 is metric. On an inch part, ask whether to use it in millimetres or ANSI B4.1's classes,
  which this table does not hold: those are not checked.

## Write it into the part

- The nominal size stays a named size at the top of the script, and each fitted size is written
  beside it from the limits the script printed, as a comment that names the class and both limits:
  \`BORE = 20.0  # Ø20 H7 (ISO 286): 20.000 to 20.021\`. Model it at its nominal size unless the
  person asks for the middle of its limits, and say which.
- A fit between two parts goes in both: the hole's class in the part with the hole, the shaft's in
  the other, the same nominal size in each.
- A drawing of the part: put the class on the callout with the drawing's own \`fit=\`
  (\`view.hole(..., fit="H7")\`, \`view.dim(..., fit="g6")\`, \`"H7/g6"\` where both show), the
  engineering-drawing skill's way, never the limits typed as text. Where there is no drawing, say
  the fit is in the script and offer one.
- PMI on the model, where the part has it: \`dimensional_size(..., tolerance=limits(low, high))\`
  with the printed limits.

## Say what it means

Give the person the fit's kind (clearance, transition or interference), its tightest and loosest
in mm as \`fits.py\` printed them, and what that means for putting it together (slides by hand,
light press, heat the hub). Nothing here checks the parts' own geometry: to see they meet, run the
Fit and clearance check on the assembly.
`;

const FITS_PY = `"""ISO 286-1 limits for a fit or a tolerance class at a nominal size, read off fits.json.

    python fits.py H7/g6 20      a fit at 20 mm: both classes' limits and the clearances
    python fits.py g6 20         one class
    python fits.py presets       the preferred fits, by what each is for
    add --json to print JSON

Studio writes fits.json from its ISO 286-1 tables (apps/web/src/components/workbench/isoFits.ts).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

TABLE = json.loads((Path(__file__).resolve().parent / "fits.json").read_text(encoding="utf-8"))


def tolerance_class(name: str, size: float) -> dict:
    rows = TABLE["classes"].get(name)
    if rows is None:
        raise SystemExit(f"{name}: not in Studio's ISO 286 table ({TABLE['holds']}).")
    for over, up_to, upper, lower in rows:
        if over < size <= up_to:
            return {"class": name, "feature": "hole" if name[0].isupper() else "shaft",
                    "over": over, "up_to": up_to, "upper": upper, "lower": lower,
                    "max": round(size + upper, 4), "min": round(size + lower, 4)}
    raise SystemExit(f"{name}: ISO 286 gives no limits at {size:g} mm.")


def fit(name: str, size: float) -> dict:
    hole_name, _, shaft_name = name.partition("/")
    hole, shaft = tolerance_class(hole_name, size), tolerance_class(shaft_name, size)
    if hole["feature"] != "hole" or shaft["feature"] != "shaft":
        raise SystemExit(f"{name}: a fit is a hole's class (capitals) over a shaft's (H7/g6).")
    tightest = round(hole["lower"] - shaft["upper"], 4)
    loosest = round(hole["upper"] - shaft["lower"], 4)
    kind = "clearance" if tightest >= 0 else "interference" if loosest <= 0 else "transition"
    return {"fit": name, "size": size, "hole": hole, "shaft": shaft,
            "tightest": tightest, "loosest": loosest, "kind": kind}


def limits_line(c: dict) -> str:
    return (f"{c['class']:>4} {c['feature']:<5} {c['upper']:+.4f} / {c['lower']:+.4f} mm  "
            f"-> {c['min']:.4f} to {c['max']:.4f}  (over {c['over']:g} up to {c['up_to']:g} mm)")


def main(argv: list[str]) -> None:
    as_json = "--json" in argv
    args = [a for a in argv if a != "--json"]
    if args == ["presets"]:
        out = TABLE["presets"]
        if not as_json:
            for p in out:
                print(f"{p['fit']:<8} {p['name']}: {p['use']}")
            return
    elif len(args) == 2:
        name, size = args[0].replace(" ", ""), float(args[1])
        out = fit(name, size) if "/" in name else tolerance_class(name, size)
        if not as_json:
            if "/" in name:
                print(f"{out['fit']} at {size:g} mm: {out['kind']} fit")
                print(limits_line(out["hole"]))
                print(limits_line(out["shaft"]))
                print(f"clearance {out['tightest']:+.4f} (tightest) to {out['loosest']:+.4f} mm"
                      " (loosest); negative is interference")
            else:
                print(limits_line(out))
            return
    else:
        raise SystemExit(__doc__)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main(sys.argv[1:])
`;

/** The files the skill carries beside its SKILL.md. */
export function isoFitsSkillFiles(): Readonly<Record<string, string>> {
  const table = {
    source: "ISO 286-1:2010, Tables 1 to 3; mm deviations from the nominal size",
    holds: "holes and shafts c to u, grades IT4 to IT13, over 0 up to 500 mm",
    presets: ISO_FIT_PRESETS,
    classes: isoFitsTable(),
  };
  return { "fits.py": FITS_PY, "fits.json": `${JSON.stringify(table)}\n` };
}
