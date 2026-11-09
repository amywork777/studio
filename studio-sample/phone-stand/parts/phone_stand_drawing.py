"""Engineering drawing of the phone stand, as a PDF in ../drawings. It draws the phone stand's model: running it builds
the model as it is now. The views are projected from it, and every point a dimension measures is worked out from the
model's own sizes, so changing a size in the model moves its dimension here. A prototype's sheet: every size is nominal,
as no tolerance has been asked for yet."""

from math import radians, sin

from cad.eng_drawing import Sheet, eng_drawing

from phone_stand import (
    ANGLE,
    BASE_DEPTH,
    BASE_THICKNESS,
    BRIDGE_CHAMFER,
    BRIDGE_CHAMFER_RISE,
    CABLE_PASS_HEIGHT,
    CABLE_PASS_WIDTH,
    CABLE_SLOT_WIDTH,
    FILLET,
    LEDGE_HEIGHT,
    LEDGE_THICKNESS,
    LIP_HEIGHT,
    PHONE_SLOT,
    REST_FROM_FRONT,
    REST_LENGTH,
    WALL,
    WIDTH,
    along_rest,
    phone_stand,
)

SIDE = WIDTH / 2  # the right-hand face, which the right view looks at


def at(point: tuple[float, float], x: float = SIDE) -> tuple[float, float, float]:
    """A profile point (Y, Z) on the face at `x`."""
    return (x, *point)


@eng_drawing(out="../drawings/phone_stand_drawing.pdf")
def phone_stand_drawing():
    part = phone_stand().shape
    sheet = Sheet(
        "A1",
        scale=1.0,
        title="PHONE STAND",
        part_number="phone_stand",
        material="PLA (BAMBU PLA BASIC)",
        revision="A",
        stage="prototype",
        notes=[
            f"FILLETS AND ROUNDS R{FILLET:g} ON EVERY EDGE ALONG THE WIDTH (THE PROFILE'S CORNERS).",
            "PRINT ON ITS SIDE, THE -X FACE ON THE PLATE (parts/phone_stand_print.py), 0.2 MM LAYERS.",
            "THE CABLE SLOT'S +X CORNERS ARE CUT BACK 3 ACROSS AND 4 UP SO ITS ROOF BRIDGES 8.",
        ],
    )
    top, front, right, iso = sheet.three_views(part, iso=True)

    # Right: the profile. Its sizes along the rest are aligned with it, measured from where the rest meets the base.
    foot = along_rest(0)
    ledge_top = along_rest(LEDGE_HEIGHT)
    ledge_bottom = along_rest(LEDGE_HEIGHT - LEDGE_THICKNESS)
    lip_root = along_rest(LEDGE_HEIGHT, PHONE_SLOT)
    lip_inside_top = along_rest(LEDGE_HEIGHT + LIP_HEIGHT, PHONE_SLOT)
    lip_outside_top = along_rest(LEDGE_HEIGHT + LIP_HEIGHT, PHONE_SLOT + WALL)
    rest_top = along_rest(REST_LENGTH)
    rest_back_top = along_rest(REST_LENGTH, -WALL)
    rest_back_foot = (REST_FROM_FRONT + WALL / sin(radians(ANGLE)), BASE_THICKNESS)
    right.angle(at(rest_back_foot), at((BASE_DEPTH, BASE_THICKNESS)), at(rest_back_top))
    right.dim(at((0, BASE_THICKNESS)), at(foot), orientation="h")
    right.dim(at((BASE_DEPTH, 0)), at((BASE_DEPTH, BASE_THICKNESS)), orientation="v")
    right.dim(at(foot), at(ledge_top), orientation="aligned")
    right.dim(at(foot), at(rest_top), orientation="aligned")
    right.dim(at(rest_back_top), at(rest_top), orientation="aligned", offset=-10)

    # Detail B, the ledge at 2:1: its thickness, the slot the phone stands in, and the lip.
    ledge = sheet.detail(right, at(along_rest(LEDGE_HEIGHT, PHONE_SLOT / 2)), 18, scale=2, at=(250, 460))
    ledge.dim(at(ledge_bottom), at(ledge_top), orientation="aligned")
    ledge.dim(at(ledge_top), at(lip_root), orientation="aligned")
    ledge.dim(at(lip_root), at(lip_inside_top), orientation="aligned")
    ledge.dim(at(lip_inside_top), at(lip_outside_top), orientation="aligned")

    # Top: the width and the depth.
    top.overall()

    # View C, square onto the ledge: the cable slot's true shape, placed from the left side, its two +X corners cut
    # back so its roof bridges less.
    def on_ledge(x: float, out: float) -> tuple[float, float, float]:
        return (x, *along_rest(LEDGE_HEIGHT, out))

    slot = sheet.auxiliary(right, on_ledge(SIDE / 2, PHONE_SLOT / 2), partial=False, scale=2, at=(745, 330))
    edge = CABLE_SLOT_WIDTH / 2
    slot.dim(on_ledge(-SIDE, PHONE_SLOT / 2), on_ledge(-edge, PHONE_SLOT / 2), orientation="h")
    slot.dim(on_ledge(-edge, PHONE_SLOT / 2), on_ledge(edge, PHONE_SLOT / 2), orientation="h")
    slot.dim(on_ledge(edge - BRIDGE_CHAMFER_RISE, 0), on_ledge(edge, BRIDGE_CHAMFER), orientation="h")
    slot.dim(on_ledge(edge, BRIDGE_CHAMFER), on_ledge(edge, PHONE_SLOT - BRIDGE_CHAMFER))
    slot.angle(on_ledge(edge, BRIDGE_CHAMFER), on_ledge(edge, PHONE_SLOT - BRIDGE_CHAMFER),
               on_ledge(edge - BRIDGE_CHAMFER_RISE, 0), offset=8)
    slot.angle(on_ledge(edge, PHONE_SLOT - BRIDGE_CHAMFER), on_ledge(edge, BRIDGE_CHAMFER),
               on_ledge(edge - BRIDGE_CHAMFER_RISE, PHONE_SLOT), offset=30)

    # Front: the height, and the cable pass through the foot of the rest, its width and height.
    front.overall(width=False)
    front.dim((-SIDE, 0, BASE_THICKNESS), (-CABLE_PASS_WIDTH / 2, 0, BASE_THICKNESS), orientation="h")
    front.dim((-CABLE_PASS_WIDTH / 2, 0, BASE_THICKNESS), (CABLE_PASS_WIDTH / 2, 0, BASE_THICKNESS), orientation="h")
    front.dim((CABLE_PASS_WIDTH / 2, 0, BASE_THICKNESS), (CABLE_PASS_WIDTH / 2, 0, BASE_THICKNESS + CABLE_PASS_HEIGHT),
              orientation="v")
    return sheet


if __name__ == "__main__":
    phone_stand_drawing()
