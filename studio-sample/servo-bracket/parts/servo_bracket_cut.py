"""The servo bracket's cut file: its flat pattern as a DXF, ready to laser or waterjet cut, with the bend line on a layer
of its own. The outline is the flat pattern's outside face (servo_bracket_flat.py), moved down onto the XY plane so it
keeps the flat pattern's own coordinates: the holes stay circles, the corners arcs, and the bend's centre stays on Y = 0.
The bend line marks that centre and runs right across the blank, on a solid BEND layer: each layer is a part of the
model, named by its label, and `cad run exports.py` writes the DXF. text-to-cad's DXF export writes every layer Continuous,
where SendCutSend asks for a dashed bend line in a DXF (cut/servo_bracket_sendcutsend.md). Drawn at true size: the
cutter's own kerf compensation applies."""

import build123d as bd
from cad import model
from cad.build123d import offset_profile, planar_faces, union_faces

from servo_bracket import THICKNESS, WIDTH
from servo_bracket_flat import servo_bracket_flat

KERF = 0.0  # true size


@model
def servo_bracket_cut():
    outside = planar_faces(
        servo_bracket_flat().shape, normal_axis="z", normal_sign=1.0, coordinate_axis="z", coordinate=THICKNESS
    )
    outline = offset_profile(union_faces([bd.Location((0, 0, -THICKNESS)) * face for face in outside]), KERF)
    bend = bd.Edge.make_line((-WIDTH / 2, 0), (WIDTH / 2, 0))  # the bend's centre line, edge to edge
    outline.label = "CUT"
    bend = bd.Compound([bend], label="BEND")
    return bd.Compound(children=[outline, bend], label="servo_bracket_cut")


if __name__ == "__main__":
    servo_bracket_cut()
