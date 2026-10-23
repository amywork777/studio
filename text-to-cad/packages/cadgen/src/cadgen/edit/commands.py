"""Edit mode's modeling commands: a CAD command written as one line of the part's script.

Fillet, Chamfer, Hole, Shell, Mirror and Pattern act on what the engineer selects: faces and edges
picked on the model (cadgen's selectors, ``f12`` and ``e3``, each with the geometry the viewer read
for it) and a feature picked in the history. A command writes one line of build123d into the
script, after the statement that makes the part's body, and the tracer reads it back as a feature
of its own.

The hard part is the selection. A face or an edge is matched to the part as its script makes it
now by its geometry (its kind, centre, and length or area), then written as build123d's own
selectors, which say where it is rather than what number it has: ``tray.edges().group_by(
bd.Axis.Z)[-1]`` (the top edges), ``tray.faces().sort_by(bd.Axis.Z)[-1].outer_wire().edges()``
(the top face's outer edges). The cheapest chain of selectors that picks exactly the selection is
found by a search over what build123d's selectors read of each face and edge, read once with
build123d's own code, and the chain is run before it is written.

Runs in the tracer's process only: it imports build123d.
"""

from __future__ import annotations

import ast
import difflib
import heapq
import itertools
import math
import re
from dataclasses import dataclass, field
from pathlib import Path

import build123d as B
from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE
from OCP.TopExp import TopExp
from OCP.TopoDS import TopoDS
from OCP.TopTools import TopTools_IndexedMapOfShape


class CommandError(Exception):
    """A command that cannot be made, said to the engineer."""


# ---------------------------------------------------------------------------------------------
# The selection, matched to the part as its script makes it now.

_ORDINAL = re.compile(r"([fe])(\d+)$")
_KIND_WORDS = {"face": ("face", "faces"), "edge": ("edge", "edges")}


def selector_ordinal(selector) -> tuple[str | None, int | None]:
    """``f12`` (or ``o1.1.f12``) is the twelfth face; ``e3`` the third edge."""
    match = _ORDINAL.search(str(selector or "").strip())
    if not match:
        return None, None
    return ("face" if match.group(1) == "f" else "edge"), int(match.group(2))


def counted(count: int, kind: str) -> str:
    """``1 edge``, ``4 edges``."""
    one, many = _KIND_WORDS.get(kind, (kind, f"{kind}s"))
    return f"{count} {one if count == 1 else many}"


def _said(item) -> str:
    kind, number = selector_ordinal(item.get("selector"))
    return f"{(kind or 'that').capitalize()} {kind[0] if kind else ''}{number or ''}".strip()


def _type_name(shape) -> str:
    """A face's or edge's kind as cadgen's selectors name it: ``plane``, ``cylinder``, ``line``."""
    try:
        from OCP.BRepAdaptor import BRepAdaptor_Curve, BRepAdaptor_Surface

        adaptor = BRepAdaptor_Surface(shape.wrapped) if isinstance(shape, B.Face) else BRepAdaptor_Curve(shape.wrapped)
        # The kind's enum name without its family, as cadgen 0.7's selectors spelled it: GeomAbs_Plane is plane.
        name = str(adaptor.GetType()).split(".")[-1]
        return (name[len("GeomAbs_") :] if name.startswith("GeomAbs_") else name).lower()
    except Exception:  # noqa: BLE001 - an unnamed kind only loosens the match
        return ""


class Topology:
    """One kind of a body's subshapes, numbered as cadgen's selectors number them (``f1`` is the
    first face ``TopExp.MapShapes`` meets) and described as the viewer describes them."""

    def __init__(self, shape, kind: str):
        self.kind = kind
        self.map = TopTools_IndexedMapOfShape()
        TopExp.MapShapes_s(shape.wrapped, TopAbs_FACE if kind == "face" else TopAbs_EDGE, self.map)
        self._items: dict[int, object] = {}
        self._described: dict[int, dict] = {}

    def __len__(self) -> int:
        return self.map.Extent()

    def item(self, number: int):
        if number not in self._items:
            raw = self.map.FindKey(number)
            self._items[number] = B.Face(TopoDS.Face_s(raw)) if self.kind == "face" else B.Edge(TopoDS.Edge_s(raw))
        return self._items[number]

    def number(self, shape) -> int:
        """The number of a face or edge of the body (0 for one not on it)."""
        return self.map.FindIndex(shape.wrapped)

    def describe(self, number: int) -> dict:
        if number not in self._described:
            item = self.item(number)
            center = item.center(B.CenterOf.MASS)
            size = item.area if self.kind == "face" else item.length
            self._described[number] = {"type": _type_name(item), "center": (center.X, center.Y, center.Z), "size": float(size)}
        return self._described[number]


def _distance(described: dict, wanted: dict, tolerance: float) -> float | None:
    """How far a face or edge is from what the viewer described, or None when it is another."""
    kind = str(wanted.get("type") or "").lower()
    if kind and described["type"] and kind != described["type"]:
        return None
    center = wanted.get("center")
    try:
        distance = math.dist(described["center"], [float(value) for value in center])
    except (TypeError, ValueError):
        return None
    if distance > tolerance:
        return None
    size = wanted.get("size")
    if size is not None:
        try:
            size = float(size)
        except (TypeError, ValueError):
            return None
        if abs(described["size"] - size) > 1e-4 * max(1.0, abs(size)):
            return None
    return distance


def resolve(topology: Topology, items: list[dict], scale: float) -> list[int]:
    """The faces or edges a selection names, as numbers of the body.

    Each item is a selector with what the viewer read of it (``type``, ``center``, ``size``). The
    selector's own number is tried first, as the STEP numbers it; a face or edge that is not there
    is looked for by its geometry, so a part that rebuilt with its faces in another order still
    finds them. Last, the face or edge at the selector's number is taken when its kind and size
    are the ones read, wherever the viewer placed it. A selector with no geometry is taken at its
    number."""
    tolerance = 1e-4 + 1e-6 * scale
    numbers: list[int] = []
    for item in items:
        kind, number = selector_ordinal(item.get("selector"))
        if kind != topology.kind:
            raise CommandError(f"{_said(item)} is not {'a face' if topology.kind == 'face' else 'an edge'}.")
        described = item.get("center") is not None
        if 1 <= number <= len(topology) and (not described or _distance(topology.describe(number), item, tolerance) is not None):
            found = number
        elif described:
            nearest = [(distance, candidate) for candidate in range(1, len(topology) + 1)
                       if (distance := _distance(topology.describe(candidate), item, tolerance)) is not None]
            if nearest:
                found = min(nearest)[1]
            elif 1 <= number <= len(topology) and _distance(topology.describe(number), {**item, "center": topology.describe(number)["center"]}, tolerance) is not None:
                found = number
            else:
                raise CommandError(f"{_said(item)} is not on the part as its script makes it now. "
                                   "Wait for the model to update, then select it again.")
        else:
            raise CommandError(f"{_said(item)} is not on the part.")
        if found not in numbers:
            numbers.append(found)
    return numbers


def same_items(shapes, wanted: list[dict], scale: float) -> bool:
    """Whether ``shapes`` are the faces or edges ``wanted`` describes, each once."""
    if isinstance(shapes, B.Shape) and not isinstance(shapes, list):
        shapes = [shapes]
    try:
        shapes = list(shapes)
    except TypeError:
        return False
    if len(shapes) != len(wanted):
        return False
    tolerance = 1e-4 + 1e-6 * scale
    left = list(wanted)
    for shape in shapes:
        kind = "face" if isinstance(shape, B.Face) else "edge"
        center = shape.center(B.CenterOf.MASS)
        described = {"type": "", "center": (center.X, center.Y, center.Z),
                     "size": float(shape.area if kind == "face" else shape.length)}
        match = next((each for each in left if _distance(described, {**each, "type": ""}, tolerance) is not None), None)
        if match is None:
            return False
        left.remove(match)
    return True


# ---------------------------------------------------------------------------------------------
# The selection written as build123d's own selectors.

AXES = ("Z", "X", "Y")  # Z first: a tie goes to "the top edges" over "the back ones"
PLANES = ("XY", "XZ", "YZ")
# What a step of a chain costs: a step that names where (an extreme, a kind, a direction) is
# cheap; one that counts in from an end is dear, as it means less once a size changes.
_COST_FILTER = 1.0
_COST_END = 1.0
_COST_RANK = 2.5
_COST_SIZE = 1.5
_COST_EDGES_OF_FACE = 1.0
_COST_OUTER_EDGES = 1.5
_COST_FIRST = 0.5
_DEPTH = 4
_BUDGET = 2500
_FACE_BUDGET = 400


class _Space:
    """A body's faces or edges as build123d's selectors read them: for each, its kind, the axes
    and planes it is parallel to (``filter_by``), where its centre lies along each axis
    (``group_by`` and ``sort_by``) and its sizes, each read once, with build123d's own code."""

    def __init__(self, shape, topology: Topology):
        self.kind = topology.kind
        self.topology = topology
        items = shape.faces() if self.kind == "face" else shape.edges()
        self.base = tuple(topology.number(item) for item in items)
        axes = {name: getattr(B.Axis, name) for name in AXES}
        planes = {name: getattr(B.Plane, name) for name in PLANES}
        self.facts: dict[int, dict] = {}
        for number, item in zip(self.base, items):
            one = B.ShapeList([item])
            center = item.center()
            sizes = {}
            for size in (("AREA", "RADIUS") if self.kind == "face" else ("LENGTH", "RADIUS")):
                try:
                    value = getattr(item, size.lower())
                    if isinstance(value, (int, float)) and math.isfinite(value):
                        sizes[size] = float(value)
                except Exception:  # noqa: BLE001 - a line has no radius
                    pass
            self.facts[number] = {
                "geom": item.geom_type,
                "parallel": {name: bool(one.filter_by(axis)) for name, axis in axes.items()},
                "flat": {name: bool(one.filter_by(plane)) for name, plane in planes.items()},
                "along": {name: (axis.location.inverse() * B.Location(center)).position.Z for name, axis in axes.items()},
                "sizes": sizes,
            }

    def numbers_of(self, shapes) -> tuple[int, ...]:
        return tuple(self.topology.number(shape) for shape in shapes)

    @staticmethod
    def _groups(seq, key):
        ordered = sorted(seq, key=key)
        return [tuple(group) for _, group in itertools.groupby(ordered, key=key)]

    def moves(self, seq: tuple[int, ...], picks_one: bool):
        """Each selector that narrows ``seq``: its text (names in braces, filled in by how the file
        reaches build123d), its cost, and what it leaves (a number, for a pick of one)."""
        facts = self.facts
        out = []
        kinds = sorted({facts[n]["geom"] for n in seq}, key=lambda kind: kind.name)
        if len(kinds) > 1:
            for kind in kinds:
                out.append((f".filter_by({{GeomType}}.{kind.name})", _COST_FILTER, tuple(n for n in seq if facts[n]["geom"] == kind)))
        for name in AXES:
            kept = tuple(n for n in seq if facts[n]["parallel"][name])
            if 0 < len(kept) < len(seq):
                out.append((f".filter_by({{Axis}}.{name})", _COST_FILTER, kept))
        for name in PLANES:
            kept = tuple(n for n in seq if facts[n]["flat"][name])
            if 0 < len(kept) < len(seq):
                out.append((f".filter_by({{Plane}}.{name})", _COST_FILTER, kept))
        for name in AXES:
            groups = self._groups(seq, lambda n, name=name: round(facts[n]["along"][name], 6))
            if len(groups) > 1:
                for index, cost in ((0, _COST_END), (-1, _COST_END), (1, _COST_RANK), (-2, _COST_RANK)):
                    if index in (1, -2) and len(groups) < 3:
                        continue
                    out.append((f".group_by({{Axis}}.{name})[{index}]", cost, groups[index]))
        for size in ("LENGTH", "AREA", "RADIUS"):
            if not all(size in facts[n]["sizes"] for n in seq):
                continue
            groups = self._groups(seq, lambda n, size=size: round(facts[n]["sizes"][size], 6))
            if len(groups) > 1:
                for index in (0, -1):
                    out.append((f".group_by({{SortBy}}.{size})[{index}]", _COST_SIZE, groups[index]))
        if picks_one and len(seq) == 1:
            out.append(("[0]", _COST_FIRST, seq[0]))
        if picks_one and len(seq) > 1:
            for name in AXES:
                ordered = sorted(seq, key=lambda n, name=name: facts[n]["along"][name])
                for index, neighbour in ((0, 1), (-1, -2)):
                    # Only an extreme that is the only one: a tie would pick by topology's order.
                    if abs(facts[ordered[index]]["along"][name] - facts[ordered[neighbour]]["along"][name]) > 1e-6:
                        out.append((f".sort_by({{Axis}}.{name})[{index}]", _COST_END, ordered[index]))
        return out


def _cheapest(space: _Space, starts, goal, keep, picks_one: bool, budget: int = _BUDGET):
    """The cheapest chain from one of ``starts`` (cost, text, numbers) that reaches ``goal``,
    never leaving what ``keep`` allows; None when there is none within the search's budget."""
    heap = []
    tie = itertools.count()
    for cost, text, seq in starts:
        heapq.heappush(heap, (cost, next(tie), text, seq, 0))
    seen: dict = {}
    while heap and budget > 0:
        cost, _, text, seq, depth = heapq.heappop(heap)
        if goal(seq):
            return cost, text, seq
        if isinstance(seq, int) or depth >= _DEPTH:
            continue
        budget -= 1
        for move, extra, result in space.moves(seq, picks_one):
            if not keep(result):
                continue
            key = result if isinstance(result, int) else frozenset(result)
            total = cost + extra
            if seen.get(key, math.inf) <= total:
                continue
            seen[key] = total
            heapq.heappush(heap, (total, next(tie), text + move, result, depth + 1))
    return None


@dataclass
class Names:
    """How a file reaches build123d: through a module (``bd.fillet``) or by bare names
    (``fillet``), and the bare names a line needs that the file does not import yet."""

    module: str
    needed: set[str] = field(default_factory=set)

    def __call__(self, name: str) -> str:
        if self.module:
            return f"{self.module}.{name}"
        self.needed.add(name)
        return name

    def fill(self, text: str) -> str:
        return text.format(**{name: self(name) for name in ("GeomType", "Axis", "Plane", "SortBy")
                              if "{" + name + "}" in text})

    def namespace(self) -> dict:
        if not self.module:
            return {name: getattr(B, name) for name in dir(B) if not name.startswith("_")}
        head, *rest = self.module.split(".")
        value = B
        for part in reversed(rest):  # `cadgen.build123d.fillet`: a `cadgen` with a `build123d`
            value = type("Module", (), {part: value})
        return {head: value}


class Selections:
    """Writes a selection of the body's faces or edges as build123d selectors on ``var``."""

    def __init__(self, shape, var: str, names: Names):
        self.shape = shape
        self.var = var
        self.names = names
        self.topology = {kind: Topology(shape, kind) for kind in ("face", "edge")}
        self._spaces: dict[str, _Space] = {}
        self._single_faces: dict[int, tuple[float, str] | None] = {}

    def space(self, kind: str) -> _Space:
        if kind not in self._spaces:
            self._spaces[kind] = _Space(self.shape, self.topology[kind])
        return self._spaces[kind]

    def _starts(self, kind: str, targets: frozenset[int]):
        space = self.space(kind)
        starts = [(0.0, f"{self.var}.{'faces' if kind == 'face' else 'edges'}()", space.base)]
        if kind == "edge":
            # The edges of a face the selection lies on: `<face>.edges()`, `.outer_wire().edges()`.
            faces = self.topology["face"]
            for face_number in range(1, len(faces) + 1):
                face = faces.item(face_number)
                edges = space.numbers_of(face.edges())
                if not targets & set(edges):
                    continue
                written = self._one_face(face_number)
                if written is None:
                    continue
                cost, text = written
                starts.append((cost + _COST_EDGES_OF_FACE, f"{text}.edges()", edges))
                try:
                    outer = space.numbers_of(face.outer_wire().edges())
                except Exception:  # noqa: BLE001 - a face with no outer wire
                    outer = ()
                if outer and len(outer) < len(edges):
                    starts.append((cost + _COST_OUTER_EDGES, f"{text}.outer_wire().edges()", outer))
        return starts

    def _one_face(self, number: int):
        if number not in self._single_faces:
            space = self.space("face")
            found = _cheapest(space, [(0.0, f"{self.var}.faces()", space.base)], goal=lambda seq: seq == number,
                              keep=lambda seq: seq == number if isinstance(seq, int) else number in seq, picks_one=True,
                              budget=_FACE_BUDGET)
            self._single_faces[number] = None if found is None else found[:2]
        return self._single_faces[number]

    def write(self, kind: str, numbers: list[int], one: bool = False) -> str:
        """The selector text for exactly these faces or edges; ``one`` asks for a single face or
        edge (a ``Face``, not a list), for what takes one."""
        targets = frozenset(numbers)
        space = self.space(kind)
        starts = self._starts(kind, targets)
        picks_one = len(targets) == 1
        found = _cheapest(
            space, starts,
            # One face for what takes one (a hole's): a Face, never a list of one.
            goal=lambda seq: (seq in targets) if isinstance(seq, int) else (not one and len(seq) == len(targets) and frozenset(seq) == targets),
            keep=lambda seq: (seq in targets) if isinstance(seq, int) else targets <= frozenset(seq),
            picks_one=picks_one,
        )
        if found is not None:
            return self._checked(self.names.fill(found[1]), kind, targets)
        if one:
            raise CommandError("That face cannot be told apart from the others by where it is. Pick another.")
        # No one chain picks them all: several, each picking only selected ones, added together.
        covered: set[int] = set()
        parts: list[str] = []
        for target in sorted(targets):
            if target in covered:
                continue
            found = _cheapest(
                space, starts,
                goal=lambda seq, target=target: not isinstance(seq, int) and target in seq and set(seq) <= targets and not set(seq) & covered,
                keep=lambda seq, target=target: not isinstance(seq, int) and target in seq,
                picks_one=False,
            )
            if found is None:
                raise CommandError(f"Some of the selected {_KIND_WORDS[kind][1]} cannot be told apart from the others by where "
                                   "they are. Select fewer, or ask the agent.")
            _, text, seq = found
            covered |= set(seq)
            parts.append(text)
        return self._checked(self.names.fill(" + ".join(parts)), kind, targets)

    def _checked(self, text: str, kind: str, targets: frozenset[int]) -> str:
        """The selector, run on the body: it must pick exactly the selection."""
        try:
            value = eval(text, {"__builtins__": {}}, {**self.names.namespace(), self.var: self.shape})  # noqa: S307 - our own selector text
        except Exception as error:  # noqa: BLE001
            raise CommandError(f"The selection could not be written ({error}).") from error
        shapes = [value] if isinstance(value, B.Shape) and not isinstance(value, list) else list(value)
        picked = [self.topology[kind].number(shape) for shape in shapes]
        if len(picked) != len(targets) or frozenset(picked) != targets:
            raise CommandError("The selection could not be written as selectors that pick exactly it.")
        return text


# ---------------------------------------------------------------------------------------------
# The script: where the body is made, and the line a command writes after it.

UNIT_NAMES = {"INCH", "INCHES", "IN", "MM_PER_IN", "MM_PER_INCH"}
_BUILDERS = re.compile(r"\bBuild(Part|Sketch|Line)\b")


@dataclass
class Body:
    """Where a part's body is made: the file, the function that designs the part, its top-level
    statement that last makes the body, and the name the body is held in (None when the
    statement returns it outright)."""

    path: Path
    rel: str
    text: str
    tree: ast.Module
    function: ast.FunctionDef
    statement: ast.stmt
    name: str | None
    indent: str

    @property
    def lines(self) -> list[str]:
        return self.text.splitlines(keepends=True)


def _function(tree: ast.Module, name: str, line: int):
    best = None
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name and node.lineno <= line <= node.end_lineno:
            if best is None or node.lineno > best.lineno:
                best = node
    return best


def _top_statement(function, line: int):
    return next((stmt for stmt in function.body if stmt.lineno <= line <= stmt.end_lineno), None)


def _innermost(statement: ast.stmt, line: int) -> ast.stmt:
    found = statement
    for node in ast.walk(statement):
        if isinstance(node, ast.stmt) and node.lineno <= line <= node.end_lineno and node.lineno >= found.lineno:
            found = node
    return found


def _assigned(statement: ast.stmt) -> str | None:
    if isinstance(statement, ast.Assign) and len(statement.targets) == 1 and isinstance(statement.targets[0], ast.Name):
        return statement.targets[0].id
    if isinstance(statement, (ast.AugAssign, ast.AnnAssign)) and isinstance(statement.target, ast.Name):
        return statement.target.id
    return None


def find_body(steps: list[dict], shape, level: int, root: Path) -> Body:
    """The statement that makes ``shape``, the part's body: the last recorded operation whose
    result it is, at the level of the function that designs the part (the history's level)."""
    step = next((step for step in reversed(steps) if step.get("result") is shape), None)
    if step is None or not step.get("frames"):
        raise CommandError("Edit mode cannot find the line that makes this part's body. Ask the agent to make the change.")
    frame = step["frames"][min(level, len(step["frames"]) - 1)]
    path = (root / frame["file"]).resolve()
    text = path.read_text(encoding="utf-8")
    tree = ast.parse(text, str(path))
    function = _function(tree, frame["function"], frame["line"])
    statement = _top_statement(function, frame["line"]) if function is not None else None
    if statement is None:
        raise CommandError("Edit mode cannot find the line that makes this part's body. Ask the agent to make the change.")
    source = text.splitlines()[statement.lineno - 1]
    if isinstance(statement, ast.With) and _BUILDERS.search(ast.get_source_segment(text, statement) or ""):
        raise CommandError("This part is written in build123d's builder style, which edit mode's commands do not write "
                           "into yet. Ask the agent to make the change.")
    inner = _innermost(statement, frame["line"])
    if isinstance(statement, ast.Return):
        name = None
    else:
        name = _assigned(inner)
        if name is None:
            raise CommandError("Edit mode cannot tell which name holds this part's body. Ask the agent to make the change.")
    return Body(path=path, rel=frame["file"], text=text, tree=tree, function=function, statement=statement, name=name,
                indent=source[: len(source) - len(source.lstrip())])


def _solid(shape) -> bool:
    try:
        return isinstance(shape, B.Shape) and len(shape.solids()) > 0
    except Exception:  # noqa: BLE001 - a shape that cannot list its solids is no body
        return False


def body_at(steps: list[dict], shape, level: int, root: Path, rel: str, line: int):
    """The part's body as it is just before the top-level statement at ``line`` of ``rel`` runs, as
    a rollback bar there shows it (``shape_at``), and where it is made (``Body``)."""
    found = shape_at(steps, shape, level, rel, line)
    if found is None:
        raise CommandError("There is no body above that point yet. Move the rollback bar below the first feature.")
    return found, find_body(steps, found, level, root)


def shape_at(steps: list[dict], shape, level: int, rel: str, line: int):
    """The part's body as it is just before the top-level statement at ``line`` of ``rel`` runs:
    the shape the last operation on the body above that line made, or None when there is none. The
    body is the final shape's lineage: the operations whose result carries its origin, or the
    origin of a body it was made from (a shell's, a mirror's). Nothing is read from the files."""
    origins: set[int] = set()
    origin = getattr(shape, "_studio_origin", None)
    while isinstance(origin, int) and origin not in origins and 0 <= origin < len(steps):
        origins.add(origin)
        origin = steps[origin].get("from")
    found = None
    for step in steps:
        frames = step.get("frames")
        if not frames:
            continue
        frame = frames[min(level, len(frames) - 1)]
        if frame["file"] == rel and frame["line"] < line and getattr(step.get("result"), "_studio_origin", None) in origins \
                and _solid(step["result"]):
            found = step
    return None if found is None else found["result"]


def shifted(line: int, changes: list[dict]) -> int:
    """Where line ``line`` of a file is after ``changes`` (``hunks`` of its old text to its new)
    were made: moved by what they took out or put in above it, a line put in right above it too."""
    moved = line
    for change in changes:
        if int(change["start"]) + len(change["old"]) <= line:
            moved += len(change["new"]) - len(change["old"])
    return moved


def build123d_names(tree: ast.Module) -> tuple[str | None, ast.ImportFrom | None]:
    """How a file reaches build123d: a module name (``bd``), or ``""`` for bare names, with the
    named import that bare names would be added to (None for a star import)."""
    for node in tree.body:
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name in ("build123d", "cadgen.build123d"):
                    return alias.asname or alias.name, None
        if isinstance(node, ast.ImportFrom) and node.module == "cadgen":
            for alias in node.names:
                if alias.name == "build123d":
                    return alias.asname or "build123d", None
    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.module in ("build123d", "cadgen.build123d"):
            if any(alias.name == "*" for alias in node.names):
                return "", None
            return "", node
    return None, None


def unit_name(tree: ast.Module) -> str | None:
    """The name an inch part multiplies its sizes by (``INCH = 25.4``), where the file has one."""
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            if name.upper() in UNIT_NAMES and isinstance(node.value, ast.Constant) and node.value.value == 25.4:
                return name
        if isinstance(node, ast.ImportFrom):
            for alias in node.names:
                name = alias.asname or alias.name
                if name.upper() in UNIT_NAMES:
                    return name
    return None


def _names_in(tree: ast.AST) -> set[str]:
    return {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)} | {
        node.name for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))}


def fresh_name(tree: ast.AST, wanted: str) -> str:
    """``wanted`` as a Python name the file does not use yet."""
    base = re.sub(r"\W+", "_", wanted.strip().lower()).strip("_") or "feature"
    if base[0].isdigit():
        base = f"feature_{base}"
    taken = _names_in(tree)
    if base not in taken:
        return base
    return next(f"{base}_{n}" for n in itertools.count(2) if f"{base}_{n}" not in taken)


class Edits:
    """Changes to one file's text, made at once: text put in at a point of a line (a column in
    UTF-8 bytes, as ``ast`` counts them) and lines put in after a line."""

    def __init__(self, text: str):
        self.text = text
        self._ops: list[tuple] = []

    def put(self, line: int, col: int, text: str, until: int | None = None):
        """Text at ``line``:``col``, replacing up to column ``until`` of the same line."""
        self._ops.append((line, col, 0, text, until if until is not None else col))

    def after(self, line: int, lines: list[str]):
        self._ops.append((line, math.inf, 1, lines, None))

    def swap(self, first: int, last: int, lines: list[str]):
        """Lines ``first`` to ``last`` put as ``lines``."""
        self._ops.append((first, -1, 2, lines, last))

    def apply(self) -> str:
        lines = self.text.splitlines(keepends=True)
        newline = next((line[len(line.rstrip("\r\n")):] for line in lines if line.endswith(("\n", "\r"))), "\n")
        for line, col, kind, text, until in sorted(self._ops, key=lambda op: (op[0], op[1]), reverse=True):
            if kind == 2:
                lines[line - 1:until] = [each + newline for each in text]
                continue
            if kind == 1:
                if line and not lines[line - 1].endswith(("\n", "\r")):
                    lines[line - 1] += newline
                lines[line:line] = [each + newline for each in text]
            else:
                raw = lines[line - 1].encode("utf-8")
                lines[line - 1] = (raw[:col] + text.encode("utf-8") + raw[until:]).decode("utf-8")
        return "".join(lines)


def hunks(old: str, new: str) -> list[dict]:
    """The lines that differ between two texts: each run of lines at ``start`` (from 1) that read
    ``old`` and become ``new``, endings kept, so a change can be put back exactly."""
    a, b = old.splitlines(keepends=True), new.splitlines(keepends=True)
    out = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if tag != "equal":
            out.append({"start": i1 + 1, "old": a[i1:i2], "new": b[j1:j2]})
    return out


def splice(text: str, changes: list[dict]) -> str:
    """``text`` with ``changes`` (from ``hunks``) made, each checked to still read as it did."""
    lines = text.splitlines(keepends=True)
    for change in sorted(changes, key=lambda change: change["start"], reverse=True):
        start, old = int(change["start"]) - 1, list(change["old"])
        if start < 0 or lines[start:start + len(old)] != old:
            raise CommandError(f"Line {start + 1} no longer reads as the change left it. Look again.")
        lines[start:start + len(old)] = list(change["new"])
    return "".join(lines)


# ---------------------------------------------------------------------------------------------
# The commands.

COMMANDS = ("fillet", "chamfer", "hole", "shell", "draft", "mirror", "pattern", "extrude", "cut", "revolve", "revolve_cut", "sweep",
            "sweep_cut", "loft", "loft_cut", "rib", "plane", "split", "delete_body")
FEATURE_WORDS = {"fillet": "Fillet", "chamfer": "Chamfer", "hole": "Hole", "shell": "Shell", "draft": "Draft", "mirror": "Mirror",
                 "pattern": "Pattern", "extrude": "Boss-Extrude", "cut": "Cut-Extrude", "revolve": "Boss-Revolve", "revolve_cut": "Cut-Revolve",
                 "sweep": "Boss-Sweep", "sweep_cut": "Cut-Sweep", "loft": "Boss-Loft", "loft_cut": "Cut-Loft", "rib": "Rib", "plane": "Plane",
                 "split": "Split", "delete_body": "Delete/Keep Body"}
# The operation each command's line records in the tracer.
RECORDS = {"fillet": ("fillet",), "chamfer": ("chamfer",), "hole": ("cut",), "shell": ("offset",), "draft": ("draft",),
           "mirror": ("mirror",), "pattern": ("GridLocations", "PolarLocations"), "extrude": ("extrude",), "cut": ("extrude",),
           "revolve": ("revolve",), "revolve_cut": ("revolve",), "sweep": ("sweep",), "sweep_cut": ("sweep",), "loft": ("loft",),
           "loft_cut": ("loft",), "rib": ("rib",), "plane": ("plane",), "split": ("split",), "delete_body": ("cut", "add")}
# The origin's planes as the design tree names them, and as build123d does.
ORIGIN_PLANES = {"Top": "XY", "Front": "XZ", "Right": "YZ"}
# The faces a draft tilts, as OCCT's draft takes them.
DRAFTED = ("plane", "cylinder", "cone")
# A hole's callout, as Hole Wizard's sizes word one: a screw's size, what the hole is for, its fit.
_CALLOUT = re.compile(r"^[A-Za-z0-9#./ ,-]{1,60}$")
# A callout Hole Wizard wrote, rather than a name the engineer gave the hole.
_SIZED = re.compile(r"^(M[\d.]+|#\d+-\d+|\d+/\d+-\d+)(?:x[\d.]+)? (clearance hole|socket head counterbore|flat head countersink|tapped hole)"
                    r"(?:, (close|normal|loose) fit)?$")


def trailing_comment(text: str, statement: ast.stmt) -> str:
    """The comment at the end of a statement's last line, without its mark (``Cable notch`` of
    ``part -= ...  # Cable notch``): a feature's name, or a hole's callout. Empty for none."""
    line = text.splitlines()[statement.end_lineno - 1].encode("utf-8")
    rest = line[statement.end_col_offset:].decode("utf-8", "replace").strip()
    return rest[1:].strip() if rest.startswith("#") else ""


def with_comment(text: str, statement: ast.stmt, comment: str) -> str:
    """``text`` with the comment at the end of ``statement``'s last line made ``comment``, or taken off for ""."""
    lines = text.splitlines(keepends=True)
    index = statement.end_lineno - 1
    raw = lines[index]
    newline = raw[len(raw.rstrip("\r\n")):]
    code = raw.encode("utf-8")[:statement.end_col_offset].decode("utf-8").rstrip()
    lines[index] = f"{code}{f'  # {comment}' if comment else ''}{newline}"
    return "".join(lines)


@dataclass
class Plan:
    """A command made into text: the file before and after, the command's line, and what the
    traced line must show (its operation, and the faces or edges it was given)."""

    command: str
    path: Path
    rel: str
    old: str
    new: str
    line: int
    code: str
    records: tuple[str, ...]
    selected: dict | None
    summary: dict


def _number(value: float, dotted: bool) -> str:
    text = f"{value:.6f}".rstrip("0").rstrip(".") if not float(value).is_integer() else str(int(value))
    if dotted and re.match(r"^-?0\.", text):
        text = text.replace("0.", ".", 1)
    return "0" if text in ("-0", "") else text


class _Writer:
    """Numbers and names written as the file writes them."""

    def __init__(self, body: Body, units: str, literals: dict, names: Names):
        self.units = units
        self.unit = unit_name(body.tree) if units == "in" else None
        # A file that writes `.060` gets `.020`, not `0.020`.
        self.dotted = any(literal["file"] == body.rel and re.match(r"^-?\.\d", literal["text"]) for literal in literals.values())
        self.names = names

    def number(self, value: float) -> str:
        return _number(value, self.dotted)

    def length(self, value: float, factor: str = "") -> str:
        """A length typed in the project's units, as code: ``.020*INCH`` in an inch part."""
        if self.units == "in":
            if self.unit:
                return f"{self.number(value)}{factor}*{self.unit}"
            return f"{self.number(value * 25.4)}{factor}"
        return f"{self.number(value)}{factor}"


def _value(inputs: dict, key: str, label: str, parse, *, positive: bool = True, integer: bool = False,
           minimum: float | None = None):
    text = str(inputs.get(key, "")).strip()
    try:
        value = parse(text)
    except Exception:  # noqa: BLE001
        raise CommandError(f"{label} needs a number.") from None
    if integer:
        if not float(value).is_integer():
            raise CommandError(f"{label} needs a whole number.")
        value = int(value)
    if minimum is not None and value < minimum:
        raise CommandError(f"{label} needs to be at least {_number(minimum, False)}.")
    if positive and value <= 0:
        raise CommandError(f"{label} needs to be more than 0.")
    return value


def _tool(body: Body, var: str, feature: dict | None, bar: int | None = None):
    """What Mirror and Pattern copy: the tool a feature cuts or adds (``lid -= <tool>``), named
    so it can be used again, or the body itself (``var``). Returns (tool, operator, edits)."""
    if not feature or not feature.get("row"):
        return var, "+=", []
    file, _, line = str(feature["row"]).rpartition(":")
    if file != body.rel or not line.isdigit():
        raise CommandError("Pick a feature of this part's body in the history.")
    line = int(line)
    if bar is not None and line >= bar:
        raise CommandError(f"{feature.get('name') or 'That feature'} is below the rollback bar. Move the bar below it first.")
    statement = _top_statement(body.function, line)
    if statement is None:
        raise CommandError("Pick a feature of this part's body in the history.")
    if statement.lineno != line or isinstance(statement, (ast.For, ast.While, ast.If, ast.With)):
        raise CommandError("That feature is made inside a loop or a branch. Ask the agent to mirror or pattern it.")
    tool = operator = None
    if isinstance(statement, ast.AugAssign) and isinstance(statement.op, (ast.Sub, ast.Add)):
        tool, operator = statement.value, statement.op
    elif isinstance(statement, ast.Assign) and isinstance(statement.value, ast.BinOp) and isinstance(statement.value.op, (ast.Sub, ast.Add)):
        tool, operator = statement.value.right, statement.value.op
    if tool is None:
        # A feature that is the body itself (the first extrude): the body is what is copied.
        return var, "+=", []
    sign = "-=" if isinstance(operator, ast.Sub) else "+="
    if isinstance(tool, ast.Name):
        return tool.id, sign, []
    # Named already, by a pattern or a mirror made of it before (`part -= (hole1 := ...)`): that name.
    if isinstance(tool, ast.NamedExpr) and isinstance(tool.target, ast.Name):
        return tool.target.id, sign, []
    name = fresh_name(body.tree, str(feature.get("name") or "tool"))
    edits = [(tool.lineno, tool.col_offset, f"({name} := "), (tool.end_lineno, tool.end_col_offset, ")")]
    return name, sign, edits


def recorded_numbers(steps: list[dict]) -> dict:
    """What a line's operations were given, by operation and argument (``("fillet", "radius")``):
    sizes in millimetres, angles in degrees, counts, and how many faces or edges a list held. An
    operation the line makes again is also keyed by which one it is (``("Cylinder", "radius", 2)``,
    a counterbore's after its hole's), the first's numbers kept under the plain key."""
    out: dict = {}
    made: dict = {}
    for step in steps:
        nth = made[step["op"]] = made.get(step["op"], 0) + 1
        for name, value in step["args"]:
            if isinstance(value, bool):
                continue
            if isinstance(value, (int, float)):
                number = float(value)
            elif isinstance(value, (list, tuple)):
                number = float(len(value))
            else:
                continue
            out.setdefault((step["op"], name), number)
            out.setdefault((step["op"], name, nth), number)
    return out


def _feature_line(body: Body, replacing: dict, command: str, units: str, steps: list[dict], level: int) -> tuple[ast.stmt, Feature]:
    """The line Edit Feature writes again: the feature's own, read as the command it is."""
    file, _, line = str(replacing.get("row") or "").rpartition(":")
    if file != body.rel or not line.isdigit():
        raise CommandError("That feature is not made where this part's body is. Ask the agent to change it.")
    made = [step for step in steps if step.get("frames")
            and (step["frames"][min(level, len(step["frames"]) - 1)]["file"], step["frames"][min(level, len(step["frames"]) - 1)]["line"])
            == (file, int(line))]
    statement = _top_statement(body.function, int(line))
    feature = (read_feature(statement, body.text, recorded_numbers(made), units)
               if statement is not None and statement.lineno == int(line) else None)
    if feature is None:
        raise CommandError("That feature is not written as one of edit mode's commands, so edit mode cannot open it. "
                           "Change its sizes in the design tree, or ask the agent.")
    if feature.command != command:
        raise CommandError(f"That feature is a {FEATURE_WORDS[feature.command]}, not a {FEATURE_WORDS[command]}.")
    return statement, feature


def _sketch_block(drawn: dict, body: Body, bar: int | None, replacing, verb: str):
    """Where the script makes a sketch a command is made from (``drawn``: its file, line and
    name): in the function that makes the part's body, and above the rollback bar."""
    from cadgen.edit import sketching

    if str(drawn.get("file") or "") != body.rel:
        raise CommandError("Pick a sketch of this part's body in the design tree.")
    try:
        block = sketching.find_block(body.text, int(drawn.get("line") or 0), str(body.path))
    except (sketching.SketchEditError, ValueError) as error:
        raise CommandError(str(error)) from None
    if block.function is None or block.function.lineno != body.function.lineno:
        raise CommandError(f"That sketch is made outside the function that makes this part's body. Ask the agent to {verb} it.")
    if bar is not None and not replacing and block.last_line >= bar:
        raise CommandError(f"{drawn.get('name') or 'That sketch'} is below the rollback bar. Move the bar below it first.")
    return block


def _one_region(drawn: dict, block, what: str) -> str:
    """A sketch's one closed region as code (``sketch3.face()``), for a profile that is one."""
    regions = int(drawn.get("regions") or 1)
    if regions != 1:
        raise CommandError(f"{drawn.get('name') or 'That sketch'} has {regions} separate regions; {what} takes one.")
    return f"{block.var}.face()"


def plan(spec: dict, *, steps: list[dict], shape, level: int, units: str, literals: dict, root: Path, parse,
         bar: int | None = None) -> Plan:
    """A command (``spec``: its ``command``, the ``selection`` it acts on, its ``inputs`` as
    typed and the history ``feature`` it copies) made into the part's script. ``parse`` reads a
    typed number (plain arithmetic allowed). With ``replace`` (a feature's history row) it is Edit
    Feature: that feature's own line written again in its place, with what it acts on kept, or
    picked again (a ``selection``) on the body as it was before it. ``bar``: the line of the
    top-level statement a rollback bar sits above; the command acts on the body there and its
    line goes right above that statement."""
    command = str(spec.get("command") or "")
    if command not in COMMANDS:
        raise CommandError(f"Edit mode has no command {command or 'by that name'}.")
    records = RECORDS[command]
    if not isinstance(shape, B.Shape):
        raise CommandError("This part's script makes no solid body to change.")
    body = find_body(steps, shape, level, root)
    module, named_import = build123d_names(body.tree)
    names = Names(module if module is not None else "bd")
    edits = Edits(body.text)
    selection = [item for item in spec.get("selection") or [] if isinstance(item, dict)]
    # A draft's neutral plane, when it is a face picked on the model.
    neutral = spec.get("neutral") if command == "draft" and isinstance(spec.get("neutral"), dict) else None
    replacing = spec.get("replace") if isinstance(spec.get("replace"), dict) else None
    old = kept = None
    # The body the selection is on, and the name that holds it there: the part's, unless rolled back.
    picked_on, picked_var = shape, None
    if bar is not None and not replacing:
        from cadgen.edit.deleting import suppressed_span

        statement = _top_statement(body.function, bar)
        if (statement is None or statement.lineno != bar) and suppressed_span(body.lines, bar) is None:
            raise CommandError("The rollback bar is no longer between two features. Move it again.")
    if replacing:
        old, kept = _feature_line(body, replacing, command, units, steps, level)
        var, returned = kept.target, []
        if (selection or neutral) and command in ("fillet", "chamfer", "hole", "shell", "draft", "extrude", "cut"):
            # Picked again, as a CAD tool rolls back to the feature: on the body as it was before it.
            picked_on, before = body_at(steps, shape, level, root, body.rel, old.lineno)
            picked_var = before.name
    elif bar is not None:
        picked_on, before = body_at(steps, shape, level, root, body.rel, bar)
        if before.name is None:
            raise CommandError("Edit mode cannot tell which name holds the body there. Ask the agent to make the change.")
        var, returned = before.name, []
    elif body.name is None:
        # `return <body>` becomes `part = <body>`, the command's line, and `return part`.
        var = fresh_name(body.tree, "part")
        value = body.statement.value
        if value is None or value.lineno != body.statement.lineno:
            raise CommandError("Edit mode cannot tell what this part returns. Ask the agent to make the change.")
        edits.put(body.statement.lineno, body.statement.col_offset, f"{var} = ", until=value.col_offset)
        returned = [f"{body.indent}return {var}"]
    else:
        var, returned = body.name, []
    writer = _Writer(body, units, literals, names)
    inputs = spec.get("inputs") or {}
    # A new feature comes last in the tree, as a CAD tool adds it: past any suppressed right after the body's line.
    from cadgen.edit.deleting import suppressed_span

    at = body.statement.end_lineno
    while (span := suppressed_span(body.lines, at + 1)) is not None:
        at = span["last"]
    if bar is not None and not replacing:
        at = bar - 1
    # Edges or faces picked again replace the feature's own; otherwise it keeps them as written.
    fixed = None if kept is not None and selection and picked_var else kept

    def same(role: str, value: float, fresh: str) -> str:
        """``fresh``, unless Edit Feature left this value as it was: then the line's own code for it."""
        if kept is not None and role in kept.codes:
            written, was = kept.codes[role]
            if math.isclose(float(value), was, rel_tol=1e-9, abs_tol=1e-9):
                return written
        return fresh

    scale = picked_on.bounding_box().diagonal or 1.0
    selections = Selections(picked_on, picked_var or var, names)
    selected = None
    units_word = units if units in ("mm", "in") else ""

    def reference_plane(named: str) -> str:
        """A reference plane of the part a command names (``named:plane1``), by its name: a new
        line goes after the plane's own; a feature written again, or one at the rollback bar,
        needs the plane made above it."""
        nonlocal at
        name = named.partition(":")[2]
        made = next((statement for statement in body.function.body if _assigned(statement) == name), None)
        if made is None:
            raise CommandError(f"{name} is not a plane of this part. Pick another.")
        if (old is not None and made.end_lineno >= old.lineno) or (old is None and bar is not None and made.end_lineno > at):
            raise CommandError(f"{name} is made below where this goes. Pick another, or move the rollback bar.")
        if old is None and bar is None:
            at = max(at, made.end_lineno)
        return name

    def chosen(kind: str, *, one: bool = False, least: int = 1):
        items = [item for item in selection if selector_ordinal(item.get("selector"))[0] == kind]
        if len(items) < least:
            raise CommandError(f"Select {'a face' if kind == 'face' and one else _KIND_WORDS[kind][1]} on the model first.")
        if one and len(items) > 1:
            raise CommandError("Select one face.")
        numbers = resolve(selections.topology[kind], items, scale)
        return numbers, selections.write(kind, numbers, one=one)

    def chosen_edges():
        # A face selected for a fillet or a chamfer stands for all its edges, as in a CAD tool.
        edge_items = [item for item in selection if selector_ordinal(item.get("selector"))[0] == "edge"]
        face_items = [item for item in selection if selector_ordinal(item.get("selector"))[0] == "face"]
        if not edge_items and not face_items:
            raise CommandError("Select edges on the model first.")
        numbers = resolve(selections.topology["edge"], edge_items, scale) if edge_items else []
        edges = selections.topology["edge"]
        for face_number in resolve(selections.topology["face"], face_items, scale) if face_items else []:
            for each in selections.topology["face"].item(face_number).edges():
                if (number := edges.number(each)) and number not in numbers:
                    numbers.append(number)
        return numbers, selections.write("edge", numbers)

    if command in ("fillet", "chamfer"):
        numbers, edges = ([], fixed.parts["edges"]) if fixed else chosen_edges()
        if command == "fillet":
            radius = _value(inputs, "radius", "Radius", parse)
            code = f"{var} = {names('fillet')}({edges}, radius={same('radius', radius, writer.length(radius))})"
            shown = [("Radius", radius, units_word)]
        else:
            # Chamfer's types, as SolidWorks' Chamfer sets them: one distance both ways, a distance
            # each way (flipped, swapped), or a distance and the angle from it.
            kind = str(inputs.get("type") or "equal").lower()
            distance = _value(inputs, "distance", "Distance", parse)
            length = same("distance", distance, writer.length(distance))
            if kind == "distances":
                second = _value(inputs, "distance2", "Distance 2", parse)
                other = same("distance2", second, writer.length(second))
                if inputs.get("flip") in (True, "true", "1", 1):
                    length, other = other, length
                code = f"{var} = {names('chamfer')}({edges}, length={length}, length2={other})"
                shown = [("Distance", distance, units_word), ("Distance 2", second, units_word)]
            elif kind == "angle":
                angle = _value(inputs, "angle", "Angle", parse)
                if angle >= 90:
                    raise CommandError("A chamfer's angle is less than 90 degrees.")
                turned = same("angle", angle, writer.number(angle))
                if inputs.get("flip") in (True, "true", "1", 1):
                    # Flip direction: the distance along each edge's other face. build123d measures an
                    # angle chamfer's length along the edge's first face, so there the length is the
                    # distance times the angle's tangent, and the distance goes the other way.
                    code = (f"{var} = {names('chamfer')}({edges}, length={_term(length)} * {names('tan')}({names('radians')}({turned})), "
                            f"length2={length})")
                else:
                    code = f"{var} = {names('chamfer')}({edges}, length={length}, angle={turned})"
                shown = [("Distance", distance, units_word), ("Angle", angle, "deg")]
            else:
                code = f"{var} = {names('chamfer')}({edges}, length={length})"
                shown = [("Distance", distance, units_word)]
        selected = None if fixed else {"argument": "objects", "items": [selections.topology["edge"].describe(n) for n in numbers]}
        what = fixed.keeps if fixed else counted(len(numbers), "edge")
    elif command == "hole":
        if fixed:
            face = fixed.parts["face"]
        else:
            numbers, face = chosen("face", one=True)
            if selections.topology["face"].describe(numbers[0])["type"] != "plane":
                raise CommandError("A hole goes in a flat face. Select a flat one.")
        diameter = _value(inputs, "diameter", "Diameter", parse)
        through = str(inputs.get("depth", "")).strip().lower() in ("", "through", "through all")
        depth = None if through else _value(inputs, "depth", "Depth", parse)
        depth_code = f"{var}.bounding_box().diagonal" if through else same("depth", depth, writer.length(depth))
        plane = None if fixed else B.Plane(selections.topology["face"].item(numbers[0]))

        def placed(given: dict) -> dict:
            """A hole's place on its face, its distance from the face's center along each axis."""
            offsets = {axis: 0.0 for axis in AXES}
            for axis in (("X", "Y", "Z") if fixed else offset_axes(plane.z_dir)):
                if str(given.get(axis.lower(), "")).strip():
                    offsets[axis] = _value(given, axis.lower(), axis, parse, positive=False)
            if not fixed:
                unit = 25.4 if units == "in" else 1.0
                moved = B.Vector(*(offsets[axis] * unit for axis in ("X", "Y", "Z")))
                # A slanted face moves its hole in X, Y and Z at once: the place clicked, to the places
                # the panel shows, is put back on the face's plane; one typed well off it is refused.
                off = moved.dot(plane.z_dir)
                if len(offset_axes(plane.z_dir)) == 3 and abs(off) > 1e-9:
                    if abs(off) > 0.05:
                        raise CommandError(f"Those X, Y and Z put the hole's center {abs(off) / unit:.3g} {units_word or 'mm'} off the face. "
                                           "Click the face where the hole goes.")
                    moved -= plane.z_dir * off
                    offsets = {axis: round(getattr(moved, axis) / unit, 6) for axis in ("X", "Y", "Z")}
                if selections.topology["face"].item(numbers[0]).distance_to(plane.origin + moved) > 1e-4 + 1e-6 * scale:
                    raise CommandError("The hole's center is off that face. Click the face where the hole goes.")
            return offsets

        # Hole Wizard's Positions: the first hole's place, and one more for each other click on the face.
        places = [placed(inputs)] + [placed(each) for each in inputs.get("more") or [] if isinstance(each, dict)]
        offsets = places[0]
        moved = ""
        if len(places) == 1 and any(offsets.values()):
            given = [same(axis.lower(), offsets[axis], writer.length(offsets[axis])) if offsets[axis] else "0" for axis in ("X", "Y", "Z")]
            moved = f"{names('Pos')}({', '.join(given[:2] if given[2] == '0' else given)}) * "
        align = names("Align")
        under = f"align=({align}.CENTER, {align}.CENTER, {align}.MAX)"
        tool = f"{names('Cylinder')}({same('diameter', diameter, writer.length(diameter, '/2'))}, {depth_code}, {under})"
        shown = [("Diameter", diameter, units_word)] + ([("Depth", depth, units_word)] if depth is not None else [])
        # Hole Wizard's types: a counterbore or a countersink at the face for a screw's head,
        # each a solid added to the hole's cylinder, both from the face down.
        kind = str(inputs.get("type") or "simple").lower()
        if kind == "counterbore":
            bore = _value(inputs, "cbore_diameter", "Counterbore diameter", parse)
            bore_depth = _value(inputs, "cbore_depth", "Counterbore depth", parse)
            if bore <= diameter:
                raise CommandError("A counterbore is wider than its hole. Make its diameter larger than the hole's.")
            if depth is not None and bore_depth >= depth:
                raise CommandError("A counterbore is shallower than its hole. Make its depth less than the hole's.")
            tool = (f"({tool} + {names('Cylinder')}({same('cbore_diameter', bore, writer.length(bore, '/2'))}, "
                    f"{same('cbore_depth', bore_depth, writer.length(bore_depth))}, {under}))")
            shown += [("Counterbore diameter", bore, units_word), ("Counterbore depth", bore_depth, units_word)]
        elif kind == "countersink":
            sink = _value(inputs, "csk_diameter", "Countersink diameter", parse)
            angle = _value(inputs, "csk_angle", "Countersink angle", parse)
            if sink <= diameter:
                raise CommandError("A countersink is wider than its hole. Make its diameter larger than the hole's.")
            if not 0 < angle < 180:
                raise CommandError("A countersink's angle is between 0 and 180 degrees.")
            # The cone from the countersink's diameter at the face down to the hole's, at its angle.
            height = (sink - diameter) / 2 / math.tan(math.radians(angle) / 2)
            tool = (f"({tool} + {names('Cone')}({same('diameter', diameter, writer.length(diameter, '/2'))}, "
                    f"{same('csk_diameter', sink, writer.length(sink, '/2'))}, {writer.length(height)}, {under}))")
            shown += [("Countersink diameter", sink, units_word), ("Countersink angle", angle, "deg")]
        code = f"{var} -= {moved}{names('Plane')}({face}) * {tool}"
        if len(places) > 1:
            # Several holes, one feature: the same hole at each place, `Pos(*at)` from the face's center.
            spatial = any(place["Z"] for place in places)
            axes = ("X", "Y", "Z") if spatial else ("X", "Y")
            first = [same(axis.lower(), offsets[axis], writer.length(offsets[axis])) if offsets[axis] else "0" for axis in axes]
            rest = [[writer.length(place[axis]) if place[axis] else "0" for axis in axes] for place in places[1:]]
            listed = ", ".join(f"({', '.join(each)})" for each in [first, *rest])
            code = f"{var} -= [{names('Pos')}(*at) * {names('Plane')}({face}) * {tool} for at in ({listed})]"
        what = "through all" if through else "a blind hole"
        if kind in ("counterbore", "countersink", "tapped"):
            what = f"{ {'counterbore': 'counterbored', 'countersink': 'countersunk'}.get(kind, kind)}, {what}"
        if len(places) > 1:
            what = f"{len(places)} holes, {what.replace('a blind hole', 'blind')}"
        # Hole Wizard's callout for a hole of a standard's size, kept beside its line as a drawing
        # labels the hole: "M3 clearance hole, normal fit", "M3x0.5 tapped hole".
        callout = str(inputs.get("callout") or "").strip()
        if callout:
            if not _CALLOUT.match(callout):
                raise CommandError("That hole's size could not be written beside it. Pick its size again.")
            code = f"{code}  # {callout}"
    elif command == "shell":
        numbers, faces = ([], fixed.parts["openings"]) if fixed else chosen("face")
        thickness = _value(inputs, "thickness", "Thickness", parse)
        code = f"{var} = {names('offset')}({var}, amount=-{same('thickness', thickness, writer.length(thickness))}, openings={faces})"
        shown = [("Thickness", thickness, units_word)]
        selected = None if fixed else {"argument": "openings", "items": [selections.topology["face"].describe(n) for n in numbers]}
        what = fixed.keeps if fixed else f"{counted(len(numbers), 'face')} open"
    elif command == "plane" and str(inputs.get("mode") or "") in ("mid", "normal"):
        # Plane's other references, as SolidWorks' Plane takes them: Mid Plane between two parallel
        # flat faces (kept midway as the part changes), or Normal to Curve at an edge's start or end.
        taken = _names_in(body.tree)
        target = kept.target if kept is not None else next(f"plane{n}" for n in itertools.count(1) if f"plane{n}" not in taken)
        plane_name = names("Plane")
        if inputs["mode"] == "mid":
            items = [item for item in selection if selector_ordinal(item.get("selector"))[0] == "face"]
            if not items and kept is not None and kept.parts.get("a"):
                a, b = kept.parts["a"], kept.parts["b"]  # Edit Feature, its faces kept
            else:
                if len(items) != 2:
                    raise CommandError("A Mid Plane goes between two parallel flat faces. Select two.")
                numbers = resolve(selections.topology["face"], items, scale)
                if len(set(numbers)) != 2 or any(selections.topology["face"].describe(n)["type"] != "plane" for n in numbers):
                    raise CommandError("A Mid Plane goes between two flat faces. Select two flat ones.")
                normals = [B.Plane(selections.topology["face"].item(n)).z_dir for n in numbers]
                if abs(abs(normals[0].dot(normals[1])) - 1) > 1e-6:
                    raise CommandError("A Mid Plane goes between parallel faces. These two are not parallel.")
                a, b = (selections.write("face", [n], one=True) for n in numbers)
            code = f"{target} = {plane_name}({a}).offset({plane_name}({a}).z_dir.dot({b}.center() - {a}.center()) / 2)"
            what = "midway between two faces"
        else:
            items = [item for item in selection if selector_ordinal(item.get("selector"))[0] == "edge"]
            if not items and kept is not None and kept.parts.get("edge"):
                edge = kept.parts["edge"]  # Edit Feature, its edge kept
            else:
                if len(items) != 1:
                    raise CommandError("A plane normal to a curve takes one edge. Select one.")
                edge = selections.write("edge", resolve(selections.topology["edge"], items, scale), one=True)
            end = 1 if str(inputs.get("end") or "") == "end" else 0
            # `.offset(0)`: a plane line is a reference plane by its offset, as the others are.
            code = f"{target} = {plane_name}(origin={edge}.position_at({end}), z_dir={edge}.tangent_at({end})).offset(0)"
            what = f"normal to an edge at its {'end' if end else 'start'}"
        shown = []
    elif command == "plane":
        # Plane, as SolidWorks' Reference Geometry offsets one: from an origin plane, or a flat face
        # of the body (out of the part as it is turned, into it flipped), named Plane1 in the tree.
        which = str(inputs.get("reference") or "").strip()
        if any(selector_ordinal(item.get("selector"))[0] == "face" for item in selection):
            numbers, face = chosen("face", one=True)
            if selections.topology["face"].describe(numbers[0])["type"] != "plane":
                raise CommandError("A plane is offset from a flat face. Select a flat one, or a plane in the design tree.")
            base, words = f"{names('Plane')}({face})", "a face"
        elif which in ORIGIN_PLANES:
            base, words = f"{names('Plane')}.{ORIGIN_PLANES[which]}", f"the {which} Plane"
        elif which.startswith("named:"):
            base = words = reference_plane(which)
        elif kept is not None and kept.parts.get("base"):
            base, words = kept.parts["base"], kept.keeps
        else:
            raise CommandError("Select a plane in the design tree, or a flat face on the model, to offset from.")
        distance = _value(inputs, "distance", "Offset distance", parse, positive=False, minimum=0)
        written = same("distance", distance, writer.length(distance))
        flip = inputs.get("flip") in (True, "true", "1", 1)
        taken = _names_in(body.tree)
        target = kept.target if kept is not None else next(f"plane{n}" for n in itertools.count(1) if f"plane{n}" not in taken)
        code = f"{target} = {base}.offset({'-' + _term(written) if flip and distance else written})"
        shown = [("Offset distance", distance, units_word)]
        what = f"{writer.number(distance)} {units_word} from {words}{', flipped' if flip else ''}".replace("  ", " ")
        # At angle, as SolidWorks' second reference turns a plane: about its own X or Y axis, through its origin.
        angle = _value(inputs, "angle", "Angle", parse, positive=False) if str(inputs.get("angle", "")).strip() else 0.0
        if not -180 < angle < 180:
            raise CommandError("A plane turns less than 180 degrees either way.")
        if angle:
            about = "y" if str(inputs.get("about") or "x").lower() == "y" else "x"
            turned = same("angle", angle, writer.number(angle))
            code += f".rotated(({turned}, 0, 0))" if about == "x" else f".rotated((0, {turned}, 0))"
            shown.append(("Angle", angle, "deg"))
            what += f", turned {writer.number(angle)} degrees about its {about.upper()} axis"
    elif command == "draft":
        # Draft, as SolidWorks' Neutral Plane draft: the faces tilt by the angle about where they
        # meet the neutral plane, so the part narrows the way the plane faces, its direction of pull.
        numbers, faces = ([], fixed.parts["faces"]) if fixed else chosen("face")
        if not fixed and any(selections.topology["face"].describe(n)["type"] not in DRAFTED for n in numbers):
            raise CommandError("Draft tilts flat, round and conical faces. Take the others out.")
        angle = _value(inputs, "angle", "Draft angle", parse)
        if angle >= 90:
            raise CommandError("A draft angle is less than 90 degrees.")
        which = str(inputs.get("neutral") or "").strip()
        if neutral is not None:
            plane_numbers = resolve(selections.topology["face"], [neutral], scale)
            if selections.topology["face"].describe(plane_numbers[0])["type"] != "plane":
                raise CommandError("The neutral plane is a flat face. Select a flat one, or a plane in the design tree.")
            if plane_numbers[0] in numbers:
                raise CommandError("The neutral plane cannot be a face it drafts. Select another.")
            plane = f"{names('Plane')}({selections.write('face', plane_numbers, one=True)})"
        elif which in ORIGIN_PLANES:
            plane = f"{names('Plane')}.{ORIGIN_PLANES[which]}"
        elif which.startswith("named:"):
            plane = reference_plane(which)
        elif kept is not None and kept.parts.get("neutral"):
            plane = kept.parts["neutral"]
        else:
            raise CommandError("Select the neutral plane: a flat face on the model, or a plane in the design tree.")
        if inputs.get("reverse") in (True, "true", "1", 1):
            plane = f"-{plane}"
        code = f"{var} = {names('draft')}({faces}, {plane}, {same('angle', angle, writer.number(angle))})"
        shown = [("Draft angle", angle, "deg")]
        selected = None if fixed else {"argument": "faces", "items": [selections.topology["face"].describe(n) for n in numbers]}
        what = fixed.keeps if fixed else counted(len(numbers), "face")
    elif command == "split":
        # Split, as SolidWorks splits a part into bodies: by an origin or reference plane, or a flat
        # face's plane; both sides kept as bodies of their own, or the side above or below it alone.
        faces = [item for item in selection if selector_ordinal(item.get("selector"))[0] == "face"]
        if faces:
            numbers, face = chosen("face", one=True)
            if selections.topology["face"].describe(numbers[0])["type"] != "plane":
                raise CommandError("A body is split by a flat face's plane. Select a flat one, or pick a plane.")
            plane_code, plane_words = f"{names('Plane')}({face})", "a face's plane"
        elif str(inputs.get("plane") or "").startswith("named:"):
            plane_code = plane_words = reference_plane(str(inputs["plane"]))
        else:
            plane = str(inputs.get("plane") or "YZ").upper()
            if plane not in PLANES:
                raise CommandError("Pick the plane to split the body with.")
            plane_code, plane_words = f"{names('Plane')}.{plane}", f"the {plane} plane"
        keep = {"both": "BOTH", "top": "TOP", "bottom": "BOTTOM"}.get(str(inputs.get("keep") or "both"))
        if keep is None:
            raise CommandError("Keep both bodies, or the one above or below the plane.")
        code = f"{var} = {names('split')}({var}, bisect_by={plane_code}, keep={names('Keep')}.{keep})"
        shown = []
        what = f"by {plane_words}, keeping {'both bodies' if keep == 'BOTH' else 'the side ' + ('above' if keep == 'TOP' else 'below')}"
    elif command == "delete_body":
        # Delete/Keep Body, as SolidWorks takes bodies out of a multibody part: the body a face is
        # picked on, by its place among the part's bodies; Keep keeps it alone instead.
        numbers, _face = chosen("face", one=True)
        face = selections.topology["face"].item(numbers[0])
        solids = list(picked_on.solids())
        if len(solids) < 2:
            raise CommandError("This part is one body. Delete/Keep Body works on a part of several, after a Split.")
        index = next((i for i, solid in enumerate(solids) if any(face.wrapped.IsSame(each.wrapped) for each in solid.faces())), None)
        if index is None:
            raise CommandError("Edit mode cannot tell which body that face is on. Pick another face of it.")
        # Which body: by its place along the axis the bodies are most spread along.
        centers = [solid.center() for solid in solids]
        axis = max(("X", "Y", "Z"), key=lambda a: max(getattr(c, a) for c in centers) - min(getattr(c, a) for c in centers))
        ordered = sorted(range(len(solids)), key=lambda i: getattr(centers[i], axis))
        if len({round(getattr(c, axis), 6) for c in centers}) < len(solids):
            raise CommandError("These bodies sit side by side in a way edit mode cannot name. Ask the agent to remove one.")
        place = ordered.index(index)
        source = picked_var or var
        body_code = f"{source}.solids().sort_by({names('Axis')}.{axis})[{place if place < len(solids) - 1 else -1}]"
        keeping = str(inputs.get("mode") or "delete") == "keep"
        code = (f"{var} = {names('Part')}() + {body_code}  # Keep Body" if keeping else f"{var} -= {body_code}  # Delete Body")
        shown = []
        what = f"{'kept' if keeping else 'deleted'} the body picked"
    elif command == "mirror":
        faces = [item for item in selection if selector_ordinal(item.get("selector"))[0] == "face"]
        if faces:
            numbers, face = chosen("face", one=True)
            if selections.topology["face"].describe(numbers[0])["type"] != "plane":
                raise CommandError("A mirror plane is a flat face. Select a flat one, or pick a plane.")
            plane_code, plane_words = f"{names('Plane')}({face})", "a face"
        elif str(inputs.get("plane") or "").startswith("named:"):
            # About a reference plane of the part, by its name.
            plane_code = plane_words = reference_plane(str(inputs["plane"]))
        else:
            plane = str(inputs.get("plane") or "YZ").upper()
            if kept and plane == "FACE" and kept.parts.get("plane"):
                plane_code, plane_words = kept.parts["plane"], "a face"
            elif plane not in PLANES:
                raise CommandError("Pick the plane to mirror about.")
            else:
                plane_code, plane_words = f"{names('Plane')}.{plane}", f"the {plane} plane"
        tool, sign, tool_edits = (kept.parts["tool"], kept.operator, []) if kept else _tool(body, var, spec.get("feature"), bar)
        for line, col, text in tool_edits:
            edits.put(line, col, text)
        code = f"{var} {sign} {names('mirror')}({tool}, about={plane_code})"
        shown = []
        what = f"about {plane_words}"
    elif command in ("revolve", "revolve_cut"):
        # A sketch turned about one of its lines, as Revolved Boss/Base and Revolved Cut turn one:
        # `sketch.axis(line)` is that line in the part; the angle runs from the sketch, the other
        # way when reversed. Its line goes after the sketch's lines and the body's.
        drawn = spec.get("sketch") or {}
        block = _sketch_block(drawn, body, bar, replacing, "revolve")
        axis = str(drawn.get("axis_code") or "")
        if not axis:
            raise CommandError("Pick the line to revolve about: a centerline of the sketch.")
        angle = _value(inputs, "angle", "Angle", parse)
        if angle > 360:
            raise CommandError("An angle is at most 360 degrees.")
        if inputs.get("reverse") in (True, "true", "1", 1):
            angle = -angle
        profile = kept.parts["profile"] if kept else f"{block.var}.face()" if int(drawn.get("regions") or 1) == 1 else f"{block.var}.faces()"
        sign = "+=" if command == "revolve" else "-="
        code = f"{var} {sign} {names('revolve')}({profile}, axis={block.var}.axis({axis}), revolution_arc={same('angle', angle, writer.number(angle))})"
        at = max(at, block.last_line)
        shown = [("Angle", abs(angle), "deg")]
        what = f"from {drawn.get('name') or 'the sketch'}, about {drawn.get('axis') or 'its centerline'}"
    elif command in ("extrude", "cut"):
        # A sketch made a solid of, as Extruded Boss/Base and Extruded Cut make one: from its
        # face, along its plane's normal (Reverse direction the other way), joined to the body or
        # cut from it. Its line goes after the sketch's lines and the body's.
        drawn = spec.get("sketch") or {}
        block = _sketch_block(drawn, body, bar, replacing, "extrude")
        end = str(inputs.get("end") or "blind").lower()
        through = command == "cut" and end == "through"
        # Up To Next: as far as the next face of the body along the sketch's normal (build123d's
        # `until`), no depth of its own. Up To Surface and Up To Vertex: as far as a face or a
        # vertex picked on the model, its distance from the sketch's plane (`depth_to`), so the
        # extrude follows it as the part changes.
        up_to_next = end == "next"
        up_to = end in ("surface", "vertex")
        depth = None if through or up_to_next or up_to else _value(inputs, "depth", "Depth", parse)
        # Mid Plane: half the depth each way (build123d's `both`), so Reverse does not apply.
        both = ", both=True" if end == "mid" else ""
        # Thin Feature, as SolidWorks' is: the outline as a wall of a thickness (inside it, outside
        # it, or astride it), made a solid of as the face would be.
        thin = inputs.get("thin") in (True, "true", "1", 1)
        if thin:
            wall = _value(inputs, "thin_thickness", "Thickness", parse)
            side = str(inputs.get("thin_side") or "inside").lower()
            if side not in ("inside", "outside", "mid"):
                raise CommandError("A thin feature's wall is inside, outside or astride the outline.")
            placed = "" if side == "inside" else f', side="{side}"'
            profile = f"{block.var}.thin({same('thin_thickness', wall, writer.length(wall))}{placed})"
        elif kept and not kept.values.get("thin"):
            profile = kept.parts["profile"]
        else:
            profile = f"{block.var}.face()" if int(drawn.get("regions") or 1) == 1 else f"{block.var}.faces()"
        sign = "+=" if command == "extrude" else "-="
        # Draft, as SolidWorks' Draft On/Off: the sides lean in by the angle (build123d's `taper`),
        # out with Draft outward. Not with Up To Next, whose length is the body's to say.
        drafted = inputs.get("draft") in (True, "true", "1", 1) and not up_to_next
        taper = ""
        if drafted:
            angle = _value(inputs, "draft_angle", "Draft angle", parse)
            if angle >= 90:
                raise CommandError("A draft angle is less than 90 degrees.")
            outward = inputs.get("outward") in (True, "true", "1", 1)
            taper = f", taper={'-' if outward else ''}{same('taper', angle, writer.number(angle))}"
        if up_to_next:
            code = f"{var} {sign} {names('extrude')}({profile}, until={names('Until')}.NEXT, target={var})"
        elif up_to:
            ending = _extrude_target(end, selection, selections, scale, inputs, kept)
            code = f"{var} {sign} {names('extrude')}({profile}, amount={block.var}.depth_to({ending}){taper})"
        else:
            amount = f"{var}.bounding_box().diagonal" if through else writer.length(depth / 2 if both else depth)
            reverse = inputs.get("reverse") in (True, "true", "1", 1) and not both
            if reverse:
                amount = f"-{amount}"
            if not through:
                amount = same("amount", (-1 if reverse else 1) * (depth / 2 if both else depth), amount)
            code = f"{var} {sign} {names('extrude')}({profile}, amount={amount}{both}{taper})"
        # Direction 2, as SolidWorks' extrude goes both ways from its sketch: a second extrude of
        # the same profile the other way, added to the first, Blind (or Through All for a cut), its
        # own draft. Not at Mid Plane, nor where a pick ends Direction 1, whose way the pick says.
        second = inputs.get("direction2") in (True, "true", "1", 1)
        if second and end == "mid":
            raise CommandError("Direction 2 goes with every end but Mid Plane, which goes both ways already.")
        if second:
            end2 = str(inputs.get("end2") or "blind").lower()
            if end2 not in ("blind", "through") or (end2 == "through" and command != "cut"):
                raise CommandError("Direction 2 goes Blind, or Through All for a cut.")
            # The other way from Direction 1: down the normal, up it when Direction 1 is reversed, or,
            # Up To a face or a vertex, the side of the plane it does not end on.
            if up_to:
                side = _target_side(end, selection, selections, scale, inputs, drawn.get("frame"))
                if side is None and kept is not None:
                    side = -1.0 if kept.parts.get("toward") == "-" else 1.0
                if side is None:
                    raise CommandError("Pick what Direction 1 ends on, so Direction 2 can go the other way.")
                back = "" if side < 0 else "-"
            else:
                back = "" if inputs.get("reverse") in (True, "true", "1", 1) and not up_to_next else "-"
            if end2 == "through":
                amount2 = f"{back}{var}.bounding_box().diagonal"
            else:
                depth2 = _value(inputs, "depth2", "Depth 2", parse)
                amount2 = same("amount2", (-1 if back else 1) * depth2, f"{back}{writer.length(depth2)}")
            taper2 = ""
            drafted2 = inputs.get("draft2") in (True, "true", "1", 1)
            if drafted2:
                angle2 = _value(inputs, "draft_angle2", "Draft angle 2", parse)
                if angle2 >= 90:
                    raise CommandError("A draft angle is less than 90 degrees.")
                outward2 = inputs.get("outward2") in (True, "true", "1", 1)
                taper2 = f", taper={'-' if outward2 else ''}{same('taper2', angle2, writer.number(angle2))}"
            first = code.split(f" {sign} ", 1)[1]
            code = f"{var} {sign} {first} + {names('extrude')}({profile}, amount={amount2}{taper2})"
        at = max(at, block.last_line)
        shown = [] if through or up_to_next or up_to else [("Depth", depth, units_word)]
        if drafted:
            shown.append(("Draft", angle, "deg"))
        if second and end2 == "blind":
            shown.append(("Depth 2", depth2, units_word))
        what = f"from {drawn.get('name') or 'the sketch'}" + (", through all" if through else ", up to next" if up_to_next
                                                              else ", up to a vertex" if end == "vertex" else ", up to a face" if end == "surface"
                                                              else ", mid plane" if end == "mid" else "")
        if drafted:
            what += f", drafted {'out' if outward else 'in'} {_number(angle, False)} degrees"
        if second:
            what += ", through all the other way" if end2 == "through" else ", and the other way"
        if thin:
            shown.append(("Thickness", wall, units_word))
            what += {"inside": ", a wall inside it", "outside": ", a wall outside it", "mid": ", a wall astride it"}[side]
    elif command in ("sweep", "sweep_cut"):
        # A profile run along a path, as Swept Boss/Base and Swept Cut run one: the profile
        # sketch's region along the path sketch's curves, mitred at a corner (build123d's
        # `transition`), joined to the body or cut from it.
        drawn = [each for each in spec.get("sketches") or [] if isinstance(each, dict)]
        if kept:
            profile, along, words = kept.parts["profile"], kept.parts["path"], kept.keeps
            blocks = []
        else:
            if len(drawn) != 2:
                raise CommandError("Pick the profile sketch, then the path sketch.")
            blocks = [_sketch_block(each, body, bar, replacing, "sweep") for each in drawn]
            profile = _one_region(drawn[0], blocks[0], "a sweep's profile")
            along = f"{blocks[1].var}.path()"
            words = f"{drawn[0].get('name') or 'the profile'} along {drawn[1].get('name') or 'the path'}"
        sign = "+=" if command == "sweep" else "-="
        code = f"{var} {sign} {names('sweep')}({profile}, path={along}, transition={names('Transition')}.RIGHT)"
        at = max([at, *(block.last_line for block in blocks)])
        shown = []
        what = words
    elif command in ("loft", "loft_cut"):
        # Profiles joined into a solid, as Lofted Boss/Base and Lofted Cut join them: each
        # sketch's region in the order picked.
        drawn = [each for each in spec.get("sketches") or [] if isinstance(each, dict)]
        if kept:
            sections, words, blocks = kept.parts["sections"], kept.keeps, []
        else:
            if len(drawn) < 2:
                raise CommandError("Pick two or more profile sketches, in the order the loft goes through them.")
            blocks = [_sketch_block(each, body, bar, replacing, "loft") for each in drawn]
            sections = "[" + ", ".join(_one_region(each, block, "each of a loft's profiles") for each, block in zip(drawn, blocks)) + "]"
            words = "through " + ", ".join(each.get("name") or "a sketch" for each in drawn)
        sign = "+=" if command == "loft" else "-="
        code = f"{var} {sign} {names('loft')}({sections})"
        at = max([at, *(block.last_line for block in blocks)])
        shown = []
        what = words
    elif command == "rib":
        # A rib, as SolidWorks' Rib makes one parallel to its sketch: the sketch's lines
        # thickened across its plane and grown in it until they meet the body (`sketch.rib`),
        # the other way with Flip material side.
        drawn = spec.get("sketch") or {}
        block = _sketch_block(drawn, body, bar, replacing, "rib")
        wall = _value(inputs, "thickness", "Thickness", parse)
        flip = ", flip=True" if inputs.get("flip") in (True, "true", "1", 1) else ""
        code = f"{var} += {block.var}.rib({same('thickness', wall, writer.length(wall))}, {var}{flip})"
        at = max(at, block.last_line)
        shown = [("Thickness", wall, units_word)]
        what = f"from {drawn.get('name') or 'the sketch'}"
    else:  # pattern
        kind = str(inputs.get("type") or "linear").lower()
        count = _value(inputs, "count", "Instances", parse, integer=True, minimum=2)
        counted_code = same("count", count, str(count))
        align = names("Align")
        tool, sign, tool_edits = (kept.parts["tool"], kept.operator, []) if kept else _tool(body, var, spec.get("feature"), bar)
        for line, col, text in tool_edits:
            edits.put(line, col, text)
        if kind == "circular":
            # About a round face's axis or a straight edge picked on the model, as SolidWorks'
            # Circular Pattern takes its axis; else the Z axis through the origin.
            axis = _pattern_axis(selection, selections, scale, names)
            if axis is None and kept and kept.parts.get("axis"):
                axis = (kept.parts["axis"], _axis_words(kept.parts["axis"]))
            if axis is not None:
                code = f"{var} {sign} [{tool}.rotate({axis[0]}, i * 360 / {counted_code}) for i in range(1, {counted_code})]"
                records = ("join", "cut")
                what = f"{count} around {axis[1]}"
            else:
                code = f"{var} {sign} [loc * {tool} for loc in {names('PolarLocations')}(0, {counted_code}).locations[1:]]"
                what = f"{count} around the Z axis"
            shown = [("Instances", count, "")]
        elif kind == "linear":
            spacing = _value(inputs, "spacing", "Spacing", parse, positive=False)
            if spacing == 0:
                raise CommandError("Spacing needs to be more or less than 0.")
            direction = str(inputs.get("direction") or "X").upper()
            spaced = same("spacing", spacing, writer.length(spacing))
            if direction == "X":
                locations = f"{names('GridLocations')}({spaced}, 0, {counted_code}, 1, align=({align}.MIN, {align}.CENTER))"
            elif direction == "Y":
                locations = f"{names('GridLocations')}(0, {spaced}, 1, {counted_code}, align=({align}.CENTER, {align}.MIN))"
            elif direction != "Z":
                raise CommandError("A linear pattern runs along X, Y or Z.")
            if direction == "Z":
                # GridLocations lays copies out on a plane; up Z each copy is placed by its own Pos.
                code = f"{var} {sign} [{names('Pos')}(0, 0, {_term(spaced)} * i) * {tool} for i in range(1, {counted_code})]"
                records = ("move",)
            else:
                code = f"{var} {sign} [loc * {tool} for loc in {locations}.locations[1:]]"
            shown = [("Spacing", spacing, units_word), ("Instances", count, "")]
            what = f"{count} along {direction}"
        else:
            raise CommandError("A pattern is linear or circular.")

    if old is not None:
        source = body.lines[old.lineno - 1]
        # A name the feature was given in the design tree stays with its line; a hole's callout is
        # written afresh, or goes with its size.
        named = trailing_comment(body.text, old)
        if named and "  # " not in code and not _SIZED.match(named):
            code = f"{code}  # {named}"
        edits.swap(old.lineno, old.end_lineno, [f"{source[:len(source) - len(source.lstrip())]}{code}"])
        added_lines = _imports(edits, body, module, named_import, names)
        new = edits.apply()
        line = old.lineno + added_lines
    else:
        edits.after(at, [f"{body.indent}{code}", *returned])
        added_lines = _imports(edits, body, module, named_import, names)
        new = edits.apply()
        line = at + 1 + added_lines
    return Plan(command=command, path=body.path, rel=body.rel, old=body.text, new=new, line=line, code=code,
                records=records, selected=selected,
                summary={"feature": FEATURE_WORDS[command], "what": what,
                         "inputs": [{"label": label, "display": writer.number(value) if isinstance(value, float) else str(value),
                                     "unit": unit} for label, value, unit in shown]})


def _target_side(end: str, selection: list[dict], selections: Selections, scale: float, inputs: dict, frame: dict | None) -> float | None:
    """Which side of the sketch's plane (``frame``) what an extrude Up To ends on lies: its distance
    along the plane's normal, negative behind it; None where it cannot be told (nothing picked)."""
    kind = "face" if end == "surface" else "edge"
    items = [item for item in selection if selector_ordinal(item.get("selector"))[0] == kind]
    if not items or not frame:
        return None
    number = resolve(selections.topology[kind], items[-1:], scale)[0]
    if end == "surface":
        place = selections.topology["face"].item(number).center()
    else:
        try:
            click = B.Vector(*(float(value) for value in inputs.get("vertex_at")))
        except (TypeError, ValueError):
            return None
        edge = selections.topology["edge"].item(number)
        place = edge.start_point() if (edge.start_point() - click).length <= (edge.end_point() - click).length else edge.end_point()
    origin, normal = B.Vector(*frame["origin"]), B.Vector(*frame["z"])
    return float((place - origin).dot(normal))


def _extrude_target(end: str, selection: list[dict], selections: Selections, scale: float, inputs: dict, kept: Feature | None) -> str:
    """What an extrude ends on, as SolidWorks' Up To Surface and Up To Vertex end one: a flat face
    picked on the model, or the end of a picked edge nearest where it was clicked (``vertex_at``,
    the click in the part's millimetres), as code on the body. Edit Feature keeps its own when none
    is picked."""
    kind = "face" if end == "surface" else "edge"
    items = [item for item in selection if selector_ordinal(item.get("selector"))[0] == kind]
    if not items:
        if kept is not None and kept.parts.get("target") and kept.values.get("end") == end:
            return kept.parts["target"]
        raise CommandError("Select a flat face on the model for the extrude to end on." if end == "surface"
                           else "Click near the end of an edge on the model: the vertex there ends the extrude.")
    number = resolve(selections.topology[kind], items[-1:], scale)[0]
    if end == "surface":
        if selections.topology["face"].describe(number)["type"] != "plane":
            raise CommandError("Up To Surface ends on a flat face. Select a flat one, or use Up To Next.")
        return selections.write("face", [number], one=True)
    try:
        click = B.Vector(*(float(value) for value in inputs.get("vertex_at")))
    except (TypeError, ValueError):
        raise CommandError("Click near the end of an edge on the model: the vertex there ends the extrude.") from None
    edge = selections.topology["edge"].item(number)
    role = "start_point" if (edge.start_point() - click).length <= (edge.end_point() - click).length else "end_point"
    return f"{selections.write('edge', [number], one=True)}.{role}()"


def _pattern_axis(selection: list[dict], selections: Selections, scale: float, names: Names):
    """The axis a circular pattern turns about, from what is picked on the model, as SolidWorks'
    Circular Pattern takes one: a round face's (``.axis_of_rotation``) or a straight edge
    (``Axis(edge)``), as code with its words; None with nothing picked."""
    items = [item for item in selection if selector_ordinal(item.get("selector"))[0] in ("face", "edge")]
    if not items:
        return None
    if len(items) > 1:
        raise CommandError("Pick one round face or one straight edge for the axis.")
    kind = selector_ordinal(items[0].get("selector"))[0]
    number = resolve(selections.topology[kind], items, scale)[0]
    shape_type = selections.topology[kind].describe(number)["type"]
    if kind == "face" and shape_type in ("cylinder", "cone"):
        code = f"{selections.write('face', [number], one=True)}.axis_of_rotation"
    elif kind == "edge" and shape_type == "line":
        code = f"{names('Axis')}({selections.write('edge', [number], one=True)})"
    else:
        raise CommandError("A circular pattern turns about a round face's axis or a straight edge. Pick one of those.")
    return code, _axis_words(code)


def _term(code: str) -> str:
    """Code to multiply by, in brackets where its terms would split: a sum, a difference."""
    try:
        node = ast.parse(code, mode="eval").body
    except SyntaxError:
        return f"({code})"
    split = (isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub))) or isinstance(node, (ast.IfExp, ast.BoolOp, ast.Compare))
    return f"({code})" if split else code


def _axis_words(code: str) -> str:
    """A pattern's axis, as its line writes it, in words."""
    return "a round face's axis" if code.endswith(".axis_of_rotation") else "a straight edge"


def _imports(edits: Edits, body: Body, module: str | None, named_import: ast.ImportFrom | None, names: Names) -> int:
    """Brings the names a line uses into the file: added to its ``from build123d import ...``,
    or, in a file that does not import build123d, a line that does. Returns the lines added
    above the command's line."""
    if module is None:
        last = max((node.end_lineno for node in body.tree.body if isinstance(node, (ast.Import, ast.ImportFrom))), default=0)
        edits.after(last, ["from cadgen import build123d as bd"])
        return 1
    if module or named_import is None:
        return 0
    have = {alias.asname or alias.name for alias in named_import.names}
    missing = sorted(name for name in names.needed if name not in have)
    if missing:
        last = named_import.names[-1]
        edits.put(last.end_lineno, last.end_col_offset, "".join(f", {name}" for name in missing))
    return 0


def offset_axes(normal) -> tuple[str, ...]:
    """The axes a hole moves along on a face: the two that lie in its plane, when its normal is
    along the third (a hole on a top face moves in X and Y); all three on a slanted face, whose
    plane the hole's place is then kept on."""
    for axis, others in (("Z", ("X", "Y")), ("X", ("Y", "Z")), ("Y", ("X", "Z"))):
        if abs(abs(getattr(normal, axis)) - 1.0) < 1e-9:
            return others
    return ("X", "Y", "Z")


def failure_words(command: str, error: str) -> str:
    """Why a command's line did not run, in words."""
    feature = FEATURE_WORDS.get(command, "change").lower()
    last = error.strip().splitlines()[-1] if error.strip() else ""
    # A sketch's own refusal is said in the engineer's words already (`depth_to`'s, a sketch's).
    said = re.match(r"^(?:[\w.]+\.)?SketchError: (.+)$", last)
    if said:
        return said.group(1)
    if command in ("fillet", "chamfer", "shell") and re.search(r"StdFail|NotDone|BRep_API|failed|Fillet|Chamfer|offset", error, re.I):
        size = {"fillet": "radius", "chamfer": "distance", "shell": "thickness"}[command]
        return f"The {feature} could not be made with that {size} on that selection. Try a smaller {size}."
    return f"The {feature} could not be made: {last or 'the script stopped'}"


# ---------------------------------------------------------------------------------------------
# Edit Feature: a command's line read back into its PropertyManager's values, and written again
# in its place (``plan`` with ``replace``). What the line acts on stays as it is written: its
# edges, faces, the feature it copies, its sketch.


@dataclass
class Feature:
    """A command's line as Edit Feature reads it: the command, the values its panel opens with
    (in the part's units, as the panel types them), what it keeps (said in words), the code of
    what it keeps, and the name and operator it assigns with."""

    command: str
    values: dict
    keeps: str
    parts: dict
    target: str
    operator: str
    # Each number of the line as it is written (a named size, a formula) with its value in the
    # panel's units: a value the engineer leaves as it was is written as it was.
    codes: dict = field(default_factory=dict)


def _tight(node, text: str) -> str:
    """A number's code to put a minus before: as written when it is one term, else in brackets."""
    written = ast.get_source_segment(text, node) or ""
    one_term = isinstance(node, (ast.Name, ast.Constant, ast.Attribute, ast.Call, ast.Subscript)) or (
        isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Mult, ast.Div)))
    return written if one_term else f"({written})"


def _call_name(node) -> str | None:
    """The name a call is made by: ``fillet`` for ``bd.fillet(...)`` and for ``fillet(...)``."""
    if not isinstance(node, ast.Call):
        return None
    return node.func.attr if isinstance(node.func, ast.Attribute) else node.func.id if isinstance(node.func, ast.Name) else None


def _keyword_value(call: ast.Call, name: str):
    return next((each.value for each in call.keywords if each.arg == name), None)


def _through_all(node) -> bool:
    """Whether a depth is written as Through All: ``part.bounding_box().diagonal``, either way."""
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        node = node.operand
    return isinstance(node, ast.Attribute) and node.attr == "diagonal" and _call_name(node.value) == "bounding_box"


def _sketch_of(profile, made=("face", "faces", "thin")) -> str | None:
    """The sketch a profile is taken from, by its name: ``sketch2`` of ``sketch2.face()`` (or of
    its thin wall, ``sketch2.thin(...)``; of its path, ``sketch2.path()``, with ``made``)."""
    if (isinstance(profile, ast.Call) and isinstance(profile.func, ast.Attribute) and profile.func.attr in made
            and isinstance(profile.func.value, ast.Name)):
        return profile.func.value.id
    return None


def read_feature(statement: ast.stmt, text: str, numbers: dict, units: str) -> Feature | None:
    """``statement`` read as the command that writes such a line, or None for a line no command
    writes (the agent's own build123d). ``numbers`` are what the trace recorded for the line's
    operations: ``(operation, argument)`` to a size in millimetres, an angle in degrees, or a count."""
    if isinstance(statement, ast.AugAssign) and isinstance(statement.target, ast.Name) and isinstance(statement.op, (ast.Add, ast.Sub)):
        target, operator, value = statement.target.id, "+=" if isinstance(statement.op, ast.Add) else "-=", statement.value
    elif isinstance(statement, ast.Assign) and len(statement.targets) == 1 and isinstance(statement.targets[0], ast.Name):
        target, operator, value = statement.targets[0].id, "=", statement.value
    else:
        return None
    code = lambda node: ast.get_source_segment(text, node) or ""  # noqa: E731
    typed = lambda mm: None if mm is None else (mm / 25.4) if units == "in" else mm  # noqa: E731
    size = lambda mm: "" if mm is None else _number(typed(mm), False)  # noqa: E731
    number = lambda key: numbers.get(key)  # noqa: E731
    name = _call_name(value)
    codes: dict = {}

    def held(role, node, amount, written=None):
        # ``amount`` in the panel's units (a size already converted, a count or an angle as is).
        if node is not None and amount is not None:
            codes[role] = (written if written is not None else code(node), float(amount))

    def counted_items(key, kind):
        count = number(key)
        return counted(int(count), kind) if isinstance(count, (int, float)) else f"its {_KIND_WORDS[kind][1]}"

    if operator == "=" and name == "fillet" and value.args:
        held("radius", _keyword_value(value, "radius"), typed(number(("fillet", "radius"))))
        return Feature("fillet", {"radius": size(number(("fillet", "radius")))}, counted_items(("fillet", "objects"), "edge"),
                       {"edges": code(value.args[0])}, target, operator, codes)
    if operator == "=" and name == "chamfer" and value.args:
        # Angle distance, flipped: `length=<distance> * tan(radians(<angle>)), length2=<distance>`.
        written, other = _keyword_value(value, "length"), _keyword_value(value, "length2")
        if (other is not None and isinstance(written, ast.BinOp) and isinstance(written.op, ast.Mult) and _call_name(written.right) == "tan"
                and written.right.args and _call_name(written.right.args[0]) == "radians" and written.right.args[0].args
                and code(written.left) == code(other) and None not in (number(("chamfer", "length")), number(("chamfer", "length2")))):
            along = number(("chamfer", "length2"))
            angle = round(math.degrees(math.atan2(number(("chamfer", "length")), along)), 6)
            held("distance", other, typed(along))
            held("angle", written.right.args[0].args[0], angle)
            return Feature("chamfer", {"distance": size(along), "type": "angle", "angle": _number(angle, False), "flip": True},
                           counted_items(("chamfer", "objects"), "edge"), {"edges": code(value.args[0])}, target, operator, codes)
        held("distance", _keyword_value(value, "length"), typed(number(("chamfer", "length"))))
        values = {"distance": size(number(("chamfer", "length")))}
        # A distance each way, or a distance and an angle: Chamfer's other types.
        if _keyword_value(value, "length2") is not None and number(("chamfer", "length2")) is not None:
            held("distance2", _keyword_value(value, "length2"), typed(number(("chamfer", "length2"))))
            values.update(type="distances", distance2=size(number(("chamfer", "length2"))))
        elif _keyword_value(value, "angle") is not None and number(("chamfer", "angle")) is not None:
            held("angle", _keyword_value(value, "angle"), number(("chamfer", "angle")))
            values.update(type="angle", angle=_number(number(("chamfer", "angle")), False))
        return Feature("chamfer", values, counted_items(("chamfer", "objects"), "edge"),
                       {"edges": code(value.args[0])}, target, operator, codes)
    if operator == "=" and name == "offset" and _keyword_value(value, "openings") is not None:
        amount = number(("offset", "amount"))
        written = _keyword_value(value, "amount")
        if isinstance(written, ast.UnaryOp) and isinstance(written.op, ast.USub) and amount is not None:
            held("thickness", written.operand, typed(-amount), _tight(written.operand, text))
        return Feature("shell", {"thickness": size(-amount if amount is not None else None)}, f"{counted_items(('offset', 'openings'), 'face')} open",
                       {"openings": code(_keyword_value(value, "openings"))}, target, operator, codes)
    # Hole Wizard's Positions: the same hole at each place listed, `[Pos(*at) * Plane(<face>) * <hole> for at in (...)]`.
    places = None
    if (operator == "-=" and isinstance(value, ast.ListComp) and isinstance(value.elt, ast.BinOp) and len(value.generators) == 1
            and isinstance(value.generators[0].iter, ast.Tuple) and value.generators[0].iter.elts
            and all(isinstance(each, ast.Tuple) for each in value.generators[0].iter.elts)):
        places, value = value.generators[0].iter.elts, value.elt
    if operator == "-=" and isinstance(value, ast.BinOp):
        calls = [node for node in ast.walk(value) if isinstance(node, ast.Call)]
        cylinder = next((node for node in calls if _call_name(node) == "Cylinder" and len(node.args) >= 2), None)
        plane = next((node for node in calls if _call_name(node) == "Plane" and node.args), None)
        if cylinder is not None and plane is not None:
            through = _through_all(cylinder.args[1])
            radius = number(("Cylinder", "radius"))
            values = {"diameter": size(2 * radius if radius is not None else None), "through": through,
                      "depth": size(number(("Cylinder", "height"))) if not through and number(("Cylinder", "height")) is not None else ""}
            held("diameter", cylinder.args[0], typed(2 * radius) if radius is not None else None)
            if not through:
                held("depth", cylinder.args[1], typed(number(("Cylinder", "height"))))
            # Hole Wizard's types: a second cylinder at the face is a counterbore, a cone a countersink.
            cylinders = [node for node in calls if _call_name(node) == "Cylinder" and len(node.args) >= 2]
            cone = next((node for node in calls if _call_name(node) == "Cone" and len(node.args) >= 3), None)
            values["type"] = "simple"
            if len(cylinders) >= 2 and number(("Cylinder", "radius", 2)) is not None:
                bore, bore_depth = 2 * number(("Cylinder", "radius", 2)), number(("Cylinder", "height", 2))
                values.update(type="counterbore", cbore_diameter=size(bore), cbore_depth=size(bore_depth))
                held("cbore_diameter", cylinders[1].args[0], typed(bore))
                held("cbore_depth", cylinders[1].args[1], typed(bore_depth))
            elif cone is not None and None not in (number(("Cone", "top_radius")), number(("Cone", "bottom_radius")), number(("Cone", "height"))):
                top, bottom, rise = number(("Cone", "top_radius")), number(("Cone", "bottom_radius")), number(("Cone", "height"))
                angle = 2 * math.degrees(math.atan2(top - bottom, rise))
                values.update(type="countersink", csk_diameter=size(2 * top), csk_angle=_number(round(angle, 2), False))
                held("csk_diameter", cone.args[1], typed(2 * top))
            moved = next((node for node in calls if _call_name(node) == "Pos"), None)
            for index, axis in enumerate(("x", "y", "z")):
                given = (places[0].elts if places else moved.args if moved is not None else [])
                if number(("move", axis)) is not None and index < len(given):
                    values[axis] = size(number(("move", axis)))
                    held(axis, given[index], typed(number(("move", axis))))
            if places:
                values["more"] = [{axis: size(number(("move", axis, nth))) for axis, _ in zip(("x", "y", "z"), place.elts)
                                   if number(("move", axis, nth)) is not None} for nth, place in enumerate(places[1:], 2)]
            # A sized hole's callout, kept in a comment beside its line; a tapped hole is drilled as a plain one.
            comment = trailing_comment(text, statement)
            if _SIZED.match(comment):
                values["callout"] = comment
                if values["callout"].endswith("tapped hole") and values["type"] == "simple":
                    values["type"] = "tapped"
            return Feature("hole", values, f"{len(places)} holes on 1 face" if places else "1 face", {"face": code(plane.args[0])},
                           target, operator, codes)
    if operator == "=" and name == "draft" and len(value.args) + len(value.keywords) >= 3:
        drafted = value.args[0] if value.args else _keyword_value(value, "faces")
        plane = value.args[1] if len(value.args) > 1 else _keyword_value(value, "neutral_plane")
        written = value.args[2] if len(value.args) > 2 else _keyword_value(value, "angle")
        if drafted is None or plane is None or written is None:
            return None
        # The neutral plane: an origin plane (`Plane.XY`), or a face's (`Plane(<face>)`); a minus before it turns the pull.
        reverse = isinstance(plane, ast.UnaryOp) and isinstance(plane.op, ast.USub)
        inner = plane.operand if reverse else plane
        origin = {value: key for key, value in ORIGIN_PLANES.items()}
        neutral = (origin.get(inner.attr) if isinstance(inner, ast.Attribute) else "face" if _call_name(inner) == "Plane"
                   else f"named:{inner.id}" if isinstance(inner, ast.Name) else None)
        if neutral is None:
            return None
        angle = number(("draft", "angle"))
        held("angle", written, angle)
        return Feature("draft", {"angle": _number(angle, False) if angle is not None else "", "neutral": neutral, "reverse": reverse},
                       counted_items(("draft", "faces"), "face"), {"faces": code(drafted), "neutral": code(inner)}, target, operator, codes)
    # At angle: the offset plane turned about its own X or Y axis, `.rotated((30, 0, 0))`.
    turn = None
    if (operator == "=" and name == "rotated" and isinstance(value.func, ast.Attribute) and len(value.args) == 1
            and isinstance(value.args[0], ast.Tuple) and len(value.args[0].elts) == 3 and _call_name(value.func.value) == "offset"):
        turn, value, name = value.args[0], value.func.value, "offset"
    if (operator == "=" and name == "offset" and isinstance(value.func, ast.Attribute) and len(value.args) == 1 and not value.keywords
            and _call_name(value.func.value) == "Plane"):
        base = value.func.value
        origin, z_dir = _keyword_value(base, "origin"), _keyword_value(base, "z_dir")
        # Normal to Curve: `Plane(origin=<edge>.position_at(0), z_dir=<edge>.tangent_at(0)).offset(0)`.
        if (isinstance(origin, ast.Call) and _call_name(origin) == "position_at" and isinstance(origin.func, ast.Attribute)
                and z_dir is not None and not base.args):
            at_end = bool(origin.args) and isinstance(origin.args[0], ast.Constant) and origin.args[0].value == 1
            return Feature("plane", {"mode": "normal", "end": "end" if at_end else "start"}, "an edge",
                           {"edge": code(origin.func.value)}, target, operator, codes)
        # Mid Plane: `Plane(a).offset(Plane(a).z_dir.dot(b.center() - a.center()) / 2)`.
        half = value.args[0]
        if (base.args and isinstance(half, ast.BinOp) and isinstance(half.op, ast.Div) and isinstance(half.left, ast.Call)
                and _call_name(half.left) == "dot" and half.left.args and isinstance(half.left.args[0], ast.BinOp)):
            between = half.left.args[0]
            far = between.left.func.value if isinstance(between.left, ast.Call) and isinstance(between.left.func, ast.Attribute) else None
            if far is not None:
                return Feature("plane", {"mode": "mid"}, "two faces", {"a": code(base.args[0]), "b": code(far)}, target, operator, codes)
    if (operator == "=" and name == "offset" and isinstance(value.func, ast.Attribute) and len(value.args) == 1 and not value.keywords):
        # A reference plane, `plane1 = Plane.XY.offset(10)`: from an origin plane, or a face's.
        base = value.func.value
        origin = {axes: plane for plane, axes in ORIGIN_PLANES.items()}
        reference = (origin.get(base.attr) if isinstance(base, ast.Attribute) else "face" if _call_name(base) == "Plane" and base.args
                     else f"named:{base.id}" if isinstance(base, ast.Name) else None)
        if reference is None:
            return None
        amount = number(("plane", "amount"))
        written = value.args[0]
        flip = isinstance(written, ast.UnaryOp) and isinstance(written.op, ast.USub)
        held("distance", written.operand if flip else written, typed(abs(amount)) if amount is not None else None,
             _tight(written.operand, text) if flip else None)
        values = {"reference": reference, "distance": size(abs(amount)) if amount is not None else "", "flip": flip}
        if turn is not None:
            about = "y" if number(("plane", "y_angle")) else "x"
            angle = number(("plane", f"{about}_angle"))
            if angle is not None:
                values.update(angle=_number(angle, False), about=about)
                held("angle", turn.elts[0 if about == "x" else 1], angle)
        return Feature("plane", values,
                       "a face" if reference == "face" else reference.partition(":")[2] if reference.startswith("named:") else f"the {reference} Plane",
                       {"base": code(base)}, target, operator, codes)
    if operator in ("+=", "-=") and name == "mirror" and value.args:
        about = _keyword_value(value, "about")
        plane = (about.attr if isinstance(about, ast.Attribute) and about.attr in PLANES
                 else f"named:{about.id}" if isinstance(about, ast.Name) else "face")
        tool = code(value.args[0])
        return Feature("mirror", {"plane": plane}, "Whole body" if tool == target else tool,
                       {"tool": tool, "plane": code(about) if about is not None else ""}, target, operator)
    if operator in ("+=", "-=") and isinstance(value, ast.ListComp) and value.generators and _call_name(value.generators[0].iter) == "range":
        # Copies made one by one (`for i in range(1, 6)`): up Z by a Pos each, or turned about an
        # axis picked on the model. The copies are counted from what the body was given.
        last = value.generators[0].iter.args[-1] if value.generators[0].iter.args else None
        copies = number(("join" if operator == "+=" else "cut", "other"))
        count = int(copies) + 1 if copies is not None else None
        elt = value.elt
        if isinstance(elt, ast.Call) and isinstance(elt.func, ast.Attribute) and elt.func.attr == "rotate" and len(elt.args) == 2:
            tool, axis = code(elt.func.value), code(elt.args[0])
            held("count", last, count)
            return Feature("pattern", {"type": "circular", "count": str(count or 0), "axis": _axis_words(axis)},
                           "Whole body" if tool == target else tool, {"tool": tool, "axis": axis}, target, operator, codes)
        if isinstance(elt, ast.BinOp) and isinstance(elt.op, ast.Mult) and _call_name(elt.left) == "Pos" and len(elt.left.args) == 3:
            spacing = number(("move", "z")) or 0.0
            tool, step = code(elt.right), elt.left.args[2]
            # `Pos(0, 0, <spacing> * i)`: the spacing, the first copy's place.
            if isinstance(step, ast.BinOp) and isinstance(step.op, ast.Mult):
                held("spacing", step.left, typed(spacing))
            held("count", last, count)
            return Feature("pattern", {"type": "linear", "direction": "Z", "spacing": size(abs(spacing)), "reverse": spacing < 0,
                                       "count": str(count or 0)}, "Whole body" if tool == target else tool, {"tool": tool}, target, operator, codes)
        return None
    if operator in ("+=", "-=") and isinstance(value, ast.ListComp) and isinstance(value.elt, ast.BinOp):
        iterated = value.generators[0].iter if value.generators else None
        made = iterated.value.value if isinstance(iterated, ast.Subscript) and isinstance(iterated.value, ast.Attribute) else None
        tool = code(value.elt.right)
        if _call_name(made) == "PolarLocations":
            values = {"type": "circular", "count": str(int(number(("PolarLocations", "count")) or 0))}
            held("count", made.args[1] if len(made.args) > 1 else None, number(("PolarLocations", "count")))
        elif _call_name(made) == "GridLocations":
            along_y = number(("GridLocations", "y_count")) not in (None, 1)
            spacing = number(("GridLocations", "y_spacing" if along_y else "x_spacing")) or 0.0
            values = {"type": "linear", "direction": "Y" if along_y else "X", "spacing": size(abs(spacing)), "reverse": spacing < 0,
                      "count": str(int(number(("GridLocations", "y_count" if along_y else "x_count")) or 0))}
            if len(made.args) >= 4:
                held("spacing", made.args[1 if along_y else 0], typed(spacing))
                held("count", made.args[3 if along_y else 2], number(("GridLocations", "y_count" if along_y else "x_count")))
        else:
            return None
        return Feature("pattern", values, "Whole body" if tool == target else tool, {"tool": tool}, target, operator, codes)
    if operator in ("+=", "-=") and name == "sweep" and value.args:
        along = _keyword_value(value, "path")
        sketch, path = _sketch_of(value.args[0], ("face",)), _sketch_of(along, ("path",))
        if sketch and path:
            return Feature("sweep" if operator == "+=" else "sweep_cut", {}, f"{sketch} along {path}",
                           {"profile": code(value.args[0]), "path": code(along), "sketch": sketch, "sketches": [sketch, path]},
                           target, operator, codes)
    if operator in ("+=", "-=") and name == "loft" and value.args and isinstance(value.args[0], ast.List):
        named = [_sketch_of(each, ("face",)) for each in value.args[0].elts]
        if len(named) >= 2 and all(named):
            return Feature("loft" if operator == "+=" else "loft_cut", {}, "through " + ", ".join(named),
                           {"sections": code(value.args[0]), "sketch": named[0], "sketches": named}, target, operator, codes)
    if operator == "+=" and name == "rib" and value.args and isinstance(value.func, ast.Attribute) and isinstance(value.func.value, ast.Name):
        wall = number(("rib", "thickness"))
        held("thickness", value.args[0], typed(wall))
        flip = _keyword_value(value, "flip")
        return Feature("rib", {"thickness": size(wall), "flip": isinstance(flip, ast.Constant) and flip.value is True},
                       value.func.value.id, {"sketch": value.func.value.id}, target, operator, codes)
    # Direction 2: two extrudes of one profile added, the second the other way.
    second = None
    if (operator in ("+=", "-=") and isinstance(value, ast.BinOp) and isinstance(value.op, ast.Add)
            and _call_name(value.left) == "extrude" and _call_name(value.right) == "extrude" and value.left.args and value.right.args
            and code(value.left.args[0]) == code(value.right.args[0])):
        value, second, name = value.left, value.right, "extrude"
    if operator in ("+=", "-=") and name in ("extrude", "revolve") and value.args and _sketch_of(value.args[0]):
        profile, sketch = value.args[0], _sketch_of(value.args[0])
        if name == "extrude":
            amount = number(("extrude", "amount")) or 0.0
            both = isinstance(_keyword_value(value, "both"), ast.Constant) and _keyword_value(value, "both").value is True
            through = _through_all(_keyword_value(value, "amount"))
            until = _keyword_value(value, "until")
            up_to_next = isinstance(until, ast.Attribute) and until.attr == "NEXT"
            written = _keyword_value(value, "amount")
            # Up To Surface or Up To Vertex: `sketch2.depth_to(<face>)`, or an edge's end.
            ending = written.args[0] if _call_name(written) == "depth_to" and written.args else None
            up_to = None if ending is None else "vertex" if _call_name(ending) in ("start_point", "end_point") else "surface"
            reverse = (isinstance(written, ast.UnaryOp) and isinstance(written.op, ast.USub)) if through else amount < 0
            values = {"end": "next" if up_to_next else up_to or ("mid" if both else "through" if through else "blind"),
                      "reverse": bool(reverse) and not both and not up_to_next and not up_to,
                      "depth": size(abs(amount) * (2 if both else 1)) if not (through or up_to_next or up_to) else ""}
            if not (through or up_to_next or up_to):
                held("amount", written, typed(amount))
            # Draft: build123d's `taper`, in degrees; drawn in, or out when negative.
            taper = _keyword_value(value, "taper")
            drafted = number(("extrude", "taper"))
            if taper is not None and drafted:
                outward = drafted < 0
                values.update(draft=True, draft_angle=_number(abs(drafted), False), outward=outward)
                shown = taper.operand if outward and isinstance(taper, ast.UnaryOp) and isinstance(taper.op, ast.USub) else taper
                held("taper", shown, abs(drafted), _tight(shown, text))
            # Thin Feature: the profile is the sketch's wall, `sketch2.thin(<thickness>, side=...)`.
            if _call_name(profile) == "thin" and profile.args:
                wall = number(("thin", "thickness"))
                side = _keyword_value(profile, "side")
                values.update(thin=True, thin_thickness=size(wall),
                              thin_side=side.value if isinstance(side, ast.Constant) and side.value in ("outside", "mid") else "inside")
                held("thin_thickness", profile.args[0], typed(wall))
            if second is not None:
                written2 = _keyword_value(second, "amount")
                through2 = _through_all(written2)
                amount2 = number(("extrude", "amount", 2)) or 0.0
                values.update(direction2=True, end2="through" if through2 else "blind", depth2="" if through2 else size(abs(amount2)))
                if not through2:
                    held("amount2", written2, typed(amount2))
                taper2 = _keyword_value(second, "taper")
                drafted2 = number(("extrude", "taper", 2))
                if taper2 is not None and drafted2:
                    outward2 = drafted2 < 0
                    values.update(draft2=True, draft_angle2=_number(abs(drafted2), False), outward2=outward2)
                    shown2 = taper2.operand if outward2 and isinstance(taper2, ast.UnaryOp) and isinstance(taper2.op, ast.USub) else taper2
                    held("taper2", shown2, abs(drafted2), _tight(shown2, text))
            parts = {"profile": code(profile), "sketch": sketch, **({"target": code(ending), "toward": "-" if amount < 0 else ""} if up_to else {})}
            return Feature("extrude" if operator == "+=" else "cut", values, sketch, parts, target, operator, codes)
        axis = _keyword_value(value, "axis")
        line = code(axis.args[0]) if isinstance(axis, ast.Call) and _call_name(axis) == "axis" and axis.args else None
        if name == "revolve" and line:
            arc = number(("revolve", "revolution_arc")) or 0.0
            held("angle", _keyword_value(value, "revolution_arc"), arc)
            return Feature("revolve" if operator == "+=" else "revolve_cut", {"angle": _number(abs(arc), False), "reverse": arc < 0},
                           sketch, {"profile": code(profile), "sketch": sketch, "axis": line}, target, operator, codes)
    return None
