"""The stand with the largest phone it is for (parts/phone_placeholder.py) standing in it in portrait: the phone's
back on the rest, its bottom edge on the ledge, in the middle of the stand. For the fit check and the pictures."""

import sys
from math import cos, radians, sin
from pathlib import Path

import build123d as bd
from cad import model

PARTS = Path(__file__).resolve().parent.parent / "parts"
sys.path.insert(0, str(PARTS))  # the parts are models in ../parts, each built in this run with its own document

from phone_placeholder import phone_placeholder  # noqa: E402
from phone_stand import ANGLE, LEDGE_HEIGHT, along_rest, phone_stand  # noqa: E402


def on_ledge():
    """Where the phone stands: its back's bottom edge in the corner of the rest and the ledge, its length up the
    rest. The phone is turned half round first so its screen (+Y) faces the viewer, then tilted back to the rest."""
    y, z = along_rest(LEDGE_HEIGHT)
    return bd.Location((0, y, z)) * bd.Rot(ANGLE - 90, 0, 0) * bd.Rot(0, 0, 180)


@model
def phone_stand_portrait():
    stand = phone_stand().shape
    phone = on_ledge() * phone_placeholder().shape
    return bd.Compound(children=[stand, phone], label="phone_stand_portrait")


if __name__ == "__main__":
    phone_stand_portrait()
