#!/usr/bin/env python3
"""Studio's FreeCAD for text-to-cad's CNC CAM, the way cad's render runs Blender: FreeCAD as packages
in an environment of its own beside cad, never the FreeCAD app, so macOS asks no question about it.

conda-forge builds FreeCAD (its CAM workbench and post processors included) for macOS arm64 and
x86-64 and Windows x86-64. A lock per platform (`studio-freecad-env/<platform>.txt`) names every
package by URL and SHA-256; micromamba, a single program fetched at a pinned release and checked by
its SHA-256, installs exactly that set into `<home>/tools/freecad-env-<lock digest>`, `<home>` being
the folder that holds `CAD_LAUNCHER_DIR`. Nothing it writes carries macOS's quarantine mark, and
this refuses a `freecadcmd` that has one. Its package cache is removed after, and so is the
environment of an older lock.

On a Mac its `freecadcmd` is linked into `CAD_LAUNCHER_DIR`, first on PATH for Studio's agents and
CAD server; cad's CAM looks on PATH before an installer's place, so the next plan uses it. Windows
has no such link without a symlink privilege: there Studio would hand cad `CAD_FREECAD` (`--print`).

    studio_freecad_env.py [--print]
"""

from __future__ import annotations

import argparse
import hashlib
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from collections.abc import Callable
from pathlib import Path

VERSION = "1.1.3"
LOCKS = Path(__file__).resolve().with_name("studio-freecad-env")
MICROMAMBA_RELEASE = "2.10.0-0"
# Each platform's micromamba and its SHA-256, as its release publishes it (`<name>.sha256`).
MICROMAMBA = {
    "osx-arm64": "c547639f5caf742236641c362746abb4a3505774753ecd08fe341643670c4c01",
    "osx-64": "8421462a1ef1df9f7acd114f9e2a24c1332ce4f4e29f44465b4acb44e2755172",
    "win-64": "f8b4284bd4eb1134122eaf93b3ea6c7be567e596de5829e1a6f478e34e41974a",
}
QUARANTINE = "com.apple.quarantine"
VERSION_TIMEOUT_S = 60
INSTALL_TIMEOUT_S = 3600


class Refused(Exception):
    """Why FreeCAD was not installed, in a sentence for the person."""


Run = Callable[..., subprocess.CompletedProcess]
Download = Callable[[str, Path], None]


def subdir(system: str = sys.platform, machine: str = platform.machine()) -> str:
    """conda's name for this platform, one a lock is written for; Refused for any other."""
    machine = machine.lower()
    if system == "darwin" and machine == "arm64":
        return "osx-arm64"
    if system == "darwin" and machine == "x86_64":
        return "osx-64"
    if system == "win32" and machine in ("amd64", "x86_64"):
        return "win-64"
    raise Refused(f"Studio installs FreeCAD for Macs and 64-bit Windows; this is {system} {machine}.")


def lock_digest(lock: str) -> str:
    """What names an environment: its lock's packages, so a new lock is a new environment."""
    packages = sorted(line.strip() for line in lock.splitlines() if line.strip().startswith("https://"))
    return hashlib.sha256("\n".join(packages).encode()).hexdigest()[:12]


def freecadcmd(env: Path, platform_name: str) -> Path:
    """Where conda-forge's FreeCAD puts `freecadcmd` in an environment."""
    return env / "Library" / "bin" / "freecadcmd.exe" if platform_name == "win-64" else env / "bin" / "freecadcmd"


def said_version(text: str) -> str | None:
    found = re.search(r"FreeCAD\s+(\d+\.\d+(?:\.\d+)?)", text)
    return found.group(1) if found else None


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _download(url: str, to: Path) -> None:
    with urllib.request.urlopen(url, timeout=60) as response, to.open("wb") as out:
        shutil.copyfileobj(response, out, 1 << 20)


def _run(args: list[str], **options) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True, errors="replace", stdin=subprocess.DEVNULL, **options)


def quarantined(path: Path, run: Run) -> bool:
    if sys.platform != "darwin":
        return False
    return run(["xattr", "-p", QUARANTINE, str(path)]).returncode == 0


def check(program: Path, run: Run, scratch: Path) -> str:
    """The version `program` says within a minute, which must be :data:`VERSION`; Refused otherwise."""
    if not program.is_file():
        raise Refused(f"FreeCAD's environment has no {program.name}.")
    if quarantined(program, run):
        raise Refused(f"{program} carries macOS's quarantine mark, so it would wait on macOS's question.")
    env = {**os.environ, "FREECAD_USER_HOME": str(scratch)}
    try:
        done = run([str(program), "--version"], timeout=VERSION_TIMEOUT_S, env=env)
    except subprocess.TimeoutExpired:
        raise Refused(f"FreeCAD did not say its version within {VERSION_TIMEOUT_S} s.") from None
    version = said_version((done.stdout or "") + (done.stderr or ""))
    if version != VERSION:
        raise Refused(f"FreeCAD says it is {version or 'no version'}, not {VERSION}.")
    return version


def link(program: Path, launcher_dir: Path) -> Path:
    """`freecadcmd` in `launcher_dir`, linked to `program` (a Mac's: Windows takes `CAD_FREECAD`)."""
    launcher_dir.mkdir(parents=True, exist_ok=True)
    linked = launcher_dir / "freecadcmd"
    if linked.is_symlink() or linked.exists():
        linked.unlink()
    linked.symlink_to(program)
    return linked


def install(home: Path, *, platform_name: str | None = None, run: Run = _run,
            download: Download = _download) -> Path:
    """FreeCAD's environment in `home/tools`, made from this platform's lock when it is not there
    complete: its `freecadcmd`. An older lock's environment is removed. Refused in a sentence."""
    platform_name = platform_name or subdir()
    lock_file = LOCKS / f"{platform_name}.txt"
    lock = lock_file.read_text(encoding="utf-8")
    tools = home / "tools"
    env = tools / f"freecad-env-{lock_digest(lock)}"
    program = freecadcmd(env, platform_name)
    marker = env / "studio-installed"
    tools.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".freecad-", dir=tools) as scratch_name:
        scratch = Path(scratch_name)
        if not marker.is_file():
            shutil.rmtree(env, ignore_errors=True)
            micromamba = scratch / ("micromamba.exe" if platform_name == "win-64" else "micromamba")
            download(f"https://github.com/mamba-org/micromamba-releases/releases/download/{MICROMAMBA_RELEASE}/"
                     f"micromamba-{platform_name}", micromamba)
            if sha256(micromamba) != MICROMAMBA[platform_name]:
                raise Refused("micromamba's download does not match its release's SHA-256.")
            micromamba.chmod(0o755)
            root = scratch / "root"
            done = run([str(micromamba), "create", "--yes", "--quiet", "--no-rc", "--root-prefix", str(root),
                        "--prefix", str(env), "--file", str(lock_file)],
                       timeout=INSTALL_TIMEOUT_S, env={**os.environ, "CONDA_PKGS_DIRS": str(root / "pkgs")})
            if done.returncode != 0:
                shutil.rmtree(env, ignore_errors=True)
                tail = " ".join(((done.stderr or "") + (done.stdout or "")).split()[-40:])
                raise Refused(f"micromamba could not install FreeCAD: {tail}")
            check(program, run, scratch / "freecad")
            marker.write_text(f"{VERSION}\n", encoding="utf-8")
        else:
            check(program, run, scratch / "freecad")
    for older in tools.glob("freecad-env-*"):
        if older != env:
            shutil.rmtree(older, ignore_errors=True)
    return program


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Install Studio's FreeCAD for CNC CAM.")
    parser.add_argument("--print", action="store_true", help="print the freecadcmd to set CAD_FREECAD to")
    args = parser.parse_args(argv)
    launcher = os.environ.get("CAD_LAUNCHER_DIR")
    if not launcher:
        print("CAD_LAUNCHER_DIR is not set: run this from Studio.", file=sys.stderr)
        return 2
    launcher_dir = Path(launcher)
    try:
        program = install(launcher_dir.parent)
    except Refused as refused:
        print(refused, file=sys.stderr)
        return 1
    if args.print or sys.platform == "win32":
        print(program)
    else:
        print(f"FreeCAD {VERSION} is installed: {link(program, launcher_dir)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
