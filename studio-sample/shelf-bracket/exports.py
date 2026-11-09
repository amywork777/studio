# /// script
# dependencies = ["cad[build123d]"]
# ///
"""The project's delivered files, written from its models: the bracket's STEP (what SendCutSend is sent), its flat
pattern's STEP and its cut file. Run from the project root with `cad run exports.py` after a change; the strength study
and the preflight read these files."""

import sys
from pathlib import Path

from cad import model

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "parts"))

from shelf_bracket import shelf_bracket  # noqa: E402
from shelf_bracket_cut import shelf_bracket_cut  # noqa: E402
from shelf_bracket_flat import shelf_bracket_flat  # noqa: E402

if __name__ == "__main__":
    model.export(shelf_bracket, ROOT / "parts/shelf_bracket.step")
    model.export(shelf_bracket_flat, ROOT / "parts/shelf_bracket_flat.step")
    model.export(shelf_bracket_cut, ROOT / "cut/shelf_bracket_cut.dxf")
