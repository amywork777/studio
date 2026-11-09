"""The servo bracket: an L bent from 2 mm 5052-H32 sheet that holds an MG996R horn up. The servo drops into the
shelf's cutout with its tabs on the shelf, held by four M3 screws in tapped holes; the flange fixes the bracket to a
wall with two M4 screws. The bend is drawn at SendCutSend's inside radius for this sheet, and the flat pattern
(servo_bracket_flat.py) is developed with their k-factor. Origin: the outside corner of the bend, halfway along it;
+Y out from the wall, +Z up, the shelf's top face at Z = 0 and the flange's back face at Y = 0."""

import build123d as bd
from cad import model
from cad.sketch import Sketch

from sizes import SERVO_LENGTH, SERVO_TAB_HOLE_ACROSS, SERVO_TAB_HOLE_SPACING, SERVO_WIDTH

THICKNESS = 2.0  # 5052-H32 sheet
BEND_RADIUS = 0.965  # inside: SendCutSend's 0.038 in for 0.080 in 5052 (sendcutsend-specs.json, ALU-080)
K_FACTOR = 0.48  # SendCutSend's for the same sheet, for the flat pattern
WIDTH = 64.0  # along the bend
SHELF_DEPTH = 40.0  # wall face to the shelf's front edge, outside
FLANGE_HEIGHT = 32.0  # shelf top to the flange's bottom edge, outside
CUTOUT_FROM_WALL = 12.0  # wall face to the back edge of the servo's cutout
SERVO_CLEARANCE = 0.3  # around the servo's case in the cutout
CUTOUT_CORNER = 0.5  # the cutout's corner radius
TAP_DRILL = 2.5  # the servo screws' M3x0.5 tapped holes
WALL_HOLE = 4.5  # M4 clearance, to fix the bracket to a wall
WALL_HOLE_SPACING = 52.0
WALL_HOLE_DROP = 16.0  # shelf top to the wall holes' centres
CORNER = 3.0  # the outside corners' radius

SERVO_Y = CUTOUT_FROM_WALL + SERVO_CLEARANCE + SERVO_WIDTH / 2  # wall face to the servo's centre line


@model
def servo_bracket():
    profile = Sketch("Profile", plane="Right")
    shelf, flange = profile.polyline((SHELF_DEPTH, 0), (0, 0), (0, -FLANGE_HEIGHT))
    profile.coincident(shelf.end, profile.origin)
    profile.horizontal(shelf)
    profile.vertical(flange)
    profile.length(shelf, SHELF_DEPTH)
    profile.length(flange, FLANGE_HEIGHT)
    bracket = bd.extrude(profile.thin(THICKNESS, side="outside"), amount=WIDTH / 2, both=True)  # under the shelf line, in front of the flange line
    bracket = bd.fillet(bracket.edges().filter_by(bd.Axis.X).group_by(bd.Axis.Y)[0].sort_by(bd.Axis.Z)[-1], radius=BEND_RADIUS + THICKNESS)  # Bend, outside
    bracket = bd.fillet(bracket.edges().filter_by(bd.Axis.X).group_by(bd.Axis.Y)[1].sort_by(bd.Axis.Z)[-1], radius=BEND_RADIUS)  # Bend, inside

    cutout = Sketch("Servo cutout", plane="Top")
    back, end1, front, end2 = cutout.rectangle(
        (-(SERVO_LENGTH / 2 + SERVO_CLEARANCE), CUTOUT_FROM_WALL),
        (SERVO_LENGTH / 2 + SERVO_CLEARANCE, CUTOUT_FROM_WALL + SERVO_WIDTH + 2 * SERVO_CLEARANCE),
    )
    cutout.length(back, SERVO_LENGTH + 2 * SERVO_CLEARANCE)
    cutout.length(end1, SERVO_WIDTH + 2 * SERVO_CLEARANCE)
    cutout.horizontal_distance(back.start, cutout.origin, SERVO_LENGTH / 2 + SERVO_CLEARANCE)
    cutout.vertical_distance(cutout.origin, back.start, CUTOUT_FROM_WALL)
    cutout.fillet(back, end1, CUTOUT_CORNER)
    cutout.fillet(end1, front, CUTOUT_CORNER)
    cutout.fillet(front, end2, CUTOUT_CORNER)
    cutout.fillet(end2, back, CUTOUT_CORNER)
    bracket -= bd.extrude(cutout.face(), amount=-bracket.bounding_box().diagonal)

    screws = Sketch("Servo screw holes", plane="Top")
    hole1 = screws.circle((SERVO_TAB_HOLE_SPACING / 2, SERVO_Y + SERVO_TAB_HOLE_ACROSS / 2), TAP_DRILL / 2)
    screws.diameter(hole1, TAP_DRILL)
    screws.horizontal_distance(screws.origin, hole1.center, SERVO_TAB_HOLE_SPACING / 2)
    screws.vertical_distance(screws.origin, hole1.center, SERVO_Y + SERVO_TAB_HOLE_ACROSS / 2)
    hole2 = screws.circle((SERVO_TAB_HOLE_SPACING / 2, SERVO_Y - SERVO_TAB_HOLE_ACROSS / 2), TAP_DRILL / 2)
    screws.diameter(hole2, TAP_DRILL)
    screws.horizontal_distance(screws.origin, hole2.center, SERVO_TAB_HOLE_SPACING / 2)
    screws.vertical_distance(screws.origin, hole2.center, SERVO_Y - SERVO_TAB_HOLE_ACROSS / 2)
    hole3 = screws.circle((-SERVO_TAB_HOLE_SPACING / 2, SERVO_Y + SERVO_TAB_HOLE_ACROSS / 2), TAP_DRILL / 2)
    screws.diameter(hole3, TAP_DRILL)
    screws.horizontal_distance(hole3.center, screws.origin, SERVO_TAB_HOLE_SPACING / 2)
    screws.vertical_distance(screws.origin, hole3.center, SERVO_Y + SERVO_TAB_HOLE_ACROSS / 2)
    hole4 = screws.circle((-SERVO_TAB_HOLE_SPACING / 2, SERVO_Y - SERVO_TAB_HOLE_ACROSS / 2), TAP_DRILL / 2)
    screws.diameter(hole4, TAP_DRILL)
    screws.horizontal_distance(hole4.center, screws.origin, SERVO_TAB_HOLE_SPACING / 2)
    screws.vertical_distance(screws.origin, hole4.center, SERVO_Y - SERVO_TAB_HOLE_ACROSS / 2)
    bracket -= bd.extrude(screws.faces(), amount=-bracket.bounding_box().diagonal)  # M3x0.5 tapped hole

    wall = Sketch("Wall holes", plane="Front")
    hole5 = wall.circle((WALL_HOLE_SPACING / 2, -WALL_HOLE_DROP), WALL_HOLE / 2)
    wall.diameter(hole5, WALL_HOLE)
    wall.horizontal_distance(wall.origin, hole5.center, WALL_HOLE_SPACING / 2)
    wall.vertical_distance(hole5.center, wall.origin, WALL_HOLE_DROP)
    hole6 = wall.circle((-WALL_HOLE_SPACING / 2, -WALL_HOLE_DROP), WALL_HOLE / 2)
    wall.diameter(hole6, WALL_HOLE)
    wall.horizontal_distance(hole6.center, wall.origin, WALL_HOLE_SPACING / 2)
    wall.vertical_distance(hole6.center, wall.origin, WALL_HOLE_DROP)
    bracket -= bd.extrude(wall.faces(), amount=-bracket.bounding_box().diagonal)  # M4 clearance hole

    bracket = bd.fillet(bracket.edges().filter_by(bd.Axis.Z).group_by(bd.Axis.Y)[-1], radius=CORNER)  # Shelf corners
    bracket = bd.fillet(bracket.edges().filter_by(bd.Axis.Y).group_by(bd.Axis.Z)[0], radius=CORNER)  # Flange corners

    bracket.color = "#B9BFC6"
    bracket.label = "servo_bracket"
    return bracket


if __name__ == "__main__":
    servo_bracket()
