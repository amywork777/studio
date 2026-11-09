"""The motor plate: a 6061-T6 aluminium plate, CNC milled, that holds a NEMA 17 stepper to a frame. The motor sits
under it, its pilot in the plate's bore and its shaft up through it to a belt pulley, held by four M3 screws whose
heads sit in the pocket on top. Two M5 screws through the slots at its ends fix it to the frame; the slots let it
slide along the belt, so it is pulled back to tension the belt and then clamped. Origin: the centre of its underside,
the face the motor sits on; +X along the belt and the slots, +Z up through the plate to the pulley.

It carries its requirements on its faces (3D PMI, a model-based definition): datum A the underside, B the front
side and C the left end; the pilot bore, the M3 holes and the slots' ends sized and positioned to A|B|C, their
true positions located by basic dimensions from B and C; the underside's flatness; the thickness and the pocket's
depth toleranced; B and C profiled to the datums before them; every other face held by the general profile (Note 1);
and two named views."""

import build123d as bd
from bd_materials import metals
from cad import model
from cad.build123d import (annotate, datum, dimensional_location, dimensional_size, flatness_tolerance,
                           general_profile, note, plus_minus_tolerance, position_tolerance, section,
                           surface_profile_tolerance, view)
from cad.sketch import Sketch

from sizes import MOTOR_BOLT_PATTERN, MOTOR_PILOT

PLATE_LENGTH = 110.0  # along the belt
PLATE_WIDTH = 56.0
THICKNESS = 6.0
CORNER = 5.0  # the outline's corners
PILOT_CLEARANCE = 0.2  # across the motor's pilot, so it drops in
PILOT_BORE = MOTOR_PILOT + PILOT_CLEARANCE
SCREW_CLEARANCE = 3.4  # M3, ISO 273 medium
POCKET_SIZE = 46.0  # square, round the motor's four screw heads
POCKET_DEPTH = 3.0  # leaves a 3 mm floor under the screw heads
POCKET_CORNER = 5.0  # the pocket's inside corners: over the 6 mm cutter's 3 mm radius
SLOT_WIDTH = 5.5  # M5, ISO 273 medium
SLOT_LENGTH = 10.0  # the belt's tensioning travel: between the centres of each slot's two ends
SLOT_SPACING = 80.0  # between the two slots' middles, along the belt
CHAMFER = 0.5  # the outline's top and bottom edges

# The plate's requirements (README, Decisions: each one assumed for a NEMA 17 plate on a 3-axis mill).
GENERAL_PROFILE = 0.5  # every face nothing else controls, to A|B|C
DEPTHS = 0.1  # the thickness and the pocket's depth, +/-: ISO 2768-m's at those sizes, as the drawing has it
FLATNESS = 0.05  # the underside, datum A: the motor's face and the frame seat on it
DATUM_PROFILE = 0.1  # datum features B and C, each to the datums before it
PILOT_BORE_OVER = 0.1  # the bore 22.2 +0.1/0: the motor's 22 mm pilot always drops in
PILOT_POSITION = 0.1  # the bore's axis, a diametral zone to A|B|C
HOLE_OVER = 0.1  # the M3 holes 3.4 +0.1/0, as drilled
HOLE_POSITION = 0.2  # the M3 holes' axes: (3.4 hole - 3.0 screw) / 2, the motor's holes tapped (fixed fastener)
SLOT_OVER = 0.1  # the slots' ends R2.75, 5.5 +0.1/0 across
SLOT_POSITION = 0.5  # the slots' ends: 5.5 slot - 5.0 screw, the frame's holes clear (floating fastener)


def requirements(plate):
    """The plate's PMI, on the faces of the finished plate: its datums, each feature's size and position, the
    underside's flatness, the datum features' profiles, the general profile (Note 1), a note and two views."""
    bottom = plate.faces().filter_by(bd.Axis.Z).sort_by(bd.Axis.Z)[0]
    top = plate.faces().filter_by(bd.Axis.Z).sort_by(bd.Axis.Z)[-1]
    floor = plate.faces().filter_by(bd.Axis.Z).group_by(bd.Axis.Z)[1][0]  # the pocket's
    front = plate.faces().filter_by(bd.Axis.Y).sort_by(bd.Axis.Y)[0]
    left = plate.faces().filter_by(bd.Axis.X).sort_by(bd.Axis.X)[0]
    cylinders = plate.faces().filter_by(bd.GeomType.CYLINDER)
    bore = cylinders.filter_by(lambda face: abs(face.radius - PILOT_BORE / 2) < 1e-3)[0]
    holes = cylinders.filter_by(lambda face: abs(face.radius - SCREW_CLEARANCE / 2) < 1e-3).sort_by(bd.Axis.X).sort_by(bd.Axis.Y)
    ends = cylinders.filter_by(lambda face: abs(face.radius - SLOT_WIDTH / 2) < 1e-3).sort_by(bd.Axis.X)

    located = []  # each hole's and slot end's size, its position to A|B|C, and its basic distances from B and C
    for kind, faces, over, zone in (("m3", holes, HOLE_OVER, HOLE_POSITION), ("slot-end", ends, SLOT_OVER, SLOT_POSITION)):
        for n, face in enumerate(faces, 1):
            name = f"{kind}-{n}"
            located += [
                dimensional_size(f"{name}-diameter", face, tolerance=plus_minus_tolerance(over, 0)),
                position_tolerance(f"{name}-position", face, zone, datums=["A", "B", "C"]),
                dimensional_location(f"{name}-from-B", front, face, basic=True),
                dimensional_location(f"{name}-from-C", left, face, basic=True),
            ]
    return annotate(
        plate,
        datum("A", bottom),
        datum("B", front),
        datum("C", left),
        general_profile("general", GENERAL_PROFILE, datums=["A", "B", "C"]),  # Note 1
        dimensional_location("thickness", bottom, top, tolerance=plus_minus_tolerance(DEPTHS)),
        dimensional_location("pocket-depth", top, floor, tolerance=plus_minus_tolerance(DEPTHS)),
        dimensional_size("pilot-bore-diameter", bore, tolerance=plus_minus_tolerance(PILOT_BORE_OVER, 0)),
        position_tolerance("pilot-bore-position", bore, PILOT_POSITION, datums=["A", "B", "C"]),
        dimensional_location("pilot-bore-from-B", front, bore, basic=True),
        dimensional_location("pilot-bore-from-C", left, bore, basic=True),
        *located,
        flatness_tolerance("A-flatness", bottom, FLATNESS),
        surface_profile_tolerance("B-profile", front, DATUM_PROFILE, datums=["A"]),
        surface_profile_tolerance("C-profile", left, DATUM_PROFILE, datums=["A", "B"]),
        note("deburr", "Deburr the holes and slots."),  # Note 2, the drawing's own words
        # Section A-A across Y through the bore's axis, keeping the far side so the front camera looks at the cut.
        view("A-A", camera="front", section=section("y", 0, invert=True),
             shows=["A", "thickness", "pocket-depth", "pilot-bore-diameter", "pilot-bore-position", "A-flatness"]),
        view("Top", camera="top",
             shows=["B", "C", "pilot-bore-diameter", "pilot-bore-position", "pilot-bore-from-B", "pilot-bore-from-C",
                    *(f"{kind}-{n}-{what}" for kind, count in (("m3", 4), ("slot-end", 4)) for n in range(1, count + 1)
                      for what in ("diameter", "position"))]),
    )


@model
def motor_plate():
    outline = Sketch("Outline", plane="Top")
    bottom, right, top, left = outline.center_rectangle(outline.origin, (PLATE_LENGTH / 2, PLATE_WIDTH / 2))
    outline.length(bottom, PLATE_LENGTH)
    outline.length(left, PLATE_WIDTH)
    outline.fillet(bottom, right, CORNER)
    outline.fillet(right, top, CORNER)
    outline.fillet(top, left, CORNER)
    outline.fillet(left, bottom, CORNER)
    plate = bd.extrude(outline.face(), amount=THICKNESS)

    pocket = Sketch("Pocket", plane="Top", offset=THICKNESS)
    p_bottom, p_right, p_top, p_left = pocket.center_rectangle(pocket.origin, (POCKET_SIZE / 2, POCKET_SIZE / 2))
    pocket.length(p_bottom, POCKET_SIZE)
    pocket.length(p_left, POCKET_SIZE)
    pocket.fillet(p_bottom, p_right, POCKET_CORNER)
    pocket.fillet(p_right, p_top, POCKET_CORNER)
    pocket.fillet(p_top, p_left, POCKET_CORNER)
    pocket.fillet(p_left, p_bottom, POCKET_CORNER)
    plate -= bd.extrude(pocket.face(), amount=-POCKET_DEPTH)

    bore = Sketch("Pilot bore", plane="Top")
    pilot = bore.circle(bore.origin, PILOT_BORE / 2)
    bore.diameter(pilot, PILOT_BORE)
    plate -= bd.extrude(bore.face(), amount=plate.bounding_box().diagonal)

    screws = Sketch("Motor screw holes", plane="Top")
    hole1 = screws.circle((-MOTOR_BOLT_PATTERN / 2, -MOTOR_BOLT_PATTERN / 2), SCREW_CLEARANCE / 2)
    screws.diameter(hole1, SCREW_CLEARANCE)
    screws.horizontal_distance(hole1.center, screws.origin, MOTOR_BOLT_PATTERN / 2)
    screws.vertical_distance(hole1.center, screws.origin, MOTOR_BOLT_PATTERN / 2)
    (hole2,) = screws.linear_pattern([hole1], along=0, spacing=MOTOR_BOLT_PATTERN, count=2)
    screws.linear_pattern([hole1, hole2], along=90, spacing=MOTOR_BOLT_PATTERN, count=2)
    plate -= bd.extrude(screws.faces(), amount=plate.bounding_box().diagonal)  # M3 clearance, ISO 273 medium

    slots = Sketch("Belt slots", plane="Top")
    end1 = slots.point(-SLOT_SPACING / 2 - SLOT_LENGTH / 2, 0)
    end2 = slots.point(-SLOT_SPACING / 2 + SLOT_LENGTH / 2, 0)
    slots.slot(end1, end2, SLOT_WIDTH / 2)
    slots.horizontal_distance(end1, end2, SLOT_LENGTH)
    slots.horizontal_distance(end2, slots.origin, SLOT_SPACING / 2 - SLOT_LENGTH / 2)
    end3 = slots.point(SLOT_SPACING / 2 - SLOT_LENGTH / 2, 0)
    end4 = slots.point(SLOT_SPACING / 2 + SLOT_LENGTH / 2, 0)
    slots.slot(end3, end4, SLOT_WIDTH / 2)
    slots.horizontal_distance(end3, end4, SLOT_LENGTH)
    slots.horizontal_distance(slots.origin, end3, SLOT_SPACING / 2 - SLOT_LENGTH / 2)
    plate -= bd.extrude(slots.faces(), amount=plate.bounding_box().diagonal)  # M5 clearance, ISO 273 medium

    plate = bd.chamfer(
        plate.faces().sort_by(bd.Axis.Z)[-1].outer_wire().edges() + plate.faces().sort_by(bd.Axis.Z)[0].outer_wire().edges(),
        length=CHAMFER,
    )

    plate.color = "#B9C0C8"
    plate.material = metals.aluminum()
    plate.label = "motor_plate"
    return requirements(plate)


if __name__ == "__main__":
    motor_plate()
