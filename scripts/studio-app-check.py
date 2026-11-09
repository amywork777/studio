#!/usr/bin/env python3
"""Checks an installed or built Studio the way a friend's first hour would use it: by the CAD tools the app carries,
not the checkout's. With the app's own Python and a home of its own, it registers the bundled CAD server (as the
app does on each start), builds the motor mount example's plate, rebuilds all of every example's delivered STEP files
and compares each with the one the example ships with, then solves every example's strength study and holds each
answer to the one the example ships with. No pass, no release.

    python3 scripts/studio-app-check.py <the app's studio folder>

The studio folder is `Studio.app/Contents/Resources/studio` on a Mac and `resources\\studio` beside Studio.exe on
Windows. Nothing it writes is the person's: the home is a scratch folder, removed after, and the engine listens on
its own port (`check_engine_port`), never the app's (3345) or a checkout's (3346), so it never retires either,
and one a leftover engine from an earlier check holds never stops it.
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# The part it builds: the motor mount's plate, a model script.
SAMPLE = "motor-mount"
PART = "parts/motor_plate.py"
# A fresh mesh of the same part lands near the shipped answer, not on it.
STRESS_TOLERANCE = 0.25
# `cad <type> solve`'s document type for a study's document, by its ending.
SOLVED_TYPES = {".step": "step", ".stp": "step", ".xbf": "xbf"}
# A rebuilt part matches its shipped STEP when solid_diff finds nothing added or removed. An assembly's solids are fused
# first, which leaves the same sliver each way between two runs of one model: at most 0.0115% of its volume across the
# five examples on text-to-cad 0.10.3. Its parts are held exactly, so this hides no change to a part.
ASSEMBLY_SLIVER = 0.0005


def python_of(bundle: Path) -> Path:
    windows = bundle / "python" / "python.exe"
    return windows if windows.is_file() else bundle / "python" / "bin" / "python3"


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip().splitlines()[-4], file=sys.stderr)
        return 2
    bundle = Path(sys.argv[1]).resolve()
    python = python_of(bundle)
    samples = bundle / "sample"
    # Each study beside the answer the example ships with, the folder its solve wrote (`<name>/result.json`), which
    # names the document it solved.
    studies = sorted(study for study in samples.glob("*/studies/*.study.json") if shipped_answer(study).is_file())
    for needed in (python, samples / SAMPLE / PART):
        if not needed.is_file():
            print(f"FAIL the app carries no {needed}", file=sys.stderr)
            return 1
    wheels = bundle / "wheels"
    if not any(wheels.glob("cad-*.whl")):
        print(f"FAIL the app carries no library wheel under {wheels}", file=sys.stderr)
        return 1
    # An install record naming the build's wheel sends an integration made on first use to a file that is gone.
    named = subprocess.run([str(python), "-c", "from importlib.metadata import distribution as d; "
                            "print(' '.join(n for n in ('cad', 'cad-server', 'cad-mcp') if d(n).read_text('direct_url.json')))"],
                           capture_output=True, text=True)
    if named.returncode != 0 or named.stdout.strip():
        print(f"FAIL still installed from the build's wheel: {named.stdout.strip() or named.stderr.strip()}",
              file=sys.stderr)
        return 1
    if not studies:
        print(f"FAIL the app carries no example with a strength study under {samples}", file=sys.stderr)
        return 1

    with tempfile.TemporaryDirectory(prefix="studio-app-check-") as folder:
        home = Path(folder)
        cad = home / "cad"
        # The app's own solver, cad[calculix]'s, never one CAD_CCX names here.
        env = {
            **{name: value for name, value in os.environ.items() if name != "CAD_CCX"},
            # As studioEngine.ts gives the app's, on a port of this check's own.
            "CAD_STATE_DIR": str(cad / "state"),
            "CAD_CACHE_DIR": str(cad / "cache"),
            "CAD_ENGINE_DIR": str(cad / "engine"),
            "CAD_ENGINE_PORT": check_engine_port(),
            "CAD_LAUNCHER_DIR": str(home / "bin"),
            "CAD_UPDATE_FIND_LINKS": str(wheels),
            # A home with nothing in it: no tool this Mac or PC happens to have cached stands in for one the app
            # is missing.
            "HOME": str(home),
            "USERPROFILE": str(home),
            "DO_NOT_TRACK": "1",
        }
        shutil.copytree(samples, home / "sample", ignore=shutil.ignore_patterns("__pycache__"))

        def cad_command(*args: str, cwd: Path, timeout: int) -> subprocess.CompletedProcess[str]:
            started = time.monotonic()
            done = subprocess.run([str(python), "-P", "-m", *args], cwd=cwd, env=env, capture_output=True,
                                  text=True, timeout=timeout)
            print(f"{'ok  ' if done.returncode == 0 else 'FAIL'} {' '.join(args)} "
                  f"({time.monotonic() - started:.0f} s)", flush=True)
            if done.returncode != 0:
                print("\n".join(f"{done.stdout}{done.stderr}".splitlines()[-15:]), file=sys.stderr)
            return done

        try:
            if cad_command("cad_server._internal.installations", cwd=home, timeout=300).returncode != 0:
                return 1
            if cad_command("cad_server.cli", "run", PART, cwd=home / "sample" / SAMPLE, timeout=600).returncode:
                return 1
            failed = 0
            for project in sorted(path.parent for path in (home / "sample").glob("*/studio-sample.json")):
                failed += rebuilt_as_shipped(project, samples / project.name, home / "compared", cad_command)
            for study in studies:
                project = home / "sample" / study.parent.parent.name
                shipped = json.loads(shipped_answer(study).read_text(encoding="utf-8"))
                # text-to-cad 0.11's `cad <type> solve`, its results written into a folder of their own.
                document = shipped["path"]
                solved = cad_command("cad_server.cli", SOLVED_TYPES[Path(document).suffix.lower()], "solve",
                                     document, "--study", str(study.relative_to(study.parent.parent)),
                                     "--out", str(home / "solved" / project.name), "--json", cwd=project,
                                     timeout=900)
                failed += 1 if solved.returncode != 0 else held_to_shipped(project.name, solved.stdout, shipped)
            return 1 if failed else 0
        finally:
            subprocess.run([str(python), "-P", "-m", "cad_server.cli", "stop"], env=env, capture_output=True,
                           timeout=60)


def check_engine_port() -> str:
    """A port nothing listens on now, for this check's engine alone."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return str(probe.getsockname()[1])


def shipped_answer(study: Path) -> Path:
    """The answer an example ships for a study: the folder its solve wrote, named for the study
    (`studies/bracket.study.json` beside `studies/bracket/result.json`)."""
    return study.with_name(study.name.removesuffix(".study.json")) / "result.json"


def rebuilt_as_shipped(project: Path, shipped: Path, compared: Path, cad_command) -> int:
    """Runs an example's `exports.py` in its copy, then compares each STEP it delivers with the shipped one: 1 if any
    differs, or was not rebuilt. Files bought in (`imported`) are not made here."""
    delivered = {path: path.stat().st_mtime_ns for path in sorted(project.rglob("*.step"))
                 if "imported" not in path.relative_to(project).parts}
    if not delivered:
        print(f"FAIL {project.name}: the example delivers no STEP", file=sys.stderr)
        return 1
    if cad_command("cad_server.cli", "run", "exports.py", cwd=project, timeout=1200).returncode != 0:
        return 1
    failed = 0
    for rebuilt, written in delivered.items():
        relative = rebuilt.relative_to(project)
        if rebuilt.stat().st_mtime_ns == written:
            print(f"FAIL {project.name}: exports.py did not rebuild {relative.as_posix()}", file=sys.stderr)
            failed += 1
            continue
        out = compared / project.name / relative.with_suffix("")
        cad_command("cad.edit.solid_diff", str(shipped / relative), str(rebuilt), str(out), cwd=project, timeout=300)
        problem = step_difference(json.loads((out / "result.json").read_text(encoding="utf-8")), relative)
        if problem:
            print(f"FAIL {project.name}: {relative.as_posix()} {problem}", file=sys.stderr)
            if "assemblies" in relative.parts:
                print(parts_moved(shipped / relative, rebuilt, project), file=sys.stderr)
            failed += 1
    if not failed:
        print(f"ok   {project.name}: {len(delivered)} STEP files as shipped")
    return 1 if failed else 0


# Each part of an assembly STEP: its label, where it sits and its volume, one line each.
PARTS_OF = """
import sys
from pathlib import Path
from cad import step
def at(v):
    return ", ".join(f"{round(x, 4) + 0.0:.4f}" for x in (v.X, v.Y, v.Z))
for part in step.read(Path(sys.argv[1])).children:
    print(f"{part.label}: at ({at(part.location.position)}) turned ({at(part.location.orientation)}), {part.volume:.3f} mm3")
"""


def parts_moved(shipped: Path, rebuilt: Path, project: Path) -> str:
    """Which parts of a rebuilt assembly sit elsewhere or hold another volume than the shipped one's, so a
    failure says what moved."""
    lines = []
    for path in (shipped, rebuilt):
        done = subprocess.run([sys.executable, "-P", "-c", PARTS_OF, str(path)], cwd=project, capture_output=True,
                              text=True, timeout=300)
        lines.append(done.stdout.splitlines() if done.returncode == 0 else [f"(could not read: {done.stderr[-300:]})"])
    before, after = lines
    moved = [f"     shipped {old}\n     rebuilt {new}" for old, new in zip(before, after) if old != new]
    if len(before) != len(after):
        moved.append(f"     {len(before)} parts shipped, {len(after)} rebuilt")
    return "\n".join(moved) or "     every part sits where it did, with its volume: the difference is in the fuse"


def step_difference(result: dict, relative: Path) -> str | None:
    """What differs in solid_diff's result for a rebuilt STEP, or None when it matches the shipped one."""
    if "error" in result:
        return f"could not be compared: {result['error']}"
    if result["same"]:
        return None
    changed = result["added_mm3"] + result["removed_mm3"]
    if "assemblies" in relative.parts and changed <= ASSEMBLY_SLIVER * result["kept_mm3"]:
        return None
    return (f"changed from the shipped STEP: {result['added_mm3']:.3f} mm3 added, "
            f"{result['removed_mm3']:.3f} mm3 removed, {result['kept_mm3']:.3f} mm3 kept")


def held_to_shipped(name: str, stdout: str, shipped: dict) -> int:
    """The solve's answer beside the example's: forces in balance, stress near the shipped run's, the same verdicts.
    Both are text-to-cad 0.11's `result.json`, whose numbers are its `measurements`."""
    line = next((line for line in reversed(stdout.splitlines()) if line.startswith("{")), "")
    result = json.loads(line) if line else {}
    summary = result.get("measurements") or {}
    expected = shipped["measurements"]
    problems = []
    applied, reaction = summary.get("applied_force_N"), summary.get("reaction_force_N")
    if not applied or not reaction or any(abs(a + r) > 0.01 * max(1.0, abs(a)) for a, r in zip(applied, reaction)):
        problems.append(f"the supports do not carry the load: applied {applied} N, reaction {reaction} N")
    stress, shipped_stress = summary.get("max_von_mises_MPa"), expected["max_von_mises_MPa"]
    if not isinstance(stress, (int, float)) or abs(stress - shipped_stress) > STRESS_TOLERANCE * shipped_stress:
        problems.append(f"peak stress {stress} MPa, where the example's run found {shipped_stress} MPa")
    statuses = [check.get("status") for check in summary.get("checks") or []]
    if statuses != [check["status"] for check in expected["checks"]]:
        problems.append(f"the checks say {statuses}, where the example's run says "
                        f"{[check['status'] for check in expected['checks']]}")
    if problems:
        for problem in problems:
            print(f"FAIL {name}: {problem}", file=sys.stderr)
        return 1
    print(f"ok   {name}: {stress} MPa peak (the example's run: {shipped_stress} MPa), checks {statuses}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
