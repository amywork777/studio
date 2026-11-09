# /// script
# dependencies = ["cad[build123d]"]
# ///
"""Checks the motor plate's 3D PMI: it builds the plate whole, in this process, and reads what its build says of its
annotations (each one attached to its faces, every face of the plate with a requirement, no conflict); then reads the
requirements back off the plate's AP242 STEP, as a supplier's program would. Run from the project root after
`cad run exports.py`, with `cad run checks/motor_plate_pmi.py`; writes checks/motor_plate_pmi.md and exits 1 if any
check fails."""

import sys
from collections import Counter
from pathlib import Path

from cad.engine.pmi import read

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "parts"))

import motor_plate as mp  # noqa: E402

STEP = ROOT / "parts" / "motor_plate.step"

# A whole build in this process (no engine, nothing cached), so its report has every annotation's word.
report = mp.motor_plate.build(daemon=False).models[0]
pmi = report.get("pmi") or {}
rows = []


def check(name, measured, expected, ok):
    rows.append((name, measured, expected, "pass" if ok else "FAIL"))


check("Annotations on the plate", str(pmi.get("annotations", 0)), "more than 0", pmi.get("annotations", 0) > 0)
problems = [f"{each['id']} {each['status']}" for each in pmi.get("problems", [])]
check("Annotations linked to nothing (missing, ambiguous, invalid)", ", ".join(problems) or "none", "none", not problems)
lost = pmi.get("unattached", [])
check("Annotations on a shape the plate does not hold", ", ".join(lost) or "none", "none", not lost)
coverage = pmi.get("coverage", [])
uncovered = [ref for each in coverage for ref in each["uncovered"]]
check("Faces with no requirement", ", ".join(uncovered) or "none", "none", not uncovered)
conflicts = [f"{', '.join(each['ids'])}: {each['problem']}" for found in coverage for each in found["conflicts"]]
check("Conflicts", "; ".join(conflicts) or "none", "none", not conflicts)

entries = read(STEP)
kinds = Counter(entry["kind"] for entry in entries)
# The file holds a datum for each place a tolerance's frame names it: the letters are the datums.
letters = sorted({entry["datum"]["letter"] for entry in entries if entry["kind"] == "datum"})
broken = [entry["id"] for entry in entries if entry["status"] != "ok"]
check("Requirements read off the STEP",
      f"datums {', '.join(letters)}; {kinds['dimension']} dimensions; {kinds['geometric_tolerance']} tolerances",
      "datums A, B, C; dimensions; tolerances", letters == ["A", "B", "C"] and kinds["dimension"] > 0
      and kinds["geometric_tolerance"] > 0)
check("Requirements in the STEP not ok", ", ".join(broken) or "none", "none", not broken)
# The general profile is written as a surface profile on exactly the faces it covers, to A|B|C.
general = [entry for entry in entries if entry["kind"] == "geometric_tolerance"
           and entry["geometric_tolerance"]["characteristic"] == "surface_profile"
           and entry["geometric_tolerance"]["value"] == mp.GENERAL_PROFILE
           and entry["geometric_tolerance"]["datums"] == ["A", "B", "C"]]
covered = sum(len(entry["refs"]) for entry in general)
check("Faces the general profile holds, in the STEP", f"{covered} faces, profile {mp.GENERAL_PROFILE:g} to A|B|C",
      "every face nothing else controls", covered > 0)

lines = ["# Motor plate: 3D PMI check", "",
         "Measured on the plate's model (`parts/motor_plate.py`) and its AP242 STEP (`parts/motor_plate.step`, written "
         "by `cad run exports.py`) with `cad run checks/motor_plate_pmi.py`.", "",
         "| Check | Measured | Expected | Result |", "| --- | --- | --- | --- |"]
lines += [f"| {a} | {b} | {c} | {d} |" for a, b, c, d in rows]
(ROOT / "checks" / "motor_plate_pmi.md").write_text("\n".join(lines) + "\n")
print("\n".join(lines))
sys.exit(1 if any(row[3] == "FAIL" for row in rows) else 0)
