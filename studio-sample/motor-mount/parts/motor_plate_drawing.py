"""Engineering drawing of the motor plate, as a PDF in ../drawings. It draws the plate's model: `python
parts/motor_plate_drawing.py` builds the plate as it is now and projects its views, hidden lines and measured values
from it, and every size a dimension points at is imported from the model, so moving a feature in the model moves its
dimension here. The holes and slots are listed in a hole table, their sizes read off the part. The general tolerance (ISO 2768-m) and the pilot bore's tolerance are assumed for a prototype, not asked."""

from cad.eng_drawing import Sheet, eng_drawing

from motor_plate import (
    CHAMFER,
    CORNER,
    PLATE_LENGTH,
    PLATE_WIDTH,
    POCKET_CORNER,
    POCKET_DEPTH,
    POCKET_SIZE,
    THICKNESS,
    motor_plate,
)

# The model's frame: the centre of the underside, +X along the belt, +Z up through the plate.
P = POCKET_SIZE / 2


@eng_drawing(out="../drawings/motor_plate_drawing.pdf")
def motor_plate_drawing():
    part = motor_plate().shape
    sheet = Sheet(
        "A3",
        title="NEMA 17 MOTOR PLATE",
        part_number="motor_plate",
        material="ALUMINIUM 6061-T6, 10 MM PLATE",
        revision="A",
        stage="prototype",
        general_tolerance="ISO 2768-m",
        notes=[
            f"OUTSIDE CORNERS R{CORNER:g}, POCKET CORNERS R{POCKET_CORNER:g}. POCKET FLOOR TO WALL SHARP.",
            f"CHAMFER THE OUTLINE'S TOP AND BOTTOM EDGES {CHAMFER:g} x 45°. DEBURR THE HOLES AND SLOTS.",
            "THE SLOTS TAKE TWO M5 SCREWS; THE 4 HOLES ON THE 31 SQUARE TAKE THE MOTOR'S M3 SCREWS.",
        ],
    )
    top, front, right, iso = sheet.three_views(part, iso=True)
    front.section("A", through=(0, 0, THICKNESS / 2))

    # Top: the outline, the pocket and every hole and slot, tabulated from the plate's centre.
    top.symmetric("v")
    top.symmetric("h")
    top.overall()
    top.dim((-P, -P, THICKNESS), (P, -P, THICKNESS))
    top.dim((P, -P, THICKNESS), (P, P, THICKNESS), offset=50)  # beyond the section letter A
    top.hole_table(origin=(0, 0, THICKNESS))
    top.radius((PLATE_LENGTH / 2 - CORNER, PLATE_WIDTH / 2 - CORNER, THICKNESS), size=CORNER)
    top.radius((P - POCKET_CORNER, P - POCKET_CORNER, THICKNESS))

    # Section A-A: the thickness and the pocket's depth.
    front.overall(width=False)
    front.dim((P, 0, THICKNESS), (P, 0, THICKNESS - POCKET_DEPTH))
    return sheet


if __name__ == "__main__":
    motor_plate_drawing()
