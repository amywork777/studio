"""ISO 286-1 limits for a fit or a tolerance class at a nominal size, read off fits.json.

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
