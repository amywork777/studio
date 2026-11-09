"""The cable clip: printed in PETG and bonded to the bracket's flange, it holds the servo's lead where it leaves the
servo. The lead is pressed into the channel through its opening. The channel runs along the clip's Z, so it prints
standing up, the way it is drawn, with nothing overhanging. Origin: the centre of the bonded face; +Y out of it."""

import build123d as bd
from cad import model
from cad.sketch import Sketch

BASE_WIDTH = 8.0
HEIGHT = 8.0  # along the channel
BASE_THICKNESS = 1.6
CABLE = 4.0  # the channel, for the servo's three-wire lead bunched (the lead's size is not in the datasheet)
WALL = 1.6  # the channel's wall
CHANNEL_FROM_BASE = 4.4  # the bonded face to the channel's axis; the channel's wall runs into the base
OPENING = 2.6  # the gap the lead is pressed through


@model
def cable_clip():
    base = Sketch("Base", plane="Top")
    bottom, side1, top, side2 = base.rectangle((-BASE_WIDTH / 2, 0), (BASE_WIDTH / 2, BASE_THICKNESS))
    base.midpoint(base.origin, bottom)
    base.length(bottom, BASE_WIDTH)
    base.length(side1, BASE_THICKNESS)
    clip = bd.extrude(base.face(), amount=HEIGHT / 2, both=True)

    channel = Sketch("Channel", plane="Top")
    axis = channel.line(channel.origin, (0, CHANNEL_FROM_BASE), construction=True)
    channel.vertical(axis)
    channel.length(axis, CHANNEL_FROM_BASE)
    outside = channel.circle(axis.end, CABLE / 2 + WALL)
    channel.diameter(outside, CABLE + 2 * WALL)
    inside = channel.circle(axis.end, CABLE / 2)
    channel.diameter(inside, CABLE)
    clip += bd.extrude(channel.face(), amount=HEIGHT / 2, both=True)

    opening = Sketch("Opening", plane="Top")
    lip, side3, end, side4 = opening.rectangle((-OPENING / 2, CHANNEL_FROM_BASE), (OPENING / 2, CHANNEL_FROM_BASE + CABLE / 2 + WALL + 1))
    opening.horizontal_distance(lip.start, opening.origin, OPENING / 2)
    opening.vertical_distance(opening.origin, lip.start, CHANNEL_FROM_BASE)
    opening.length(lip, OPENING)
    opening.length(side3, CABLE / 2 + WALL + 1)
    clip -= bd.extrude(opening.face(), amount=clip.bounding_box().diagonal, both=True)

    clip.color = "#3E6FA8"
    clip.label = "cable_clip"
    return clip


if __name__ == "__main__":
    cable_clip()
