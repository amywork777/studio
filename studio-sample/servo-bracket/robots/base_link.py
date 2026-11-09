"""The base link of the servo mount's robot descriptions (servo_mount.urdf, .srdf and .sdf beside this script): every
part of the mount that does not turn with the horn, as one mesh in the base link's frame. That frame is the
assembly's own: the outside corner of the bracket's bend, halfway along it, +Y out from the wall, +Z up. The parts
are the assembly model's, placed by its mates, so the mesh follows the mount. `cad run exports.py` writes its meshes,
meshes/base_link.3mf for the URDF (in colour) and meshes/base_link.stl for the SDF (Gazebo reads no 3MF)."""

import sys
from pathlib import Path

import build123d as bd
from cad import model

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "assemblies"))  # the mount is a model in ../assemblies

from servo_mount import servo_mount  # noqa: E402

TURNS = "horn_adapter"  # the one part the horn turns: the horn link (horn_link.py)


@model
def base_link():
    mount = servo_mount().shape
    parts = [part for part in mount.children if part.label != TURNS]  # the bracket, the servo's body, its screws, the clip
    return bd.Compound(children=parts, label="base_link")


if __name__ == "__main__":
    base_link()
