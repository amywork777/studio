"""The phone stand as it is printed: on its side, its right-hand face (the stand's -X side) on the plate, so its
profile is the layer and it prints with nothing overhanging. Its STL and 3MF, which `cad run exports.py` writes beside
this script, are the files the slicer and the FDM check read. Origin: the plate's corner under the part; +Z up from the
plate."""

import build123d as bd
from cad import model

from phone_stand import phone_stand


@model
def phone_stand_print():
    stand = phone_stand().shape
    on_side = bd.Rot(0, -90, 0) * stand  # the stand's +X becomes up
    low = on_side.bounding_box().min
    printed = bd.Pos(-low.X, -low.Y, -low.Z) * on_side
    printed.label = "phone_stand"
    return printed


if __name__ == "__main__":
    phone_stand_print()
