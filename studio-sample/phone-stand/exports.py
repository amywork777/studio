# /// script
# dependencies = ["cad[build123d]"]
# ///
"""The project's delivered files, written from its models: the stand's STEP, the placeholder phone's and the stand with
the phone in it, and the stand as it prints as an STL and a 3MF, the files the slicer and the FDM check read. Run from
the project root with `cad run exports.py` after a change."""

import sys
from pathlib import Path

from cad import model

ROOT = Path(__file__).resolve().parent
sys.path[:0] = [str(ROOT / "parts"), str(ROOT / "assemblies")]

from phone_placeholder import phone_placeholder  # noqa: E402
from phone_stand import phone_stand  # noqa: E402
from phone_stand_portrait import phone_stand_portrait  # noqa: E402
from phone_stand_print import phone_stand_print  # noqa: E402

if __name__ == "__main__":
    model.export(phone_stand, ROOT / "parts/phone_stand.step")
    model.export(phone_placeholder, ROOT / "parts/phone_placeholder.step")
    model.export(phone_stand_portrait, ROOT / "assemblies/phone_stand_portrait.step")
    model.export(phone_stand_print, ROOT / "parts/phone_stand_print.stl", ROOT / "parts/phone_stand_print.3mf")
