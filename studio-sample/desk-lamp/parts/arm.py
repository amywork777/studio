"""The arm: one PETG link from the base's hinge to the head's, printed flat. Its rounded ends turn between the cheeks of
the base's clevis and the head's yoke, each on an M5 screw whose clamp holds the arm where it is set. A slot along its
middle lightens it and takes the LED's lead. Origin: the base hinge's axis; the arm runs along +X to the head's hinge,
its thickness along Y."""

import build123d as bd
from cad import model
from cad.sketch import Sketch

from sizes import ARM_LENGTH, ARM_WIDTH, HINGE_HOLE, TONGUE

SLOT_WIDTH = 6.0  # the lead's slot along the middle
SLOT_FROM_HINGE = 30.0  # where the slot starts and ends, from each hinge's axis
EDGE_CHAMFER = 0.6  # every edge of both flat faces


@model
def arm():
    outline = Sketch("Outline", plane="Front")
    outline.slot(outline.origin, (ARM_LENGTH, 0), ARM_WIDTH / 2)
    hole1 = outline.circle(outline.origin, HINGE_HOLE / 2)
    outline.diameter(hole1, HINGE_HOLE)
    hole2 = outline.circle((ARM_LENGTH, 0), HINGE_HOLE / 2)
    outline.diameter(hole2, HINGE_HOLE)
    link = bd.extrude(outline.face(), amount=TONGUE / 2, both=True)

    lead = Sketch("Lead slot", plane="Front")
    lead.slot((SLOT_FROM_HINGE, 0), (ARM_LENGTH - SLOT_FROM_HINGE, 0), SLOT_WIDTH / 2)
    link -= bd.extrude(lead.face(), amount=TONGUE, both=True)

    link = bd.chamfer(link.faces().filter_by(bd.Axis.Y).sort_by(bd.Axis.Y)[-1].outer_wire().edges() + link.faces().filter_by(bd.Axis.Y).sort_by(bd.Axis.Y)[0].outer_wire().edges(), length=EDGE_CHAMFER)

    link.color = "#D9DDE2"
    link.label = "arm"
    return link


if __name__ == "__main__":
    arm()
