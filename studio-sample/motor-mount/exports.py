# /// script
# dependencies = ["cad[build123d]"]
# ///
"""The project's delivered files, written from its models: the plate's STEP (AP242, its PMI on its faces), the
motor's and the mount's. Run from the project root with `cad run exports.py` after a change; the CAM job and
the strength study read the plate's STEP."""

import sys
from pathlib import Path

from cad import model

ROOT = Path(__file__).resolve().parent
sys.path[:0] = [str(ROOT / "parts"), str(ROOT / "assemblies")]

from motor_mount import motor_mount  # noqa: E402
from motor_plate import motor_plate  # noqa: E402
from nema17 import nema17  # noqa: E402

if __name__ == "__main__":
    model.export(motor_plate, ROOT / "parts/motor_plate.step")
    model.export(nema17, ROOT / "parts/nema17.step")
    model.export(motor_mount, ROOT / "assemblies/motor_mount.step")
