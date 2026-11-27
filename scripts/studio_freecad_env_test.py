import hashlib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import studio_freecad_env as fc  # noqa: E402

MICROMAMBA = b"micromamba"


class Fake:
    """micromamba and FreeCAD as the installer sees them: what each run makes and says."""

    def __init__(self, version="1.1.3", create_code=0, quarantined=False):
        self.version, self.create_code, self.quarantined = version, create_code, quarantined
        self.downloads, self.creates = 0, 0

    def download(self, url, to):
        self.downloads += 1
        to.write_bytes(MICROMAMBA)

    def run(self, args, **options):
        if args[0] == "xattr":
            return subprocess.CompletedProcess(args, 0 if self.quarantined else 1, "", "")
        if args[1] == "create":
            self.creates += 1
            env = Path(args[args.index("--prefix") + 1])
            if self.create_code == 0:
                fc.freecadcmd(env, "osx-arm64").parent.mkdir(parents=True)
                fc.freecadcmd(env, "osx-arm64").write_text("")
            else:
                env.mkdir(parents=True)
            return subprocess.CompletedProcess(args, self.create_code, "", "could not solve")
        return subprocess.CompletedProcess(args, 0, f"FreeCAD {self.version} Revision: 1\n", "")


class InstallTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.home = Path(folder.name)
        for patch in (mock.patch.dict(fc.MICROMAMBA, {"osx-arm64": hashlib.sha256(MICROMAMBA).hexdigest()}),
                      mock.patch.object(fc, "quarantined", lambda path, run: run(["xattr"]).returncode == 0)):
            patch.start()
            self.addCleanup(patch.stop)

    def install(self, fake):
        return fc.install(self.home, platform_name="osx-arm64", run=fake.run, download=fake.download)

    def envs(self):
        return sorted(path.name for path in (self.home / "tools").glob("freecad-env-*"))

    def test_makes_the_environment_once_and_removes_an_older_one(self):
        (self.home / "tools" / "freecad-env-0ld").mkdir(parents=True)
        fake = Fake()
        program = self.install(fake)
        self.assertTrue(program.is_file())
        self.install(fake)
        self.assertEqual((fake.downloads, fake.creates), (1, 1))
        self.assertEqual(self.envs(), [program.parents[1].name])

    def test_a_micromamba_that_does_not_match_its_sha256_is_refused(self):
        fake = Fake()
        fake.download = lambda url, to: to.write_bytes(b"something else")
        with self.assertRaisesRegex(fc.Refused, "SHA-256"):
            self.install(fake)
        self.assertEqual(self.envs(), [])

    def test_a_failed_install_leaves_no_environment(self):
        with self.assertRaisesRegex(fc.Refused, "could not solve"):
            self.install(Fake(create_code=1))
        self.assertEqual(self.envs(), [])

    def test_an_unfinished_environment_is_made_again(self):
        fake = Fake(version="1.1.2")
        with self.assertRaisesRegex(fc.Refused, "1.1.2, not 1.1.3"):
            self.install(fake)
        fake.version = "1.1.3"
        self.install(fake)
        self.assertEqual(fake.creates, 2)

    def test_a_quarantined_freecad_is_refused(self):
        with self.assertRaisesRegex(fc.Refused, "quarantine"):
            self.install(Fake(quarantined=True))


class PlatformTest(unittest.TestCase):
    def test_platforms(self):
        self.assertEqual(fc.subdir("darwin", "arm64"), "osx-arm64")
        self.assertEqual(fc.subdir("darwin", "x86_64"), "osx-64")
        self.assertEqual(fc.subdir("win32", "AMD64"), "win-64")
        with self.assertRaises(fc.Refused):
            fc.subdir("win32", "ARM64")
        self.assertEqual(fc.freecadcmd(Path("e"), "win-64"), Path("e", "Library", "bin", "freecadcmd.exe"))

    def test_every_platform_has_a_lock_of_this_freecad_pinned_by_sha256(self):
        for name in fc.MICROMAMBA:
            lock = (fc.LOCKS / f"{name}.txt").read_text(encoding="utf-8")
            packages = [line for line in lock.splitlines() if line.startswith("https://")]
            self.assertTrue(all(line.startswith("https://conda.anaconda.org/conda-forge/") and
                                "#sha256:" in line for line in packages), name)
            self.assertTrue(any(f"/freecad-{fc.VERSION}-" in line for line in packages), name)

    def test_the_digest_is_the_packages_alone(self):
        lock = "# FreeCAD\n@EXPLICIT\nhttps://b\nhttps://a\n"
        self.assertEqual(fc.lock_digest(lock), fc.lock_digest("@EXPLICIT\nhttps://a\nhttps://b"))
        self.assertNotEqual(fc.lock_digest(lock), fc.lock_digest("https://a"))


if __name__ == "__main__":
    unittest.main()
