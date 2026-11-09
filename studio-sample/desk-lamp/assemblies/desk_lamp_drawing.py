"""Assembly drawing of the desk lamp, as a PDF in ../drawings: a general arrangement with every part ballooned to its
parts list, then a first-pass sheet for each part the project makes. It draws the lamp's model: running it builds the lamp
as it is now. A prototype's drawing at nominal sizes: no tolerances, fits or
general tolerance have been set, and the sheets say so."""

import sys
from pathlib import Path

from cad.eng_drawing import assembly_sheets, eng_drawing, parts_list

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "parts"))  # the base's sizes, so its dimensions follow the model

from base import CLEVIS_LENGTH, CLEVIS_X, DIAMETER, EDGE_ROUND, FOOT_CHAMFER, HEIGHT  # noqa: E402
from sizes import CHEEK, CHEEK_GAP  # noqa: E402

from desk_lamp import desk_lamp  # noqa: E402
MADE = ("base", "weight", "arm", "head")  # the parts this project makes, each detailed on a sheet of its own


@eng_drawing(out="../drawings/desk_lamp_drawing.pdf")
def desk_lamp_drawing():
    parts = parts_list(desk_lamp().shape)
    parts.merge("m5x30_screw:base_hinge", "m5x30_screw:head_hinge", description="SCREW, ISO 4762 M5 X 30")
    parts.merge("m5_locknut:base_hinge", "m5_locknut:head_hinge", description="LOCKNUT, NYLON INSERT, M5")
    parts.merge("m3x8_screw:left", "m3x8_screw:right", description="SCREW, ISO 4762 M3 X 8")
    for printed in ("base", "arm", "head"):
        parts.set(printed, material="PETG", family="plastic")
    parts.set("weight", material="MILD STEEL", family="steel")
    parts.set("led_module", description="LED MODULE, ⌀40 (ENVELOPE)")
    parts.add("ADHESIVE, WEIGHT TO BASE (NOT CHOSEN)")
    sheets = assembly_sheets(parts, title="DESK LAMP", part_number="desk-lamp", stage="prototype")
    ga_front = next(view for view in sheets[0].views if view.name == "front")
    ga_front.section("A", through=(0, 0, 0), parts=parts)  # through the hinges' middle: the weight, the LED module and its screws show cut
    ga_front.flag("WEIGHT FLUSH WITH THE BASE'S UNDERSIDE", at=(30, 0, 0), joint="bond")
    detail_base(sheets.part("base"), parts["base"].shape)
    return [sheets[0], *(sheets.part(name) for name in MADE)]  # bought parts are on the parts list, with no sheet


def detail_base(sheet, base):
    """The base's sheet past its first pass: the clevis's cheeks placed, the pocket called out from below, its edges stated."""
    views = {view.name: view for view in sheet.views}  # the first pass draws only the views the part earns
    top, front = views["top"], views["front"]
    radius = DIAMETER / 2
    clevis_back, clevis_front = CLEVIS_X - CLEVIS_LENGTH / 2, CLEVIS_X + CLEVIS_LENGTH / 2
    inner, outer = CHEEK_GAP / 2, CHEEK_GAP / 2 + CHEEK
    top.symmetric("h")  # the clevis's two cheeks mirror about the base's centre line
    top.dim((-radius, 0, 0), (clevis_back, outer, 0), orientation="h")
    top.dim((clevis_back, outer, 0), (clevis_front, outer, 0))
    top.dim((clevis_front, -inner, 0), (clevis_front, inner, 0))
    top.dim((clevis_front, inner, 0), (clevis_front, outer, 0))
    front.section("A", through=(0, 0, 0))
    front.dim((radius, 0, 0), (radius - EDGE_ROUND, 0, HEIGHT), orientation="v")
    front.radius((radius - EDGE_ROUND, 0, HEIGHT - EDGE_ROUND))
    bottom = sheet.view(base, "bottom", at=(455, 150), hidden=False)  # looking up into the weight's pocket
    bottom.hole((0, 0, 0))
    sheet.notes = (*sheet.notes, f"FOOT CHAMFER {FOOT_CHAMFER:g} × 45°.")


if __name__ == "__main__":
    desk_lamp_drawing()
