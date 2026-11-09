"""Engineering drawing of the servo bracket, as a PDF in ../drawings. It draws the servo bracket's model: running it
builds the model as it is now. The views, hidden lines and measured values are projected from it, and every size a
dimension points at is imported from the model, so moving a hole in the model moves its dimension here. The tolerances
are SendCutSend's for the sheet the bracket is cut and bent from, ALU-080 (sendcutsend-specs.json and their CNC bending
page, as parts/servo_bracket_sheet_metal.md and cut/servo_bracket_sendcutsend.md cite them)."""

from cad.eng_drawing import Sheet, eng_drawing

from servo_bracket import (
    BEND_RADIUS,
    CORNER,
    CUTOUT_CORNER,
    CUTOUT_FROM_WALL,
    FLANGE_HEIGHT,
    SERVO_CLEARANCE,
    SERVO_Y,
    SHELF_DEPTH,
    TAP_DRILL,
    THICKNESS,
    WALL_HOLE,
    WALL_HOLE_DROP,
    WALL_HOLE_SPACING,
    WIDTH,
    servo_bracket,
)
from sizes import SERVO_LENGTH, SERVO_TAB_HOLE_ACROSS, SERVO_TAB_HOLE_SPACING, SERVO_WIDTH

# The model's frame: the outside corner of the bend, halfway along it; +Y out from the wall, +Z up.
CUTOUT_X = SERVO_LENGTH / 2 + SERVO_CLEARANCE  # the cutout's ends, either side of the centre
CUTOUT_FRONT = CUTOUT_FROM_WALL + SERVO_WIDTH + 2 * SERVO_CLEARANCE
HOLE_X = SERVO_TAB_HOLE_SPACING / 2
HOLE_NEAR, HOLE_FAR = SERVO_Y - SERVO_TAB_HOLE_ACROSS / 2, SERVO_Y + SERVO_TAB_HOLE_ACROSS / 2
ROW = 12  # sheet millimetres between rows of dimensions placed below a view


@eng_drawing(out="../drawings/servo_bracket_drawing.pdf")
def servo_bracket_drawing():
    part = servo_bracket().shape
    sheet = Sheet(
        "A3",
        title="SERVO BRACKET",
        part_number="servo_bracket",
        material=f"5052-H32 ALUMINIUM, {THICKNESS:g} MM SHEET",
        revision="A",
        general_tolerance="SENDCUTSEND ALU-080 (CUT ±0.127, BEND TO EDGE ±0.381, BEND ±1°)",
        notes=[
            f"ONE 90° BEND, INSIDE R{BEND_RADIUS:g}. OUTSIDE CORNERS R{CORNER:g}, CUTOUT CORNERS R{CUTOUT_CORNER:g}.",
            "TAP THE 4 HOLES M3x0.5 AFTER BENDING.",
        ],
    )
    top, front, right, iso = sheet.three_views(part, iso=True, gap=60)

    # Top: the shelf the servo drops into, its cutout and the four tapped holes for the servo's tabs. The features'
    # places along the width are measured from its left edge, in two rows below the view.
    top.overall()
    top.dim((-HOLE_X, HOLE_FAR, 0), (HOLE_X, HOLE_FAR, 0))
    top.dim((-CUTOUT_X, CUTOUT_FROM_WALL, 0), (CUTOUT_X, CUTOUT_FROM_WALL, 0))
    top.dim((-WIDTH / 2, 0, 0), (-HOLE_X, HOLE_NEAR, 0), orientation="h", offset=-ROW)
    top.dim((-WIDTH / 2, 0, 0), (-CUTOUT_X, CUTOUT_FROM_WALL, 0), orientation="h", offset=-2 * ROW)
    top.dim((HOLE_X, HOLE_NEAR, 0), (HOLE_X, HOLE_FAR, 0))
    top.dim((CUTOUT_X, CUTOUT_FROM_WALL, 0), (CUTOUT_X, CUTOUT_FRONT, 0))
    top.dim((WIDTH / 2, 0, 0), (HOLE_X, HOLE_NEAR, 0), orientation="v")
    top.dim((WIDTH / 2, 0, 0), (CUTOUT_X, CUTOUT_FROM_WALL, 0), orientation="v")
    top.hole((-HOLE_X, HOLE_FAR, 0), TAP_DRILL, thru=True, count=4, label="TAP M3x0.5")

    # Front, from the wall's side: the flange and its two wall holes, placed from the shelf's top and the left edge.
    front.overall()
    front.dim((-WIDTH / 2, 0, -FLANGE_HEIGHT), (-WALL_HOLE_SPACING / 2, 0, -WALL_HOLE_DROP), orientation="h", offset=-ROW)
    front.dim((-WALL_HOLE_SPACING / 2, 0, -WALL_HOLE_DROP), (WALL_HOLE_SPACING / 2, 0, -WALL_HOLE_DROP),
              offset=-(FLANGE_HEIGHT - WALL_HOLE_DROP + 2 * ROW))
    front.dim((WIDTH / 2, 0, 0), (WALL_HOLE_SPACING / 2, 0, -WALL_HOLE_DROP), orientation="v")
    front.hole((-WALL_HOLE_SPACING / 2, 0, -WALL_HOLE_DROP), WALL_HOLE, thru=True, count=2)

    # Right: the bent profile.
    right.overall()
    right.angle((WIDTH / 2, 0, 0), (WIDTH / 2, 0, -FLANGE_HEIGHT), (WIDTH / 2, SHELF_DEPTH, 0))
    return sheet


if __name__ == "__main__":
    servo_bracket_drawing()
