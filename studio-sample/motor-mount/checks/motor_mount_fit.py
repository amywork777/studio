"""Checks the motor mount for collisions between its parts and measures where the motor and screws sit on the
plate: it calls the mount's model, so it checks the mount as it is now. Run from the project root with
`cad run checks/motor_mount_fit.py`; writes checks/motor_mount_fit.md."""

import sys
from itertools import combinations
from pathlib import Path

from cad.build123d import overlap_volume

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "assemblies"))

from motor_mount import motor_mount  # noqa: E402

# Every placed part, in world coordinates, by its label.
parts = {part.label: part for part in motor_mount().shape.leaves}

lines = ["# Motor mount: fit check", "",
         "Measured on the motor mount's model (`assemblies/motor_mount.py`) with `cad run checks/motor_mount_fit.py`. "
         "Millimetres; the plate's underside is Z 0.", "", "## Overlaps between parts", "", "| Parts | Overlap, mm3 | Result |", "| --- | --- | --- |"]
bad = 0
for (a, sa), (b, sb) in combinations(parts.items(), 2):
    v = sum(overlap_volume(x, y) for x in sa.solids() for y in sb.solids())
    if v > 1e-6:
        bad += 1
    lines.append(f"| {a} / {b} | {v:.4f} | {'pass' if v <= 1e-6 else 'FAIL'} |")

lines += ["", "## Where the parts sit", "", "| Part | Z min | Z max |", "| --- | --- | --- |"]
for name, shape in parts.items():
    bb = shape.bounding_box()
    lines.append(f"| {name} | {bb.min.Z:.3f} | {bb.max.Z:.3f} |")
lines += ["", f"{bad} overlapping pairs of {len(list(combinations(parts, 2)))}."]
(ROOT / "checks" / "motor_mount_fit.md").write_text("\n".join(lines) + "\n")
print("\n".join(lines))
