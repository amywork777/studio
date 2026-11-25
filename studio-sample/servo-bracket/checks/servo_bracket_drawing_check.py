"""The servo bracket against its drawing: measures each row of servo_bracket.drawing-check.json on the
built model's B-rep (parts/servo_bracket.step) and writes what it measured into the file. Studio
holds each value to the row's tolerance. Run it after the part changes:

    cad run checks/servo_bracket_drawing_check.py     (or the cad environment's python)
"""

import json
import math
from pathlib import Path

import build123d as bd
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Cylinder

HERE = Path(__file__).resolve().parent
CHECK = HERE / "servo_bracket.drawing-check.json"
MODEL = HERE.parent / "parts" / "servo_bracket.step"

shape = bd.import_step(MODEL)
box = shape.bounding_box()


def cylinders():
    """Every cylindrical face as (radius, axis direction, a point on the axis)."""
    found = []
    for face in shape.faces():
        surface = BRepAdaptor_Surface(face.wrapped)
        if surface.GetType() != GeomAbs_Cylinder:
            continue
        cylinder = surface.Cylinder()
        axis = cylinder.Axis()
        direction = axis.Direction()
        location = axis.Location()
        found.append(
            (
                cylinder.Radius(),
                (direction.X(), direction.Y(), direction.Z()),
                (location.X(), location.Y(), location.Z()),
            )
        )
    return found


def along(direction, axis: int) -> bool:
    return abs(abs(direction[axis]) - 1) < 1e-6


def holes(radius: float, axis: int):
    """Hole axes of one size along one world axis, each once (a hole's wall may be two faces)."""
    others = [i for i in range(3) if i != axis]
    centres = {
        tuple(round(point[i], 6) for i in others)
        for r, direction, point in cylinders()
        if abs(r - radius) < 1e-6 and along(direction, axis)
    }
    return sorted(centres)


def radii(axis: int):
    return sorted({round(r, 6) for r, direction, _ in cylinders() if along(direction, axis)})


def planes(normal_axis: int, inside):
    """The positions along `normal_axis` of planar faces facing that way whose centres pass `inside`."""
    found = set()
    for face in shape.faces():
        if face.geom_type != bd.GeomType.PLANE:
            continue
        normal = face.normal_at()
        if abs(abs(tuple(normal)[normal_axis]) - 1) > 1e-6:
            continue
        centre = tuple(face.center())
        if inside(centre):
            found.add(round(centre[normal_axis], 6))
    return sorted(found)


X, Y, Z = 0, 1, 2
taps = holes(1.25, Z)  # (x, y) of each
wall_holes = holes(2.25, Y)  # (x, z) of each
in_cutout = lambda c: -2 < c[Z] < 0 and abs(c[X]) < 30 and 5 < c[Y] < 35  # noqa: E731
cutout_x = planes(X, in_cutout)
cutout_y = planes(Y, in_cutout)
shelf_faces = planes(Z, lambda c: c[Y] > 5)
tap_rows = sorted({y for _, y in taps})
tap_columns = sorted({x for x, _ in taps})
top = max(shelf_faces)
wall = box.min.Y

flange = next(f for f in shape.faces() if f.geom_type == bd.GeomType.PLANE and abs(f.center().Y - wall) < 1e-6)
shelf = next(f for f in shape.faces() if f.geom_type == bd.GeomType.PLANE and abs(f.center().Z - top) < 1e-6)
bend = math.degrees(math.acos(abs(flange.normal_at().dot(shelf.normal_at()))))

MEASURES = {
    "width": (box.size.X, "bounding box along X"),
    "width-front": (box.size.X, "bounding box along X"),
    "tap-spacing": (tap_columns[-1] - tap_columns[0], f"between the {len(taps)} Ø2.5 hole axes along X"),
    "shelf-depth": (box.max.Y - wall, "flange back face to the shelf's front edge"),
    "depth-right": (box.max.Y - wall, "flange back face to the shelf's front edge"),
    "cutout-width": (cutout_y[-1] - cutout_y[0], "between the cutout's walls along Y"),
    "tap-across": (tap_rows[-1] - tap_rows[0], "between the Ø2.5 hole axes along Y"),
    "tap-from-wall": (tap_rows[0] - wall, "flange back face to the nearer Ø2.5 hole axes"),
    "cutout-from-wall": (cutout_y[0] - wall, "flange back face to the cutout's back wall"),
    "tap-from-side": (tap_columns[0] - box.min.X, "side face to the Ø2.5 hole axes"),
    "cutout-from-side": (cutout_x[0] - box.min.X, "side face to the cutout's end wall"),
    "cutout-length": (cutout_x[-1] - cutout_x[0], "between the cutout's end walls"),
    "tap-drill": (2 * 1.25 if len(taps) == 4 else None, f"{len(taps)} cylinders of radius 1.25 along Z"),
    "flange-height": (box.size.Z, "bounding box along Z"),
    "height-right": (box.size.Z, "bounding box along Z"),
    "wall-hole-drop": (top - wall_holes[0][1], "shelf top face to the Ø4.5 hole axes"),
    "wall-hole-from-side": (wall_holes[0][0] - box.min.X, "side face to the Ø4.5 hole axis"),
    "wall-hole-spacing": (wall_holes[-1][0] - wall_holes[0][0], "between the Ø4.5 hole axes"),
    "wall-hole": (2 * 2.25 if len(wall_holes) == 2 else None, f"{len(wall_holes)} cylinders of radius 2.25 along Y"),
    "bend-angle": (bend, "between the shelf top and flange back faces' normals"),
    "bend-radius": (min(radii(X)), "the bend's inner cylinder radius"),
    "corner-radius": (max(r for r in radii(Z) if r < 5), "the shelf's corner cylinder radius"),
    "cutout-corner": (min(radii(Z)), "the cutout's corner cylinder radius"),
    "thickness": (top - min(shelf_faces), "between the shelf's top and bottom faces"),
}

check = json.loads(CHECK.read_text())
for row in check["dimensions"]:
    measured = MEASURES.get(row["id"])
    if measured is None or measured[0] is None:
        row.pop("measured", None)
        row.pop("measuredHow", None)
        continue
    row["measured"] = round(measured[0], 5)
    row["measuredHow"] = measured[1]
CHECK.write_text(json.dumps(check, indent=2, ensure_ascii=False) + "\n")
print(f"{sum('measured' in row for row in check['dimensions'])} of {len(check['dimensions'])} rows measured")
