# /// script
# dependencies = ["cad[build123d]"]
# ///
"""The project's delivered files, written from its models: every part's STEP and the mount's, the bracket's flat
pattern and its cut file, the printed parts' meshes, and the robot links' meshes the URDF and the SDF name. Run from
the project root with `cad run exports.py` after a change; the strength study, the CAM job and the robot descriptions
read these files."""

import sys
from pathlib import Path

from cad import model

ROOT = Path(__file__).resolve().parent
sys.path[:0] = [str(ROOT / "parts"), str(ROOT / "assemblies"), str(ROOT / "robots")]

from base_link import base_link  # noqa: E402
from cable_clip import cable_clip  # noqa: E402
from horn_adapter import horn_adapter  # noqa: E402
from horn_link import horn_link  # noqa: E402
from mg996r import mg996r  # noqa: E402
from servo_bracket import servo_bracket  # noqa: E402
from servo_bracket_cut import servo_bracket_cut  # noqa: E402
from servo_bracket_flat import servo_bracket_flat  # noqa: E402
from servo_mount import servo_mount  # noqa: E402

if __name__ == "__main__":
    model.export(servo_bracket, ROOT / "parts/servo_bracket.step", ROOT / "parts/servo_bracket.stl",
           ROOT / "parts/servo_bracket.3mf")
    model.export(servo_bracket_flat, ROOT / "parts/servo_bracket_flat.step")
    model.export(servo_bracket_cut, ROOT / "cut/servo_bracket_cut.dxf")
    model.export(mg996r, ROOT / "parts/mg996r.step")
    model.export(horn_adapter, ROOT / "parts/horn_adapter.step")
    model.export(cable_clip, ROOT / "parts/cable_clip.step", ROOT / "parts/cable_clip.stl")
    model.export(servo_mount, ROOT / "assemblies/servo_mount.step")
    model.export(base_link, ROOT / "robots/meshes/base_link.3mf", ROOT / "robots/meshes/base_link.stl")
    model.export(horn_link, ROOT / "robots/meshes/horn_link.3mf", ROOT / "robots/meshes/horn_link.stl")
