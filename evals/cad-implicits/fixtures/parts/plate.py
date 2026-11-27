"""Cover plate: 100 x 60 x 5 mm with four M5 clearance holes 8 mm in from each corner."""

import build123d as bd
from cad import model


@model
def plate():
    body = bd.Box(100, 60, 5)
    for x in (-42, 42):
        for y in (-22, 22):
            body -= bd.Cylinder(2.75, 10).moved(bd.Location((x, y, 0)))
    body.label = "Cover plate"
    return body
