"""Studio's Sizes (``cadgen.edit.sizes``): every named size in a project's scripts in one place,
read from the source; one changed where it is written; a shared one added beside the parts.

The parts here are never run: a script is a part when it declares a model (``@step``), and Sizes
reads only its text.
"""

from __future__ import annotations

import os
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest import mock

from cadgen.edit import sizes

BRACKET = textwrap.dedent(
    """\
    from sizes import WALL

    WIDTH = 40.0  # across the base
    HEIGHT = 2 * WALL
    HOLE_D = 5
    MM = 1
    label = 3


    @step(out="bracket.step")
    def bracket():
        return WIDTH
    """
)
HUB = textwrap.dedent(
    """\
    from sizes import WALL

    BORE = -2.5


    @step(out="hub.step")
    def hub():
        return BORE
    """
)


class SizesTest(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        # No Studio project records: the project's units are left at their default.
        records = tempfile.TemporaryDirectory()
        self.addCleanup(records.cleanup)
        patch = mock.patch.dict(os.environ, {"STUDIO_PROJECTS_DIR": records.name})
        patch.start()
        self.addCleanup(patch.stop)

    def write(self, rel: str, text: str) -> Path:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def test_lists_shared_sizes_first_with_their_parts_then_each_parts_own(self) -> None:
        self.write("sizes.py", '"""Shared."""\n\nWALL = 2.0  # every wall\n')
        self.write("bracket.py", BRACKET)
        self.write("hub.py", HUB)
        self.write("notes.py", "UNUSED = 1\n")
        listed = sizes.sizes(str(self.root))
        self.assertTrue(listed["ok"])
        self.assertEqual(listed["units"], "mm")
        self.assertEqual([group["file"] for group in listed["groups"]], ["sizes.py", "bracket.py", "hub.py"])
        shared = listed["groups"][0]
        self.assertEqual(shared["kind"], "shared")
        self.assertEqual(sorted(shared["usedBy"]), ["bracket", "hub"])
        self.assertEqual(shared["sizes"][0], {"name": "WALL", "line": 3, "text": "2.0", "value": 2.0, "editable": True, "note": "every wall"})
        bracket = {size["name"]: size for size in listed["groups"][1]["sizes"]}
        # Upper-case names only, unit factors left out.
        self.assertEqual(list(bracket), ["WIDTH", "HEIGHT", "HOLE_D"])
        self.assertEqual(bracket["WIDTH"]["note"], "across the base")
        self.assertFalse(bracket["HEIGHT"]["editable"])
        self.assertEqual(bracket["HEIGHT"]["text"], "2 * WALL")
        self.assertIsNone(bracket["HEIGHT"]["value"])
        self.assertEqual(listed["groups"][2]["sizes"][0]["value"], -2.5)

    def test_changes_the_number_where_it_is_written_and_keeps_the_rest_of_the_line(self) -> None:
        part = self.write("bracket.py", BRACKET)
        changed = sizes.set_size(str(self.root), "bracket.py", "WIDTH", 3, "40.0", " 45 ")
        self.assertEqual(changed["text"], "45")
        self.assertEqual(changed["parts"], ["bracket"])
        self.assertIn("WIDTH = 45  # across the base\n", part.read_text(encoding="utf-8"))
        self.assertEqual(part.read_text(encoding="utf-8").replace("WIDTH = 45", "WIDTH = 40.0"), BRACKET)

    def test_changes_a_negative_number(self) -> None:
        part = self.write("hub.py", HUB)
        sizes.set_size(str(self.root), "hub.py", "BORE", 3, "-2.5", "3")
        self.assertIn("BORE = 3\n", part.read_text(encoding="utf-8"))

    def test_refuses_a_stale_value_a_formula_text_and_a_moved_size(self) -> None:
        self.write("bracket.py", BRACKET)
        with self.assertRaisesRegex(sizes.SizesError, "changed since Sizes read it; it is 40.0 now"):
            sizes.set_size(str(self.root), "bracket.py", "WIDTH", 3, "39", "45")
        with self.assertRaisesRegex(sizes.SizesError, "worked out from other sizes"):
            sizes.set_size(str(self.root), "bracket.py", "HEIGHT", 4, "2 * WALL", "4")
        with self.assertRaisesRegex(sizes.SizesError, "is a number here"):
            sizes.set_size(str(self.root), "bracket.py", "WIDTH", 3, "40.0", "forty")
        with self.assertRaisesRegex(sizes.SizesError, "no longer on line 9"):
            sizes.set_size(str(self.root), "bracket.py", "WIDTH", 9, "40.0", "45")
        with self.assertRaisesRegex(sizes.SizesError, "not in the project"):
            sizes.set_size(str(self.root), "../outside.py", "WIDTH", 3, "40.0", "45")

    def test_adds_a_shared_size_beside_the_parts(self) -> None:
        self.write("cad/bracket.py", BRACKET)
        self.write("cad/hub.py", HUB)
        self.write("fixtures/jig.py", "@step\ndef jig():\n    return 1\n")
        added = sizes.add_shared(str(self.root), "WALL", "2", "every  wall")
        self.assertEqual(added["file"], "cad/sizes.py")
        text = (self.root / "cad/sizes.py").read_text(encoding="utf-8")
        self.assertTrue(text.startswith('"""Sizes several parts share.'))
        self.assertTrue(text.endswith("\nWALL = 2  # every wall\n"))
        sizes.add_shared(str(self.root), "BOLT_D", "3")
        self.assertTrue((self.root / "cad/sizes.py").read_text(encoding="utf-8").endswith("WALL = 2  # every wall\nBOLT_D = 3\n"))
        listed = sizes.sizes(str(self.root))
        self.assertEqual(listed["sharedFile"], "cad/sizes.py")
        self.assertEqual(listed["groups"][0]["file"], "cad/sizes.py")
        with self.assertRaisesRegex(sizes.SizesError, "already a shared size"):
            sizes.add_shared(str(self.root), "WALL", "3")
        with self.assertRaisesRegex(sizes.SizesError, "capitals, digits and underscores"):
            sizes.add_shared(str(self.root), "wall", "3")

    def test_a_project_with_no_parts_keeps_shared_sizes_in_its_folder(self) -> None:
        self.assertEqual(sizes.shared_folder(self.root), self.root)
        self.assertEqual(sizes.sizes(str(self.root))["groups"], [])


if __name__ == "__main__":
    unittest.main()
