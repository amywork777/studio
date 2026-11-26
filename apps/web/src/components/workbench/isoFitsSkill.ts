/**
 * How the agent gives a hole or a shaft a fit from ISO 286, on a drawing's callout or as PMI: the `pmi` job
 * skill's own instructions after its hand-off (`jobSkillFiles`), with `fits.py` and the table it reads
 * (written into it from `isoFits.ts`), so every limit is read off the standard, never recalled.
 */

import { ISO_FIT_PRESETS, isoFitsTable } from "./isoFits";

export const ISO_FITS_GUIDE = `## Fits from ISO 286, on a drawing or as PMI

When the person asks for a fit or a tolerance class ("H7 on this bore", "H7/g6", "a press fit for the
pin"), on a drawing or as PMI, read its limits off ISO 286 with this skill's \`fits.py\`, never from
memory. It is in this skill's folder and runs with the \`cad\` environment's Python (any Python 3; it
needs nothing installed):

\`\`\`sh
python <this skill's folder>/fits.py H7 22          # one class at Ø22 mm: its limits
python <this skill's folder>/fits.py H7/g6 22       # a fit: hole, shaft, tightest and loosest
python <this skill's folder>/fits.py presets        # the preferred fits, by what each is for
\`\`\`

Add \`--json\` for JSON. It holds ISO 286-1's tables over 0 up to 500 mm: holes and shafts c, d, e, f,
g, h, js, k, m, n, p, r, s, t and u, grades IT4 to IT13. A class it does not hold (a J hole, an a shaft,
IT14) it refuses: say so, never fill one in.

- **The class.** What the person names wins. A word, not a class ("it should slide", "a press fit"):
  take the preset \`fits.py presets\` gives for it, and say it in plain words first, the classes after
  ("a sliding fit (H7/g6)"). Nothing said: pick from what the faces do, then ask with the choice made
  ("I used H7/p6 so the bearing presses in: keep it, or H7/k6 so it comes out by hand?").
- **A drawing.** Put the class on the callout with the drawing's own \`fit=\` (\`view.hole(..., fit="H7")\`,
  \`view.dim(..., fit="g6")\`, \`"H7/g6"\` where both parts show), as the engineering-drawing skill says,
  never the limits typed as text. Where the person wants limits printed instead, \`limits=(low, high)\`
  with the numbers \`fits.py\` printed.
- **PMI.** \`dimensional_size(..., tolerance=limits(low, high))\` with the printed limits, as
  references/pmi.md says.
- **The part.** The nominal size stays a named size in the script, with the class and both limits in its
  comment: \`BORE = 22.0  # Ø22 H7 (ISO 286): 22.000 to 22.021\`. A fit between two parts goes in both.
- **ISO 286 is metric.** On an inch part, ask whether to use it in millimetres or ANSI B4.1's classes,
  which this table does not hold: say those are not checked.
- **Say what it means:** the fit's kind (clearance, transition or interference) and its tightest and
  loosest in mm as \`fits.py\` printed them, and what that means for putting it together.
`;

const FITS_PY = `"""ISO 286-1 limits for a fit or a tolerance class at a nominal size, read off the table below.

    python fits.py H7/g6 20      a fit at 20 mm: both classes' limits and the clearances
    python fits.py g6 20         one class
    python fits.py presets       the preferred fits, by what each is for
    add --json to print JSON

Studio writes the table from its ISO 286-1 tables (apps/web/src/components/workbench/isoFits.ts).
"""

from __future__ import annotations

import json
import sys

TABLE = json.loads(r"""@@TABLE@@""")


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
  // In the script itself: a .py the formatter leaves as written, where a .json it would lay out anew.
  return { "fits.py": FITS_PY.replace("@@TABLE@@", JSON.stringify(table)) };
}
