"""scripts/studio_freecad.py's checks, with macOS's tools stood in for: python3 -m unittest discover -s scripts -p 'studio_*_test.py'"""

from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path

import studio_cad_plugin
import studio_freecad as freecad
from studio_freecad import Place, Refused

TEAM_LINE = f"TeamIdentifier={freecad.TEAM}"


class Mac:
    """macOS's tools as an install meets them: FreeCAD's signed app, no quarantine mark, unless told otherwise."""

    def __init__(self, *, team: str = TEAM_LINE, quarantined: tuple[str, ...] = (), version: str = "FreeCAD 1.1.4"):
        self.team, self.quarantined, self.version = team, quarantined, version
        self.calls: list[list[str]] = []

    def __call__(self, args: list[str], **_options) -> subprocess.CompletedProcess:
        self.calls.append(args)
        tool = Path(args[0]).name
        if tool == "xattr":
            marked = any(args[-1].endswith(name) for name in self.quarantined)
            return done(0 if marked else 1)
        if tool == "codesign" and "-dv" in args:
            return done(0, err=f"Executable=...\n{self.team}\n")
        if tool == "spctl":
            return done(0, err=f"{args[-1]}: accepted\nsource=Notarized Developer ID\n")
        if tool == "ditto":
            program = Path(args[2]) / freecad.PROGRAM
            program.parent.mkdir(parents=True)
            program.write_text("#!/bin/sh\n")
        if tool == "freecadcmd":
            return done(0, out=f"{self.version} Revision: 20260928\n")
        return done(0)


def done(code: int, out: str = "", err: str = "") -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess([], code, out, err)


class InstallTest(unittest.TestCase):
    def setUp(self) -> None:
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.place = Place(self.root / "home" / "bin")
        self.dmg = self.root / "FreeCAD.dmg"
        self.dmg.write_bytes(b"FreeCAD's disk image")
        name, _hash = freecad.DMGS["arm64"]
        self.release = {"arm64": (name, hashlib.sha256(b"FreeCAD's disk image").hexdigest())}
        self.addCleanup(setattr, freecad, "DMGS", freecad.DMGS)
        freecad.DMGS = self.release

    def install(self, mac: Mac) -> Path:
        return freecad.install(self.place, self.dmg, "arm64", lambda _line: None, mac)

    def test_installs_in_studios_home_and_links_freecadcmd_beside_cad(self) -> None:
        mac = Mac()
        program = self.install(mac)
        self.assertEqual(program, self.root / "home" / "tools" / "freecad" / "FreeCAD.app" / freecad.PROGRAM)
        self.assertTrue(program.is_file())
        self.assertEqual(self.place.link.readlink(), program)
        # The download, its mount and the staged copy are gone.
        self.assertEqual(sorted(path.name for path in self.place.folder.iterdir()), ["FreeCAD.app", "installed.json"])
        self.assertIn(["hdiutil", "detach"], [call[:2] for call in mac.calls])

    def test_refuses_a_download_that_is_not_the_release_file(self) -> None:
        freecad.DMGS = {"arm64": (self.release["arm64"][0], "0" * 64)}
        with self.assertRaisesRegex(Refused, "not FreeCAD's release file"):
            self.install(Mac())
        self.assertNothingInstalled()

    def test_refuses_freecad_signed_by_another_team(self) -> None:
        with self.assertRaisesRegex(Refused, "signed by team SOMEONE"):
            self.install(Mac(team="TeamIdentifier=SOMEONE"))
        self.assertNothingInstalled()

    def test_refuses_a_quarantined_download_and_never_removes_the_mark(self) -> None:
        for marked in ("FreeCAD.dmg", "FreeCAD.app", "freecadcmd"):
            mac = Mac(quarantined=(marked,))
            with self.subTest(marked=marked), self.assertRaisesRegex(Refused, "quarantine mark"):
                self.install(mac)
            self.assertNotIn("-d", [arg for call in mac.calls if call[0] == "xattr" for arg in call])
            self.assertNothingInstalled()

    def test_refuses_a_freecad_that_does_not_run(self) -> None:
        with self.assertRaisesRegex(Refused, "did not run"):
            self.install(Mac(version="dyld: Library not loaded"))
        self.assertNothingInstalled()

    def test_keeps_the_freecad_already_installed(self) -> None:
        self.install(Mac())
        self.place.link.unlink()
        again = Mac()
        freecad.install(self.place, None, "arm64", lambda _line: None, again)
        self.assertEqual(again.calls, [])  # no download, no checks
        self.assertEqual(self.place.link.readlink(), self.place.program)

    def test_installs_again_when_studios_freecad_was_deleted(self) -> None:
        self.install(Mac())
        (self.place.program).unlink()
        self.assertFalse(freecad.installed(self.place))
        self.install(Mac())
        self.assertTrue(self.place.program.is_file())

    def test_check_says_whether_studios_freecad_is_installed_without_running_anything(self) -> None:
        code, said = freecad.check(self.place)
        self.assertEqual(code, 1)
        self.assertIn("not installed for Studio", said)
        self.install(Mac())
        code, said = freecad.check(self.place)
        self.assertEqual((code, said), (0, f"FreeCAD {freecad.VERSION} is installed for Studio: {self.place.program}"))
        self.place.program.unlink()
        self.assertEqual(freecad.check(self.place)[0], 1)

    def test_leaves_a_freecadcmd_of_someone_elses_alone(self) -> None:
        self.place.launchers.mkdir(parents=True)
        self.place.link.write_text("#!/bin/sh\n")
        with self.assertRaisesRegex(Refused, "someone else's"):
            self.install(Mac())
        self.assertEqual(self.place.link.read_text(), "#!/bin/sh\n")

    def test_the_stand_in_stops_at_once_saying_freecad_is_not_installed_until_the_install_replaces_it(self) -> None:
        freecad.stand_in(self.place)
        said = subprocess.run([str(self.place.link), "--version"], capture_output=True, text=True, timeout=10)
        self.assertNotEqual(said.returncode, 0)
        self.assertEqual((said.stdout, said.stderr.strip()), ("", freecad.NOT_INSTALLED))
        self.assertEqual(freecad.check(self.place)[0], 1)
        self.install(Mac())
        self.assertEqual(self.place.link.readlink(), self.place.program)
        freecad.stand_in(self.place)  # Studio's next start leaves Studio's FreeCAD linked
        self.assertEqual(self.place.link.readlink(), self.place.program)
        shutil.rmtree(self.place.app)
        freecad.stand_in(self.place)  # and stands in again once it is deleted
        self.assertTrue(freecad.is_stand_in(self.place.link) and not self.place.link.is_symlink())

    def test_the_stand_in_leaves_a_freecadcmd_of_someone_elses_alone(self) -> None:
        self.place.launchers.mkdir(parents=True)
        self.place.link.write_text("#!/bin/sh\n")
        freecad.stand_in(self.place)
        self.assertEqual(self.place.link.read_text(), "#!/bin/sh\n")

    def test_the_app_writes_the_same_stand_in(self) -> None:
        app = (Path(__file__).resolve().parents[1] / "apps" / "desktop" / "src" / "studio" / "studioAppBundle.ts")
        source = app.read_text(encoding="utf-8")
        self.assertIn(freecad.STAND_IN_MARK, source)
        self.assertIn(f"echo '{freecad.NOT_INSTALLED}' >&2", source)

    def test_a_checkouts_launchers_write_no_bytecode_and_stand_in_for_freecad_on_a_mac(self) -> None:
        for platform, stands_in in (("darwin", True), ("win32", False)):
            with self.subTest(platform=platform):
                folder = self.root / platform
                written = studio_cad_plugin.write_launcher(folder, "/py/python3", platform)
                for launcher in written:
                    self.assertIn("-P -B ", launcher.read_text(encoding="utf-8"))
                self.assertEqual(freecad.is_stand_in(folder / "freecadcmd"), stands_in)

    def assertNothingInstalled(self) -> None:
        self.assertFalse(self.place.link.is_symlink())
        self.assertFalse(self.place.record.exists())
        self.assertFalse(self.place.app.exists())
        self.assertEqual([path.name for path in self.place.folder.iterdir()], [])


class Clock:
    """A clock that moves only when the wait sleeps, so a wait runs out at once."""

    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.now += seconds


class DetachedInstallTest(unittest.TestCase):
    """The install runs in a process of its own, past an agent's command limit; each call returns within WAIT_S."""

    def setUp(self) -> None:
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.place = Place(self.root / "home" / "bin")
        self.dmg = self.root / "FreeCAD.dmg"
        self.dmg.write_bytes(b"FreeCAD's disk image")
        self.addCleanup(setattr, freecad, "DMGS", freecad.DMGS)
        freecad.DMGS = {"arm64": (freecad.DMGS["arm64"][0], hashlib.sha256(b"FreeCAD's disk image").hexdigest())}
        self.go = threading.Event()
        self.workers: list[threading.Thread] = []
        self.addCleanup(self.finish)

    def spawn(self, mac: Mac):
        """A worker in a thread, holding the lock on its own copy of the descriptor as the detached process does,
        that installs once `self.go` is set."""

        def spawn(fd: int) -> None:
            held = os.dup(fd)

            def worker() -> None:
                self.go.wait()
                try:
                    freecad.work(self.place, self.dmg, "arm64", mac)
                finally:
                    os.close(held)

            thread = threading.Thread(target=worker)
            thread.start()
            self.workers.append(thread)

        return spawn

    def finish(self) -> None:
        self.go.set()
        for thread in self.workers:
            thread.join()

    def wait(self) -> tuple[int, str]:
        clock = Clock()
        return freecad.wait(self.place, freecad.WAIT_S, clock.sleep, clock)

    def test_a_call_returns_while_it_installs_and_a_later_one_says_it_is_installed(self) -> None:
        self.assertTrue(freecad.start(self.place, self.spawn(Mac())))
        code, said = self.wait()
        self.assertEqual(code, 0)
        self.assertIn("Still installing FreeCAD for Studio", said)
        self.assertIn("studio-install-freecad --wait", said)
        self.finish()
        self.assertEqual(self.wait(), (0, f"Installed FreeCAD {freecad.VERSION} for Studio: {self.place.program}. "
                                          "Plan now."))
        self.assertEqual(self.place.link.readlink(), self.place.program)

    def test_concurrent_calls_start_one_install(self) -> None:
        spawned: list[int] = []
        spawn = self.spawn(Mac())

        def counted(fd: int) -> None:
            spawned.append(fd)
            spawn(fd)

        calls = [threading.Thread(target=freecad.start, args=(self.place, counted)) for _ in range(4)]
        for call in calls:
            call.start()
        for call in calls:
            call.join()
        self.assertEqual(len(spawned), 1)
        self.assertFalse(freecad.start(self.place, counted))  # a call during the install joins it
        self.assertEqual(len(spawned), 1)
        self.finish()
        self.assertEqual(self.wait()[0], 0)
        self.assertFalse(freecad.start(self.place, counted))  # and once it is installed starts none
        self.assertEqual(len(spawned), 1)

    def test_a_failed_install_says_why_to_the_calls_after_it(self) -> None:
        freecad.start(self.place, self.spawn(Mac(team="TeamIdentifier=SOMEONE")))
        self.finish()
        code, said = self.wait()
        self.assertEqual(code, 1)
        self.assertIn("Studio did not install FreeCAD: FreeCAD is signed by team SOMEONE", said)
        code, said = freecad.check(self.place)
        self.assertEqual(code, 1)
        self.assertIn("The last install stopped: FreeCAD is signed by team SOMEONE", said)
        self.assertFalse(self.place.app.exists())
        self.assertTrue(freecad.start(self.place, self.spawn(Mac())))  # the next call tries again

    def test_check_during_an_install_says_it_is_being_installed(self) -> None:
        freecad.start(self.place, self.spawn(Mac()))
        code, said = freecad.check(self.place)
        self.assertEqual(code, 1)
        self.assertIn("being installed for Studio now", said)
        self.finish()
        self.assertEqual(freecad.check(self.place)[0], 0)

    def test_wait_with_no_install_running_starts_none(self) -> None:
        code, said = self.wait()
        self.assertEqual(code, 1)
        self.assertIn("No install of FreeCAD for Studio is running", said)
        self.assertFalse(self.place.folder.exists())

    def test_an_install_whose_process_died_says_so(self) -> None:
        freecad.start(self.place, lambda _fd: None)  # the lock goes with the process that never ran
        code, said = self.wait()
        self.assertEqual(code, 1)
        self.assertIn("stopped before it finished", said)

    def test_the_detached_process_holds_the_lock_after_the_call_that_started_it_returns(self) -> None:
        child: list[subprocess.Popen] = []
        command = [sys.executable, "-c", "import signal; signal.pause()"]
        freecad.start(self.place, lambda fd: child.append(freecad.detach(self.place, fd, command)))
        self.assertTrue(freecad.installing(self.place))
        child[0].terminate()
        child[0].wait()
        self.assertFalse(freecad.installing(self.place))


class CamSkillTest(unittest.TestCase):
    def test_studios_cam_skill_installs_freecad_with_studio_on_a_mac(self) -> None:
        skill = Path(__file__).resolve().parents[1] / "text-to-cad" / "skills" / "cam" / "SKILL.md"
        studio = studio_cad_plugin.studio_skill(skill.read_text(encoding="utf-8"))
        self.assertIn("before the first plan, run `studio-install-freecad --check`", studio)
        self.assertIn("run `studio-install-freecad` once they say yes", studio)
        self.assertIn("run `studio-install-freecad --wait` again, in the same turn, until it says FreeCAD is installed",
                      studio)
        self.assertIn("If a plan says macOS is waiting for someone to answer whether to open FreeCAD", studio)
        self.assertIn("a plan stops at once saying Studio's `freecadcmd` reports no version", studio)
        for words in studio_cad_plugin.FREECAD_MAC_INSTALLS:
            self.assertNotIn(words, studio)

    def test_studios_cam_skill_plans_with_stated_defaults_before_asking(self) -> None:
        skill = Path(__file__).resolve().parents[1] / "text-to-cad" / "skills" / "cam" / "SKILL.md"
        studio = studio_cad_plugin.studio_skill(skill.read_text(encoding="utf-8"))
        self.assertIn("**Plan first, with stated defaults, then ask.**", studio)
        self.assertIn(studio_cad_plugin.STUDIO_CAM_EXAMPLE_MACHINE, studio)
        for words in studio_cad_plugin.CAM_ASKS_FIRST:
            self.assertNotIn(words, studio)

    def test_no_skill_studio_carries_gives_a_viewer_link(self) -> None:
        skills = Path(__file__).resolve().parents[1] / "text-to-cad" / "skills"
        for skill in sorted(skills.glob("*/SKILL.md")):
            studio = studio_cad_plugin.studio_skill(skill.read_text(encoding="utf-8"))
            for words in studio_cad_plugin.VIEWER_LINKS:
                self.assertNotIn(words, studio, skill.parent.name)


if __name__ == "__main__":
    unittest.main()
