"""A placeholder for the largest phone the stand takes (parts/sizes.py), not a real phone's model: a rounded block,
for the fit check, the tip-over check and the pictures. Origin: the middle of its bottom edge, on its back; +Y out of
its screen, +Z up its length."""

import build123d as bd
from cad import model

from sizes import PHONE_CORNER, PHONE_LENGTH, PHONE_THICKNESS, PHONE_WIDTH


@model
def phone_placeholder():
    phone = bd.Box(PHONE_WIDTH, PHONE_THICKNESS, PHONE_LENGTH, align=(bd.Align.CENTER, bd.Align.MIN, bd.Align.MIN))
    phone = bd.fillet(phone.edges(), radius=PHONE_CORNER)
    phone.color = "#2B2D33"
    phone.label = "phone_placeholder"
    return phone


if __name__ == "__main__":
    phone_placeholder()
