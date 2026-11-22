# A worked T-shirt

Read this when drafting a garment. It is a whole design script for a knit T-shirt (back, front,
sleeve, neckband) and the pattern for writing another garment. Save the block at the end as `tee.py`
beside `pattern_kit.py` ([the kit](pattern-kit.md)) and run `cad run tee.py`.

## Contents

- [How the script is laid out](#how-the-script-is-laid-out)
- [Sizes and made-to-measure](#sizes-and-made-to-measure)
- [What its checks are](#what-its-checks-are)
- [Writing another garment](#writing-another-garment)
- [tee.py](#teepy)

## How the script is laid out

1. **The size table**, in centimetres, one row per size.
2. **The style**, in millimetres: ease, seam allowances, the neckband's ratio, where the notches sit.
3. **`draft(body)`**, which turns one row into pieces, checks and the finished measurements.
4. **`__main__`**, which drafts every row, writes the files and exits 1 when a check failed.

The origin is the high shoulder line at the centre: x runs out to the side seam, y down to the hem.
Back and front are half pieces cut on the centre fold.

## Sizes and made-to-measure

Each size is drafted from its own row, so a size is right for its own measurements. Sizes are not
scaled copies of one another.

- **A brand's sizes**: replace `SIZES` with the brand's size chart. The rows in the example are
  illustrative; they are no standard.
- **One person**: one row with their measurements, named for them (`"ANA": dict(chest=101, ...)`).
- **A measurement the table lacks** (a hip, a waist) is added to every row and read in `draft`.

Ask for a measurement you do not have. Do not estimate one from another and present it as measured.

## What its checks are

| Check                   | Passes when                                                                     |
| ----------------------- | ------------------------------------------------------------------------------- |
| sleeve cap to armhole   | The cap is the back and front armholes together, plus `CAP_EASE`, within 0.5 mm |
| shoulder, back to front | The two shoulder seams are the same length                                      |
| side, back to front     | The two side seams are the same length                                          |
| underarm, front to back | The sleeve's two underarm seams are the same length                             |
| neckband on neckline    | The band is 80% to 92% of the neckline, so a rib lies flat without gaping       |
| neckline over the head  | The neckline, stretched by `STRETCH`, is at least `HEAD`                        |

`STRETCH` and `HEAD` are inputs. Measure the fabric's stretch on the fabric (mark 100 mm, pull, read
the ruler) and take the head from the person or the brand. With the example's 580 mm head, a fabric
that stretches 35% fails sizes XS and S: that is the check doing its work.

## Writing another garment

Keep the layout and replace the body of `draft`:

1. Convert the row to millimetres and work out the block's key widths and levels.
2. Build each piece as a loop of edges on the sew line, with its grainline, quantity and note.
3. Put every pair of seams that sew together into `seam_checks`, with its ease.
4. Add the notches, walked from the same corner on both pieces of each seam.
5. Return the pieces, the checks and the finished measurements a factory would measure.

A garment that needs a dart, a pleat or gathers is beyond the kit as it stands: say so.

## tee.py

<!-- file: tee.py -->

```python
# /// script
# dependencies = ["ezdxf", "shapely"]
# ///
"""A knit T-shirt drafted from body measurements, graded by drafting each size from its own row.

Run: cad run tee.py     (writes out/tee_<size>.svg, out/tee_aama.dxf, out/tee_spec.csv, out/tee_checks.json)
"""
import csv
import json
import pathlib
import sys

from pattern_kit import Edge, Piece, bezier, length, seam_checks, write_aama, write_svg

# Body measurements in cm, as a tape reads them. chest, neck and bicep are full circumferences;
# shoulder is point to point across the back; length is high shoulder point to hem; armhole_depth
# is high shoulder point down to the underarm line; sleeve is shoulder point to sleeve hem.
# ILLUSTRATIVE rows: replace them with the brand's size chart or the person's own measurements.
SIZES = {
    "XS": dict(chest=84, neck=35.0, shoulder=40, length=66, armhole_depth=20, shoulder_drop=4.0, sleeve=19, bicep=26.0),
    "S": dict(chest=90, neck=36.5, shoulder=42, length=68, armhole_depth=21, shoulder_drop=4.0, sleeve=20, bicep=28.0),
    "M": dict(chest=96, neck=38.0, shoulder=44, length=70, armhole_depth=22, shoulder_drop=4.2, sleeve=21, bicep=30.0),
    "L": dict(chest=104, neck=40.0, shoulder=46, length=72, armhole_depth=23, shoulder_drop=4.4, sleeve=22, bicep=32.5),
    "XL": dict(chest=112, neck=42.0, shoulder=48, length=74, armhole_depth=24, shoulder_drop=4.6, sleeve=23, bicep=35.0),
}

# The style, in mm. Ease is a design choice, not a measurement: say what was chosen.
CHEST_EASE = 100      # whole garment, over the body's chest
BICEP_EASE = 60
CAP_EASE = 10         # the sleeve cap is this much longer than the armhole (a knit takes little)
SEAM, HEM, NECK_SEAM = 10, 25, 6
NECK_EASE = 20        # the neckline sits this far out from the base of the neck, each side
HEAD = 580            # head circumference the neckline must pass. ILLUSTRATIVE: measure, or the brand's
STRETCH = 0.50        # how far the neckline's fabric stretches, measured on the fabric itself (50%)
BAND_RATIO = 0.85     # neckband length over neckline length: a rib stretches on
BAND_WIDTH = 20       # finished
FRONT_NOTCH, BACK_NOTCH = 65, 75   # walked from the underarm

# What the factory may be off by on each finished measurement, in cm. ILLUSTRATIVE: the brand's own.
TOLERANCE = {"chest width": 1.0, "body length": 1.0, "across shoulder": 0.5, "sleeve length": 0.5,
             "sleeve opening": 0.5, "neck width": 0.5, "front neck drop": 0.5, "back neck drop": 0.3}


def draft(body: dict[str, float]) -> tuple[list[Piece], list[dict], dict[str, float]]:
    m = {k: v * 10 for k, v in body.items()}                    # cm to mm
    w = (m["chest"] + CHEST_EASE) / 4                           # quarter chest
    nw = m["neck"] / 6 + NECK_EASE                              # neck width from centre
    sx, sy = m["shoulder"] / 2, -m["shoulder_drop"]             # shoulder point; origin is the high shoulder line
    arm, hem = -m["armhole_depth"], -m["length"]

    def bodice(name: str, neck_depth: float, scoop: float) -> Piece:
        return Piece(name, [
            Edge("neckline", bezier((0, -neck_depth), (nw * 0.75, -neck_depth), (nw, -neck_depth * 0.35), (nw, 0)), NECK_SEAM),
            Edge("shoulder", [(nw, 0), (sx, sy)], SEAM),
            Edge("armhole", bezier((sx, sy), (sx - scoop, sy + (arm - sy) * 0.55), (sx + 0.15 * (w - sx), arm), (w, arm)), SEAM),
            Edge("side", [(w, arm), (w, hem)], SEAM),
            Edge("hem", [(w, hem), (0, hem)], HEM, kind="hem"),
            Edge("centre", [(0, hem), (0, -neck_depth)], 0, kind="fold"),
        ], grain=((w * 0.45, arm - 40), (w * 0.45, hem + 80)), note="on fold")

    back = bodice("BACK", 20, 6)
    front = bodice("FRONT", m["neck"] / 6 + 20, 16)
    back_arm, front_arm = back.edge("armhole").pts, front.edge("armhole").pts
    front.notch("armhole", FRONT_NOTCH, from_end=True)          # one notch: front
    for d in (BACK_NOTCH, BACK_NOTCH + 6):                      # two: back
        back.notch("armhole", d, from_end=True)

    # The sleeve: the bicep is fixed, and the cap height is solved so the cap walks the armhole plus ease.
    bw = (m["bicep"] + BICEP_EASE) / 2
    target = length(back_arm) + length(front_arm) + CAP_EASE

    def cap(height: float) -> list[list[tuple[float, float]]]:
        return [bezier((-bw, 0), (-0.70 * bw, 0.10 * height), (-0.45 * bw, height), (0, height)),
                bezier((0, height), (0.40 * bw, height), (0.60 * bw, 0.10 * height), (bw, 0))]

    low, high = 5.0, 300.0
    for _ in range(60):
        height = (low + high) / 2
        low, high = (height, high) if sum(map(length, cap(height))) < target else (low, height)
    back_cap, front_cap = cap(height)
    cuff, hw = height - m["sleeve"], bw * 0.86
    sleeve = Piece("SLEEVE", [
        Edge("cap", back_cap + front_cap[1:], SEAM),
        Edge("front_underarm", [(bw, 0), (hw, cuff)], SEAM),
        Edge("hem", [(hw, cuff), (-hw, cuff)], HEM, kind="hem"),
        Edge("back_underarm", [(-hw, cuff), (-bw, 0)], SEAM),
    ], grain=((0, height - 30), (0, cuff + 40)), quantity=2, note="a mirrored pair")
    for d in (BACK_NOTCH, BACK_NOTCH + 6):
        sleeve.notch("cap", d)
    sleeve.notch("cap", FRONT_NOTCH, from_end=True)
    sleeve.notch("cap", length(back_arm) + CAP_EASE / 2)        # meets the shoulder seam

    neckline = 2 * (length(back.edge("neckline").pts) + length(front.edge("neckline").pts))
    band, bh = neckline * BAND_RATIO, 2 * BAND_WIDTH
    neckband = Piece("NECKBAND", [
        Edge("end_a", [(0, 0), (0, bh)], SEAM),
        Edge("long_a", [(0, bh), (band, bh)], NECK_SEAM),
        Edge("end_b", [(band, bh), (band, 0)], SEAM),
        Edge("long_b", [(band, 0), (0, 0)], NECK_SEAM),
    ], grain=((band * 0.3, bh / 2), (band * 0.7, bh / 2)), note="rib, stretch along the length")
    neckband.notch("long_b", band / 2)                          # centre front

    def run(piece: Piece, edge: str) -> float:
        return length(piece.edge(edge).pts)

    checks = seam_checks([
        ("sleeve cap to armhole", run(sleeve, "cap"), length(back_arm) + length(front_arm), CAP_EASE),
        ("shoulder, back to front", run(back, "shoulder"), run(front, "shoulder"), 0),
        ("side, back to front", run(back, "side"), run(front, "side"), 0),
        ("underarm, front to back", run(sleeve, "front_underarm"), run(sleeve, "back_underarm"), 0),
    ])
    checks.append({"seam": "neckband on neckline", "a": round(band, 1), "b": round(neckline, 1),
                   "ease": None, "off": round(band / neckline, 3), "ok": 0.80 <= band / neckline <= 0.92})
    # The finished garment laid flat, in cm, read off the sew lines: the size spec a factory measures against.
    spec = {"chest width": 2 * w, "body length": m["length"], "across shoulder": m["shoulder"],
            "sleeve length": m["sleeve"], "sleeve opening": 2 * hw, "neck width": 2 * nw,
            "front neck drop": m["neck"] / 6 + 20, "back neck drop": 20}
    checks.append({"seam": "neckline over the head", "a": round(neckline * (1 + STRETCH), 1), "b": HEAD,
                   "ease": None, "off": round(neckline * (1 + STRETCH) - HEAD, 1), "ok": neckline * (1 + STRETCH) >= HEAD})
    return [back, front, sleeve, neckband], checks, {k: round(v / 10, 1) for k, v in spec.items()}


if __name__ == "__main__":
    out = pathlib.Path("out")
    out.mkdir(exist_ok=True)
    sized, report, specs = {}, {}, {}
    for size, body in SIZES.items():
        pieces, checks, specs[size] = draft(body)
        sized[size], report[size] = pieces, checks
        write_svg(pieces, str(out / f"tee_{size}.svg"), f"T-shirt, size {size}")
        cap = checks[0]
        print(f"{size:>3}: finished chest {(body['chest'] * 10 + CHEST_EASE) / 10:.0f} cm, armhole {cap['b']:.0f} mm, "
              f"cap {cap['a']:.0f} mm, " + ("checks pass" if all(c["ok"] for c in checks) else "CHECKS FAILED"))
    write_aama(sized, str(out / "tee_aama.dxf"), style="TEE")
    with open(out / "tee_spec.csv", "w", newline="", encoding="utf-8") as handle:
        table = csv.writer(handle)
        table.writerow(["measurement (cm, garment flat)", "tolerance +/-", *sized])
        for name, tolerance in TOLERANCE.items():
            table.writerow([name, tolerance, *[specs[size][name] for size in sized]])
    (out / "tee_checks.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    failed = [(size, c["seam"]) for size, checks in report.items() for c in checks if not c["ok"]]
    for size, seam in failed:
        print(f"FAILED {size}: {seam}")
    sys.exit(1 if failed else 0)
```
