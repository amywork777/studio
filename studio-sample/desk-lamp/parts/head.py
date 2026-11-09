"""The lamp's head: a PETG shade, open underneath, that holds the LED module on two bosses in its ceiling, with a ring
of vents above the board. A yoke on its back, two cheeks either side of the arm, turns on the arm's upper end on an M5
screw, whose clamp holds the head where it is tilted. Origin: the head hinge's axis, along Y; the shade hangs in front
of it along +X, its opening down (-Z)."""

import build123d as bd
from cad import model

from sizes import CHEEK, CHEEK_GAP, HINGE_HOLE, LED_SCREW_SPACING

SHADE_DIAMETER = 70.0
SHADE_HEIGHT = 40.0
SHADE_FROM_HINGE = 49.0  # the shade's axis in front of the hinge's
SHADE_TOP = 10.0  # the shade's top above the hinge's axis
WALL = 2.4
CEILING = 3.0
TOP_ROUND = 3.0  # the top's outer edge
YOKE_HEIGHT = 18.0  # each cheek of the yoke, rounded to half this about the hinge
BOSS = 7.0  # the two bosses the LED board screws to
BOSS_LENGTH = 6.0  # down from the ceiling
PILOT = 2.5  # for the M3 screws to cut their thread in
PILOT_DEPTH = 8.0
VENT = 5.0
VENT_CIRCLE = 52.0  # outside the LED board
VENTS = 8


@model
def head():
    shade = bd.Pos(SHADE_FROM_HINGE, 0, SHADE_TOP - SHADE_HEIGHT / 2) * bd.Cylinder(SHADE_DIAMETER / 2, SHADE_HEIGHT)
    shade = bd.fillet(shade.faces().sort_by(bd.Axis.Z)[-1].outer_wire().edges(), radius=TOP_ROUND)

    cheek_y = (CHEEK_GAP + CHEEK) / 2
    reach = SHADE_FROM_HINGE - SHADE_DIAMETER / 2 + WALL  # from the hinge into the shade's wall
    cheek = bd.Pos(reach / 2, cheek_y, 0) * bd.Box(reach, CHEEK, YOKE_HEIGHT)
    cheek += bd.Pos(0, cheek_y, 0) * bd.Rot(90, 0, 0) * bd.Cylinder(YOKE_HEIGHT / 2, CHEEK)
    shade += cheek  # Yoke cheek
    shade += bd.mirror(cheek, about=bd.Plane.XZ)

    ceiling_z = SHADE_TOP - CEILING
    shade -= bd.Pos(SHADE_FROM_HINGE, 0, SHADE_TOP - SHADE_HEIGHT) * bd.Cylinder(SHADE_DIAMETER / 2 - WALL, SHADE_HEIGHT - CEILING, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))  # Cavity

    shade += [bd.Pos(SHADE_FROM_HINGE + x, 0, ceiling_z) * bd.Cylinder(BOSS / 2, BOSS_LENGTH, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MAX)) for x in (-LED_SCREW_SPACING / 2, LED_SCREW_SPACING / 2)]  # LED bosses
    shade -= [bd.Pos(SHADE_FROM_HINGE + x, 0, ceiling_z - BOSS_LENGTH) * bd.Cylinder(PILOT / 2, PILOT_DEPTH, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN)) for x in (-LED_SCREW_SPACING / 2, LED_SCREW_SPACING / 2)]  # M3 pilot holes
    shade -= [bd.Pos(SHADE_FROM_HINGE, 0, ceiling_z) * loc * bd.Cylinder(VENT / 2, 3 * CEILING) for loc in bd.PolarLocations(VENT_CIRCLE / 2, VENTS, start_angle=360 / VENTS / 2)]  # Vents

    shade -= bd.Rot(90, 0, 0) * bd.Cylinder(HINGE_HOLE / 2, 2 * (CHEEK_GAP + 2 * CHEEK))  # M5 clearance hole

    shade.color = "#E07A3F"
    shade.label = "head"
    return shade


if __name__ == "__main__":
    head()
