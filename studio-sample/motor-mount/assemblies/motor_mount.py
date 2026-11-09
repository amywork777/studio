"""The motor mount: the motor plate with the NEMA 17 under it, its pilot in the plate's bore and its shaft up through
it, held by four ISO 4762 M3 x 6 socket head screws (downloaded from step.parts) whose heads sit on the pocket's
floor. The frame and the belt are not modelled. Origin: the plate's, the centre of its underside."""

import sys
from pathlib import Path

import build123d as bd
from cad import model, step
from cad.mates import Coincident, Concentric, mate

PARTS = Path(__file__).resolve().parent.parent / "parts"
sys.path.insert(0, str(PARTS))  # the parts are models in ../parts, each built in this run with its own document

from motor_plate import SCREW_CLEARANCE, motor_plate  # noqa: E402
from nema17 import nema17  # noqa: E402
from sizes import MOTOR_BODY_LENGTH  # noqa: E402

SCREW = PARTS / "imported" / "iso4762_socket_head_cap_screw_m3x6.step"  # step.parts: iso4762_socket_head_cap_screw_m3x6


@model
def motor_mount():
    plate = motor_plate().shape
    holes = plate.faces().filter_by(bd.GeomType.CYLINDER).filter_by(lambda face: abs(face.radius - SCREW_CLEARANCE / 2) < 1e-3)
    pocket_floor = plate.faces().filter_by(bd.Axis.Z).group_by(bd.Axis.Z)[1][0]

    # The motor's face sits against the plate's underside.
    motor = bd.Pos(0, 0, -MOTOR_BODY_LENGTH) * nema17().shape

    screw = step.read(SCREW)
    screws = []
    for hole in holes.sort_by(bd.Axis.X).sort_by(bd.Axis.Y):
        placed = screw.moved(bd.Location())
        shank = placed.faces().filter_by(bd.GeomType.CYLINDER).sort_by(bd.Axis.Z)[0]
        head_underside = placed.faces().filter_by(bd.Axis.Z).sort_by(bd.Axis.Z)[1]
        mate(placed, Concentric(shank, hole), Coincident(head_underside, pocket_floor))
        centre = hole.axis_of_rotation.position
        placed.label = f"m3x6_screw:{'front' if centre.Y < 0 else 'back'}_{'left' if centre.X < 0 else 'right'}"
        screws.append(placed)

    return bd.Compound(children=[plate, motor, *screws], label="motor_mount")


if __name__ == "__main__":
    motor_mount()
