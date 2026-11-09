"""Two print facts the dfam-check tool does not measure, measured on the stand's model as it prints
(on its side, +X up, its -X face on the plate): how far each flat roof bridges, and how much of the part sits on the
plate. A roof is a flat face that faces straight down off the plate; it bridges between the edges where a wall below
it holds it, and its span is the distance between them. Prints one JSON line. Run it from anywhere:
cad run checks/phone_stand_print_facts.py"""

import json
import sys
from pathlib import Path

import build123d as bd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "parts"))

from phone_stand import phone_stand  # noqa: E402

STAND = "parts/phone_stand.py"
UP = bd.Vector(1, 0, 0)  # the stand's +X is up as it prints (parts/phone_stand_print.py)


def main() -> None:
    (solid,) = phone_stand().shape.solids()
    plate = solid.bounding_box().min.X
    flat_down = [face for face in solid.faces() if face.geom_type == bd.GeomType.PLANE
                 and face.normal_at().dot(UP) < -0.999]
    on_plate = [face for face in flat_down if abs(face.center().X - plate) < 1e-6]
    roofs = []
    for face in flat_down:
        if face in on_plate:
            continue
        height = face.center().X
        held = []
        for edge in face.edges():
            middle, along = edge.position_at(0.5), edge.tangent_at(0.5)
            away = middle - face.center()
            away = (away - along * away.dot(along)).normalized()  # in the roof's plane, out from its middle
            # A wall below the edge holds it: material 0.2 mm down and 0.3 mm out from the edge, so any wall steeper than 34°.
            if solid.is_inside(middle + away * 0.3 - UP * 0.2):
                held.append(edge)
        spans = [round(a.distance_to(b), 2) for i, a in enumerate(held) for b in held[i + 1:]
                 if a.distance_to(b) > 1e-6]
        roofs.append({
            "at_mm": [round(v, 2) for v in face.center()],
            "height_above_plate_mm": round(height - plate, 2),
            "area_mm2": round(face.area, 2),
            "held_edges": len(held),
            "span_mm": max(spans) if spans else None,
        })
    print(json.dumps({
        "document": STAND,
        "plate_contact_mm2": round(sum(face.area for face in on_plate), 1),
        "roofs": sorted(roofs, key=lambda roof: -roof["area_mm2"]),
    }))


if __name__ == "__main__":
    main()
