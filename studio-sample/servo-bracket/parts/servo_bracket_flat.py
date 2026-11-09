"""The servo bracket's flat pattern: the blank cut from 2 mm 5052-H32 and bent once, 90 degrees, along the bend line
at Y = 0. The bend takes BEND_ALLOWANCE of sheet, worked out from SendCutSend's inside radius and k-factor for this
sheet (servo_bracket.py); each feature sits as far from the bend as it does on the bent bracket. The shelf is +Y of the
bend line and the flange -Y, both seen from the bracket's outside face. The cut file draws the bend line."""

from math import pi

import build123d as bd
from cad import model
from cad.sketch import Sketch

from servo_bracket import (
    BEND_RADIUS,
    CORNER,
    CUTOUT_CORNER,
    CUTOUT_FROM_WALL,
    FLANGE_HEIGHT,
    K_FACTOR,
    SERVO_CLEARANCE,
    SERVO_Y,
    SHELF_DEPTH,
    TAP_DRILL,
    THICKNESS,
    WALL_HOLE,
    WALL_HOLE_DROP,
    WALL_HOLE_SPACING,
    WIDTH,
)
from sizes import SERVO_LENGTH, SERVO_TAB_HOLE_ACROSS, SERVO_TAB_HOLE_SPACING, SERVO_WIDTH

BEND_ALLOWANCE = pi / 2 * (BEND_RADIUS + K_FACTOR * THICKNESS)  # the sheet the bend takes, along its neutral line
SETBACK = BEND_RADIUS + THICKNESS  # the bracket's outside corner to where the bend starts on either face
SHELF_FLAT = SHELF_DEPTH - SETBACK  # the shelf beyond the bend
FLANGE_FLAT = FLANGE_HEIGHT - SETBACK  # the flange beyond the bend


@model
def servo_bracket_flat():
    blank = Sketch("Blank", plane="Top")
    flange_edge, end1, shelf_edge, end2 = blank.rectangle(
        (-WIDTH / 2, -(BEND_ALLOWANCE / 2 + FLANGE_FLAT)), (WIDTH / 2, BEND_ALLOWANCE / 2 + SHELF_FLAT)
    )
    blank.length(flange_edge, WIDTH)
    blank.horizontal_distance(flange_edge.start, blank.origin, WIDTH / 2)
    blank.vertical_distance(blank.origin, shelf_edge.start, BEND_ALLOWANCE / 2 + SHELF_FLAT)
    blank.vertical_distance(flange_edge.start, blank.origin, BEND_ALLOWANCE / 2 + FLANGE_FLAT)
    blank.fillet(flange_edge, end1, CORNER)
    blank.fillet(end1, shelf_edge, CORNER)
    blank.fillet(shelf_edge, end2, CORNER)
    blank.fillet(end2, flange_edge, CORNER)

    back, end3, front, end4 = blank.rectangle(
        (-(SERVO_LENGTH / 2 + SERVO_CLEARANCE), BEND_ALLOWANCE / 2 + CUTOUT_FROM_WALL - SETBACK),
        (SERVO_LENGTH / 2 + SERVO_CLEARANCE, BEND_ALLOWANCE / 2 + CUTOUT_FROM_WALL - SETBACK + SERVO_WIDTH + 2 * SERVO_CLEARANCE),
    )
    blank.length(back, SERVO_LENGTH + 2 * SERVO_CLEARANCE)
    blank.length(end3, SERVO_WIDTH + 2 * SERVO_CLEARANCE)
    blank.horizontal_distance(back.start, blank.origin, SERVO_LENGTH / 2 + SERVO_CLEARANCE)
    blank.vertical_distance(blank.origin, back.start, BEND_ALLOWANCE / 2 + CUTOUT_FROM_WALL - SETBACK)
    blank.fillet(back, end3, CUTOUT_CORNER)
    blank.fillet(end3, front, CUTOUT_CORNER)
    blank.fillet(front, end4, CUTOUT_CORNER)
    blank.fillet(end4, back, CUTOUT_CORNER)

    hole1 = blank.circle((SERVO_TAB_HOLE_SPACING / 2, BEND_ALLOWANCE / 2 + SERVO_Y - SETBACK + SERVO_TAB_HOLE_ACROSS / 2), TAP_DRILL / 2)
    blank.diameter(hole1, TAP_DRILL)
    blank.horizontal_distance(blank.origin, hole1.center, SERVO_TAB_HOLE_SPACING / 2)
    blank.vertical_distance(blank.origin, hole1.center, BEND_ALLOWANCE / 2 + SERVO_Y - SETBACK + SERVO_TAB_HOLE_ACROSS / 2)
    hole2 = blank.circle((SERVO_TAB_HOLE_SPACING / 2, BEND_ALLOWANCE / 2 + SERVO_Y - SETBACK - SERVO_TAB_HOLE_ACROSS / 2), TAP_DRILL / 2)
    blank.diameter(hole2, TAP_DRILL)
    blank.horizontal_distance(blank.origin, hole2.center, SERVO_TAB_HOLE_SPACING / 2)
    blank.vertical_distance(blank.origin, hole2.center, BEND_ALLOWANCE / 2 + SERVO_Y - SETBACK - SERVO_TAB_HOLE_ACROSS / 2)
    hole3 = blank.circle((-SERVO_TAB_HOLE_SPACING / 2, BEND_ALLOWANCE / 2 + SERVO_Y - SETBACK + SERVO_TAB_HOLE_ACROSS / 2), TAP_DRILL / 2)
    blank.diameter(hole3, TAP_DRILL)
    blank.horizontal_distance(hole3.center, blank.origin, SERVO_TAB_HOLE_SPACING / 2)
    blank.vertical_distance(blank.origin, hole3.center, BEND_ALLOWANCE / 2 + SERVO_Y - SETBACK + SERVO_TAB_HOLE_ACROSS / 2)
    hole4 = blank.circle((-SERVO_TAB_HOLE_SPACING / 2, BEND_ALLOWANCE / 2 + SERVO_Y - SETBACK - SERVO_TAB_HOLE_ACROSS / 2), TAP_DRILL / 2)
    blank.diameter(hole4, TAP_DRILL)
    blank.horizontal_distance(hole4.center, blank.origin, SERVO_TAB_HOLE_SPACING / 2)
    blank.vertical_distance(blank.origin, hole4.center, BEND_ALLOWANCE / 2 + SERVO_Y - SETBACK - SERVO_TAB_HOLE_ACROSS / 2)

    hole5 = blank.circle((WALL_HOLE_SPACING / 2, -(BEND_ALLOWANCE / 2 + WALL_HOLE_DROP - SETBACK)), WALL_HOLE / 2)
    blank.diameter(hole5, WALL_HOLE)
    blank.horizontal_distance(blank.origin, hole5.center, WALL_HOLE_SPACING / 2)
    blank.vertical_distance(hole5.center, blank.origin, BEND_ALLOWANCE / 2 + WALL_HOLE_DROP - SETBACK)
    hole6 = blank.circle((-WALL_HOLE_SPACING / 2, -(BEND_ALLOWANCE / 2 + WALL_HOLE_DROP - SETBACK)), WALL_HOLE / 2)
    blank.diameter(hole6, WALL_HOLE)
    blank.horizontal_distance(hole6.center, blank.origin, WALL_HOLE_SPACING / 2)
    blank.vertical_distance(hole6.center, blank.origin, BEND_ALLOWANCE / 2 + WALL_HOLE_DROP - SETBACK)
    flat = bd.extrude(blank.face(), amount=THICKNESS)

    flat.color = "#B9BFC6"
    flat.label = "servo_bracket_flat"
    return flat


if __name__ == "__main__":
    servo_bracket_flat()
