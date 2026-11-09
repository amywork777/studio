"""The horn link of the servo mount's robot descriptions (servo_mount.urdf, .srdf and .sdf beside this script): the
horn adapter, the one part that turns with the servo's output, as a mesh in the horn link's frame. That frame sits on
the output axis at the top of the spline, where the adapter's bore seats, with the assembly's axes; the horn joint
turns it about its +Z. `cad run exports.py` writes its meshes, meshes/horn_link.3mf for the URDF (in colour) and
meshes/horn_link.stl for the SDF (Gazebo reads no 3MF)."""

import sys
from pathlib import Path

import build123d as bd
from cad import model

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "assemblies"))  # the mount is a model in ../assemblies

from servo_mount import HORN_AXIS, servo_mount  # noqa: E402
from sizes import SERVO_HEIGHT, SERVO_TAB_HEIGHT  # noqa: E402

SPLINE_TOP = SERVO_HEIGHT - SERVO_TAB_HEIGHT  # above the shelf's top, where the servo's tabs sit


@model
def horn_link():
    mount = servo_mount().shape
    adapter = next(part for part in mount.children if part.label == "horn_adapter")
    adapter = bd.Pos(-HORN_AXIS[0], -HORN_AXIS[1], -SPLINE_TOP) * adapter
    return bd.Compound(children=[adapter], label="horn_link")


if __name__ == "__main__":
    horn_link()
