"""The MG996R servo, modeled from its datasheet's dimensions (sizes.py), not from downloaded CAD: the case as the
envelope the datasheet gives, its two mounting tabs with two holes each, and the output spline. Its origin is the
centre of the tabs' underside, where the servo sits on what holds it: +X toward the output end, +Z up to the spline."""

import build123d as bd
from cad import model
from cad.sketch import Sketch

from sizes import (
    SERVO_CASE_HEIGHT,
    SERVO_HEIGHT,
    SERVO_LENGTH,
    SERVO_SHAFT_FROM_END,
    SERVO_SPLINE,
    SERVO_TAB_HEIGHT,
    SERVO_TAB_HOLE,
    SERVO_TAB_HOLE_ACROSS,
    SERVO_TAB_HOLE_SPACING,
    SERVO_TAB_LENGTH,
    SERVO_TAB_THICKNESS,
    SERVO_WIDTH,
)


@model
def mg996r():
    case = Sketch("Case", plane="Top", offset=-SERVO_TAB_HEIGHT)
    side1, end1, side2, end2 = case.center_rectangle(case.origin, (SERVO_LENGTH / 2, SERVO_WIDTH / 2))
    case.length(side1, SERVO_LENGTH)
    case.length(end1, SERVO_WIDTH)
    servo = bd.extrude(case.face(), amount=SERVO_CASE_HEIGHT)

    tabs = Sketch("Tabs", plane="Top")
    side3, end3, side4, end4 = tabs.center_rectangle(tabs.origin, (SERVO_TAB_LENGTH / 2, SERVO_WIDTH / 2))
    tabs.length(side3, SERVO_TAB_LENGTH)
    tabs.length(end3, SERVO_WIDTH)
    hole1 = tabs.circle((SERVO_TAB_HOLE_SPACING / 2, SERVO_TAB_HOLE_ACROSS / 2), SERVO_TAB_HOLE / 2)
    tabs.diameter(hole1, SERVO_TAB_HOLE)
    tabs.horizontal_distance(tabs.origin, hole1.center, SERVO_TAB_HOLE_SPACING / 2)
    tabs.vertical_distance(tabs.origin, hole1.center, SERVO_TAB_HOLE_ACROSS / 2)
    hole2 = tabs.circle((SERVO_TAB_HOLE_SPACING / 2, -SERVO_TAB_HOLE_ACROSS / 2), SERVO_TAB_HOLE / 2)
    tabs.diameter(hole2, SERVO_TAB_HOLE)
    tabs.horizontal_distance(tabs.origin, hole2.center, SERVO_TAB_HOLE_SPACING / 2)
    tabs.vertical_distance(hole2.center, tabs.origin, SERVO_TAB_HOLE_ACROSS / 2)
    hole3 = tabs.circle((-SERVO_TAB_HOLE_SPACING / 2, SERVO_TAB_HOLE_ACROSS / 2), SERVO_TAB_HOLE / 2)
    tabs.diameter(hole3, SERVO_TAB_HOLE)
    tabs.horizontal_distance(hole3.center, tabs.origin, SERVO_TAB_HOLE_SPACING / 2)
    tabs.vertical_distance(tabs.origin, hole3.center, SERVO_TAB_HOLE_ACROSS / 2)
    hole4 = tabs.circle((-SERVO_TAB_HOLE_SPACING / 2, -SERVO_TAB_HOLE_ACROSS / 2), SERVO_TAB_HOLE / 2)
    tabs.diameter(hole4, SERVO_TAB_HOLE)
    tabs.horizontal_distance(hole4.center, tabs.origin, SERVO_TAB_HOLE_SPACING / 2)
    tabs.vertical_distance(hole4.center, tabs.origin, SERVO_TAB_HOLE_ACROSS / 2)
    servo += bd.extrude(tabs.face(), amount=SERVO_TAB_THICKNESS)

    spline = Sketch("Spline", plane="Top", offset=SERVO_CASE_HEIGHT - SERVO_TAB_HEIGHT)
    axis = spline.line(spline.origin, (SERVO_LENGTH / 2 - SERVO_SHAFT_FROM_END, 0), construction=True)
    spline.horizontal(axis)
    spline.length(axis, SERVO_LENGTH / 2 - SERVO_SHAFT_FROM_END)
    teeth = spline.circle(axis.end, SERVO_SPLINE / 2)
    spline.diameter(teeth, SERVO_SPLINE)
    servo += bd.extrude(spline.face(), amount=SERVO_HEIGHT - SERVO_CASE_HEIGHT)

    servo.color = "#45474D"
    servo.label = "mg996r"
    return servo


if __name__ == "__main__":
    mg996r()
