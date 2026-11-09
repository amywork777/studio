"""The horn adapter: a disc machined from 6061-T6 that goes on the MG996R's output in place of a plastic horn, held by
the servo's horn screw, with four M3 tapped holes to bolt an arm or a load to. Its bore is broached to the servo's
25-tooth spline after milling; it is modeled at the spline's tip diameter. Origin: the centre of its underside, +Z up
the servo's output axis."""

import build123d as bd
from cad import model
from cad.sketch import Sketch

from sizes import SERVO_SPLINE

DIAMETER = 24.0
THICKNESS = 8.0
SPLINE_DEPTH = 4.0  # how far the spline goes into the adapter
HORN_SCREW = 3.4  # clearance for the servo's M3 horn screw
HORN_SCREW_HEAD = 6.5  # its counterbore
HORN_SCREW_HEAD_DEPTH = 2.5
BOLT_CIRCLE = 16.0  # the four tapped holes
TAP_DRILL = 2.5  # M3x0.5
CHAMFER = 0.5  # the top edge


@model
def horn_adapter():
    disc = Sketch("Disc", plane="Top")
    rim = disc.circle(disc.origin, DIAMETER / 2)
    disc.diameter(rim, DIAMETER)
    adapter = bd.extrude(disc.face(), amount=THICKNESS)

    bore = Sketch("Spline bore", plane="Top")
    spline = bore.circle(bore.origin, SERVO_SPLINE / 2)
    bore.diameter(spline, SERVO_SPLINE)
    adapter -= bd.extrude(bore.face(), amount=SPLINE_DEPTH)  # 25T spline, broached

    screw = Sketch("Horn screw", plane="Top")
    shank = screw.circle(screw.origin, HORN_SCREW / 2)
    screw.diameter(shank, HORN_SCREW)
    adapter -= bd.extrude(screw.face(), amount=adapter.bounding_box().diagonal)

    head = Sketch("Horn screw head", plane="Top", offset=THICKNESS)
    counterbore = head.circle(head.origin, HORN_SCREW_HEAD / 2)
    head.diameter(counterbore, HORN_SCREW_HEAD)
    adapter -= bd.extrude(head.face(), amount=-HORN_SCREW_HEAD_DEPTH)

    tapped = Sketch("Tapped holes", plane="Top")
    radius = tapped.line(tapped.origin, (BOLT_CIRCLE / 2, 0), construction=True)
    tapped.horizontal(radius)
    tapped.length(radius, BOLT_CIRCLE / 2)
    hole1 = tapped.circle(radius.end, TAP_DRILL / 2)
    tapped.diameter(hole1, TAP_DRILL)
    tapped.circular_pattern([hole1], tapped.origin, 4)
    adapter -= bd.extrude(tapped.faces(), amount=adapter.bounding_box().diagonal)  # M3x0.5 tapped hole

    adapter = bd.chamfer(adapter.faces().sort_by(bd.Axis.Z)[-1].outer_wire().edges(), length=CHAMFER)

    adapter.color = "#8E99A6"
    adapter.label = "horn_adapter"
    return adapter


if __name__ == "__main__":
    horn_adapter()
