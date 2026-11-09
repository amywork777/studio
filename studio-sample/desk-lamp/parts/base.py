"""The lamp's base: a round PETG print that stands on the desk, with a pocket underneath for the steel weight and a
clevis on top whose two cheeks clamp the arm's lower end on an M5 screw. The clevis stands behind the centre so the arm
leans forward over the base. Origin: the centre of its underside, on the desk; +Z up, the hinge's axis along Y."""

import build123d as bd
from cad import model
from cad.sketch import Sketch

from sizes import CHEEK, CHEEK_GAP, HINGE_HOLE, WEIGHT_DIAMETER, WEIGHT_THICKNESS

DIAMETER = 120.0
HEIGHT = 18.0
EDGE_ROUND = 4.0  # the top's outer edge
FOOT_CHAMFER = 0.6  # the underside's outer edge, against the first layer's squash
POCKET_CLEARANCE = 0.2  # on the weight's diameter
CLEVIS_X = -30.0  # the hinge's axis, behind the centre
HINGE_HEIGHT = 30.0  # the hinge's axis above the base's top
CLEVIS_LENGTH = 22.0  # each cheek along X; its top is rounded to half this about the hinge


@model
def base():
    disc = Sketch("Disc", plane="Top")
    rim = disc.circle(disc.origin, DIAMETER / 2)
    disc.diameter(rim, DIAMETER)
    body = bd.extrude(disc.face(), amount=HEIGHT)

    body = bd.fillet(body.faces().sort_by(bd.Axis.Z)[-1].outer_wire().edges(), radius=EDGE_ROUND)
    body = bd.chamfer(body.faces().sort_by(bd.Axis.Z)[0].outer_wire().edges(), length=FOOT_CHAMFER)

    pocket = Sketch("Weight pocket", plane="Top")
    bore = pocket.circle(pocket.origin, (WEIGHT_DIAMETER + POCKET_CLEARANCE) / 2)
    pocket.diameter(bore, WEIGHT_DIAMETER + POCKET_CLEARANCE)
    body -= bd.extrude(pocket.face(), amount=WEIGHT_THICKNESS)

    cheek_y = (CHEEK_GAP + CHEEK) / 2
    cheek = bd.Pos(CLEVIS_X, cheek_y, HEIGHT + HINGE_HEIGHT / 2) * bd.Box(CLEVIS_LENGTH, CHEEK, HINGE_HEIGHT)
    cheek += bd.Pos(CLEVIS_X, cheek_y, HEIGHT + HINGE_HEIGHT) * bd.Rot(90, 0, 0) * bd.Cylinder(CLEVIS_LENGTH / 2, CHEEK)
    body += cheek  # Clevis cheek
    body += bd.mirror(cheek, about=bd.Plane.XZ)

    body -= bd.Pos(CLEVIS_X, 0, HEIGHT + HINGE_HEIGHT) * bd.Rot(90, 0, 0) * bd.Cylinder(HINGE_HOLE / 2, 2 * (CHEEK_GAP + 2 * CHEEK))  # M5 clearance hole

    body.color = "#C8C8C8"
    body.label = "base"
    return body


if __name__ == "__main__":
    base()
