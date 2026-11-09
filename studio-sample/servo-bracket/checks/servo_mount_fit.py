"""Fit and clearance of the servo mount: every pair of its parts checked for overlap and gap, the fits a touching
joint hides measured on their own, and the horn adapter turned through its travel. Calls the mount's model, so it
checks the mount as it is now, writes its findings to assemblies/servo_mount_fit.md beside it, prints them as one JSON
line, and exits 1 when a part collides. Run it from anywhere: cad run checks/servo_mount_fit.py"""

import json
import math
import sys
from itertools import combinations
from pathlib import Path

import build123d as bd
from cad.build123d import closest_points, overlap_volume

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "assemblies"))

from servo_mount import HORN_AXIS as HORN_ORIGIN, servo_mount  # noqa: E402

ASSEMBLY = "assemblies/servo_mount.py"
FINDINGS = "assemblies/servo_mount_fit.md"

COLLISION_MM3 = 0.01  # an overlap above this, outside the joints listed below, is a collision
TIGHT_MM = 0.5  # a gap under this is listed as tight
TOUCH_MM = 1e-4  # parts closer than this touch
HORN_AXIS = (HORN_ORIGIN, (0.0, 0.0, 1.0))  # the assembly's `horn` revolute joint: its axis, along +Z
HORN_TRAVEL = 60.0  # degrees each way
HORN_STEP = 15.0

# The joints the design means to touch or overlap, by the parts' labels; a screw is any `m3x8_screw:` occurrence.
CONTACTS = {
    ("mg996r", "servo_bracket"): "the servo's tabs sit on the shelf",
    ("horn_adapter", "mg996r"): "the adapter sits on the output spline",
    ("cable_clip", "servo_bracket"): "the clip is bonded to the flange",
    ("m3x8_screw", "mg996r"): "the screw's head clamps the servo's tab",
}
THREADS = ("m3x8_screw", "servo_bracket")  # the screw is drawn at its 3.0 mm thread in the 2.5 mm tap-drill hole
THREAD_MM3 = math.pi * (1.5**2 - 1.25**2) * 2.0  # that thread's overlap through the 2 mm sheet


def kind(label: str) -> str:
    return label.split(":")[0]


def pair_key(a: str, b: str) -> tuple[str, str]:
    return tuple(sorted((kind(a), kind(b))))


def below(shape, z: float):
    """The part of `shape` below the height `z`, for a gap a contact above it would hide."""
    box = shape.bounding_box()
    cutter = bd.Pos(box.center().X, box.center().Y, (box.min.Z - 1 + z) / 2) * bd.Box(box.size.X + 2, box.size.Y + 2, z - box.min.Z + 1)
    made = shape.intersect(cutter)
    solids = [solid for item in (made if isinstance(made, list) else [made]) for solid in item.solids()]
    return solids[0] if len(solids) == 1 else bd.Compound(solids)


def gap(a, b) -> tuple[float, list[float]]:
    """The least distance between two shapes, and one place on the first where it is (one of several when equal)."""
    found = closest_points(a, b)
    return round(found.distance, 3), [round(value, 2) for value in (found.point_a.X, found.point_a.Y, found.point_a.Z)]


def fit(name: str, a, b) -> dict:
    distance, where = gap(a, b)
    return {"fit": name, "gap_mm": distance, "at_mm": where}


def main() -> int:
    # Every placed part, by its label, with its ref's owner (`servo_mount/mg996r`, as `cad model inspect` takes it). The
    # mount stands at the world's origin, so its parts' own coordinates are the world's.
    mount = servo_mount().shape
    parts = {}
    for part in mount.children:
        (solid,) = part.solids()
        parts[part.label] = (f"{mount.label}/{part.label}", solid, part)

    touches, threads, collisions, gaps = [], [], [], []
    for (label_a, (ref_a, a, _)), (label_b, (ref_b, b, _)) in combinations(parts.items(), 2):
        volume = overlap_volume(a, b)
        distance, where = gap(a, b)
        key = pair_key(label_a, label_b)
        row = {"parts": [label_a, label_b], "refs": [ref_a, ref_b], "overlap_mm3": round(volume, 3), "gap_mm": distance, "at_mm": where}
        if key == THREADS and volume > COLLISION_MM3:
            threads.append({**row, "expected_mm3": round(THREAD_MM3, 3), "as_designed": abs(volume - THREAD_MM3) < 0.05})
        elif volume > COLLISION_MM3:
            collisions.append(row)
        elif distance < TOUCH_MM:
            touches.append({**row, "how": CONTACTS.get(key, "not a joint of the design")})
        else:
            gaps.append(row)

    # Fits a touching joint hides: each measured between the features that make it.
    servo = parts["mg996r"][1]
    bracket = parts["servo_bracket"][1]
    adapter = parts["horn_adapter"][1]
    tab_holes = [face for face in servo.faces() if face.geom_type == bd.GeomType.CYLINDER and abs(face.radius - 2.05) < 1e-3]
    fits = [fit("the servo's case in the bracket's cutout", below(servo, -0.001), bracket)]
    for label, (_, screw, _) in parts.items():
        if kind(label) != "m3x8_screw":
            continue
        shank = min((face for face in screw.faces() if face.geom_type == bd.GeomType.CYLINDER), key=lambda face: face.radius)
        hole = min(tab_holes, key=lambda face: (face.center() - shank.center()).length)
        fits.append(fit(f"{label}'s shank in the servo's tab hole", shank, hole))
        fits.append(fit(f"{label}'s tip, below the shelf, to the servo's case", below(screw, -2.001), servo))
    case_top = max(face.center().Z for face in servo.faces() if face.geom_type == bd.GeomType.PLANE and abs(face.normal_at().Z) > 0.99 and face.area > 100)
    fits.append(fit("the horn adapter over the servo's case top", adapter, below(servo, case_top + 0.001)))

    # The horn adapter turned through its travel: its gap to every part but the servo's spline it turns on.
    origin, direction = HORN_AXIS
    axis = bd.Axis(origin, direction)
    others = [solid for label, (_, solid, _) in parts.items() if label not in ("horn_adapter", "mg996r")]
    others.append(below(servo, case_top + 0.001))
    travel = []
    steps = int(2 * HORN_TRAVEL / HORN_STEP)
    for index in range(steps + 1):
        angle = -HORN_TRAVEL + index * HORN_STEP
        turned = adapter.rotate(axis, angle)
        nearest, where = min(gap(turned, other) for other in others)
        travel.append({"angle_deg": angle, "gap_mm": nearest, "at_mm": where, "overlap_mm3": round(max(overlap_volume(turned, other) for other in others), 3)})

    tight = sorted([row for row in gaps if row["gap_mm"] < TIGHT_MM] + [row for row in fits if row["gap_mm"] < TIGHT_MM], key=lambda row: row["gap_mm"])
    unexpected = [row for row in touches if row["how"] == "not a joint of the design"]
    thread_off = [row for row in threads if not row["as_designed"]]
    horn_rubs = [row for row in travel if row["gap_mm"] < TOUCH_MM or row["overlap_mm3"] > COLLISION_MM3]
    failed = bool(collisions or thread_off or horn_rubs)
    result = {
        "document": ASSEMBLY,
        "parts": len(parts),
        "pairs": len(parts) * (len(parts) - 1) // 2,
        "collisions": collisions,
        "touches": touches,
        "threads": threads,
        "fits": fits,
        "gaps": gaps,
        "horn_travel": travel,
        "limits": {"collision_mm3": COLLISION_MM3, "tight_mm": TIGHT_MM, "touch_mm": TOUCH_MM},
        "passes": not failed,
    }
    (ROOT / FINDINGS).write_text(markdown(result, tight, unexpected, horn_rubs), encoding="utf-8")
    print(json.dumps(result))
    return 1 if failed else 0


def markdown(result, tight, unexpected, horn_rubs) -> str:
    travel = result["horn_travel"]
    lowest = min(travel, key=lambda row: row["gap_mm"])
    verdict = (
        "**No part collides.**" if not result["collisions"] else f"**{len(result['collisions'])} pairs collide.**"
    )
    tightest = tight[0] if tight else None
    lines = [
        "# Fit and clearance: servo mount",
        "",
        f"Checked the mount's model, `{result['document']}`: its {result['parts']} parts, "
        f"all {result['pairs']} pairs of them, each part's solid against each other's, then the fits a touching joint "
        f"hides, then the horn adapter turned through its travel.",
        "",
        "## Verdict",
        "",
        f"{verdict} {len(result['touches'])} pairs touch where the design joins them, "
        f"{sum(row['as_designed'] for row in result['threads'])} of {len(result['threads'])} screws overlap their "
        f"tapped holes by just their thread, and the horn turns "
        f"{travel[0]['angle_deg']:g} to {travel[-1]['angle_deg']:g} degrees "
        + ("without touching anything." if not horn_rubs else "but touches a part.")
        + (f" The tightest gap is {tightest['gap_mm']:.3f} mm: {fit_name(tightest)}." if tightest else ""),
        "",
    ]
    if result["collisions"]:
        lines += ["## Collisions", "", "| Parts | Overlap (mm³) |", "|---|---|"]
        lines += [f"| {' · '.join(row['parts'])} | {row['overlap_mm3']:.3f} |" for row in result["collisions"]]
        lines += [""]
    lines += ["## Where parts touch", "", "| Parts | Joint | Overlap (mm³) |", "|---|---|---|"]
    lines += [f"| {' · '.join(row['parts'])} | {row['how']} | {row['overlap_mm3']:.3f} |" for row in result["touches"]]
    if unexpected:
        lines += ["", f"{len(unexpected)} of these touch where the design does not join them."]
    lines += [
        "",
        "## Screws in their tapped holes",
        "",
        "Each screw is drawn at its 3.0 mm thread diameter inside the bracket's 2.5 mm tap-drill hole, so it overlaps "
        f"the sheet by its thread: {result['threads'][0]['expected_mm3'] if result['threads'] else 0:.3f} mm³ through the 2 mm sheet when it is square in its hole.",
        "",
        "| Screw | Overlap (mm³) | As drawn |",
        "|---|---|---|",
    ]
    lines += [f"| {row['parts'][0] if row['parts'][0].startswith('m3x8') else row['parts'][1]} | {row['overlap_mm3']:.3f} | {'yes' if row['as_designed'] else 'no'} |" for row in result["threads"]]
    lines += ["", "## Fits", "", "Gaps a touching joint would hide, measured between the features that make each fit.", "", "| Fit | Gap (mm) | Closest at (mm) |", "|---|---|---|"]
    lines += [f"| {row['fit']} | {row['gap_mm']:.3f} | {place(row)} |" for row in result["fits"]]
    lines += ["", f"## Tight gaps (under {result['limits']['tight_mm']} mm)", ""]
    if tight:
        lines += ["| Between | Gap (mm) | Closest at (mm) |", "|---|---|---|"]
        lines += [f"| {fit_name(row)} | {row['gap_mm']:.3f} | {place(row)} |" for row in tight]
    else:
        lines += ["None."]
    lines += ["", "## Other gaps", "", "| Parts | Gap (mm) | Closest at (mm) |", "|---|---|---|"]
    lines += [f"| {' · '.join(row['parts'])} | {row['gap_mm']:.3f} | {place(row)} |" for row in sorted(result["gaps"], key=lambda row: row["gap_mm"])]
    lines += [
        "",
        "## The horn through its travel",
        "",
        "The horn adapter turned about the servo's output axis in 15 degree steps, against the bracket, the screws, the "
        "clip and the servo's case (not the spline it turns on).",
        "",
        "| Angle (degrees) | Closest gap (mm) | Closest at (mm) | Overlap (mm³) |",
        "|---|---|---|---|",
    ]
    lines += [f"| {row['angle_deg']:g} | {row['gap_mm']:.3f} | {place(row)} | {row['overlap_mm3']:.3f} |" for row in travel]
    lines += [
        "",
        f"Its closest approach is {lowest['gap_mm']:.3f} mm. The adapter is round, so that gap is the same at every angle.",
        "",
        "## How it was checked",
        "",
        "- Every pair of parts: the exact overlap of their solids (`cad.build123d.overlap_volume`, mm³) and the least "
        "distance between them (`closest_points`, mm), in the mount model's own placements. Where a gap is the "
        "same at several places (the cutout's corners), \"closest at\" names one of them, on the first part named.",
        f"- An overlap above {result['limits']['collision_mm3']} mm³ is a collision unless it is a screw's thread in its "
        f"tapped hole; parts closer than {result['limits']['touch_mm']} mm touch; a gap under "
        f"{result['limits']['tight_mm']} mm is tight. These limits are this check's own, chosen for this design.",
        "- A fit behind a contact is measured on its own: the servo's case below the shelf's top face against the "
        "bracket, each screw's shank against the tab hole around it, each screw below the shelf against the servo's "
        "case, and the adapter against the servo below its case top.",
        "- Not checked: the wall screws and the wall, which are not in the assembly; the servo's lead in the clip; and "
        "the servo's real case, which is modeled as the datasheet's envelope, so a real case has more room than this.",
        "",
    ]
    return "\n".join(lines)


def place(row) -> str:
    return "(" + ", ".join(f"{value:.2f}" for value in row["at_mm"]) + ")"


def fit_name(row) -> str:
    return row["fit"] if "fit" in row else " and ".join(row["parts"])


if __name__ == "__main__":
    sys.exit(main())
