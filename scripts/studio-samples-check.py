#!/usr/bin/env python3
"""Runs every script of Studio's examples (studio-sample/<id>/) with `cad run`, as their READMEs do, and says which
did not exit 0.

Each example is copied to a scratch folder first, so the run writes nothing into the example, and run from its
copy's root in the order its READMEs give: the models (each script declaring an `@model`), then `exports.py`, which
writes the files the rest read, then every other script (drawings, work instructions, checks). A script that takes
arguments on its command line (a probe its README gives arguments to) and the shared `sizes.py` are left out. The
motor mount's `checks/motor_plate_pmi.py` exits 1 unless the plate's PMI has every face covered and no annotation
unattached, so it is this run's PMI check too.

    text-to-cad/.venv/bin/python scripts/studio-samples-check.py [example ...]

The engine is the cad command's own unless CAD_STATE_DIR, CAD_CACHE_DIR and CAD_ENGINE_DIR are set: then the run
starts the checkout's .venv's server there (`cad server start`), uses those folders (and CAD_ENGINE_PORT) and stops
that server when it ends. The engine listens on a loopback
port, so a sandbox that refuses local sockets refuses the run.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "studio-sample"
# The library and its server, one package from text-to-cad 0.11.12, as the checkout's `uv sync` installs it.
CAD_SRC = [ROOT / "text-to-cad" / "packages" / "cad" / "src"]


def scripts(sample: Path) -> list[Path]:
    """A sample's scripts in the order its READMEs run them: models, `exports.py`, then the rest."""
    found = []
    for path in sorted(sample.rglob("*.py")):
        relative = path.relative_to(sample)
        if "imported" in relative.parts or "__pycache__" in relative.parts or path.name == "sizes.py":
            continue
        text = path.read_text(encoding="utf-8")
        if "sys.argv" in text:
            continue
        found.append(relative)

    def order(relative: Path) -> tuple[int, str]:
        text = (sample / relative).read_text(encoding="utf-8")
        rank = 0 if "\n@model" in text else 1 if relative.name == "exports.py" else 2
        return rank, str(relative)

    return sorted(found, key=order)


def run(script: Path, cwd: Path, env: dict[str, str]) -> tuple[int, str]:
    """`cad run` of one script from the sample's root: its exit code and what it said."""
    done = subprocess.run([sys.executable, "-m", "cad_server.cli", "run", str(script)], cwd=cwd, env=env,
                          capture_output=True, text=True)
    return done.returncode, f"{done.stdout}{done.stderr}"


def main() -> int:
    asked = sys.argv[1:]
    samples = [path for path in sorted(SAMPLES.iterdir()) if (path / "studio-sample.json").is_file()
               and (not asked or path.name in asked)]
    env = dict(os.environ)
    env["PYTHONPATH"] = os.pathsep.join([*map(str, CAD_SRC), *filter(None, [env.get("PYTHONPATH")])])
    isolated = all(env.get(name) for name in ("CAD_STATE_DIR", "CAD_CACHE_DIR", "CAD_ENGINE_DIR"))
    if isolated:
        # A state folder of its own has no server running: start the checkout's .venv's there, since from
        # text-to-cad 0.11.12 `cad run` starts none and says so.
        subprocess.run([sys.executable, "-m", "cad_server.cli", "server", "start"], env=env, check=True)
    failed = []
    with tempfile.TemporaryDirectory(prefix="studio-samples-") as folder:
        try:
            for sample in samples:
                copy = Path(folder) / sample.name
                shutil.copytree(sample, copy, ignore=shutil.ignore_patterns("__pycache__"))
                for script in scripts(copy):
                    code, said = run(script, copy, env)
                    print(f"{'ok  ' if code == 0 else 'FAIL'} {sample.name}/{script} (exit {code})", flush=True)
                    if code != 0:
                        failed.append(f"{sample.name}/{script}")
                        print("\n".join(said.splitlines()[-12:]), file=sys.stderr)
        finally:
            if isolated:
                subprocess.run([sys.executable, "-m", "cad_server.cli", "server", "stop"], env=env, capture_output=True)
    print(f"{len(failed)} failed" + (f": {', '.join(failed)}" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
