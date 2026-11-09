"""Engineering drawing of the shelf bracket, as a PDF in ../drawings. It draws the shelf bracket's model: running it
builds the model as it is now. The views, hidden lines and measured values are projected from it, and every size a
dimension points at is imported from the model, so moving a hole in the model moves its dimension here. The tolerances
are SendCutSend's for the sheet the bracket is cut and bent from, G90-074 (sendcutsend-specs.json and their CNC bending
page, as parts/shelf_bracket_sheet_metal.md and cut/shelf_bracket_sendcutsend.md cite them)."""

from math import atan2, cos, pi, sin

from cad.eng_drawing import Sheet, eng_drawing

from shelf_bracket import (
    ARM_LENGTH,
    BEND_RADIUS,
    CORNER,
    CORNER_RELIEF,
    FLANGE_WIDTH,
    FOOT_WIDTH,
    HOLE_INSET,
    LEG_HEIGHT,
    RELIEF_CORNER,
    SHELF_HOLE,
    SHELF_HOLE_FIRST,
    SHELF_HOLE_SPACING,
    THICKNESS,
    TIP_DEPTH,
    WALL_HOLE,
    WALL_HOLE_SPACING,
    WALL_HOLE_TOP,
    WEB_CORNER,
    shelf_bracket,
)

# The model's frame: the outside corner where the shelf meets the wall, on the web's outside face; +Y out from the
# wall, +Z up, +X the way the flanges turn.
SHELF_HOLES = (SHELF_HOLE_FIRST, SHELF_HOLE_FIRST + SHELF_HOLE_SPACING)
WALL_HOLES = (-WALL_HOLE_TOP, -(WALL_HOLE_TOP + WALL_HOLE_SPACING))
BEND_CENTRE = BEND_RADIUS + THICKNESS  # each bend's axis, this far in from both outside faces


def _fillet_centre(corner, toward_a, toward_b, radius):
    """The centre of the round of `radius` in the web's corner at `corner`, between its edges toward a and b (Y, Z)."""
    ua = atan2(toward_a[1] - corner[1], toward_a[0] - corner[0])
    ub = atan2(toward_b[1] - corner[1], toward_b[0] - corner[0])
    half = ((ub - ua + pi) % (2 * pi) - pi) / 2
    along = radius / abs(sin(half))
    mid = ua + half
    return corner[0] + along * cos(mid), corner[1] + along * sin(mid)


TIP_ROUND = _fillet_centre((ARM_LENGTH, -TIP_DEPTH), (ARM_LENGTH, 0), (FOOT_WIDTH, -LEG_HEIGHT), WEB_CORNER)
FOOT_ROUND = _fillet_centre((FOOT_WIDTH, -LEG_HEIGHT), (ARM_LENGTH, -TIP_DEPTH), (0, -LEG_HEIGHT), WEB_CORNER)
RELIEF_ROUND = (CORNER_RELIEF - RELIEF_CORNER, -CORNER_RELIEF + RELIEF_CORNER)


@eng_drawing(out="../drawings/shelf_bracket_drawing.pdf")
def shelf_bracket_drawing():
    part = shelf_bracket().shape
    sheet = Sheet(
        "A2",
        scale=0.5,
        title="SHELF BRACKET",
        part_number="shelf_bracket",
        material=f"G90 STEEL, {THICKNESS:.2f} MM",
        spec="ASTM A653",
        finish="NONE: GALVANISED AS SUPPLIED",
        revision="A",
        stage="prototype",
        general_tolerance="SENDCUTSEND G90-074 (CUT ±0.127, BEND TO EDGE ±0.381, BEND ±1°)",
        notes=[
            f"TWO 90° BENDS, BOTH THE SAME WAY, INSIDE R{BEND_RADIUS:.1f}.",
            "SHEET 0.074 IN (1.88), +0.15/-0.10 AS SENDCUTSEND STOCKS IT.",
            f"WEB CORNERS R{WEB_CORNER:g}, FLANGE CORNERS R{CORNER:g}, CORNER RELIEF INSIDE R{RELIEF_CORNER:g}.",
        ],
    )
    top, front, right, iso = sheet.three_views(part, iso=True)

    # Right: the web, the bracket's gusset, with both flanges edge on.
    right.overall()
    right.dim((THICKNESS, ARM_LENGTH, 0), (THICKNESS, ARM_LENGTH, -TIP_DEPTH))
    right.dim((THICKNESS, 0, -LEG_HEIGHT), (THICKNESS, FOOT_WIDTH, -LEG_HEIGHT))
    right.radius((THICKNESS, TIP_ROUND[0], TIP_ROUND[1]), size=WEB_CORNER)
    right.radius((THICKNESS, FOOT_ROUND[0], FOOT_ROUND[1]), size=WEB_CORNER)
    right.angle((THICKNESS, FOOT_WIDTH, -LEG_HEIGHT), (THICKNESS, ARM_LENGTH, -TIP_DEPTH), (THICKNESS, 0, -LEG_HEIGHT))

    # Top: the shelf flange and its two holes, placed from the wall and the web's outside face.
    top.dim((0, ARM_LENGTH, 0), (THICKNESS, ARM_LENGTH, 0))  # the web
    top.dim((FLANGE_WIDTH, 0, -LEG_HEIGHT / 2), (FLANGE_WIDTH, THICKNESS, -LEG_HEIGHT / 2))  # the wall flange
    top.dim((0, 0, 0), (HOLE_INSET, SHELF_HOLES[0], 0), orientation="v")
    top.dim((HOLE_INSET, SHELF_HOLES[0], 0), (HOLE_INSET, SHELF_HOLES[1], 0))
    top.dim((0, SHELF_HOLES[1], 0), (HOLE_INSET, SHELF_HOLES[1], 0))
    top.hole((HOLE_INSET, SHELF_HOLES[0], 0), SHELF_HOLE, thru=True, count=2)
    top.angle((0, 0, 0), (0, ARM_LENGTH, 0), (FLANGE_WIDTH, 0, 0))
    top.radius((BEND_CENTRE, BEND_CENTRE, 0), size=BEND_RADIUS)
    top.radius((BEND_CENTRE, BEND_CENTRE, 0), size=BEND_CENTRE)
    top.radius((FLANGE_WIDTH - CORNER, CORNER_RELIEF + CORNER, 0), size=CORNER)

    # Front, from the wall: the wall flange and its two holes, placed from the shelf and the web's outside face.
    front.overall(height=False)
    front.dim((FLANGE_WIDTH, ARM_LENGTH / 2, 0), (FLANGE_WIDTH, ARM_LENGTH / 2, -THICKNESS))  # the shelf flange
    front.dim((0, 0, 0), (HOLE_INSET, 0, WALL_HOLES[0]), orientation="v")
    front.dim((HOLE_INSET, 0, WALL_HOLES[0]), (HOLE_INSET, 0, WALL_HOLES[1]))
    front.dim((0, 0, WALL_HOLES[1]), (HOLE_INSET, 0, WALL_HOLES[1]))
    front.hole((HOLE_INSET, 0, WALL_HOLES[0]), WALL_HOLE, thru=True, count=2)
    front.angle((0, 0, 0), (0, 0, -LEG_HEIGHT), (FLANGE_WIDTH, 0, 0))
    front.radius((BEND_CENTRE, 0, -BEND_CENTRE), size=BEND_RADIUS)
    front.radius((BEND_CENTRE, 0, -BEND_CENTRE), size=BEND_CENTRE)
    front.radius((FLANGE_WIDTH - CORNER, 0, -(CORNER_RELIEF + CORNER)), size=CORNER)

    # The corner relief, where the two bends meet, drawn larger.
    relief = sheet.detail(right, (THICKNESS, CORNER_RELIEF / 2, -CORNER_RELIEF / 2), 8, letter="B", scale=2)
    relief.dim((THICKNESS, 0, -CORNER_RELIEF), (THICKNESS, CORNER_RELIEF, 0), orientation="h")
    relief.dim((THICKNESS, 0, -CORNER_RELIEF), (THICKNESS, CORNER_RELIEF, 0), orientation="v")
    relief.radius((THICKNESS, RELIEF_ROUND[0], RELIEF_ROUND[1]), size=RELIEF_CORNER)
    return sheet


if __name__ == "__main__":
    shelf_bracket_drawing()
