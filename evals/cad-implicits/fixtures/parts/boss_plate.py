"""Sensor mount: a base plate, a boss tilted 30 degrees to aim the sensor, and a rib bracing the boss."""

import math

import build123d as bd
from cad import model

TILT = 30.0
AXIS = (math.sin(math.radians(TILT)), 0.0, math.cos(math.radians(TILT)))
TOP = (12 * AXIS[0], 0.0, 14 + 12 * AXIS[2])  # the centre of the boss's top face


@model
def boss_plate():
    plate = bd.Box(60, 40, 6).moved(bd.Location((0, 0, 3)))
    # the boss runs down into the plate and is trimmed flush with its underside
    centre = tuple(TOP[i] - 20 * AXIS[i] for i in range(3))
    boss = bd.Cylinder(8, 40).moved(bd.Location((0, 0, 0), (0, TILT, 0))).moved(bd.Location(centre))
    boss = boss & bd.Box(200, 200, 100).moved(bd.Location((0, 0, 50)))
    rib = bd.Box(22, 4, 12).moved(bd.Location((13, 0, 12)))
    body = plate + boss + rib
    body -= bd.Cylinder(4, 80).moved(bd.Location((0, 0, 0), (0, TILT, 0))).moved(bd.Location(centre))
    body.label = "Sensor mount"
    return body
