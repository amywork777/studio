"""The servo mount: the bracket with an MG996R dropped into its cutout horn up, held by four ISO 4762 M3x8 socket head
screws (downloaded from step.parts) in the bracket's tapped holes, the horn adapter on the servo's output, and the
cable clip bonded to the flange. Each part is placed by its mates, solved on every run; the horn turns 60 degrees
each way (the datasheet's 120 degrees of travel), a revolute joint on the servo with a rigid joint of the same label on
the adapter, and the `range` sequence turns it through that travel, as the viewer's Motion plays it and a GLB exported
from the mount carries it."""

import sys
from pathlib import Path

import math

import build123d as bd
from cad import model, step
from cad.build123d import configuration_sequence
from cad.mates import Coincident, Concentric, Parallel, mate

PARTS = Path(__file__).resolve().parent.parent / "parts"
sys.path.insert(0, str(PARTS))  # the parts are models in ../parts, each built in this run with its own document

from cable_clip import cable_clip  # noqa: E402
from horn_adapter import horn_adapter  # noqa: E402
from mg996r import mg996r  # noqa: E402
from servo_bracket import SERVO_Y, TAP_DRILL, servo_bracket  # noqa: E402
from sizes import SERVO_LENGTH, SERVO_SHAFT_FROM_END, SERVO_SPLINE, SERVO_TRAVEL  # noqa: E402

SCREW = PARTS / "imported" / "iso4762_socket_head_cap_screw_m3x8.step"  # step.parts: iso4762_socket_head_cap_screw_m3x8
CLIP_FROM_SIDE = 1.0  # the clip's outer side in from the flange's side edge, at the servo's output end
CLIP_FROM_BOTTOM = 2.0  # the clip's lower end up from the flange's bottom edge
HORN_AXIS = (SERVO_LENGTH / 2 - SERVO_SHAFT_FROM_END, SERVO_Y, 0)  # the servo's output axis, along +Z
RANGE_SECONDS = 6.0  # one cycle of the range sequence: 0, up to +60, back through 0 to -60, and back to 0



def through_travel(t: float) -> dict:
    """The horn's angle `t` seconds into the range sequence: a sine through the servo's whole travel."""
    return {"horn": SERVO_TRAVEL / 2 * math.sin(2 * math.pi * t / RANGE_SECONDS)}


@model
def servo_mount():
    bracket = servo_bracket().shape
    shelf_top = bracket.faces().sort_by(bd.Axis.Z)[-1]
    tapped = bracket.faces().filter_by(bd.GeomType.CYLINDER).filter_by(lambda face: abs(face.radius - TAP_DRILL / 2) < 1e-3)

    servo = mg996r().shape
    tab_holes = servo.faces().filter_by(bd.GeomType.CYLINDER).sort_by(bd.Axis.Z)[:4]
    tab_underside = servo.faces().filter_by(bd.Axis.Z).group_by(bd.Axis.Z)[1][0]
    mate(
        servo,
        Coincident(tab_underside, shelf_top),
        Concentric(tab_holes.sort_by(bd.Axis.X)[-2:].sort_by(bd.Axis.Y)[-1], tapped.sort_by(bd.Axis.X)[-2:].sort_by(bd.Axis.Y)[-1]),
        Concentric(tab_holes.sort_by(bd.Axis.X)[:2].sort_by(bd.Axis.Y)[0], tapped.sort_by(bd.Axis.X)[:2].sort_by(bd.Axis.Y)[0]),
    )
    tab_top = servo.faces().filter_by(bd.Axis.Z).group_by(bd.Axis.Z)[2][0]

    screw = step.read(SCREW)
    bracket_side = bracket.faces().filter_by(bd.Axis.Y).sort_by(bd.Axis.Y)[0]
    screws = []
    for end, holes in (("output_end", tapped.sort_by(bd.Axis.X)[-2:]), ("other_end", tapped.sort_by(bd.Axis.X)[:2])):
        for side, hole in zip(("back", "front"), holes.sort_by(bd.Axis.Y)):
            placed = screw.moved(bd.Location())
            shank = placed.faces().filter_by(bd.GeomType.CYLINDER).sort_by(bd.Axis.Z)[0]
            head_underside = placed.faces().filter_by(bd.Axis.Z).sort_by(bd.Axis.Z)[1]
            # A flat of the hex socket square to the bracket's side, so each screw's turn about its own axis is set,
            # not left to the solver: left free, it lands on another turn on Windows than on a Mac.
            socket_flat = placed.faces().filter_by(bd.GeomType.PLANE).filter_by(lambda face: abs(face.normal_at().Z) < 1e-6).sort_by(bd.Axis.Y)[-1]
            mate(placed, Concentric(shank, hole), Coincident(head_underside, tab_top), Parallel(socket_flat, bracket_side))
            placed.label = f"m3x8_screw:{end}_{side}"
            screws.append(placed)

    adapter = horn_adapter().shape
    bore = adapter.faces().filter_by(bd.GeomType.CYLINDER).filter_by(lambda face: abs(face.radius - SERVO_SPLINE / 2) < 1e-3)[0]
    bore_end = adapter.faces().filter_by(bd.Axis.Z).group_by(bd.Axis.Z)[1][0]
    spline = servo.faces().filter_by(bd.GeomType.CYLINDER).sort_by(bd.Axis.Z)[-1]
    spline_top = servo.faces().sort_by(bd.Axis.Z)[-1]
    # The adapter's X, the line its first tapped hole is on, along the servo's length: its turn about the output is set
    # too, not left to the solver.
    servo_side = servo.faces().filter_by(bd.Axis.Y).sort_by(bd.Axis.Y)[0]
    mate(adapter, Concentric(bore, spline), Coincident(bore_end, spline_top), Parallel(bd.Axis.X, servo_side))

    clip = cable_clip().shape
    flange_front = bracket.faces().filter_by(bd.Axis.Y).group_by(bd.Axis.Y)[1][0]
    # Two datum planes on the flange, in from its side edge at the servo's output end and up from its bottom edge: with
    # the bonded face they hold the clip every way, so none of where it sits is left to the solver.
    in_from_side = bd.Plane(bracket.faces().filter_by(bd.Axis.X).sort_by(bd.Axis.X)[-1]).offset(-CLIP_FROM_SIDE)
    up_from_bottom = bd.Plane(bracket.faces().filter_by(bd.Axis.Z).sort_by(bd.Axis.Z)[0]).offset(-CLIP_FROM_BOTTOM)
    mate(
        clip,
        Coincident(clip.faces().filter_by(bd.Axis.Y).sort_by(bd.Axis.Y)[0], flange_front),
        Coincident(clip.faces().filter_by(bd.Axis.X).sort_by(bd.Axis.X)[-1], in_from_side, flip=True),
        Coincident(clip.faces().filter_by(bd.Axis.Z).sort_by(bd.Axis.Z)[0], up_from_bottom, flip=True),
    )

    mount = bd.Compound(children=[bracket, servo, adapter, *screws, clip], label="servo_mount")

    # The horn, where the adapter stands (its value 0 as built): the mount is at the world's origin, so the axis is given
    # in the world's frame, and the adapter's rigid joint at the horn's own frame.
    horn = bd.RevoluteJoint("horn", servo, axis=bd.Axis(HORN_AXIS, (0, 0, 1)), angular_range=(-SERVO_TRAVEL / 2, SERVO_TRAVEL / 2))
    bd.RigidJoint("horn", adapter, horn.location)
    return configuration_sequence(mount, "range", through_travel, duration=RANGE_SECONDS)


if __name__ == "__main__":
    servo_mount()
