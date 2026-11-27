"""Sensor post: a base plate and an upright boss for the sensor, bored through."""

import build123d as bd
from cad import model


@model
def boss_upright():
    plate = bd.Box(60, 40, 6).moved(bd.Location((0, 0, 3)))
    boss = bd.Cylinder(8, 24).moved(bd.Location((0, 0, 18)))
    body = plate + boss
    body -= bd.Cylinder(4, 80)
    body.label = "Sensor post"
    return body
