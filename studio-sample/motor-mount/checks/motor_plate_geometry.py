"""Checks the motor plate against its named sizes: its size, its holes and slots, its pocket, its mass, and that it
is one sound solid. It calls the plate's model, so it checks the plate as it is now. Run from the project root with
`cad run checks/motor_plate_geometry.py`; writes checks/motor_plate_geometry.md."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "parts"))

import build123d as bd  # noqa: E402
from cad.build123d import topology_errors  # noqa: E402

import motor_plate as mp  # noqa: E402
from sizes import MOTOR_BOLT_PATTERN  # noqa: E402

DENSITY_G_PER_MM3 = 2.70e-3  # 6061-T6, 2700 kg/m3
TOL = 1e-3

plate = mp.motor_plate().shape
rows = []


def check(name, measured, expected, ok):
    rows.append((name, measured, expected, "pass" if ok else "FAIL"))


bb = plate.bounding_box()
size = (bb.max.X - bb.min.X, bb.max.Y - bb.min.Y, bb.max.Z - bb.min.Z)
check("Size, mm", "%.3f x %.3f x %.3f" % size, f"{mp.PLATE_LENGTH:g} x {mp.PLATE_WIDTH:g} x {mp.THICKNESS:g}",
      all(abs(a - b) < TOL for a, b in zip(size, (mp.PLATE_LENGTH, mp.PLATE_WIDTH, mp.THICKNESS))))

solids = plate.solids()
check("Solids", str(len(solids)), "1", len(solids) == 1)
errors = topology_errors(plate)
check("Topology errors", str(len(errors)), "0", len(errors) == 0)

cylinders = plate.faces().filter_by(bd.GeomType.CYLINDER)

bore = [f for f in cylinders if abs(f.radius - mp.PILOT_BORE / 2) < TOL]
check("Pilot bore", "%d at diameter %.3f, axis (%.3f, %.3f)" % (
    len(bore), 2 * bore[0].radius, bore[0].axis_of_rotation.position.X, bore[0].axis_of_rotation.position.Y) if bore else "none",
    f"1 at diameter {mp.PILOT_BORE:g}, on the origin",
    len(bore) == 1 and abs(bore[0].axis_of_rotation.position.X) < TOL and abs(bore[0].axis_of_rotation.position.Y) < TOL)

screw_holes = [f for f in cylinders if abs(f.radius - mp.SCREW_CLEARANCE / 2) < TOL]
centres = sorted((round(f.axis_of_rotation.position.X, 3), round(f.axis_of_rotation.position.Y, 3)) for f in screw_holes)
half = MOTOR_BOLT_PATTERN / 2
expected = sorted((x, y) for x in (-half, half) for y in (-half, half))
check("M3 clearance holes", f"{len(screw_holes)} at diameter {mp.SCREW_CLEARANCE:g}, centres {centres}",
      f"4 on a {MOTOR_BOLT_PATTERN:g} mm square", centres == expected)

# The slots' half-round ends: cylinders of the slot's radius, two to a slot.
slot_ends = [f for f in cylinders if abs(f.radius - mp.SLOT_WIDTH / 2) < TOL]
ends_x = sorted(round(f.axis_of_rotation.position.X, 3) for f in slot_ends)
s, l = mp.SLOT_SPACING / 2, mp.SLOT_LENGTH / 2
check("M5 slots' ends", f"{len(slot_ends)} ends at X {ends_x}",
      f"4 at X {sorted([-s - l, -s + l, s - l, s + l])}", ends_x == sorted([-s - l, -s + l, s - l, s + l]))

floor_z = mp.THICKNESS - mp.POCKET_DEPTH
floors = [f for f in plate.faces().filter_by(bd.GeomType.PLANE) if abs(f.center().Z - floor_z) < TOL
          and abs(f.normal_at().Z - 1) < TOL]
check("Pocket floor", "%d face at Z %.3f" % (len(floors), floor_z), f"1 at Z {floor_z:g} ({mp.POCKET_DEPTH:g} deep)",
      len(floors) == 1)
corner_r = sorted({round(f.radius, 3) for f in cylinders if abs(f.radius - mp.POCKET_CORNER) < TOL
                   and f.bounding_box().min.Z > floor_z - TOL})
check("Pocket corner radius", f"{corner_r}", f"[{mp.POCKET_CORNER:g}]", corner_r == [mp.POCKET_CORNER])

volume = sum(sol.volume for sol in solids)
mass = volume * DENSITY_G_PER_MM3
solid_block = mp.PLATE_LENGTH * mp.PLATE_WIDTH * mp.THICKNESS * DENSITY_G_PER_MM3
rows.append(("Volume", "%.0f mm3" % volume, "", ""))
rows.append(("Mass, 6061-T6 at 2.70 g/cm3", "%.1f g" % mass, "", ""))
rows.append(("Saved against a plain 110 x 56 x 6 block", "%.1f g (%.0f %%)" % (solid_block - mass, 100 * (1 - mass / solid_block)), "", ""))

lines = ["# Motor plate: geometry check", "",
         "Measured on the plate's model (`parts/motor_plate.py`) with `cad run checks/motor_plate_geometry.py`, against the named sizes in "
         "`parts/motor_plate.py` and `parts/sizes.py`. Millimetres.", "",
         "| Check | Measured | Expected | Result |", "| --- | --- | --- | --- |"]
lines += [f"| {a} | {b} | {c} | {d} |" for a, b, c, d in rows]
out = ROOT / "checks" / "motor_plate_geometry.md"
out.write_text("\n".join(lines) + "\n")
print("\n".join(lines))
failed = [r for r in rows if r[3] == "FAIL"]
sys.exit(1 if failed else 0)
