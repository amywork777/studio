"""The weight: a mild steel disc in the pocket under the base, bonded in, which keeps the lamp from tipping with its arm
out. Sawn from Ø90 bar and faced to thickness. Origin: the centre of its underside; +Z up."""

import build123d as bd
from cad import model
from cad.sketch import Sketch

from sizes import WEIGHT_DIAMETER, WEIGHT_THICKNESS

EDGE_CHAMFER = 0.5  # both faces' outer edges, deburred


@model
def weight():
    disc = Sketch("Disc", plane="Top")
    rim = disc.circle(disc.origin, WEIGHT_DIAMETER / 2)
    disc.diameter(rim, WEIGHT_DIAMETER)
    plate = bd.extrude(disc.face(), amount=WEIGHT_THICKNESS)

    plate = bd.chamfer(plate.edges().filter_by(bd.GeomType.CIRCLE), length=EDGE_CHAMFER)

    plate.color = "#C0C0C0"
    plate.label = "weight"
    return plate


if __name__ == "__main__":
    weight()
