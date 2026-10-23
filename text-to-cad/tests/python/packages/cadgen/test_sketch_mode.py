"""Sketch mode (``cadgen.edit.sketching``, through the edit service): a sketch drawn, dimensioned
and changed in the viewer, written as lines of the part's script, then made into a feature.

The tracer runs in a process of its own, as the viewer's server runs it, on a small part in a
fresh folder; nothing is built (``build=False``).
"""

from __future__ import annotations

import shutil
import tempfile
import textwrap
import unittest
from pathlib import Path

from cadgen.edit import service as edit

PART = """
    from build123d import Box, Pos
    from cadgen import step

    WIDTH = 40

    @step(out="plate.step")
    def plate():
        part = Pos(0, 0, -5) * Box(WIDTH, 20, 5)
        return part
"""


def project(text: str = PART) -> Path:
    root = Path(tempfile.mkdtemp(prefix="cadgen-sketch-mode-"))
    (root / ".git").mkdir()
    (root / "plate.py").write_text(textwrap.dedent(text), encoding="utf-8")
    return root


class SketchMode(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = edit.EditService(build=False)

    @classmethod
    def tearDownClass(cls):
        cls.service.close()

    def setUp(self):
        self.root = project()
        self.addCleanup(shutil.rmtree, self.root, True)
        self.file = str(self.root / "plate.step")
        self.files = self.service.state(self.file)["files"]
        self.sketch = None

    def source(self) -> str:
        return (self.root / "plate.py").read_text(encoding="utf-8")

    def send(self, op: dict, **more) -> dict:
        target = {"file": self.sketch["file"], "line": self.sketch["line"], "name": self.sketch["name"]} if self.sketch else {}
        reply = self.service.change({"file": self.file, "files": self.files, "sketch": {**target, "op": op}, **more})
        self.assertTrue(reply.get("ok"), reply.get("error"))
        self.files = {**self.files, **(reply.get("files") or {})}
        if reply.get("sketch"):
            self.sketch = reply["sketch"]
        return reply

    def start(self, plane: str = "Top") -> dict:
        reply = self.send({"kind": "new", "plane": plane, "name": "Sketch1"})
        self.assertEqual(self.sketch["name"], "Sketch1")
        return reply

    def test_a_new_sketch_is_written_before_the_part_is_returned(self):
        self.start()
        text = self.source()
        self.assertIn("from cadgen.sketch import Sketch\n", text)
        self.assertIn('    sketch1 = Sketch("Sketch1", plane="Top")\n    return part\n', text)
        self.assertEqual(self.sketch["state"]["status"], "Fully defined")
        self.assertEqual(self.sketch["state"]["frame"]["z"], [0.0, 0.0, 1.0])

    def test_a_sketch_on_an_offset_plane_is_written_with_its_offset(self):
        refused = self.service.change({"file": self.file, "files": self.files, "sketch": {"op": {
            "kind": "new", "plane": "Top", "name": "Sketch1", "offset": "a little"}}})
        self.assertFalse(refused["ok"])
        self.assertIn("Offset distance needs a number", refused["error"])
        self.send({"kind": "new", "plane": "Top", "name": "Sketch1", "offset": "8"})
        self.assertIn('    sketch1 = Sketch("Sketch1", plane="Top", offset=8)\n', self.source())
        # The sketch's plane is the Top plane moved 8 up its normal.
        self.assertEqual(self.sketch["state"]["frame"]["origin"], [0.0, 0.0, 8.0])
        self.send({"kind": "draw", "entity": "rectangle", "corner": {"point": "Origin"}, "opposite": {"at": [10, 6]}})
        left = self.send({"kind": "exit", "changed": True})
        self.assertEqual([f["sketch"]["offset"] for f in left["features"] if f["kind"] == "Sketch"], [8.0])

    def test_strokes_and_dimensions_are_lines_of_the_script_and_solve_at_once(self):
        self.start()
        drawn = self.send({"kind": "draw", "entity": "rectangle", "corner": {"point": "Origin"}, "opposite": {"at": [30, 10]}})
        self.assertTrue(drawn["sketchOnly"])
        self.assertIn("line1, line2, line3, line4 = sketch1.rectangle(sketch1.origin, (30, 10))", self.source())
        state = self.sketch["state"]
        self.assertEqual((state["status"], state["dof"]), ("Under defined", 2))
        self.send({"kind": "dimension", "dimension": "length", "refs": ["Line1"], "value": "25"})
        # The sketch's first size scales it about its origin, as SolidWorks' "Scale sketch on first
        # dimension" does, so the rectangle keeps its shape: the script says where its corner is now.
        self.assertIn("sketch1.rectangle(sketch1.origin, (25, 8.333333))", self.source())
        self.assertIn("sketch1.length(line1, 25)", self.source())
        # A second size only moves what it holds.
        self.send({"kind": "dimension", "dimension": "length", "refs": ["Line2"], "value": "10"})
        self.assertIn("sketch1.rectangle(sketch1.origin, (25, 10))", self.source())
        self.send({"kind": "delete", "items": ["D2"]})
        self.send({"kind": "dimension", "dimension": "length", "refs": ["Line4"], "value": "WIDTH / 4"})
        self.assertIn("sketch1.length(line4, WIDTH / 4)", self.source())
        self.assertEqual(self.sketch["state"]["status"], "Fully defined")
        right = next(point for point in self.sketch["state"]["points"] if point["id"] == "Point3")
        self.assertAlmostEqual(right["y"], 10.0)
        self.assertTrue(all(curve["defined"] for curve in self.sketch["state"]["curves"]))

    def test_a_polygon_a_tangent_arc_and_a_three_point_arc_are_lines_of_the_script(self):
        self.start()
        self.send({"kind": "draw", "entity": "polygon", "center": {"point": "Origin"}, "vertex": {"at": [10, 0]}, "sides": 6})
        self.assertIn("line1, line2, line3, line4, line5, line6, circle1 = sketch1.polygon(sketch1.origin, (10, 0), 6)\n", self.source())
        self.send({"kind": "draw", "entity": "line", "start": {"at": [20, 0]}, "end": {"at": [30, 0]}})
        line = next(curve for curve in self.sketch["state"]["curves"] if curve["id"] == "Line7")
        # On from the line's end, kept tangent to it; then by three points back to where the line starts.
        self.send({"kind": "draw", "entity": "arc", "center": {"at": [30, 5]}, "start": {"point": line["end"]}, "end": {"at": [30, 10]},
                   "tangent": "Line7"})
        self.assertIn("arc1 = sketch1.arc((30, 5), line7.end, (30, 10))\n    sketch1.tangent(line7, arc1)\n", self.source())
        arc = next(curve for curve in self.sketch["state"]["curves"] if curve["id"] == "Arc1")
        self.send({"kind": "draw", "entity": "three_point_arc", "start": {"point": arc["end"]}, "through": {"at": [25, 12]},
                   "end": {"point": line["start"]}})
        self.assertIn("arc2 = sketch1.three_point_arc(arc1.end, (25, 12), line7.start)\n", self.source())
        # Two closed outlines: the hexagon, and the line and its arcs.
        self.assertEqual(len(self.sketch["state"]["loops"]), 2)
        refused = self.service.change({"file": self.file, "files": self.files, "sketch": {
            "file": self.sketch["file"], "line": self.sketch["line"], "name": self.sketch["name"],
            "op": {"kind": "draw", "entity": "polygon", "center": {"at": [0, 0]}, "vertex": {"at": [1, 0]}, "sides": 2}}})
        self.assertFalse(refused["ok"])
        self.assertIn("3 to 64 sides", refused["error"])

    def test_a_dimension_typed_over_changes_its_number(self):
        self.start()
        self.send({"kind": "draw", "entity": "circle", "center": {"at": [10, 4]}, "radius": 2})
        self.send({"kind": "dimension", "dimension": "diameter", "refs": ["Circle1"], "value": "5"})
        self.send({"kind": "value", "dimension": "D1", "text": "6"})
        self.assertIn("sketch1.diameter(circle1, 6)", self.source())
        self.assertIn("circle1 = sketch1.circle((10, 4), 3)", self.source())

    def test_a_drag_under_way_is_solved_but_not_written(self):
        self.start()
        self.send({"kind": "draw", "entity": "rectangle", "corner": {"point": "Origin"}, "opposite": {"at": [30, 10]}})
        before = self.source()
        corner = next(curve for curve in self.sketch["state"]["curves"] if curve["id"] == "Line2")["end"]
        live = self.send({"kind": "move", "points": [{"point": corner, "to": [40, 12]}], "live": True})
        self.assertTrue(live["live"])
        self.assertNotIn("change", live)
        self.assertEqual(self.source(), before)
        # The rectangle followed: the corner went where it was dragged, and the lines on it with it.
        points = {point["id"]: (point["x"], point["y"]) for point in live["sketch"]["state"]["points"]}
        self.assertEqual(points[corner], (40.0, 12.0))
        # Let go: the same move written.
        self.send({"kind": "move", "points": [{"point": corner, "to": [40, 12]}]})
        self.assertIn("sketch1.rectangle(sketch1.origin, (40, 12))", self.source())

    def test_a_circle_dragged_by_its_edge_takes_the_radius(self):
        self.start()
        self.send({"kind": "draw", "entity": "circle", "center": {"at": [10, 4]}, "radius": 2})
        live = self.send({"kind": "move", "curves": [{"curve": "Circle1", "radius": 3.5}], "live": True})
        self.assertEqual(next(curve for curve in live["sketch"]["state"]["curves"] if curve["id"] == "Circle1")["radius"], 3.5)
        self.assertIn("circle1 = sketch1.circle((10, 4), 2)", self.source())
        self.send({"kind": "move", "curves": [{"curve": "Circle1", "radius": 3.5}]})
        self.assertIn("circle1 = sketch1.circle((10, 4), 3.5)", self.source())
        # With its diameter dimensioned, the radius is the dimension's: a drag does not change it.
        self.send({"kind": "dimension", "dimension": "diameter", "refs": ["Circle1"], "value": "5"})
        self.send({"kind": "move", "curves": [{"curve": "Circle1", "radius": 9}]})
        self.assertAlmostEqual(next(curve for curve in self.sketch["state"]["curves"] if curve["id"] == "Circle1")["radius"], 2.5, places=6)

    def test_a_dimension_the_sketch_already_sets_is_made_driven(self):
        self.start()
        self.send({"kind": "draw", "entity": "rectangle", "corner": {"point": "Origin"}, "opposite": {"at": [30, 10]}})
        self.send({"kind": "dimension", "dimension": "length", "refs": ["Line1"], "value": "30", "if_redundant": "driven"})
        self.send({"kind": "dimension", "dimension": "length", "refs": ["Line2"], "value": "10", "if_redundant": "driven"})
        self.assertEqual(self.sketch["state"]["status"], "Fully defined")
        # The top line's length is already set: it comes in as a driven dimension, whatever was typed, measuring 30.
        self.send({"kind": "dimension", "dimension": "length", "refs": ["Line3"], "value": "45", "if_redundant": "driven"})
        self.assertIn("sketch1.length(line3, 45, driven=True)", self.source())
        state = self.sketch["state"]
        self.assertEqual(state["status"], "Fully defined")
        driven = next(each for each in state["dimensions"] if each["id"] == "D3")
        self.assertTrue(driven["driven"])
        self.assertAlmostEqual(driven["value"], 30)
        # Made driving again it would over define the sketch: refused, the script as it was.
        before = self.source()
        refused = self.service.change({"file": self.file, "files": self.files, "sketch": {
            "file": self.sketch["file"], "line": self.sketch["line"], "op": {"kind": "driven", "dimension": "D3", "on": False}}})
        self.assertFalse(refused["ok"])
        self.assertIn("over define", refused["error"])
        self.assertEqual(self.source(), before)
        # D1 made driven: the width is free again.
        self.send({"kind": "driven", "dimension": "D1", "on": True})
        self.assertIn("sketch1.length(line1, 30, driven=True)", self.source())
        self.assertEqual(self.sketch["state"]["status"], "Under defined")
        self.send({"kind": "driven", "dimension": "D1", "on": False})
        self.assertIn("sketch1.length(line1, 30)\n", self.source())

    def test_a_three_point_rectangle_is_its_lines_square_and_parallel(self):
        self.start()
        self.send({"kind": "draw", "entity": "three_point_rectangle", "corner": {"at": [0, 0]}, "along": {"at": [8, 6]},
                   "opposite": {"at": [5, 10]}, "fourth": {"at": [-3, 4]}})
        text = self.source()
        self.assertIn("line1 = sketch1.line((0, 0), (8, 6))", text)
        self.assertIn("line4 = sketch1.line(line3.end, line1.start)", text)
        self.assertIn("sketch1.perpendicular(line1, line2)", text)
        self.assertIn("sketch1.parallel(line2, line4)", text)
        # Placed, turned, long and wide: five ways it can move, as SolidWorks counts them.
        self.assertEqual(self.sketch["state"]["dof"], 5)
        # One of its lines deleted on its own: the rest stay.
        self.send({"kind": "delete", "items": ["Line3"]})
        self.assertNotIn("line3 = ", self.source())
        self.assertIn("line2 = sketch1.line(", self.source())

    def test_collinear_puts_two_lines_on_one(self):
        self.start()
        self.send({"kind": "draw", "entity": "line", "start": {"at": [0, 0]}, "end": {"at": [10, 0]}})
        self.send({"kind": "draw", "entity": "line", "start": {"at": [15, 3]}, "end": {"at": [25, 4]}})
        self.send({"kind": "relate", "relation": "collinear", "refs": ["Line1", "Line2"]})
        self.assertIn("sketch1.collinear(line1, line2)", self.source())
        points = {point["id"]: (point["x"], point["y"]) for point in self.sketch["state"]["points"]}
        curves = {curve["id"]: curve for curve in self.sketch["state"]["curves"]}
        (ax, ay), (bx, by) = points[curves["Line1"]["start"]], points[curves["Line1"]["end"]]
        # Both of Line2's ends on Line1's line, wherever the solve settled the two.
        for role in ("start", "end"):
            px, py = points[curves["Line2"][role]]
            self.assertAlmostEqual((bx - ax) * (py - ay) - (by - ay) * (px - ax), 0, places=6)

    def test_copy_entities_draws_them_again_moved_and_joined(self):
        self.start()
        self.send({"kind": "draw", "entity": "line", "start": {"at": [0, 0]}, "end": {"at": [10, 0]}})
        self.send({"kind": "draw", "entity": "line", "start": {"point": "Point2"}, "end": {"at": [10, 5]}})
        self.send({"kind": "draw", "entity": "circle", "center": {"at": [5, 3]}, "radius": 1, "construction": True})
        self.send({"kind": "copy", "items": ["Line1", "Line2", "Circle1"], "by": [0, 20]})
        text = self.source()
        self.assertIn("point5 = sketch1.point(0, 20)", text)
        self.assertIn("line3 = sketch1.line(point5, point6)", text)
        # The copies share their corner as the originals do.
        self.assertIn("line4 = sketch1.line(point6, point7)", text)
        self.assertIn("circle2 = sketch1.circle(point8, 1, construction=True)", text)
        self.assertEqual(len([curve for curve in self.sketch["state"]["curves"] if curve["kind"] == "line"]), 4)

    def test_relations_that_cannot_hold_leave_the_script_as_it_was(self):
        self.start()
        self.send({"kind": "draw", "entity": "line", "start": {"at": [0, 0]}, "end": {"at": [10, 1]}, "relations": [{"kind": "horizontal"}]})
        before = self.source()
        refused = self.service.change({"file": self.file, "files": self.files, "sketch": {
            "file": self.sketch["file"], "line": self.sketch["line"], "op": {"kind": "relate", "relation": "vertical", "refs": ["Line1"]}}})
        self.assertFalse(refused["ok"])
        self.assertIn("can't all hold", refused["error"])
        self.assertEqual(self.source(), before)

    def test_a_rectangles_line_is_deleted_on_its_own(self):
        self.start()
        self.send({"kind": "draw", "entity": "rectangle", "corner": {"at": [0, 0]}, "opposite": {"at": [30, 10]}})
        self.send({"kind": "delete", "items": ["Line2"]})
        text = self.source()
        self.assertIn("line1 = sketch1.line((0, 0), (30, 0))", text)
        self.assertNotIn("line2 =", text)
        self.assertNotIn("sketch1.vertical(line2)", text)
        # The top line kept the corner the deleted side ended at, where it was.
        self.assertIn("line3 = sketch1.line((30, 10), (0, 10))", text)
        self.assertEqual([curve["id"] for curve in self.sketch["state"]["curves"]], ["Line1", "Line2", "Line3"])

    def test_undo_puts_a_stroke_back_and_answers_with_the_sketch(self):
        self.start()
        before = self.source()
        drawn = self.send({"kind": "draw", "entity": "line", "start": {"at": [0, 0]}, "end": {"at": [10, 0]}})
        target = {"file": self.sketch["file"], "line": self.sketch["line"], "name": "Sketch1"}
        undone = self.service.change({"file": self.file, "files": self.files, "splice": drawn["change"]["undo"], "sketch": target})
        self.assertTrue(undone["ok"], undone.get("error"))
        self.assertTrue(undone["sketchOnly"])
        self.assertEqual(self.source(), before)
        self.assertEqual(undone["sketch"]["state"]["curves"], [])

    def test_discarding_a_new_sketch_puts_the_script_back_and_builds_nothing(self):
        original = self.source()
        made = self.start()
        target = {"file": self.sketch["file"], "line": self.sketch["line"], "name": "Sketch1"}
        drawn = self.send({"kind": "draw", "entity": "circle", "center": {"at": [5, 5]}, "radius": 2})
        for change in (drawn["change"], made["change"]):
            undone = self.service.change({"file": self.file, "files": self.files, "splice": change["undo"], "sketch": target})
            self.assertTrue(undone["ok"], undone.get("error"))
            self.files = {**self.files, **(undone.get("files") or {})}
        # The sketch's making undone answers with the part, which nothing of the sketch was built into.
        self.assertFalse(undone.get("sketchOnly"))
        self.assertIs(undone["change"]["build"], False)
        self.assertEqual(self.source(), original)
        self.assertNotIn("Sketch1", [sketch["name"] for sketch in undone.get("sketches") or []])

    def test_a_sketch_of_its_own_is_deleted_with_its_lines(self):
        self.start()
        self.send({"kind": "draw", "entity": "circle", "center": {"at": [5, 5]}, "radius": 2})
        self.send({"kind": "exit", "changed": True})
        state = self.service.state(self.file)
        sketch = next(feature for feature in state["features"] if feature["kind"] == "Sketch")
        reply = self.service.change({"file": self.file, "files": state["files"], "remove": {"feature": sketch["key"], "title": "Sketch1"}})
        self.assertTrue(reply["ok"], reply.get("error"))
        self.assertNotIn("sketch1", self.source())
        self.assertNotIn("Sketch", [feature["kind"] for feature in reply["features"]])

    def rectangle(self) -> None:
        """A fully defined 30 x 10 rectangle on the origin."""
        self.start()
        self.send({"kind": "draw", "entity": "rectangle", "corner": {"point": "Origin"}, "opposite": {"at": [30, 10]}})
        self.send({"kind": "dimension", "dimension": "length", "refs": ["Line1"], "value": "30"})
        self.send({"kind": "dimension", "dimension": "length", "refs": ["Line4"], "value": "10"})

    def extrudes(self, left: dict) -> dict:
        extruded = self.service.change({"file": self.file, "files": left["files"], "command": {
            "command": "extrude", "sketch": {"file": "plate.py", "line": self.sketch["line"], "name": "Sketch1"}, "inputs": {"depth": "3"}}})
        self.assertTrue(extruded["ok"], extruded.get("error"))
        self.files = {**self.files, **(extruded.get("files") or {})}
        return extruded

    def test_a_sketch_fillet_rounds_a_corner_and_keeps_its_virtual_sharp(self):
        self.rectangle()
        self.send({"kind": "fillet", "corner": "Point2", "radius": "2"})
        self.assertIn("sketch1.fillet(line2, line3, 2)", self.source())
        state = self.sketch["state"]
        # The dimensions to the corner still hold it: the sketch is still fully defined.
        self.assertEqual(state["status"], "Fully defined")
        arc = next(curve for curve in state["curves"] if curve.get("derived") == "fillet")
        self.assertEqual((arc["id"], arc["radius"], arc["c"]), ("Fillet1", 2.0, [28.0, 8.0]))
        right = next(curve for curve in state["curves"] if curve["id"] == "Line2")
        self.assertEqual(right["shown"][1], [30.0, 8.0])
        fillet = next(item for item in state["dimensions"] if item["kind"] == "fillet")
        self.send({"kind": "value", "dimension": fillet["id"], "text": "3"})
        self.assertIn("sketch1.fillet(line2, line3, 3)", self.source())
        refused = self.service.change({"file": self.file, "files": self.files, "sketch": {
            "file": self.sketch["file"], "line": self.sketch["line"], "op": {"kind": "delete", "items": [fillet["id"]]}}})
        self.assertFalse(refused["ok"])
        self.assertIn("radius", refused["error"])
        too_big = self.service.change({"file": self.file, "files": self.files, "sketch": {
            "file": self.sketch["file"], "line": self.sketch["line"], "op": {"kind": "value", "dimension": fillet["id"], "text": "40"}}})
        self.assertFalse(too_big["ok"])
        self.assertIn("more than", too_big["error"])
        self.extrudes(self.send({"kind": "exit", "changed": True}))
        self.send({"kind": "delete", "items": ["Fillet1"]})
        self.assertNotIn("fillet", self.source())

    def test_a_sketch_chamfer_cuts_a_corner_and_goes_with_its_line(self):
        self.rectangle()
        self.send({"kind": "chamfer", "lines": ["Line2", "Line3"], "distance": "2"})
        self.assertIn("sketch1.chamfer(line2, line3, 2)", self.source())
        state = self.sketch["state"]
        self.assertEqual(state["status"], "Fully defined")
        cut = next(curve for curve in state["curves"] if curve.get("derived") == "chamfer")
        self.assertEqual((cut["id"], cut["kind"], cut["s"], cut["e"]), ("Chamfer1", "line", [30.0, 8.0], [28.0, 10.0]))
        chamfer = next(item for item in state["dimensions"] if item["kind"] == "chamfer")
        refused = self.service.change({"file": self.file, "files": self.files, "sketch": {
            "file": self.sketch["file"], "line": self.sketch["line"], "op": {"kind": "delete", "items": [chamfer["id"]]}}})
        self.assertFalse(refused["ok"])
        self.assertIn("Chamfer1's distance", refused["error"])
        self.send({"kind": "delete", "items": ["Chamfer1"]})
        self.assertNotIn("chamfer", self.source())

    def test_extend_runs_a_line_on_to_the_first_curve_ahead_and_keeps_it_there(self):
        self.start()
        self.send({"kind": "draw", "entity": "line", "start": {"at": [0, 0]}, "end": {"at": [5, 0]}})
        self.send({"kind": "draw", "entity": "line", "start": {"at": [10, -5]}, "end": {"at": [10, 5]}})
        self.send({"kind": "draw", "entity": "line", "start": {"at": [20, -5]}, "end": {"at": [20, 5]}})
        self.send({"kind": "extend", "curve": "Line1", "at": [4.8, 0.1]})
        text = self.source()
        self.assertIn("line1 = sketch1.line((0, 0), (10, 0))", text)
        self.assertIn("sketch1.coincident(line1.end, line2)", text)
        # Its far end: nothing lies ahead of it; Line2's ends: nothing either side.
        nothing = self.service.change({"file": self.file, "files": self.files, "sketch": {
            "file": self.sketch["file"], "line": self.sketch["line"], "op": {"kind": "extend", "curve": "Line1", "at": [0.1, 0]}}})
        self.assertFalse(nothing["ok"])
        self.assertIn("Nothing lies ahead of Line1's start", nothing["error"])

    def test_extend_runs_an_arc_on_round_its_circle_to_the_curve_it_meets(self):
        self.start()
        # A quarter arc about (0, 0), radius 10, from (10, 0) round to (0, 10); a line up at x = -6.
        self.send({"kind": "draw", "entity": "arc", "center": {"at": [0, 0]}, "start": {"at": [10, 0]}, "end": {"at": [0, 10]}})
        self.send({"kind": "draw", "entity": "line", "start": {"at": [-6, 0]}, "end": {"at": [-6, 12]}})
        self.send({"kind": "extend", "curve": "Arc1", "at": [0.5, 9.9]})
        text = self.source()
        # Round on the way it turns to where the circle crosses x = -6: (-6, 8).
        self.assertIn("arc1 = sketch1.arc((0, 0), (10, 0), (-6, 8))", text)
        self.assertIn("sketch1.coincident(arc1.end, line1)", text)
        # Back from its start nothing is met before the arc itself.
        nothing = self.service.change({"file": self.file, "files": self.files, "sketch": {
            "file": self.sketch["file"], "line": self.sketch["line"], "op": {"kind": "extend", "curve": "Arc1", "at": [9.9, 0.2]}}})
        self.assertFalse(nothing["ok"])
        self.assertIn("Nothing lies round Arc1's circle past its start", nothing["error"])

    def test_a_pattern_is_one_line_its_spacing_a_dimension_and_its_copies_go_with_it(self):
        self.start()
        self.send({"kind": "draw", "entity": "circle", "center": {"at": [5, 0]}, "radius": 1})
        self.send({"kind": "pattern", "type": "linear", "items": ["Circle1"], "spacing": "4", "count": "3", "angle": "0"})
        self.assertIn("    pattern1 = sketch1.linear_pattern([circle1], 0, 4, 3)\n", self.source())
        circles = [curve for curve in self.sketch["state"]["curves"] if curve["kind"] == "circle"]
        self.assertEqual(len(circles), 3)
        spacing = next(item for item in self.sketch["state"]["dimensions"] if item["kind"] == "linear_pattern")
        self.assertEqual(spacing["data"]["pairs"][0][2], 1)
        self.send({"kind": "value", "dimension": spacing["id"], "text": "6"})
        self.assertIn("linear_pattern([circle1], 0, 6, 3)", self.source())
        # A bolt circle about the origin, of the same hole.
        self.send({"kind": "pattern", "type": "circular", "items": ["Circle1"], "count": "4", "angle": "360"})
        self.assertIn("    pattern2 = sketch1.circular_pattern([circle1], sketch1.origin, 4, 360)\n", self.source())
        # A copy deleted takes its pattern with it; the other pattern, of the hole itself, stays.
        self.send({"kind": "delete", "items": [circles[1]["id"]]})
        self.assertNotIn("linear_pattern", self.source())
        self.assertIn("circular_pattern", self.source())
        few = self.service.change({"file": self.file, "files": self.files, "sketch": {
            "file": self.sketch["file"], "line": self.sketch["line"], "op": {"kind": "pattern", "items": ["Circle1"], "count": "1", "spacing": "2"}}})
        self.assertFalse(few["ok"])
        self.assertIn("2 to 100 instances", few["error"])

    def test_an_offset_chain_is_held_at_one_distance(self):
        self.rectangle()
        self.send({"kind": "offset", "items": ["Line1", "Line2", "Line3", "Line4"], "distance": "2"})
        text = self.source()
        self.assertIn("line5 = sketch1.line((-2, -2), (32, -2))", text)
        self.assertIn("sketch1.offset_entities([line5, line6, line7, line8], [line1, line2, line3, line4], 2)", text)
        self.assertEqual(self.sketch["state"]["status"], "Fully defined")
        offset = next(item for item in self.sketch["state"]["dimensions"] if item["kind"] == "offset")
        self.send({"kind": "value", "dimension": offset["id"], "text": "WIDTH / 10"})
        corner = next(point for point in self.sketch["state"]["points"] if point["id"] == self.sketch["state"]["curves"][4]["start"])
        self.assertAlmostEqual(corner["x"], -4.0)
        # Inward the other way, and a single line to its left.
        self.send({"kind": "offset", "items": ["Line1"], "distance": "1", "reverse": True})
        self.assertIn("line9 = sketch1.line((0, -1), (30, -1))", self.source())

    def test_entities_mirrored_about_a_centerline_are_symmetric(self):
        self.rectangle()
        self.send({"kind": "draw", "entity": "centerline", "start": {"point": "Origin"}, "end": {"at": [0, 20]}, "relations": [{"kind": "vertical"}]})
        self.send({"kind": "dimension", "dimension": "length", "refs": ["Line5"], "value": "20"})
        self.send({"kind": "fillet", "corner": "Point1", "radius": "2"})
        self.send({"kind": "mirror", "items": ["Line1", "Line2", "Line3", "Line4"], "about": "Line5"})
        text = self.source()
        # The edge along the centerline is its own mirror; the points on it are shared.
        self.assertIn("line6 = sketch1.line(sketch1.origin, (-30, 0))", text)
        self.assertIn("sketch1.symmetric(line1.end, line6.end, line5)", text)
        self.assertNotIn("line9", text)
        self.assertIn("sketch1.fillet(line6, line7, 2)", text)
        self.assertEqual(self.sketch["state"]["status"], "Fully defined")

    def test_trim_cuts_a_circle_to_an_arc_and_splits_a_line_into_one_profile(self):
        self.rectangle()
        self.send({"kind": "draw", "entity": "circle", "center": {"at": [15, 10]}, "radius": 4})
        self.send({"kind": "dimension", "dimension": "diameter", "refs": ["Circle1"], "value": "8"})
        self.send({"kind": "trim", "curve": "Circle1", "at": [15, 7]})
        self.assertIn("arc1 = sketch1.arc((15, 10), (19, 10), (11, 10))", self.source())
        self.assertIn("sketch1.diameter(arc1, 8)", self.source())
        self.send({"kind": "trim", "curve": "Line3", "at": [15, 10]})
        text = self.source()
        self.assertIn("line3 = sketch1.line(line2.end, (19, 10))", text)
        self.assertIn("line5 = sketch1.line(arc1.end, line4.start)", text)
        self.assertEqual(self.sketch["state"]["redundant"], [])
        # The rectangle with a bump on its top is one closed profile.
        self.extrudes(self.send({"kind": "exit", "changed": True}))
        lone = self.send({"kind": "draw", "entity": "line", "start": {"at": [50, 0]}, "end": {"at": [60, 0]}})
        self.assertTrue(lone["ok"])
        self.send({"kind": "trim", "curve": "Line6", "at": [55, 0]})
        self.assertNotIn("line6", self.source())

    def test_converted_edges_stay_on_the_model_as_it_changes(self):
        # The plate's top face, 40 by 20 at z = -2.5, as the viewer would read it.
        top = {"selector": "f99", "type": "plane", "center": [0.0, 0.0, -2.5], "size": 800.0}
        self.send({"kind": "new", "plane": top, "name": "Sketch1"})
        self.send({"kind": "convert", "items": [top]})
        text = self.source()
        # The face's edges, said as build123d's selectors say where they are: the top ones.
        self.assertIn("\n    converted1 = sketch1.convert(part.edges().group_by(Axis.Z)[-1])\n", text)
        state = self.sketch["state"]
        lines = [curve for curve in state["curves"] if curve["kind"] == "line"]
        self.assertEqual(len(lines), 4)
        self.assertTrue(all(curve.get("converted") and curve["defined"] for curve in lines))
        self.assertEqual(state["status"], "Fully defined")
        self.assertEqual(sorted(relation["kind"] for relation in state["relations"]), ["on_edge"] * 4)
        corners = sorted((point["x"], point["y"]) for point in state["points"] if point["id"] != "Origin")
        self.assertEqual(corners, [(-20.0, -10.0), (-20.0, 10.0), (20.0, -10.0), (20.0, 10.0)])
        # What is converted is offset, and stays on its edge: not trimmed, its On Edge not taken off alone.
        self.send({"kind": "offset", "items": [line["id"] for line in lines], "distance": "2", "reverse": True})
        self.assertEqual(self.sketch["state"]["status"], "Fully defined")
        for op, words in (({"kind": "trim", "curve": lines[0]["id"], "at": [0, -10]}, "stays on its edge"),
                          ({"kind": "delete", "items": [state["relations"][0]["id"]]}, "on the model's edge")):
            refused = self.service.change({"file": self.file, "files": self.files, "sketch": {
                "file": self.sketch["file"], "line": self.sketch["line"], "op": op}})
            self.assertFalse(refused["ok"])
            self.assertIn(words, refused["error"])
        self.send({"kind": "exit", "changed": True})
        # The part made wider: the converted edges follow it, as On Edge holds them.
        (self.root / "plate.py").write_text(self.source().replace("WIDTH = 40", "WIDTH = 50"), encoding="utf-8")
        read = self.service.state(self.file)
        self.assertTrue(read["ok"], read.get("error"))
        view = next(view for view in read["sketches"] if view["name"] == "Sketch1")
        self.assertEqual(max(point["x"] for point in view["state"]["points"]), 25.0)
        self.assertEqual(view["state"]["status"], "Fully defined")

    def test_a_spline_passes_through_its_points_and_closes_a_profile_with_lines(self):
        self.start()
        self.send({"kind": "draw", "entity": "line", "start": {"point": "Origin"}, "end": {"at": [20, 0]}})
        corner = next(curve for curve in self.sketch["state"]["curves"] if curve["id"] == "Line1")["end"]
        self.send({"kind": "draw", "entity": "spline", "points": [{"point": corner}, {"at": [25, 8]}, {"at": [10, 15]}, {"at": [0, 10]}]})
        self.assertIn("\n    spline1 = sketch1.spline(line1.end, (25, 8), (10, 15), (0, 10))\n", self.source())
        spline = next(curve for curve in self.sketch["state"]["curves"] if curve["kind"] == "spline")
        self.assertEqual((len(spline["points"]), spline["start"], spline["closed"]), (4, corner, False))
        # Drawn by places along it, through each of its points.
        self.assertEqual(spline["samples"][0], [20, 0])
        self.assertEqual(spline["samples"][-1], [0, 10])
        # One of its points dragged: written where it was left, the spline through it there.
        self.send({"kind": "move", "points": [{"point": spline["points"][1], "to": [26, 9]}]})
        self.assertIn("sketch1.spline(line1.end, (26, 9), (10, 15), (0, 10))", self.source())
        self.send({"kind": "draw", "entity": "line", "start": {"point": spline["end"]}, "end": {"point": "Origin"}})
        self.assertIn("sketch1.line(spline1.end, sketch1.origin)", self.source())
        self.assertEqual(len(self.sketch["state"]["loops"]), 1)
        # Tangent at its start, as the line it runs on from: it leaves (20, 0) heading along +X, where
        # before it climbed away steeply.
        def leaving():
            run = next(curve for curve in self.sketch["state"]["curves"] if curve["kind"] == "spline")["samples"]
            return (run[1][1] - run[0][1]) / (run[1][0] - run[0][0])

        steep = leaving()
        self.send({"kind": "relate", "relation": "tangent", "refs": ["Line1", "Spline1"]})
        self.assertIn("sketch1.tangent(line1, spline1)", self.source())
        self.assertLess(abs(leaving()), 0.05)
        self.assertGreater(abs(steep), 0.5)
        # The tools that cut or copy curves take lines, arcs and circles; a spline is shaped by its points.
        refused = self.service.change({"file": self.file, "files": self.files, "sketch": {
            "file": self.sketch["file"], "line": self.sketch["line"], "op": {"kind": "trim", "curve": "Spline1", "at": [25, 8]}}})
        self.assertFalse(refused["ok"])
        self.assertIn("works on lines, arcs and circles", refused["error"])
        # A closed one is a loop of its own; deleting it takes its line out.
        self.send({"kind": "draw", "entity": "spline", "closed": True, "points": [{"at": [40, 0]}, {"at": [50, 5]}, {"at": [40, 10]}]})
        self.assertIn("spline2 = sketch1.spline((40, 0), (50, 5), (40, 10), closed=True)", self.source())
        self.assertEqual(len(self.sketch["state"]["loops"]), 2)
        self.send({"kind": "delete", "items": ["Spline2"]})
        self.assertNotIn("spline2", self.source())
        # The profile with its spline side is made a solid of.
        self.extrudes(self.send({"kind": "exit", "changed": True}))

    def test_model_edges_offset_into_the_sketch_hold_the_offset_on_construction(self):
        top = {"selector": "f99", "type": "plane", "center": [0.0, 0.0, -2.5], "size": 800.0}
        self.send({"kind": "new", "plane": top, "name": "Sketch1"})
        self.send({"kind": "convert", "items": [top], "construction": True})
        self.assertIn("\n    converted1 = sketch1.convert(part.edges().group_by(Axis.Z)[-1], construction=True)\n", self.source())
        made = [curve["id"] for curve in self.sketch["state"]["curves"] if curve.get("converted")]
        self.send({"kind": "offset", "items": made, "distance": "2", "reverse": True, "construction": False})
        lines = [curve for curve in self.sketch["state"]["curves"] if curve["kind"] == "line"]
        # The face's edges stay dashed to hold the offset; the offset is the profile a feature takes.
        self.assertEqual(sorted(curve["construction"] for curve in lines), [False] * 4 + [True] * 4)
        self.assertEqual(self.sketch["state"]["status"], "Fully defined")
        self.assertEqual(sorted({abs(round(point["x"], 6)) for point in self.sketch["state"]["points"] if point["id"] != "Origin"}), [18, 20])
        self.extrudes(self.send({"kind": "exit", "changed": True}))

    def test_offset_makes_its_base_or_its_offset_construction_when_asked(self):
        self.rectangle()
        lines = [curve["id"] for curve in self.sketch["state"]["curves"] if curve["kind"] == "line"]
        self.send({"kind": "offset", "items": lines, "distance": "2", "base": True})
        curves = self.sketch["state"]["curves"]
        # The rectangle dashed, its offset solid: what a feature takes is the offset.
        self.assertEqual({curve["id"]: curve["construction"] for curve in curves if curve["id"] in lines}, dict.fromkeys(lines, True))
        self.assertEqual(sorted(curve["construction"] for curve in curves if curve["kind"] == "line"), [False] * 4 + [True] * 4)
        self.send({"kind": "offset", "items": [lines[0]], "distance": "1", "construction": True})
        self.assertTrue(self.sketch["state"]["curves"][-1]["construction"])

    def test_an_intersection_curve_is_where_the_part_crosses_the_sketch_and_follows_it(self):
        self.start("Front")
        self.send({"kind": "intersection", "construction": True})
        self.assertIn("\n    converted1 = sketch1.convert(sketch1.intersection(part), construction=True)\n", self.source())
        state = self.sketch["state"]
        lines = [curve for curve in state["curves"] if curve["kind"] == "line"]
        # The plate's section on the Front Plane: 40 wide and 5 deep, dashed for reference.
        self.assertEqual((len(lines), all(curve["construction"] and curve.get("converted") for curve in lines)), (4, True))
        self.assertEqual(sorted({round(point["x"], 6) for point in state["points"] if point["id"] != "Origin"}), [-20, 20])
        # One of its curves deleted takes the whole section.
        self.send({"kind": "delete", "items": [lines[0]["id"]]})
        self.assertNotIn("intersection", self.source())

    def test_one_converted_curve_deleted_alone_keeps_the_rest_on_their_edges(self):
        top = {"selector": "f99", "type": "plane", "center": [0.0, 0.0, -2.5], "size": 800.0}
        self.send({"kind": "new", "plane": top, "name": "Sketch1"})
        self.send({"kind": "convert", "items": [top]})
        lines = [curve for curve in self.sketch["state"]["curves"] if curve.get("converted")]
        # A line drawn from the corner the second and third converted curves share, converted1[1].end.
        self.send({"kind": "draw", "entity": "line", "start": {"point": lines[1]["end"]}, "end": {"at": [0, 0]}})
        self.assertIn("sketch1.line(converted1[1].end, ", self.source())
        corner = next(point for point in self.sketch["state"]["points"] if point["id"] == lines[1]["end"])

        def drawn_start():
            drawn = next(curve for curve in self.sketch["state"]["curves"] if not curve.get("converted"))
            start = next(point for point in self.sketch["state"]["points"] if point["id"] == drawn["start"])
            return start["x"], start["y"]

        self.send({"kind": "delete", "items": [lines[0]["id"]]})
        text = self.source()
        # The convert's line stays, its edges three of the face's four, and what came after the
        # deleted curve is counted down.
        self.assertIn("converted1 = sketch1.convert(", text)
        self.assertRegex(text, r"sketch1\.line\(converted1\[[0-2]\]\.(start|end), ")
        self.assertNotIn("converted1[3]", text)
        kept = [curve for curve in self.sketch["state"]["curves"] if curve.get("converted")]
        self.assertEqual(len(kept), 3)
        self.assertEqual(sorted(relation["kind"] for relation in self.sketch["state"]["relations"]), ["on_edge"] * 3)
        self.assertEqual(drawn_start(), (corner["x"], corner["y"]))
        # The curve the line was drawn from deleted too: the line stays on the corner, held by the
        # converted curve that still has it, named as it is counted now.
        self.send({"kind": "delete", "items": [kept[0]["id"]]})
        text = self.source()
        self.assertRegex(text, r"sketch1\.line\(converted1\[[01]\]\.(start|end), ")
        self.assertEqual(len([curve for curve in self.sketch["state"]["curves"] if curve.get("converted")]), 2)
        self.assertEqual(drawn_start(), (corner["x"], corner["y"]))

    def test_convert_takes_edges_made_before_the_sketch_only(self):
        self.start()
        # The plate's front top edge, 40 long at y = -10, brought onto the Top plane above it.
        edge = {"selector": "e99", "type": "line", "center": [0.0, -10.0, -2.5], "size": 40.0}
        self.send({"kind": "convert", "items": [edge]})
        line = next(curve for curve in self.sketch["state"]["curves"] if curve.get("converted"))
        ends = {point["id"]: (point["x"], point["y"]) for point in self.sketch["state"]["points"]}
        self.assertEqual(sorted([ends[line["start"]], ends[line["end"]]]), [(-20.0, -10.0), (20.0, -10.0)])
        # Deleting what was converted takes its line out.
        self.send({"kind": "delete", "items": [line["id"]]})
        self.assertNotIn("convert(", self.source())
        self.send({"kind": "draw", "entity": "circle", "center": {"at": [0, 0]}, "radius": 3})
        left = self.send({"kind": "exit", "changed": True})
        self.extrudes(left)
        # The boss made from Sketch1 comes after it: its rim is not Sketch1's to convert.
        rim = {"selector": "e99", "type": "circle", "center": [0.0, 0.0, 3.0], "size": 18.849556}
        refused = self.service.change({"file": self.file, "files": self.files, "sketch": {
            "file": self.sketch["file"], "line": self.sketch["line"], "op": {"kind": "convert", "items": [rim]}}})
        self.assertFalse(refused["ok"])
        self.assertIn("made after Sketch1", refused["error"])

    def test_a_finished_sketch_is_in_the_tree_and_extrudes_as_a_boss(self):
        self.start()
        self.send({"kind": "draw", "entity": "rectangle", "corner": {"point": "Origin"}, "opposite": {"at": [10, 6]}})
        left = self.send({"kind": "exit", "changed": True})
        self.assertEqual([(f["kind"], f["sketch"]["name"]) for f in left["features"] if f["kind"] == "Sketch"], [("Sketch", "Sketch1")])
        extruded = self.service.change({"file": self.file, "files": left["files"], "command": {
            "command": "extrude", "sketch": {"file": "plate.py", "line": self.sketch["line"], "name": "Sketch1"}, "inputs": {"depth": "3"}}})
        self.assertTrue(extruded["ok"], extruded.get("error"))
        self.assertIn("part += extrude(sketch1.face(), amount=3)\n    return part", self.source())
        # The box is Boss-Extrude1, on the rectangle it implies; the new boss holds Sketch1.
        boss = [f for f in extruded["features"] if f["kind"] == "Boss-Extrude"]
        self.assertEqual([f["sketch"].get("name") for f in boss], [None, "Sketch1"])
        self.assertNotIn("Sketch", [f["kind"] for f in extruded["features"]])
        # Edit Feature: the boss opens with its end condition, and its line is written again.
        self.assertEqual(boss[1]["edit"], {"command": "extrude", "values": {"end": "blind", "reverse": False, "depth": "3"},
                                           "keeps": "sketch1", "sketch": {"file": "plate.py", "line": self.sketch["line"], "name": "Sketch1"}})
        edited = self.service.change({"file": self.file, "files": extruded["files"], "command": {
            "command": "extrude", "sketch": boss[1]["edit"]["sketch"], "inputs": {"end": "mid", "depth": "8", "reverse": False},
            "replace": {"row": boss[1]["key"]}}})
        self.assertTrue(edited["ok"], edited.get("error"))
        self.assertIn("part += extrude(sketch1.face(), amount=4, both=True)\n    return part", self.source())
        self.assertEqual(self.source().count("extrude("), 1)
        again = [f for f in edited["features"] if f["kind"] == "Boss-Extrude"][1]
        self.assertEqual(again["edit"]["values"], {"end": "mid", "reverse": False, "depth": "8"})
        # Suppressed, the boss keeps its sketch under it: not a sketch of its own, nor drawn.
        before = self.source()
        suppressed = self.service.change({"file": self.file, "files": edited["files"], "suppress": {
            "feature": again["key"], "title": "Boss-Extrude2", "on": True}})
        self.assertTrue(suppressed["ok"], suppressed.get("error"))
        self.assertIn("    # Suppressed (Boss-Extrude, 1 line):\n    # part += extrude(sketch1.face(), amount=4, both=True)\n", self.source())
        held = next(f for f in suppressed["features"] if f.get("suppressed"))
        self.assertEqual((held["kind"], held["sketch"]["name"]), ("Boss-Extrude", "Sketch1"))
        self.assertNotIn("Sketch", [f["kind"] for f in suppressed["features"]])
        self.assertEqual(next(view["consumed"] for view in suppressed["sketches"] if view["name"] == "Sketch1"), held["key"])
        back = self.service.change({"file": self.file, "files": suppressed["files"], "suppress": {
            "feature": held["key"], "title": "Boss-Extrude2", "on": False}})
        self.assertTrue(back["ok"], back.get("error"))
        self.assertEqual(self.source(), before)

    def test_a_boss_drafts_in_or_out_and_reads_back_its_draft(self):
        self.start()
        self.send({"kind": "draw", "entity": "rectangle", "corner": {"point": "Origin"}, "opposite": {"at": [10, 6]}})
        left = self.send({"kind": "exit", "changed": True})
        sketch = {"file": "plate.py", "line": self.sketch["line"], "name": "Sketch1"}
        drafted = self.service.change({"file": self.file, "files": left["files"], "command": {
            "command": "extrude", "sketch": sketch, "inputs": {"depth": "3", "draft": True, "draft_angle": "5"}}})
        self.assertTrue(drafted["ok"], drafted.get("error"))
        self.assertIn("part += extrude(sketch1.face(), amount=3, taper=5)\n    return part", self.source())
        boss = [f for f in drafted["features"] if f["kind"] == "Boss-Extrude"][1]
        self.assertEqual(boss["edit"]["values"], {"end": "blind", "reverse": False, "depth": "3", "draft": True, "draft_angle": "5",
                                                  "outward": False})
        outward = self.service.change({"file": self.file, "files": drafted["files"], "command": {
            "command": "extrude", "sketch": boss["edit"]["sketch"], "inputs": {"depth": "3", "draft": True, "draft_angle": "5", "outward": True},
            "replace": {"row": boss["key"]}}})
        self.assertTrue(outward["ok"], outward.get("error"))
        self.assertIn("part += extrude(sketch1.face(), amount=3, taper=-5)\n    return part", self.source())

    def test_up_to_next_grows_a_boss_to_the_next_face_of_the_body(self):
        # A plate above the sketch's plane: a boss from the sketch grows up to the plate's underside.
        self.root = project(PART.replace("Pos(0, 0, -5)", "Pos(0, 0, 10)"))
        self.addCleanup(shutil.rmtree, self.root, True)
        self.file = str(self.root / "plate.step")
        self.files = self.service.state(self.file)["files"]
        self.start()
        self.send({"kind": "draw", "entity": "circle", "center": {"at": [0, 0]}, "radius": 3})
        left = self.send({"kind": "exit", "changed": True})
        grown = self.service.change({"file": self.file, "files": left["files"], "command": {
            "command": "extrude", "sketch": {"file": "plate.py", "line": self.sketch["line"], "name": "Sketch1"}, "inputs": {"end": "next"}}})
        self.assertTrue(grown["ok"], grown.get("error"))
        self.assertIn("part += extrude(sketch1.face(), until=Until.NEXT, target=part)", self.source())
        self.assertTrue(any(line.startswith("from build123d import") and "Until" in line for line in self.source().splitlines()))
        boss = [f for f in grown["features"] if f["kind"] == "Boss-Extrude"][1]
        self.assertEqual(boss["edit"]["values"], {"end": "next", "reverse": False, "depth": ""})

    def test_up_to_surface_and_up_to_vertex_end_a_boss_on_what_is_picked(self):
        self.start()
        self.send({"kind": "draw", "entity": "circle", "center": {"at": [0, 0]}, "radius": 3})
        left = self.send({"kind": "exit", "changed": True})
        sketch = {"file": "plate.py", "line": self.sketch["line"], "name": "Sketch1"}
        # Down from the Top plane to the plate's top face, 2.5 below it.
        top = {"selector": "f99", "type": "plane", "center": [0.0, 0.0, -2.5], "size": 800.0}
        grown = self.service.change({"file": self.file, "files": left["files"], "command": {
            "command": "extrude", "sketch": sketch, "selection": [top], "inputs": {"end": "surface"}}})
        self.assertTrue(grown["ok"], grown.get("error"))
        self.assertIn("part += extrude(sketch1.face(), amount=sketch1.depth_to(part.faces().sort_by(Axis.Z)[-1]))\n", self.source())
        boss = [f for f in grown["features"] if f["kind"] == "Boss-Extrude"][1]
        self.assertEqual(boss["edit"]["values"], {"end": "surface", "reverse": False, "depth": ""})
        self.assertEqual(grown["change"]["what"], "from Sketch1, up to a face")
        # Edit Feature to the plate's bottom front edge's left end: Up To Vertex, 7.5 below.
        bottom = {"selector": "e99", "type": "line", "center": [0.0, -10.0, -7.5], "size": 40.0}
        vertex = self.service.change({"file": self.file, "files": grown["files"], "command": {
            "command": "extrude", "sketch": sketch, "selection": [bottom], "inputs": {"end": "vertex", "vertex_at": [-19, -10, -7.4]},
            "replace": {"row": boss["key"]}}})
        self.assertTrue(vertex["ok"], vertex.get("error"))
        line = next(line.strip() for line in self.source().splitlines() if "depth_to(" in line)
        self.assertRegex(line, r"^part \+= extrude\(sketch1\.face\(\), amount=sketch1\.depth_to\(part\.edges\(\)[^\n]*\.(start|end)_point\(\)\)\)$")
        again = [f for f in vertex["features"] if f["kind"] == "Boss-Extrude"][1]
        self.assertEqual(again["edit"]["values"], {"end": "vertex", "reverse": False, "depth": ""})
        # Edit Feature that picks nothing keeps the vertex as written.
        kept = self.service.change({"file": self.file, "files": vertex["files"], "command": {
            "command": "extrude", "sketch": sketch, "inputs": {"end": "vertex", "draft": True, "draft_angle": "2"}, "replace": {"row": again["key"]}}})
        self.assertTrue(kept["ok"], kept.get("error"))
        self.assertIn(line.removesuffix(")") + ", taper=2)", self.source())
        # A face square to the sketch has no one distance to end at.
        side = {"selector": "f99", "type": "plane", "center": [20.0, 0.0, -5.0], "size": 100.0}
        refused = self.service.change({"file": self.file, "files": kept["files"], "command": {
            "command": "extrude", "sketch": sketch, "selection": [side], "inputs": {"end": "surface"}, "replace": {"row": again["key"]}}})
        self.assertFalse(refused["ok"])
        self.assertIn("parallel", refused["error"])

    def test_a_cut_from_a_sketch_on_a_face_goes_into_the_part(self):
        state = self.service.state(self.file)
        self.assertTrue(state["ok"], state.get("error"))
        # The plate's top face: the face at z = 0 the viewer would pick.
        top = {"selector": "f6", "type": "plane", "center": [0.0, 0.0, 0.0], "size": 800.0}
        self.send({"kind": "new", "plane": top, "name": "Sketch1"})
        self.assertIn("plane=part.faces()", self.source())
        self.send({"kind": "draw", "entity": "circle", "center": {"at": [0, 0]}, "radius": 3})
        left = self.send({"kind": "exit"})
        cut = self.service.change({"file": self.file, "files": left["files"], "command": {
            "command": "cut", "sketch": {"file": "plate.py", "line": self.sketch["line"]},
            "inputs": {"end": "through", "reverse": True}}})
        self.assertTrue(cut["ok"], cut.get("error"))
        self.assertIn("part -= extrude(sketch1.face(), amount=-part.bounding_box().diagonal)", self.source())
        self.assertIn("Cut-Extrude", [f["kind"] for f in cut["features"]])

    def test_a_boss_made_from_a_sketch_is_the_body_later_commands_act_on(self):
        # `part += extrude(...)` is build123d's own `+=`: the tracer must still read the joined
        # body as the part's, or no command after it finds the body.
        self.start()
        self.send({"kind": "draw", "entity": "rectangle", "corner": {"point": "Origin"}, "opposite": {"at": [10, 6]}})
        left = self.send({"kind": "exit"})
        extruded = self.service.change({"file": self.file, "files": left["files"], "command": {
            "command": "extrude", "sketch": {"file": "plate.py", "line": self.sketch["line"]}, "inputs": {"depth": "3"}}})
        self.assertTrue(extruded["ok"], extruded.get("error"))
        # The boss's top face, 10 by 6 at z = 3: a sketch on it starts from the part's origin, below.
        top = {"selector": "f1", "type": "plane", "center": [5.0, 3.0, 3.0], "size": 60.0}
        self.files = extruded["files"]
        self.sketch = None
        self.send({"kind": "new", "plane": top, "name": "Sketch2"})
        self.assertEqual(self.sketch["state"]["frame"]["origin"], [0.0, 0.0, 3.0])
        self.assertEqual(self.sketch["state"]["frame"]["x"], [1.0, 0.0, 0.0])

    def test_a_sketch_revolved_about_its_centerline_is_a_boss_revolve(self):
        self.start("Front")
        self.send({"kind": "draw", "entity": "rectangle", "corner": {"at": [5, 0]}, "opposite": {"at": [10, 4]}})
        self.send({"kind": "draw", "entity": "centerline", "start": {"point": "Origin"}, "end": {"at": [0, 10]}})
        left = self.send({"kind": "exit"})
        revolved = self.service.change({"file": self.file, "files": left["files"], "command": {
            "command": "revolve", "sketch": {"file": "plate.py", "line": self.sketch["line"], "axis": "Line5"},
            "inputs": {"angle": "360"}}})
        self.assertTrue(revolved["ok"], revolved.get("error"))
        self.assertIn("part += revolve(sketch1.face(), axis=sketch1.axis(line5), revolution_arc=360)", self.source())
        feature = next(f for f in revolved["features"] if f["kind"] == "Boss-Revolve")
        self.assertEqual((feature["edit"]["values"], feature["edit"]["sketch"]["name"]),
                         ({"angle": "360", "reverse": False, "axis": "Line5"}, "Sketch1"))
        edited = self.service.change({"file": self.file, "files": revolved["files"], "command": {
            "command": "revolve", "sketch": {**feature["edit"]["sketch"], "axis": "Line5"}, "inputs": {"angle": "90", "reverse": True},
            "replace": {"row": feature["key"]}}})
        self.assertTrue(edited["ok"], edited.get("error"))
        self.assertIn("part += revolve(sketch1.face(), axis=sketch1.axis(line5), revolution_arc=-90)\n", self.source())
        self.assertEqual(self.source().count("revolve("), 1)

    def test_an_inch_part_sketches_in_inches(self):
        root = project("""
            from build123d import Box
            from cadgen import step

            INCH = 25.4
            SIDE = 1.00

            @step(out="plate.step")
            def plate():
                part = Box(SIDE*INCH, SIDE*INCH, .25*INCH)
                return part
        """)
        self.addCleanup(shutil.rmtree, root, True)
        (root / "project.json").write_text('{"units": "in"}', encoding="utf-8")
        self.root, self.file = root, str(root / "plate.step")
        self.files = self.service.state(self.file)["files"]
        self.start()
        self.assertIn('sketch1 = Sketch("Sketch1", plane="Top", unit=INCH)', self.source())
        self.send({"kind": "draw", "entity": "circle", "center": {"point": "Origin"}, "radius": 0.2})
        self.send({"kind": "dimension", "dimension": "diameter", "refs": ["Circle1"], "value": ".25"})
        self.assertIn("sketch1.diameter(circle1, 0.25)", self.source())
        self.assertEqual(self.sketch["state"]["unit"], 25.4)


if __name__ == "__main__":
    unittest.main()
