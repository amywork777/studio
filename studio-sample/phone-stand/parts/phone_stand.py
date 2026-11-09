"""The phone stand: one printed part that holds a phone up to 80 mm wide and 12 mm thick (with its case) leaning
back at ANGLE from the desk, in portrait or landscape. The phone's back lies on the rest and its bottom edge on the
ledge, square to the rest, with the lip in front of it. A charging cable's plug goes down through the slot in the
ledge, and the cable runs along the base and out the back through the pass under the rest.

Its side profile is one sketch, extruded across the stand's width, so it prints lying on its side with nothing to
support: the cable slot's and the cable pass's roofs each bridge 8 mm. Origin: the front edge of the base, on the
desk, halfway across; +Y back from the viewer, +Z up."""

from math import cos, radians, sin

import build123d as bd
from cad import model
from cad.sketch import Sketch

ANGLE = 65.0  # the viewing angle: the phone's tilt back from the desk, degrees
WIDTH = 80.0  # across the stand
BASE_DEPTH = 140.0  # front to back on the desk
BASE_THICKNESS = 6.0
REST_FROM_FRONT = 15.0  # the base's front edge to where the rest's front face meets the base
REST_LENGTH = 110.0  # along the rest's front face, from the base to its top
WALL = 5.0  # the rest's and the lip's thickness
LEDGE_HEIGHT = 40.0  # along the rest, from the base to the ledge the phone stands on
LEDGE_THICKNESS = 5.0
PHONE_SLOT = 14.0  # the slot width: rest to lip, for a phone 12 mm thick in its case and 2 mm to spare
LIP_HEIGHT = 8.0  # above the ledge
CABLE_SLOT_WIDTH = 14.0  # the cable slot through the ledge, across the stand; it runs rest to lip
BRIDGE_CHAMFER = 3.0  # the slot's two corners that print uppermost are cut back this far across the slot,
BRIDGE_CHAMFER_RISE = 4.0  # and this far up, at 53°: self-supporting, so its roof bridges 8 mm, not 14
CABLE_PASS_WIDTH = 10.0  # the cable's way under the rest, across the stand
CABLE_PASS_HEIGHT = 8.0  # above the base
FILLET = 2.0  # every edge of the profile, inside and out


def along_rest(distance: float, out: float = 0.0) -> tuple[float, float]:
    """A point of the profile, in the sketch's (Y, Z): `distance` up the rest's front face from where it meets the
    base, and `out` from that face toward the phone, square to it."""
    c, s = cos(radians(ANGLE)), sin(radians(ANGLE))
    return (REST_FROM_FRONT + distance * c - out * s, BASE_THICKNESS + distance * s + out * c)


@model
def phone_stand():
    c, s = cos(radians(ANGLE)), sin(radians(ANGLE))
    profile = Sketch("Profile", plane="Right")
    (bottom, back, base_top, rest_back, rest_top, rest_front, ledge_top, lip_inside, lip_top, lip_front,
     ledge_bottom, rest_foot, base_front, front) = profile.polyline(
        (0, 0),
        (BASE_DEPTH, 0),
        (BASE_DEPTH, BASE_THICKNESS),
        (REST_FROM_FRONT + WALL / s, BASE_THICKNESS),
        along_rest(REST_LENGTH, -WALL),
        along_rest(REST_LENGTH),
        along_rest(LEDGE_HEIGHT),
        along_rest(LEDGE_HEIGHT, PHONE_SLOT),
        along_rest(LEDGE_HEIGHT + LIP_HEIGHT, PHONE_SLOT),
        along_rest(LEDGE_HEIGHT + LIP_HEIGHT, PHONE_SLOT + WALL),
        along_rest(LEDGE_HEIGHT - LEDGE_THICKNESS, PHONE_SLOT + WALL),
        along_rest(LEDGE_HEIGHT - LEDGE_THICKNESS),
        (REST_FROM_FRONT, BASE_THICKNESS),
        (0, BASE_THICKNESS),
        closed=True,
    )
    profile.coincident(bottom.start, profile.origin)
    profile.horizontal(bottom)
    profile.length(bottom, BASE_DEPTH)
    profile.vertical(back)
    profile.length(back, BASE_THICKNESS)
    profile.horizontal(base_top)
    profile.vertical(front)
    profile.length(front, BASE_THICKNESS)
    profile.horizontal(base_front)
    profile.horizontal_distance(front.end, base_front.start, REST_FROM_FRONT)
    profile.angle(base_front, rest_foot, ANGLE)
    profile.length(rest_foot, LEDGE_HEIGHT - LEDGE_THICKNESS)
    profile.coincident(ledge_top.start, rest_foot)
    profile.distance(rest_foot.start, ledge_top.start, LEDGE_THICKNESS)
    profile.perpendicular(ledge_top, rest_foot)
    profile.length(ledge_top, PHONE_SLOT)
    profile.parallel(lip_inside, rest_foot)
    profile.length(lip_inside, LIP_HEIGHT)
    profile.perpendicular(lip_top, lip_inside)
    profile.length(lip_top, WALL)
    profile.parallel(lip_front, lip_inside)
    profile.length(lip_front, LIP_HEIGHT + LEDGE_THICKNESS)
    profile.coincident(rest_front.start, rest_foot)
    profile.length(rest_front, REST_LENGTH - LEDGE_HEIGHT)
    profile.perpendicular(rest_top, rest_front)
    profile.length(rest_top, WALL)
    profile.parallel(rest_back, rest_front)
    stand = bd.extrude(profile.face(), amount=WIDTH / 2, both=True)
    stand = bd.fillet(stand.edges().filter_by(bd.Axis.X), radius=FILLET)
    # The cable slot, through the ledge in the middle of the stand from the rest's face to the lip: sketched square
    # to the ledge, its corners on the +X side (up, as it prints) cut back at 53° so its roof bridges less.
    slot = Sketch("Cable slot", plane=bd.Plane(origin=(0, *along_rest(LEDGE_HEIGHT - LEDGE_THICKNESS / 2)),
                                               x_dir=(1, 0, 0), z_dir=(0, -c, -s)))
    rest_side, chamfer1, roof, chamfer2, lip_side, far_side = slot.polyline(
        (-CABLE_SLOT_WIDTH / 2, 0),
        (CABLE_SLOT_WIDTH / 2 - BRIDGE_CHAMFER_RISE, 0),
        (CABLE_SLOT_WIDTH / 2, BRIDGE_CHAMFER),
        (CABLE_SLOT_WIDTH / 2, PHONE_SLOT - BRIDGE_CHAMFER),
        (CABLE_SLOT_WIDTH / 2 - BRIDGE_CHAMFER_RISE, PHONE_SLOT),
        (-CABLE_SLOT_WIDTH / 2, PHONE_SLOT),
        closed=True,
    )
    slot.horizontal(rest_side)
    slot.coincident(slot.origin, rest_side)
    slot.horizontal_distance(slot.origin, rest_side.start, CABLE_SLOT_WIDTH / 2)
    slot.vertical(far_side)
    slot.length(far_side, PHONE_SLOT)
    slot.horizontal(lip_side)
    slot.vertical(roof)
    slot.horizontal_distance(rest_side.start, roof.start, CABLE_SLOT_WIDTH)
    slot.horizontal_distance(chamfer1.start, roof.start, BRIDGE_CHAMFER_RISE)
    slot.vertical_distance(chamfer1.start, roof.start, BRIDGE_CHAMFER)
    slot.vertical_distance(roof.end, lip_side.start, BRIDGE_CHAMFER)
    slot.horizontal_distance(lip_side.start, roof.end, BRIDGE_CHAMFER_RISE)
    stand -= bd.extrude(slot.face(), amount=1.5 * LEDGE_THICKNESS, both=True)  # Cable slot
    # The cable's way under the rest, along the base, from the plug's side to the back.
    stand -= (bd.Pos(0, REST_FROM_FRONT + WALL / s / 2 + CABLE_PASS_HEIGHT / 2 * c / s, BASE_THICKNESS)
              * bd.Box(CABLE_PASS_WIDTH, 2 * WALL / s + CABLE_PASS_HEIGHT, CABLE_PASS_HEIGHT,
                       align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN)))  # Cable pass

    stand.color = "#C9B8E8"
    stand.label = "phone_stand"
    return stand


if __name__ == "__main__":
    phone_stand()
