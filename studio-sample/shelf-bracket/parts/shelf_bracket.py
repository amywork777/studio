"""The shelf bracket: bent from 14 gauge G90 galvanised steel, SendCutSend's G90-074 (0.074 in, 1.880 mm), to hold
a 200 mm deep shelf with up to 15 kg on it. A tapering web stands on edge as the bracket's gusset; a flange bent off
its top edge carries the shelf, which two wood screws hold from below, and a flange bent off its back edge fixes it to
the wall with two screws. Both flanges turn the same way, and a corner relief, cut where their bends meet, lets each
bend end clear of the other. The bends are drawn at SendCutSend's inside radius for this sheet, and the flat pattern
(shelf_bracket_flat.py) is developed with their K-factor. Origin: the outside corner where the shelf's underside
meets the wall, on the web's outside face; +Y out from the wall, +Z up, +X the way the flanges turn."""

import build123d as bd
from cad import model
from cad.build123d import materials
from cad.sketch import Sketch

THICKNESS = 1.8796  # G90-074: 0.074 in, SendCutSend's stock thickness, so the STEP uploads as drawn
BEND_RADIUS = 1.6002  # inside: SendCutSend's 0.063 in for G90-074 (sendcutsend-specs.json)
K_FACTOR = 0.40  # SendCutSend's for the same sheet, for the flat pattern
ARM_LENGTH = 180.0  # wall face to the arm's tip, outside: the shelf overhangs it by 20 mm
LEG_HEIGHT = 150.0  # shelf to the bottom of the wall leg, outside
FLANGE_WIDTH = 25.0  # both flanges, from the web's outside face
TIP_DEPTH = 30.0  # the web's depth at the arm's tip
FOOT_WIDTH = 30.0  # the web's width at the bottom of the leg
WEB_CORNER = 6.0  # the radius of the web's two free corners
CORNER_RELIEF = 7.0  # the square cut where the two bends meet, from the outside faces: 4.37 mm past each bend line
RELIEF_CORNER = 1.0  # the corner relief's inside radius
CORNER = 3.0  # the flanges' free corners
WALL_HOLE = 5.5  # clearance for a 5 mm wood screw, into a wall plug
WALL_HOLE_TOP = 25.0  # shelf to the upper wall hole's centre
WALL_HOLE_SPACING = 100.0  # between the two wall holes
SHELF_HOLE = 4.5  # clearance for a 4 mm wood screw, up into the shelf
SHELF_HOLE_FIRST = 40.0  # wall face to the first shelf hole's centre
SHELF_HOLE_SPACING = 100.0  # between the two shelf holes
HOLE_INSET = 14.0  # the web's outside face to every hole's centre, across its flange


@model
def shelf_bracket():
    web = Sketch("Web", plane="Right")
    top, front, brace, bottom, back = web.polyline(
        (0, 0), (ARM_LENGTH, 0), (ARM_LENGTH, -TIP_DEPTH), (FOOT_WIDTH, -LEG_HEIGHT), (0, -LEG_HEIGHT), closed=True
    )
    web.coincident(top.start, web.origin)
    web.horizontal(top)
    web.vertical(front)
    web.horizontal(bottom)
    web.vertical(back)
    web.length(top, ARM_LENGTH)
    web.length(front, TIP_DEPTH)
    web.length(bottom, FOOT_WIDTH)
    web.length(back, LEG_HEIGHT)
    web.fillet(front, brace, WEB_CORNER)
    web.fillet(brace, bottom, WEB_CORNER)
    bracket = bd.extrude(web.face(), amount=THICKNESS)  # the web stands in the YZ plane, +X from its outside face

    shelf = Sketch("Shelf flange", plane="Top")
    back_end, edge, tip_end, root = shelf.rectangle((0, 0), (FLANGE_WIDTH, ARM_LENGTH))
    shelf.coincident(back_end.start, shelf.origin)
    shelf.length(back_end, FLANGE_WIDTH)
    shelf.length(edge, ARM_LENGTH)
    hole1 = shelf.circle((HOLE_INSET, SHELF_HOLE_FIRST), SHELF_HOLE / 2)
    shelf.diameter(hole1, SHELF_HOLE)
    shelf.horizontal_distance(shelf.origin, hole1.center, HOLE_INSET)
    shelf.vertical_distance(shelf.origin, hole1.center, SHELF_HOLE_FIRST)
    hole2 = shelf.circle((HOLE_INSET, SHELF_HOLE_FIRST + SHELF_HOLE_SPACING), SHELF_HOLE / 2)
    shelf.diameter(hole2, SHELF_HOLE)
    shelf.horizontal_distance(shelf.origin, hole2.center, HOLE_INSET)
    shelf.vertical_distance(hole1.center, hole2.center, SHELF_HOLE_SPACING)
    bracket += bd.extrude(shelf.face(), amount=-THICKNESS)  # down from the shelf, under it

    wall = Sketch("Wall flange", plane="Front")
    foot, edge2, top_end, root2 = wall.rectangle((0, -LEG_HEIGHT), (FLANGE_WIDTH, 0))
    wall.coincident(root2.start, wall.origin)
    wall.length(foot, FLANGE_WIDTH)
    wall.length(edge2, LEG_HEIGHT)
    hole3 = wall.circle((HOLE_INSET, -WALL_HOLE_TOP), WALL_HOLE / 2)
    wall.diameter(hole3, WALL_HOLE)
    wall.horizontal_distance(wall.origin, hole3.center, HOLE_INSET)
    wall.vertical_distance(hole3.center, wall.origin, WALL_HOLE_TOP)
    hole4 = wall.circle((HOLE_INSET, -(WALL_HOLE_TOP + WALL_HOLE_SPACING)), WALL_HOLE / 2)
    wall.diameter(hole4, WALL_HOLE)
    wall.horizontal_distance(wall.origin, hole4.center, HOLE_INSET)
    wall.vertical_distance(hole4.center, hole3.center, WALL_HOLE_SPACING)
    bracket += bd.extrude(wall.face(), amount=-THICKNESS)  # out from the wall, in front of it

    relief = Sketch("Corner relief", plane="Right")
    under, side, over, outside = relief.rectangle((-1, -CORNER_RELIEF), (CORNER_RELIEF, 1))
    relief.horizontal_distance(relief.origin, side.start, CORNER_RELIEF)
    relief.vertical_distance(under.start, relief.origin, CORNER_RELIEF)
    relief.horizontal_distance(under.start, relief.origin, 1)
    relief.vertical_distance(relief.origin, over.start, 1)
    relief.fillet(under, side, RELIEF_CORNER)
    bracket -= bd.extrude(relief.face(), amount=bracket.bounding_box().diagonal, both=True)

    bracket = bd.fillet(bracket.edges().filter_by(bd.Axis.Y).group_by(bd.Axis.X)[0].group_by(bd.Axis.Z)[-1], radius=BEND_RADIUS + THICKNESS)  # Shelf bend, outside
    bracket = bd.fillet(bracket.edges().filter_by(bd.Axis.Y).group_by(bd.Axis.X)[1].group_by(bd.Axis.Z)[-1], radius=BEND_RADIUS)  # Shelf bend, inside
    bracket = bd.fillet(bracket.edges().filter_by(bd.Axis.Z).group_by(bd.Axis.X)[0].group_by(bd.Axis.Y)[0], radius=BEND_RADIUS + THICKNESS)  # Wall bend, outside
    bracket = bd.fillet(bracket.edges().filter_by(bd.Axis.Z).group_by(bd.Axis.X)[1].group_by(bd.Axis.Y)[0], radius=BEND_RADIUS)  # Wall bend, inside

    bracket = bd.fillet(bracket.edges().filter_by(bd.Axis.Z).group_by(bd.Axis.X)[-1].group_by(bd.Axis.Z)[-1], radius=CORNER)  # Shelf flange corners
    bracket = bd.fillet(bracket.edges().filter_by(bd.Axis.Y).group_by(bd.Axis.X)[-1].group_by(bd.Axis.Y)[0], radius=CORNER)  # Wall flange corners

    bracket.material = materials.zinc_plated()  # G90: mild steel under clear zinc, the sheet's strength and weight
    bracket.color = "#A9B0B6"
    bracket.label = "shelf_bracket"
    return bracket


if __name__ == "__main__":
    shelf_bracket()
