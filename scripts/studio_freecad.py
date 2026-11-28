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
plan uses this FreeCAD, with no restart. Until then Studio puts a stand-in there (`STAND_IN`), so cad's
CAM never falls through to a FreeCAD in Applications, whose first run waits on macOS's question: a plan
stops at once, and the stand-in says FreeCAD is not installed for Studio. The install replaces it.

The install takes minutes (a download of about 650 MB, a copy and macOS's signature check), longer than an
agent's command may run (Claude Code's stops at 120 s), so it runs in a process of its own, detached, that holds
`install.lock` until it ends and writes how far it is in `install-status.json`. Each call returns within
`WAIT_S`, saying how far the install is, so an agent calls again until it says FreeCAD is installed, in the
same turn, whichever agent it is.

    studio-install-freecad [--from <the release's .dmg, already downloaded>]   # start it, or join it, and wait
    studio-install-freecad --wait     # wait for the install running, up to WAIT_S, starting none
    studio-install-freecad --check    # whether it is installed, running nothing (exit 0 yes, 1 no)
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
import time
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
# How long one call waits for the install: well under the 120 s an agent's command may run, and under the
# 90 s an agent gave its call, at which Claude Code moved the call to the background (0.1.19).
WAIT_S = 60
PROGRAM = Path("Contents", "Resources", "bin", "freecadcmd")
# Studio's `freecadcmd` on a Mac until its FreeCAD is installed (written here for a checkout, by studioAppBundle.ts for
# the app, the same text): it exits at once and says why on stderr, never a "FreeCAD <version>" cad would take.
STAND_IN_MARK = "# Studio's freecadcmd until studio-install-freecad installs FreeCAD for Studio."
NOT_INSTALLED = ("FreeCAD is not installed for Studio: ask the person whether to install it (a download of about 650 MB), "
                 "then run studio-install-freecad.")
STAND_IN = f"#!/bin/sh\n{STAND_IN_MARK}\necho '{NOT_INSTALLED}' >&2\nexit 1\n"


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

    @property
    def lock(self) -> Path:
        return self.folder / "install.lock"

    @property
    def status(self) -> Path:
        return self.folder / "install-status.json"

    @property
    def log(self) -> Path:
        return self.folder / "install.log"


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


def is_stand_in(path: Path) -> bool:
    """Whether `path` is Studio's stand-in `freecadcmd` (`STAND_IN`)."""
    try:
        with path.open("rb") as file:
            return STAND_IN_MARK.encode() in file.read(256)
    except OSError:
        return False


def stand_in(place: Place) -> None:
    """The stand-in `freecadcmd` in Studio's command folder, unless Studio's FreeCAD is linked there (a link to a file
    that is there) or the file is someone else's. A link left by a deleted FreeCAD is replaced: cad would skip it."""
    if place.link.is_symlink():
        if place.link.exists():
            return
        place.link.unlink()
    elif place.link.exists() and not is_stand_in(place.link):
        return
    place.launchers.mkdir(parents=True, exist_ok=True)
    place.link.write_text(STAND_IN, encoding="utf-8")
    place.link.chmod(0o755)


def link(place: Place) -> None:
    """`freecadcmd` in Studio's command folder, a link to Studio's FreeCAD (replacing only a link or the stand-in)."""
    if place.link.is_symlink() or is_stand_in(place.link):
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


def check(place: Place) -> tuple[int, str]:
    """Whether Studio's FreeCAD is installed, from its record alone (no FreeCAD run): an exit code and a sentence."""
    if installed(place):
        return 0, f"FreeCAD {VERSION} is installed for Studio: {place.program}"
    if installing(place):
        return 1, f"FreeCAD is being installed for Studio now. {AGAIN}"
    status = read_status(place)
    failed = f" The last install stopped: {status['error']}." if status.get("state") == "failed" else ""
    return 1, (f"FreeCAD is not installed for Studio.{failed} `studio-install-freecad` installs FreeCAD {VERSION} "
               "(a download of about 650 MB), once the person says yes")


AGAIN = "Run `studio-install-freecad --wait` again until it says FreeCAD is installed; no plan has run yet."


def installing(place: Place) -> bool:
    """Whether an install holds `place.lock` now (an flock, so it is let go when its process ends, however)."""
    import fcntl

    if not place.lock.exists():
        return False
    fd = os.open(place.lock, os.O_RDWR)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return True
    finally:
        os.close(fd)
    return False


def read_status(place: Place) -> dict:
    try:
        status = json.loads(place.status.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return status if isinstance(status, dict) else {}


def write_status(place: Place, **status) -> None:
    staged = place.status.with_suffix(".json.new")
    staged.write_text(json.dumps(status) + "\n", encoding="utf-8")
    staged.replace(place.status)


def start(place: Place, spawn: Callable[[int], None]) -> bool:
    """The install started, by `spawn` handed the open `place.lock` it holds locked (its process keeps it until it
    ends), unless FreeCAD is installed or an install already holds the lock: whether this call started one."""
    import fcntl

    if installed(place):
        link(place)
        return False
    place.folder.mkdir(parents=True, exist_ok=True)
    fd = os.open(place.lock, os.O_RDWR | os.O_CREAT, 0o644)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return False
        write_status(place, state="installing", said=[])
        try:
            spawn(fd)
        except OSError as error:
            write_status(place, state="failed", said=[], error=f"the install could not start ({error})")
            raise Refused(f"the install could not start ({error})") from None
    finally:
        os.close(fd)
    return True


def detach(place: Place, fd: int, args: list[str]) -> subprocess.Popen:
    """`args` run in a session of their own, holding the lock `fd` until they end, their output in `place.log`."""
    with place.log.open("w", encoding="utf-8") as log:
        return subprocess.Popen(args, pass_fds=(fd,), stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                         start_new_session=True)


def work(place: Place, source: Path | None, machine: str, run: Run = run) -> int:
    """The install itself, in the detached process: how far it is, and how it ended, in `place.status`."""
    said: list[str] = []

    def say(line: str) -> None:
        said.append(line.strip())
        write_status(place, state="installing", said=said)

    try:
        install(place, source, machine, say, run)
    except Refused as refused:
        write_status(place, state="failed", said=said, error=str(refused))
        return 1
    except Exception as error:  # noqa: BLE001 -- whatever stops it is said to the agent waiting on it
        write_status(place, state="failed", said=said, error=f"{type(error).__name__}: {error}")
        return 1
    write_status(place, state="installed", said=said)
    return 0


def wait(place: Place, seconds: float = WAIT_S, sleep: Callable[[float], None] = time.sleep,
         clock: Callable[[], float] = time.monotonic) -> tuple[int, str]:
    """Waits up to `seconds` for the install running: an exit code and what to say (0 installed or still
    installing, which the words tell apart; 1 failed or none running)."""
    end = clock() + seconds
    while installing(place):
        if clock() >= end:
            said = read_status(place).get("said") or ["starting"]
            return 0, f"Still installing FreeCAD for Studio, at: {said[-1]} {AGAIN}"
        sleep(1)
    status = read_status(place)
    if installed(place):
        return 0, f"Installed FreeCAD {VERSION} for Studio: {place.program}. Plan now."
    if status.get("state") == "failed":
        return 1, f"Studio did not install FreeCAD: {status['error']}."
    if status.get("state") == "installing":
        return 1, (f"The install of FreeCAD stopped before it finished ({place.log} says why). Run "
                   "`studio-install-freecad` to start it again.")
    return 1, "No install of FreeCAD for Studio is running. `studio-install-freecad` starts one."


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
    parser.add_argument("--check", action="store_true",
                        help="say whether Studio's FreeCAD is installed, downloading and running nothing")
    parser.add_argument("--wait", action="store_true",
                        help=f"wait up to {WAIT_S} s for the install running, starting none")
    parser.add_argument("--work", action="store_true", help=argparse.SUPPRESS)
    options = parser.parse_args(argv)
    if sys.platform != "darwin":
        print("studio-install-freecad installs FreeCAD on a Mac. On Windows, install FreeCAD 1.1 or newer from "
              "https://www.freecad.org/downloads.php.", file=sys.stderr)
        return 1
    launchers = os.environ.get("CAD_LAUNCHER_DIR", "").strip()
    if not launchers:
        print("Run studio-install-freecad from Studio, which names its folders (CAD_LAUNCHER_DIR).", file=sys.stderr)
        return 1
    place = Place(Path(launchers))
    if options.check:
        code, said = check(place)
        print(said, flush=True)
        return code
    if options.work:
        return work(place, options.source, platform.machine())
    if not options.wait:
        source = ["--from", str(options.source.resolve())] if options.source else []
        try:
            if start(place, lambda fd: detach(place, fd, [sys.executable, "-P", "-B", str(Path(__file__).resolve()),
                                                         "--work", *source])):
                print(f"Installing FreeCAD {VERSION} for Studio (a download of about 650 MB, a few minutes).",
                      flush=True)
        except Refused as refused:
            print(f"Studio did not install FreeCAD: {refused}.", file=sys.stderr)
            return 1
    code, said = wait(place)
    print(said, file=sys.stderr if code == 1 else sys.stdout, flush=True)
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
