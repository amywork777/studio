"""The shelf bracket's cut file: its flat pattern as a DXF, ready to laser cut, with the two bend lines on a layer of
their own. The outline is the flat pattern's outside face (shelf_bracket_flat.py), moved down onto the XY plane so it
keeps the flat pattern's own coordinates: the holes stay circles, the corners arcs. Each bend line marks its bend's
centre and runs right across the flange it bends, from the corner relief to the far edge. Each layer is a part of
the model, named by its label; `cad run exports.py` writes the DXF. text-to-cad's DXF export writes every layer Continuous,
so the BEND layer is solid where SendCutSend asks for a dashed bend line in a DXF (cut/shelf_bracket_sendcutsend.md):
the order goes as the STEP, which needs no bend line, and this file is the fallback. Drawn at true size: the cutter's
own kerf compensation applies."""

import build123d as bd
from cad import model
from cad.build123d import offset_profile, planar_faces, union_faces

from shelf_bracket import ARM_LENGTH, CORNER_RELIEF, LEG_HEIGHT, THICKNESS
from shelf_bracket_flat import SHELF_BEND, WALL_BEND, shelf_bracket_flat

KERF = 0.0  # true size


@model
def shelf_bracket_cut():
    outside = planar_faces(
        shelf_bracket_flat().shape, normal_axis="z", normal_sign=1.0, coordinate_axis="z", coordinate=THICKNESS
    )
    outline = offset_profile(union_faces([bd.Location((0, 0, -THICKNESS)) * face for face in outside]), KERF)
    shelf_bend = bd.Edge.make_line((CORNER_RELIEF, SHELF_BEND), (ARM_LENGTH, SHELF_BEND))  # relief to the tip
    wall_bend = bd.Edge.make_line((WALL_BEND, -CORNER_RELIEF), (WALL_BEND, -LEG_HEIGHT))  # relief to the foot
    outline.label = "CUT"
    bends = bd.Compound([shelf_bend, wall_bend], label="BEND")
    return bd.Compound(children=[outline, bends], label="shelf_bracket_cut")


if __name__ == "__main__":
    shelf_bracket_cut()
