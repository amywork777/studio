"""The shelf bracket's flat pattern: the blank cut from G90-074 and bent twice, 90 degrees each way the same side, at
the two bend lines. Each bend takes BEND_ALLOWANCE of sheet, worked out from SendCutSend's inside radius and K-factor
for this sheet (shelf_bracket.py); every feature sits as far from its bend as it does on the bent bracket. Seen from
the web's outside face, in the bracket's own Y and Z: the web where it is on the bracket, the shelf flange unfolded up
past the shelf bend at Z = SHELF_BEND, and the wall flange unfolded back past the wall bend at Y = WALL_BEND. The corner
relief is the notch where the two flanges' ends meet. The cut file draws the bend lines."""

from math import pi

import build123d as bd
from cad import model
from cad.sketch import Sketch

from shelf_bracket import (
    ARM_LENGTH,
    BEND_RADIUS,
    CORNER,
    CORNER_RELIEF,
    FLANGE_WIDTH,
    FOOT_WIDTH,
    HOLE_INSET,
    K_FACTOR,
    LEG_HEIGHT,
    RELIEF_CORNER,
    SHELF_HOLE,
    SHELF_HOLE_FIRST,
    SHELF_HOLE_SPACING,
    THICKNESS,
    TIP_DEPTH,
    WALL_HOLE,
    WALL_HOLE_SPACING,
    WALL_HOLE_TOP,
    WEB_CORNER,
)

BEND_ALLOWANCE = pi / 2 * (BEND_RADIUS + K_FACTOR * THICKNESS)  # the sheet each bend takes, along its neutral line
SETBACK = BEND_RADIUS + THICKNESS  # an outside face to where its bend starts on the other face's side
FLANGE_FLAT = FLANGE_WIDTH - SETBACK  # each flange beyond its bend
SHELF_EDGE = -SETBACK + BEND_ALLOWANCE + FLANGE_FLAT  # the shelf flange's free edge, unfolded (+Z)
WALL_EDGE = SETBACK - BEND_ALLOWANCE - FLANGE_FLAT  # the wall flange's free edge, unfolded (-Y)
HOLE_FROM_EDGE = FLANGE_WIDTH - HOLE_INSET  # a flange's free edge to its holes' centres
SHELF_BEND = -SETBACK + BEND_ALLOWANCE / 2  # the shelf bend's centre line, in Z
WALL_BEND = SETBACK - BEND_ALLOWANCE / 2  # the wall bend's centre line, in Y


@model
def shelf_bracket_flat():
    blank = Sketch("Blank", plane="Top")
    relief_side, shelf_edge, tip, brace, bottom, wall_edge, relief_end = blank.polyline(
        (CORNER_RELIEF, -CORNER_RELIEF), (CORNER_RELIEF, SHELF_EDGE), (ARM_LENGTH, SHELF_EDGE), (ARM_LENGTH, -TIP_DEPTH),
        (FOOT_WIDTH, -LEG_HEIGHT), (WALL_EDGE, -LEG_HEIGHT), (WALL_EDGE, -CORNER_RELIEF), closed=True,
    )
    blank.vertical(relief_side)
    blank.horizontal(shelf_edge)
    blank.vertical(tip)
    blank.horizontal(bottom)
    blank.vertical(wall_edge)
    blank.horizontal(relief_end)
    blank.horizontal_distance(blank.origin, relief_side.start, CORNER_RELIEF)
    blank.vertical_distance(relief_side.start, blank.origin, CORNER_RELIEF)
    blank.vertical_distance(blank.origin, shelf_edge.start, SHELF_EDGE)
    blank.horizontal_distance(blank.origin, tip.start, ARM_LENGTH)
    blank.vertical_distance(tip.end, blank.origin, TIP_DEPTH)
    blank.horizontal_distance(blank.origin, bottom.start, FOOT_WIDTH)
    blank.vertical_distance(bottom.start, blank.origin, LEG_HEIGHT)
    blank.horizontal_distance(wall_edge.start, blank.origin, -WALL_EDGE)
    blank.fillet(relief_end, relief_side, RELIEF_CORNER)
    blank.fillet(relief_side, shelf_edge, CORNER)
    blank.fillet(shelf_edge, tip, CORNER)
    blank.fillet(tip, brace, WEB_CORNER)
    blank.fillet(brace, bottom, WEB_CORNER)
    blank.fillet(bottom, wall_edge, CORNER)
    blank.fillet(wall_edge, relief_end, CORNER)

    hole1 = blank.circle((SHELF_HOLE_FIRST, SHELF_EDGE - HOLE_FROM_EDGE), SHELF_HOLE / 2)
    blank.diameter(hole1, SHELF_HOLE)
    blank.horizontal_distance(blank.origin, hole1.center, SHELF_HOLE_FIRST)
    blank.vertical_distance(hole1.center, shelf_edge.start, HOLE_FROM_EDGE)
    hole2 = blank.circle((SHELF_HOLE_FIRST + SHELF_HOLE_SPACING, SHELF_EDGE - HOLE_FROM_EDGE), SHELF_HOLE / 2)
    blank.diameter(hole2, SHELF_HOLE)
    blank.horizontal_distance(hole1.center, hole2.center, SHELF_HOLE_SPACING)
    blank.vertical_distance(hole2.center, shelf_edge.start, HOLE_FROM_EDGE)

    hole3 = blank.circle((WALL_EDGE + HOLE_FROM_EDGE, -WALL_HOLE_TOP), WALL_HOLE / 2)
    blank.diameter(hole3, WALL_HOLE)
    blank.horizontal_distance(wall_edge.start, hole3.center, HOLE_FROM_EDGE)
    blank.vertical_distance(hole3.center, blank.origin, WALL_HOLE_TOP)
    hole4 = blank.circle((WALL_EDGE + HOLE_FROM_EDGE, -(WALL_HOLE_TOP + WALL_HOLE_SPACING)), WALL_HOLE / 2)
    blank.diameter(hole4, WALL_HOLE)
    blank.horizontal_distance(wall_edge.start, hole4.center, HOLE_FROM_EDGE)
    blank.vertical_distance(hole4.center, hole3.center, WALL_HOLE_SPACING)
    flat = bd.extrude(blank.face(), amount=THICKNESS)

    flat.color = "#A9B0B6"
    flat.label = "shelf_bracket_flat"
    return flat


if __name__ == "__main__":
    shelf_bracket_flat()
