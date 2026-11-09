"""Fit, clearance and motion of the desk lamp: every pair of its parts checked for overlap and gap at rest, the fits a
touching joint hides measured on their own, then each hinge swung through its travel to find the angles where nothing
collides and nothing goes through the desk, and at each pose the lamp's balance on its base and the torque each hinge
must hold. Calls the lamp's model, so it checks the lamp as it is now, writes its findings to assemblies/desk_lamp_fit.md, prints them as
one JSON line, and exits 1 when a part collides at rest. Run it from anywhere: cad run checks/desk_lamp_fit.py"""

import json
import math
import sys
from itertools import combinations
from pathlib import Path

import build123d as bd
from cad.build123d import closest_points, overlap_volume

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "assemblies"))

from desk_lamp import BASE_HINGE as BASE_AXIS, HEAD_HINGE as HEAD_AXIS, UP, desk_lamp  # noqa: E402

ASSEMBLY = "assemblies/desk_lamp.py"
FINDINGS = "assemblies/desk_lamp_fit.md"

COLLISION_MM3 = 0.01  # an overlap above this, outside the threads listed below, is a collision
TIGHT_MM = 0.5  # a gap under this is listed as tight
TOUCH_MM = 1e-4  # parts closer than this touch
BASE_HINGE = (BASE_AXIS, UP)  # the assembly's `tilt` revolute joint: its axis, along -Y
HEAD_HINGE = (HEAD_AXIS, UP)  # its `head` revolute joint
SWEEP_STEP = 5.0  # degrees, then each end found to the degree
FOOTPRINT_RADIUS = 60.0 - 0.6  # where the base meets the desk: its radius less the foot chamfer (parts/base.py)

# The joints the design means to touch, by the parts' kinds (a label's part before the colon).
CONTACTS = {
    ("base", "weight"): "the weight is bonded into the base's pocket, its top on the pocket's ceiling",
    ("base", "m5x30_screw"): "the hinge screw's head bears on the clevis's cheek",
    ("base", "m5_locknut"): "the locknut bears on the clevis's other cheek",
    ("m5_locknut", "m5x30_screw"): "the locknut runs on the screw",
    ("head", "m5x30_screw"): "the hinge screw's head bears on the yoke's cheek",
    ("head", "m5_locknut"): "the locknut bears on the yoke's other cheek",
    ("head", "led_module"): "the LED board's back sits on the head's two bosses",
    ("led_module", "m3x8_screw"): "the screw's head clamps the LED board",
}
THREADS = ("head", "m3x8_screw")  # each M3 screw is drawn at its 3.0 mm thread in its 2.5 mm pilot hole in a boss
THREAD = (1.5, 1.25)  # the screw's thread radius and its pilot hole's: the overlap must lie between them

# Densities in g/cm3: PETG and mild steel as their makers' sheets commonly give them, the LED module taken as aluminium.
DENSITY = {"base": 1.27, "arm": 1.27, "head": 1.27, "weight": 7.85, "led_module": 2.70, "m5x30_screw": 7.85, "m5_locknut": 7.85, "m3x8_screw": 7.85}
ARM_GROUP = ("arm", "m5x30_screw:head_hinge", "m5_locknut:head_hinge")  # turn with the arm on the base's hinge
HEAD_GROUP = ("head", "led_module", "m3x8_screw:left", "m3x8_screw:right")  # turn with the head on the arm's
G = 9.81
FRICTION = 0.3  # assumed PETG on PETG, for the clamp estimate only: measure it
NUT_FACTOR = 0.2  # assumed, dry steel thread, for the tightening torque estimate only


def kind(label: str) -> str:
    return label.split(":")[0]


def pair_key(a: str, b: str) -> tuple[str, str]:
    return tuple(sorted((kind(a), kind(b))))


def turned(point, hinge, angle: float):
    """`point` turned `angle` degrees about a hinge whose axis runs along -Y (a positive angle lifts +X)."""
    (ox, oy, oz), _ = hinge
    x, z = point[0] - ox, point[2] - oz
    c, s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    return (ox + x * c - z * s, point[1], oz + x * s + z * c)


def boxes_meet(a, b) -> bool:
    box_a, box_b = a.bounding_box(), b.bounding_box()
    return all(tuple(box_a.min)[i] <= tuple(box_b.max)[i] and tuple(box_b.min)[i] <= tuple(box_a.max)[i] for i in range(3))


def overlap(a, b) -> float:
    return overlap_volume(a, b) if boxes_meet(a, b) else 0.0


def thread_ring(screw):
    """The ring between the pilot hole's diameter and the screw's thread, along the screw's whole axis."""
    thread, pilot = THREAD
    shank = next(face for face in screw.faces() if face.geom_type == bd.GeomType.CYLINDER and abs(face.radius - thread) < 1e-3)
    axis = shank.axis_of_rotation
    frame = bd.Plane(origin=axis.position, z_dir=axis.direction)
    (ring,) = (frame * (bd.Cylinder(thread + 0.01, 60) - bd.Cylinder(pilot, 60))).solids()
    return ring


def gap(a, b) -> tuple[float, list[float]]:
    found = closest_points(a, b)
    return round(found.distance, 3), [round(value, 2) for value in (found.point_a.X, found.point_a.Y, found.point_a.Z)]


def placed(node, path=()):
    """Each part of the lamp with its ref's owner, its path of labels from the root (`desk_lamp/arm_assembly/arm`, as
    `cad model inspect` takes it). Every sub-assembly of the lamp stands at the world's origin, so its parts' own
    coordinates are the world's."""
    here = (*path, node.label)
    if not node.children:
        yield "/".join(here), node
    for child in node.children:
        yield from placed(child, here)


def main() -> int:
    parts = {}
    for ref, part in placed(desk_lamp().shape):
        (solid,) = part.solids()
        parts[part.label] = (ref, solid)

    # Every pair at rest.
    touches, threads, collisions, gaps = [], [], [], []
    for (label_a, (ref_a, a)), (label_b, (ref_b, b)) in combinations(parts.items(), 2):
        volume = overlap_volume(a, b)
        distance, where = gap(a, b)
        key = pair_key(label_a, label_b)
        row = {"parts": [label_a, label_b], "refs": [ref_a, ref_b], "overlap_mm3": round(volume, 3), "gap_mm": distance, "at_mm": where}
        if key == THREADS and volume > COLLISION_MM3:
            screw, boss = (a, b) if kind(label_a) == "m3x8_screw" else (b, a)
            beyond = sum(overlap_volume(piece, boss) for piece in (screw - thread_ring(screw)).solids())  # outside the thread
            threads.append({**row, "beyond_thread_mm3": round(beyond, 3), "as_designed": beyond < COLLISION_MM3})
        elif volume > COLLISION_MM3:
            collisions.append(row)
        elif distance < TOUCH_MM:
            touches.append({**row, "how": CONTACTS.get(key, "not a joint of the design")})
        else:
            gaps.append(row)

    # Fits a touching joint hides, each measured between the features that make it.
    def cylinders(solid, radius):
        return [face for face in solid.faces() if face.geom_type == bd.GeomType.CYLINDER and abs(face.radius - radius) < 1e-3]

    arm, base, head = parts["arm"][1], parts["base"][1], parts["head"][1]
    fits = [
        {"fit": "the arm between the clevis's cheeks, each side", "gap_mm": gap(arm, base)[0]},
        {"fit": "the arm between the yoke's cheeks, each side", "gap_mm": gap(arm, head)[0]},
    ]
    for name, holes_of in (("base_hinge", base), ("head_hinge", head)):
        shank = min(cylinders(parts[f"m5x30_screw:{name}"][1], 2.5), key=lambda face: face.area)
        arm_hole = min(cylinders(arm, 2.75), key=lambda face: (face.center() - shank.center()).length)
        fits.append({"fit": f"the {name.replace('_', ' ')}'s screw in the arm's hole", "gap_mm": gap(shank, arm_hole)[0]})
        fits.append({"fit": f"the {name.replace('_', ' ')}'s screw in its cheeks' holes", "gap_mm": min(gap(shank, hole)[0] for hole in cylinders(holes_of, 2.75))})
    for side in ("left", "right"):
        screw = parts[f"m3x8_screw:{side}"][1]
        shank = cylinders(screw, 1.5)[0]
        fits.append({"fit": f"the {side} M3 screw in the LED board's hole", "gap_mm": min(gap(shank, hole)[0] for hole in cylinders(parts["led_module"][1], 1.6))})
    weight = parts["weight"][1]
    fits.append({"fit": "the weight in the base's pocket, round its side", "gap_mm": gap(cylinders(weight, 45.0)[0], cylinders(base, 45.1)[0])[0]})

    # The hinges swung. A pose is blocked when a moving part overlaps a part it does not move with, or dips below the desk.
    arm_group = [parts[label][1] for label in ARM_GROUP]
    head_group = [parts[label][1] for label in HEAD_GROUP]
    still = [solid for label, (_, solid) in parts.items() if label not in ARM_GROUP + HEAD_GROUP]

    def axis(hinge):
        origin, direction = hinge
        return bd.Axis(origin, direction)

    def pose(tilt: float, head_angle: float):
        """The arm's and the head's parts at a pose, as solids in the assembly's frame."""
        arm_now = [solid.rotate(axis(BASE_HINGE), tilt) for solid in arm_group]
        head_now = [solid.rotate(axis(HEAD_HINGE), head_angle).rotate(axis(BASE_HINGE), tilt) for solid in head_group]
        return arm_now, head_now

    def blocked(tilt: float, head_angle: float):
        arm_now, head_now = pose(tilt, head_angle)
        moving = arm_now + head_now
        lowest = min(solid.bounding_box().min.Z for solid in moving)
        if lowest < 0:
            return f"goes {-lowest:.1f} mm through the desk"
        for solid in arm_now:
            for other in still:
                if overlap(solid, other) > COLLISION_MM3:
                    return "the arm's parts hit the base"
        for solid in head_now:
            for other in still:
                if overlap(solid, other) > COLLISION_MM3:
                    return "the head hits the base"
            for other in arm_now:
                if overlap(solid, other) > COLLISION_MM3:
                    return "the head hits the arm"
        return None

    def clear_range(swing, start, stop):
        """The angles either side of rest where the swing is clear, to the degree, and what stops it at each end."""
        ends = []
        for direction, limit in ((-1, start), (1, stop)):
            angle, reason = 0.0, None
            while abs(angle + direction * SWEEP_STEP) <= abs(limit):
                reason = swing(angle + direction * SWEEP_STEP)
                if reason:
                    break
                angle += direction * SWEEP_STEP
            if reason:
                for _ in range(int(SWEEP_STEP) - 1):  # each degree to the first blocked one
                    reason_here = swing(angle + direction)
                    if reason_here:
                        reason = reason_here
                        break
                    angle += direction
                else:
                    reason = swing(angle + direction)
            ends.append({"angle_deg": angle, "stopped_by": reason or f"not stopped before {limit:g} degrees"})
        return ends

    tilt_range = clear_range(lambda angle: blocked(angle, 0.0), -180, 180)
    head_range = clear_range(lambda angle: blocked(0.0, angle), -180, 180)

    # Every pose of the two together, in 15 degree steps within each one's clear range.
    def steps(ends):
        low, high = ends[0]["angle_deg"], ends[1]["angle_deg"]
        values = sorted({*range(int(math.ceil(low / 15) * 15), int(high) + 1, 15), low, high})
        return values

    grid = []
    for tilt in steps(tilt_range):
        for head_angle in steps(head_range):
            reason = blocked(tilt, head_angle)
            grid.append({"tilt_deg": tilt, "head_deg": head_angle, "blocked": reason})

    # Masses and balance.
    masses = {label: solid.volume / 1000 * DENSITY[kind(label)] for label, (_, solid) in parts.items()}
    centres = {label: tuple(solid.center(bd.CenterOf.MASS)) for label, (_, solid) in parts.items()}

    def placed_centre(label, tilt, head_angle):
        point = centres[label]
        if label in HEAD_GROUP:
            point = turned(point, HEAD_HINGE, head_angle)
        if label in ARM_GROUP + HEAD_GROUP:
            point = turned(point, BASE_HINGE, tilt)
        return point

    balance, torques = [], []
    for row in grid:
        tilt, head_angle = row["tilt_deg"], row["head_deg"]
        if row["blocked"]:
            continue
        # The lamp's centre of mass, the printed base left out (it only steadies the lamp), the rest printed solid.
        counted = {label: mass for label, mass in masses.items() if label != "base"}
        x = sum(mass * placed_centre(label, tilt, head_angle)[0] for label, mass in counted.items()) / sum(counted.values())
        balance.append({"tilt_deg": tilt, "head_deg": head_angle, "centre_x_mm": round(x, 1), "margin_mm": round(FOOTPRINT_RADIUS - abs(x), 1)})
        hinge_x, head_x = BASE_HINGE[0][0], turned(HEAD_HINGE[0], BASE_HINGE, tilt)[0]
        base_torque = sum(masses[label] / 1000 * G * (placed_centre(label, tilt, head_angle)[0] - hinge_x) / 1000 for label in ARM_GROUP + HEAD_GROUP)
        head_torque = sum(masses[label] / 1000 * G * (placed_centre(label, tilt, head_angle)[0] - head_x) / 1000 for label in HEAD_GROUP)
        torques.append({"tilt_deg": tilt, "head_deg": head_angle, "base_hinge_Nm": round(base_torque, 3), "head_hinge_Nm": round(head_torque, 3)})

    worst_balance = min(balance, key=lambda row: row["margin_mm"])
    worst_base = max(torques, key=lambda row: abs(row["base_hinge_Nm"]))
    worst_head = max(torques, key=lambda row: abs(row["head_hinge_Nm"]))
    inner, outer = 2.75, 8.0  # the clamped annulus each side of the arm: its hole to its rounded end (sizes.py)
    friction_radius = 2 / 3 * (outer**3 - inner**3) / (outer**2 - inner**2) / 1000
    clamps = {}
    for name, worst, key in (("base_hinge", worst_base, "base_hinge_Nm"), ("head_hinge", worst_head, "head_hinge_Nm")):
        clamp = abs(worst[key]) / (2 * FRICTION * friction_radius)  # two faces of the arm slip on each hinge
        clamps[name] = {"holding_Nm": abs(worst[key]), "clamp_N": round(clamp), "screw_torque_Nm": round(NUT_FACTOR * clamp * 0.005, 2)}

    unexpected = [row for row in touches if row["how"] == "not a joint of the design"]
    thread_off = [row for row in threads if not row["as_designed"]]
    tight = sorted([row for row in gaps if row["gap_mm"] < TIGHT_MM] + [row for row in fits if row["gap_mm"] < TIGHT_MM], key=lambda row: row["gap_mm"])
    failed = bool(collisions or thread_off or unexpected)
    result = {
        "document": ASSEMBLY,
        "parts": len(parts),
        "pairs": len(parts) * (len(parts) - 1) // 2,
        "collisions": collisions,
        "touches": touches,
        "threads": threads,
        "fits": fits,
        "gaps": gaps,
        "tilt_range": tilt_range,
        "head_range": head_range,
        "grid": grid,
        "masses_g": {label: round(mass, 1) for label, mass in masses.items()},
        "balance_worst": worst_balance,
        "torque_worst": {"base_hinge": worst_base, "head_hinge": worst_head},
        "clamps": clamps,
        "tight": tight,
        "limits": {"collision_mm3": COLLISION_MM3, "tight_mm": TIGHT_MM, "touch_mm": TOUCH_MM},
        "passes": not failed,
    }
    (ROOT / FINDINGS).write_text(markdown(result), encoding="utf-8")
    print(json.dumps(result))
    return 1 if failed else 0


def markdown(result) -> str:
    tilt, head = result["tilt_range"], result["head_range"]
    blocked = [row for row in result["grid"] if row["blocked"]]
    masses = result["masses_g"]
    lines = [
        "# Fit, clearance and motion: desk lamp",
        "",
        f"Checked the lamp's model, `{result['document']}`: its {result['parts']} parts at rest, "
        f"all {result['pairs']} pairs of them, then the fits a touching joint hides, then each hinge swung until a part "
        "collides or goes through the desk, then every pose of the two together in 15 degree steps.",
        "",
        "## Verdict",
        "",
        ("**No part collides at rest.** " if not result["collisions"] else f"**{len(result['collisions'])} pairs collide at rest.** ")
        + f"{len(result['touches'])} pairs touch where the design joins them, and "
        f"{sum(row['as_designed'] for row in result['threads'])} of {len(result['threads'])} M3 screws overlap their pilot holes by just their thread. "
        f"The arm tilts clear from {tilt[0]['angle_deg']:g} to +{tilt[1]['angle_deg']:g} degrees about its rest (55 degrees up from the desk), "
        f"and the head from {head[0]['angle_deg']:g} to +{head[1]['angle_deg']:g} degrees about hanging level. "
        + (f"{len(blocked)} of the {len(result['grid'])} poses of the two together are blocked." if blocked else f"Every one of the {len(result['grid'])} poses of the two together within those ranges is clear.")
        + f" At the worst pose the lamp's balance point is {result['balance_worst']['margin_mm']:g} mm inside the base's edge, so it does not tip.",
        "",
        "## The hinges' range",
        "",
        "Positive lifts: the arm up and back, the head's front up. Each end is the last whole degree clear.",
        "",
        "| Hinge | From (degrees) | Stopped by | To (degrees) | Stopped by |",
        "|---|---|---|---|---|",
        f"| Arm on the base (`tilt`) | {tilt[0]['angle_deg']:g} | {tilt[0]['stopped_by']} | +{tilt[1]['angle_deg']:g} | {tilt[1]['stopped_by']} |",
        f"| Head on the arm (`head`) | {head[0]['angle_deg']:g} | {head[0]['stopped_by']} | +{head[1]['angle_deg']:g} | {head[1]['stopped_by']} |",
        "",
        "In the model the arm is 55 degrees up from the desk at rest, so it reaches from "
        f"{55 + tilt[0]['angle_deg']:g} to {55 + tilt[1]['angle_deg']:g} degrees up from the desk. The assembly's `tilt` and `head` "
        "joints take these ranges, rounded in to whole 5 degrees.",
        "",
    ]
    if blocked:
        lines += [
            f"Together, in 15 degree steps within those ranges, {len(blocked)} of {len(result['grid'])} poses are blocked, "
            + ("each by a part going through the desk:" if all("desk" in row["blocked"] for row in blocked) else "by a collision or the desk:"),
            "",
            "| Tilt (degrees) | Head angles blocked (degrees) |",
            "|---|---|",
        ]
        for tilt_angle in sorted({row["tilt_deg"] for row in blocked}):
            angles = [row["head_deg"] for row in blocked if row["tilt_deg"] == tilt_angle]
            lines += [f"| {tilt_angle:g} | {', '.join(f'{angle:g}' for angle in angles)} |"]
        lines += [""]
    worst_base, worst_head = result["torque_worst"]["base_hinge"], result["torque_worst"]["head_hinge"]
    clamps = result["clamps"]
    lines += [
        "## Holding its position",
        "",
        "Each hinge holds by friction: its screw clamps the arm's two faces between the cheeks. The weight of what it "
        "carries turns it, most of all with the arm far out:",
        "",
        "| Hinge | Most torque to hold (N·m) | At tilt, head (degrees) | Clamp needed (N) | Screw torque, estimate (N·m) |",
        "|---|---|---|---|---|",
        f"| Arm on the base | {abs(worst_base['base_hinge_Nm']):.3f} | {worst_base['tilt_deg']:g}, {worst_base['head_deg']:g} | {clamps['base_hinge']['clamp_N']} | {clamps['base_hinge']['screw_torque_Nm']:.2f} |",
        f"| Head on the arm | {abs(worst_head['head_hinge_Nm']):.3f} | {worst_head['tilt_deg']:g}, {worst_head['head_deg']:g} | {clamps['head_hinge']['clamp_N']} | {clamps['head_hinge']['screw_torque_Nm']:.2f} |",
        "",
        "The clamp and the screw torque are estimates on two assumptions, a friction of 0.3 between PETG faces and a nut "
        "factor of 0.2, with the arm's faces slipping on an annulus from its Ø5.5 hole to its R8 end: set each hinge's "
        "tension on the first lamp by test (the work instructions' last step, docs/desk_lamp_work_instructions.pdf) rather than to these numbers.",
        "",
        "## Balance",
        "",
        f"The lamp's balance point, from the masses below with the printed base left out, is at worst "
        f"{abs(result['balance_worst']['centre_x_mm']):g} mm from the base's centre (tilt {result['balance_worst']['tilt_deg']:g}, "
        f"head {result['balance_worst']['head_deg']:g}), inside the {FOOTPRINT_RADIUS:g} mm the base stands on.",
        "",
        "| Part | Mass (g) |",
        "|---|---|",
    ]
    lines += [f"| {label} | {mass:.1f} |" for label, mass in masses.items()]
    lines += [
        f"| All | {sum(masses.values()):.1f} |",
        "",
        "Printed parts are weighed solid, at PETG's 1.27 g/cm³; printed at a lower infill they are lighter, which leaves "
        "the head lighter and the lamp steadier. The steel is 7.85 g/cm³ and the LED module is taken as aluminium, 2.70 g/cm³.",
        "",
        "## Where parts touch at rest",
        "",
        "| Parts | Joint |",
        "|---|---|",
    ]
    lines += [f"| {' · '.join(row['parts'])} | {row['how']} |" for row in result["touches"]]
    lines += [
        "",
        "Each M3 screw is drawn at its 3.0 mm thread inside its boss's 2.5 mm pilot hole, so it overlaps the boss by its "
        "thread, all of it in the ring between the two diameters: "
        + ", ".join(f"{row['parts'][1]} {row['overlap_mm3']:.3f} mm³ ({'all' if row['as_designed'] else 'not all'} in the ring)" for row in result["threads"]) + ".",
        "",
        "## Fits",
        "",
        f"Gaps a touching joint hides, measured between the features that make each fit.",
        "",
        "| Fit | Gap (mm) |",
        "|---|---|",
    ]
    lines += [f"| {row['fit']} | {row['gap_mm']:.3f} |" for row in result["fits"]]
    lines += [
        "",
        "## How it was checked",
        "",
        "- Every pair of parts at rest: the exact overlap of their solids (`cad.build123d.overlap_volume`, mm³) and the "
        "least distance between them (`closest_points`, mm), in the lamp model's own placements.",
        f"- An overlap above {result['limits']['collision_mm3']} mm³ is a collision unless it is an M3 screw's thread in "
        f"its pilot hole; parts closer than {result['limits']['touch_mm']} mm touch; a gap under "
        f"{result['limits']['tight_mm']} mm is tight. These limits are this check's own, chosen for this design.",
        "- Each hinge swung from rest in 5 degree steps, then a degree at a time, about the axis the assembly's joints "
        "declare: the arm with everything it carries, against the base, the weight and the base hinge's screw and nut; "
        "the head with the LED module and its screws, against the arm and everything else. A pose is blocked by an "
        "overlap, or by any part below the desk (z < 0).",
        "- Not checked: the LED's lead, which is not modelled; the hinge screws' thread in the locknuts, drawn as touching; "
        "and the friction itself, which only a built lamp shows.",
        "",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    sys.exit(main())
