#!/usr/bin/env python3
"""Studio's FreeCAD on a Mac, for text-to-cad's CNC CAM: FreeCAD's own signed release, downloaded,
checked and installed in Studio's home (`studio-install-freecad`, which Studio writes beside `cad`).

A FreeCAD dragged into Applications from a browser's download carries macOS's quarantine mark, so
its first run waits on macOS's question about a downloaded app, and with nobody at the screen every
plan waited (0.1.19). A file Python writes carries no such mark, so once the checks below pass,
FreeCAD runs headless with no question. This never opens FreeCAD through LaunchServices (`open`),
never touches Applications and never removes a quarantine mark: it refuses a file that has one.

FreeCAD goes in `<home>/tools/freecad/FreeCAD.app`, `<home>` being the folder that holds
`CAD_LAUNCHER_DIR`, and its `freecadcmd` is linked into `CAD_LAUNCHER_DIR`, first on PATH for
Studio's agents and CAD server. cad's CAM looks on PATH before an installer's place, so the next
plan uses this FreeCAD, with no restart; a link left by a deleted FreeCAD is skipped.

    studio-install-freecad [--from <the release's .dmg, already downloaded>]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

VERSION = "1.1.4"
RELEASE = f"https://github.com/FreeCAD/FreeCAD/releases/download/{VERSION}/"
# Each Mac's disk image and its SHA-256, as the release publishes it (`<name>-SHA256.txt`).
DMGS = {
    "arm64": ("FreeCAD_1.1.4-macOS-arm64-py311.dmg",
              "071343b4abb70492b75c973f41eaf1d2528f9b9c7ea018d22a4f46ae14d27ac0"),
    "x86_64": ("FreeCAD_1.1.4-macOS-x86_64-py311.dmg",
               "e173d0dcf47a5166b59cbb33adccf54cd751eb9ceaa2c86486230d0d079648c1"),
}
# "Developer ID Application: The FreeCAD project association".
TEAM = "289DJRF23X"
QUARANTINE = "com.apple.quarantine"
VERSION_TIMEOUT_S = 60
PROGRAM = Path("Contents", "Resources", "bin", "freecadcmd")


class Refused(Exception):
    """Why FreeCAD was not installed, in a sentence for the person."""


Run = Callable[..., subprocess.CompletedProcess]


def run(args: list[str], **options) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True, errors="replace", **options)


@dataclass(frozen=True)
class Place:
    """Where Studio keeps its FreeCAD, and the folder its `freecadcmd` link goes in."""

    launchers: Path

    @property
    def folder(self) -> Path:
        return self.launchers.parent / "tools" / "freecad"

    @property
    def app(self) -> Path:
        return self.folder / "FreeCAD.app"

    @property
    def program(self) -> Path:
        return self.app / PROGRAM

    @property
    def record(self) -> Path:
        return self.folder / "installed.json"

    @property
    def link(self) -> Path:
        return self.launchers / "freecadcmd"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def check_download(path: Path, expected: str, run: Run = run) -> None:
    """Refused unless `path` is the release's file (its published SHA-256) and carries no quarantine mark."""
    found = sha256(path)
    if found != expected:
        raise Refused(f"the download is not FreeCAD's release file (its SHA-256 is {found}, the release publishes "
                      f"{expected}); it was deleted, so try again, and if it happens again the download is being changed "
                      "on its way")
    refuse_quarantine(path, run)


def refuse_quarantine(path: Path, run: Run = run) -> None:
    """Refused when macOS marked `path` as downloaded: its first run would wait on macOS's question, and Studio
    never removes the mark to skip that question."""
    if run(["xattr", "-p", QUARANTINE, str(path)]).returncode == 0:
        raise Refused(f"{path} carries macOS's quarantine mark, so its first run would wait on macOS's question "
                      "about a downloaded app; Studio does not remove that mark. Let Studio download FreeCAD itself "
                      "(run studio-install-freecad without --from)")


def check_app(app: Path, run: Run = run) -> None:
    """Refused unless `app` is FreeCAD as its project signed it: whole and unchanged, signed by the FreeCAD
    project's team, accepted by Gatekeeper, and with no quarantine mark."""
    verified = run(["codesign", "--verify", "--deep", "--strict", str(app)])
    if verified.returncode != 0:
        raise Refused(f"FreeCAD's signature does not hold: a file in it was changed or is missing "
                      f"({last_line(verified.stderr)})")
    described = run(["codesign", "-dv", "--verbose=2", str(app)])
    teams = [line.split("=", 1)[1].strip() for line in (described.stderr + described.stdout).splitlines()
             if line.startswith("TeamIdentifier=")]
    if teams != [TEAM]:
        raise Refused(f"FreeCAD is signed by team {teams[0] if teams else 'none'}, not the FreeCAD project's "
                      f"({TEAM})")
    assessed = run(["spctl", "--assess", "--type", "execute", "-vv", str(app)])
    if assessed.returncode != 0 or "accepted" not in assessed.stderr + assessed.stdout:
        raise Refused(f"macOS's Gatekeeper does not accept FreeCAD ({last_line(assessed.stderr)})")
    refuse_quarantine(app, run)
    refuse_quarantine(app / PROGRAM, run)


def check_runs(program: Path, run: Run = run) -> None:
    """Refused unless `program --version` says this FreeCAD within VERSION_TIMEOUT_S, run headless in a home of
    its own so it writes nothing in the person's FreeCAD settings."""
    with tempfile.TemporaryDirectory(prefix="studio-freecad-") as home:
        env = {**os.environ, "HOME": home, "TMPDIR": home}
        env.pop("DISPLAY", None)
        try:
            said = run([str(program), "--version"], env=env, stdin=subprocess.DEVNULL, timeout=VERSION_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            raise Refused(f"FreeCAD did not answer --version in {VERSION_TIMEOUT_S} s") from None
    if f"FreeCAD {VERSION}" not in said.stdout + said.stderr:
        raise Refused(f"FreeCAD did not run: {last_line(said.stderr or said.stdout) or f'exit {said.returncode}'}")


def link(place: Place) -> None:
    """`freecadcmd` in Studio's command folder, a link to Studio's FreeCAD (replacing only a link)."""
    if place.link.is_symlink():
        place.link.unlink()
    elif place.link.exists():
        raise Refused(f"{place.link} is a file of someone else's, so Studio left it alone")
    place.launchers.mkdir(parents=True, exist_ok=True)
    place.link.symlink_to(place.program)


def installed(place: Place) -> bool:
    """Whether Studio's FreeCAD of this version was installed, checked, and is still there."""
    try:
        record = json.loads(place.record.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    return isinstance(record, dict) and record.get("version") == VERSION and place.program.is_file()


def download(url: str, to: Path, say: Callable[[str], None]) -> None:
    """`url` written to `to` by Python itself, which sets no quarantine mark, saying how far it is every tenth."""
    with urllib.request.urlopen(url, timeout=60) as response, to.open("wb") as file:
        total = int(response.headers.get("Content-Length") or 0)
        done, shown = 0, 0
        while block := response.read(1 << 20):
            file.write(block)
            done += len(block)
            if total and done * 10 // total > shown:
                shown = done * 10 // total
                say(f"  {done // 1_000_000} of {total // 1_000_000} MB")


def copy_from_image(dmg: Path, to: Path, run: Run = run) -> None:
    """FreeCAD.app from the disk image `dmg` into `to`, the image attached read-only and out of Finder's sight
    (`-nobrowse`, nothing opened), and detached again whatever happens."""
    with tempfile.TemporaryDirectory(prefix="mount-", dir=to.parent) as mount:
        attached = run(["hdiutil", "attach", "-nobrowse", "-readonly", "-noautoopen", "-mountpoint", mount, str(dmg)])
        if attached.returncode != 0:
            raise Refused(f"the disk image would not open ({last_line(attached.stderr)})")
        try:
            copied = run(["ditto", str(Path(mount) / "FreeCAD.app"), str(to)])
            if copied.returncode != 0:
                raise Refused(f"FreeCAD could not be copied out of its disk image ({last_line(copied.stderr)})")
        finally:
            run(["hdiutil", "detach", mount, "-force"])


def install(place: Place, source: Path | None, machine: str, say: Callable[[str], None], run: Run = run) -> Path:
    """Studio's FreeCAD installed (or the one already there kept) and linked: the `freecadcmd` path."""
    if installed(place):
        link(place)
        say(f"FreeCAD {VERSION} is already installed for Studio.")
        return place.program
    if machine not in DMGS:
        raise Refused(f"FreeCAD publishes no Mac build for this processor ({machine})")
    name, expected = DMGS[machine]
    place.folder.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix=".install-", dir=place.folder))
    try:
        dmg = source
        if dmg is None:
            dmg = work / name
            say(f"Downloading FreeCAD {VERSION} (about 650 MB) from FreeCAD's release on GitHub.")
            try:
                download(RELEASE + name, dmg, say)
            except OSError as error:
                raise Refused(f"the download stopped ({error}); try again when the connection is back") from None
        say("Checking the download against the release's SHA-256.")
        check_download(dmg, expected, run)
        say("Copying FreeCAD out of its disk image (a few minutes).")
        staged = work / "FreeCAD.app"
        copy_from_image(dmg, staged, run)
        say("Checking FreeCAD's signature with macOS (about a minute).")
        check_app(staged, run)
        check_runs(staged / PROGRAM, run)
        if place.app.exists():
            shutil.rmtree(place.app)
        staged.rename(place.app)
        place.record.write_text(json.dumps({"version": VERSION, "sha256": expected}) + "\n", encoding="utf-8")
    finally:
        shutil.rmtree(work, ignore_errors=True)
    link(place)
    say(f"Installed FreeCAD {VERSION} for Studio: {place.program}")
    return place.program


def last_line(text: str) -> str:
    lines = [line.strip() for line in text.strip().splitlines() if line.strip()]
    return lines[-1] if lines else ""


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="studio-install-freecad", description=__doc__.split("\n\n")[0])
    parser.add_argument("--from", dest="source", type=Path,
                        help=f"the release's disk image, already downloaded ({DMGS['arm64'][0]})")
    options = parser.parse_args(argv)
    if sys.platform != "darwin":
        print("studio-install-freecad installs FreeCAD on a Mac. On Windows, install FreeCAD 1.1 or newer from "
              "https://www.freecad.org/downloads.php.", file=sys.stderr)
        return 1
    launchers = os.environ.get("CAD_LAUNCHER_DIR", "").strip()
    if not launchers:
        print("Run studio-install-freecad from Studio, which names its folders (CAD_LAUNCHER_DIR).", file=sys.stderr)
        return 1
    try:
        install(Place(Path(launchers)), options.source, platform.machine(), lambda line: print(line, flush=True))
    except Refused as refused:
        print(f"Studio did not install FreeCAD: {refused}.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
