"""Mounting bracket: a base plate and an upright, R6 inside fillet, two M5 clearance holes in the base."""

import build123d as bd
from cad import model

PLATE = (80.0, 40.0, 6.0)
UPRIGHT = (6.0, 40.0, 44.0)
BLEND = 6.0
HOLE = 5.5  # M5 clearance
HOLES_X = (15.0, 30.0)


@model
def bracket():
    plate = bd.Box(*PLATE).moved(bd.Location((0, 0, PLATE[2] / 2)))
    upright = bd.Box(*UPRIGHT).moved(bd.Location((-37, 0, 28)))
    body = plate + upright
    inner = body.edges().filter_by(bd.Axis.Y).filter_by(lambda e: abs(e.center().X + 34) < 1e-3 and abs(e.center().Z - 6) < 1e-3)
    body = bd.fillet(inner, BLEND)
    for x in HOLES_X:
        body -= bd.Cylinder(HOLE / 2, 20).moved(bd.Location((x, 0, 0)))
    body.label = "Bracket"
    return body
