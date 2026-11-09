"""Measures the machining features of the motor plate for its DFM review (docs/motor_plate_dfm.md): every vertical
inside corner's radius, the pocket's depth and width, each hole's and slot's diameter and depth, and the thinnest
walls between features, as distances between the model's own faces. Run from the project root with
`cad run checks/motor_plate_dfm_measure.py`; writes checks/motor_plate_dfm_measure.md."""

import sys
from pathlib import Path

import build123d as bd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "parts"))

from motor_plate import motor_plate  # noqa: E402

plate = motor_plate().shape
faces = plate.faces()
bb = plate.bounding_box()
top_z, bottom_z = bb.max.Z, bb.min.Z


def is_vertical_cylinder(f):
    return f.geom_type == bd.GeomType.CYLINDER and abs(abs(f.axis_of_rotation.direction.Z) - 1) < 1e-6


def z_span(f):
    b = f.bounding_box()
    return b.min.Z, b.max.Z


def concave(f):
    """A cylinder whose material is outside it (a hole, a slot end or a pocket corner), not a rounded outside corner."""
    axis = f.axis_of_rotation
    c = f.center()
    mid = bd.Vector(c.X, c.Y, c.Z)
    radial = mid - bd.Vector(axis.position.X, axis.position.Y, mid.Z)
    n = f.normal_at(mid)
    return radial.dot(n) < 0  # the face's normal points at the axis: the air is inside it


rows = []
cyl = [f for f in faces if is_vertical_cylinder(f) and concave(f)]
by_radius = {}
for f in cyl:
    by_radius.setdefault(round(f.radius, 3), []).append(f)
for r, group in sorted(by_radius.items()):
    zs = sorted({tuple(round(v, 3) for v in z_span(f)) for f in group})
    rows.append(("Inside cylinders, R%.3f (Ø%.3f)" % (r, 2 * r), f"{len(group)} faces", ", ".join(f"Z {a:g} to {b:g}" for a, b in zs)))

floor = max((f for f in faces if f.geom_type == bd.GeomType.PLANE and abs(f.normal_at().Z - 1) < 1e-6
             and f.center().Z < top_z - 1e-6), key=lambda f: f.area)
fb = floor.outer_wire().bounding_box()
rows.append(("Pocket floor", "Z %.3f, %.3f deep" % (floor.center().Z, top_z - floor.center().Z),
             "opening %.3f x %.3f" % (fb.max.X - fb.min.X, fb.max.Y - fb.min.Y)))
rows.append(("Plate", "%.3f thick" % (top_z - bottom_z), "%.3f x %.3f" % (bb.max.X - bb.min.X, bb.max.Y - bb.min.Y)))


def walls_named(pred):
    return [f for f in faces if pred(f)]


outer_y = walls_named(lambda f: f.geom_type == bd.GeomType.PLANE and abs(abs(f.normal_at().Y) - 1) < 1e-6
                      and abs(abs(f.center().Y) - (bb.max.Y)) < 1e-3)
outer_x = walls_named(lambda f: f.geom_type == bd.GeomType.PLANE and abs(abs(f.normal_at().X) - 1) < 1e-6
                      and abs(abs(f.center().X) - (bb.max.X)) < 1e-3)
pocket_walls = walls_named(lambda f: f.geom_type == bd.GeomType.PLANE and abs(f.normal_at().Z) < 1e-6
                           and z_span(f)[0] > floor.center().Z - 1e-6 and f not in outer_y and f not in outer_x)
pocket_y = [f for f in pocket_walls if abs(abs(f.normal_at().Y) - 1) < 1e-6]
pocket_x = [f for f in pocket_walls if abs(abs(f.normal_at().X) - 1) < 1e-6]
slot_ends = by_radius.get(2.75, [])
screw_holes = by_radius.get(1.7, [])
bore = by_radius.get(11.1, [])


def gap(a_faces, b_faces):
    return min(a.distance_to(b) for a in a_faces for b in b_faces)


rows.append(("Wall: pocket side to plate side (Y)", "%.3f" % gap(pocket_y, outer_y), "3 mm tall, above the floor"))
rows.append(("Wall: pocket end to slot (X)", "%.3f" % gap(pocket_x, slot_ends), "full 6 mm plate"))
rows.append(("Wall: slot to plate end (X)", "%.3f" % gap(slot_ends, outer_x), "full 6 mm plate"))
rows.append(("Wall: M3 hole to pocket wall", "%.3f" % gap(screw_holes, pocket_walls), "in the 3 mm floor"))
rows.append(("Wall: M3 hole to pilot bore", "%.3f" % gap(screw_holes, bore), "in the 3 mm floor"))

lines = ["# Motor plate: DFM measurements", "",
         "Measured on the plate's model (`parts/motor_plate.py`) with `cad run checks/motor_plate_dfm_measure.py`, from its "
         "own faces (exact B-rep: radii from the cylinders, gaps as face-to-face distances). Millimetres; Z 0 is the "
         "plate's underside, Z 6 its top.", "",
         "| Feature | Measured | Where |", "| --- | --- | --- |"]
lines += [f"| {a} | {b} | {c} |" for a, b, c in rows]
(ROOT / "checks" / "motor_plate_dfm_measure.md").write_text("\n".join(lines) + "\n")
print("\n".join(lines))
