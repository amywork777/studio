"""Edit mode's tracer: a part script run so that its program reads as a design.

The script stays the only thing anyone writes. Running it here records it as an engineer reads a
part: a timeline of the build123d operations it performed, in order, each traced to the line of
code that asked for it, and the sizes that drove them, each traced to the number in the source it
came from. Every numeric literal in the project's own files is read as a number that remembers
where it was written (`LENGTH = 2.80`, line 8) and the formula it went through (`LENGTH - 2*WALL`),
while behaving exactly as a float or an int to build123d and OCCT. A hand edit is then one number
changed in the source, solved back from the dimension the engineer typed, and the part traced again.

It runs warm in a process of its own (`python -m cadgen.edit.tracer --serve`, started by
`service.py`): one JSON request per line on stdin, one reply per line on stdout, with build123d
imported once. It patches build123d and cadgen's model decorator for its own process only, so it is
never imported anywhere else. Nothing here changes how cadgen builds: the STEP files are still
written by running the scripts as the agent does.
"""

from __future__ import annotations

import ast
import base64
import functools
import hashlib
import importlib.abc
import importlib.machinery
import importlib.util
import io
import json
import math
import os
import re
import sys
import tempfile
import textwrap
import time
import traceback
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace

# ---------------------------------------------------------------------------------------------
# Numbers that remember where they came from.

LITERALS: dict[str, dict] = {}
"""Every numeric literal of the traced files: where it is written, its text and the name it sets."""


def _expr(value):
    return value._e if isinstance(value, (TFloat, TInt)) else ("num", value)


def _plain(value):
    if isinstance(value, TFloat):
        return float(value)
    if isinstance(value, TInt):
        return int(value)
    return value


def _traced(value, expr):
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return TInt(value, expr)
    if isinstance(value, float):
        return TFloat(value, expr)
    return value


def _numeric(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _ops(cls, base):
    def binary(symbol, fn):
        def left(self, other):
            if not _numeric(other):
                return NotImplemented
            return _traced(fn(base(self), _plain(other)), (symbol, self._e, _expr(other)))

        def right(self, other):
            if not _numeric(other):
                return NotImplemented
            return _traced(fn(_plain(other), base(self)), (symbol, _expr(other), self._e))

        return left, right

    for name, symbol, fn in [
        ("add", "+", lambda a, b: a + b),
        ("sub", "-", lambda a, b: a - b),
        ("mul", "*", lambda a, b: a * b),
        ("truediv", "/", lambda a, b: a / b),
        ("floordiv", "//", lambda a, b: a // b),
        ("pow", "**", lambda a, b: a**b),
    ]:
        left, right = binary(symbol, fn)
        setattr(cls, f"__{name}__", left)
        setattr(cls, f"__r{name}__", right)
    cls.__neg__ = lambda self: _traced(-base(self), ("neg", self._e))
    cls.__pos__ = lambda self: self
    cls.__abs__ = lambda self: _traced(abs(base(self)), ("abs", self._e))
    return cls


class TFloat(float):
    def __new__(cls, value, expr):
        number = float.__new__(cls, value)
        number._e = expr
        return number

    def __reduce__(self):
        return (float, (float(self),))


class TInt(int):
    def __new__(cls, value, expr):
        number = int.__new__(cls, value)
        number._e = expr
        return number

    def __reduce__(self):
        return (int, (int(self),))


_ops(TFloat, float)
_ops(TInt, int)


def studio_number(value, literal_id):
    return _traced(value, ("lit", literal_id))


# ---------------------------------------------------------------------------------------------
# Reading the project's files with their numbers traced.


def _literal_of(node):
    """A numeric literal, its sign included: `2.80`, `-.80`."""
    if isinstance(node, ast.Constant) and _numeric(node.value):
        return node.value
    if (
        isinstance(node, ast.UnaryOp)
        and isinstance(node.op, (ast.USub, ast.UAdd))
        and isinstance(node.operand, ast.Constant)
        and _numeric(node.operand.value)
    ):
        return -node.operand.value if isinstance(node.op, ast.USub) else node.operand.value
    return None


class _Numbers(ast.NodeTransformer):
    def __init__(self, file: str, rel: str, source: str):
        self.file, self.rel = file, rel
        self.lines = source.splitlines(keepends=True)
        self.names: dict[tuple[int, int], str] = {}

    def name_assignments(self, tree):
        # `LENGTH = 2.80` names its literal: the engineer's named size.
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Assign)
                and len(node.targets) == 1
                and isinstance(node.targets[0], ast.Name)
                and _literal_of(node.value) is not None
            ):
                self.names[(node.value.lineno, node.value.col_offset)] = node.targets[0].id

    def _replace(self, node, value):
        if node.lineno != node.end_lineno:
            return node
        text = self.lines[node.lineno - 1].encode()[node.col_offset : node.end_col_offset].decode()
        literal_id = f"{self.rel}:{node.lineno}:{node.col_offset}"
        LITERALS[literal_id] = {
            "id": literal_id,
            "file": self.rel,
            "path": self.file,
            "line": node.lineno,
            "col": node.col_offset,
            "end": node.end_col_offset,
            "text": text,
            "value": value,
            "name": self.names.get((node.lineno, node.col_offset)),
        }
        call = ast.Call(
            func=ast.Name(id="__studio_number__", ctx=ast.Load()),
            args=[ast.Constant(value), ast.Constant(literal_id)],
            keywords=[],
        )
        return ast.copy_location(call, node)

    def visit_UnaryOp(self, node):
        value = _literal_of(node)
        if value is not None and not isinstance(node, ast.Constant):
            return self._replace(node, value)
        return self.generic_visit(node)

    def visit_Constant(self, node):
        if _numeric(node.value):
            return self._replace(node, node.value)
        return node

    def visit_JoinedStr(self, node):
        return node


ROOT: Path = Path.cwd()
FILES: dict[str, str] = {}
"""The traced files' hashes by path relative to the project, to refuse an edit to a changed file."""
UNSAVED: dict[str, str] = {}
"""Text a preview runs and reads in place of a file's own, by the file's resolved path: the
command's line, never written (`preview`)."""


def _unsaved(path) -> str | None:
    return UNSAVED.get(str(Path(path).resolve())) if UNSAVED else None


def _relative(path: str) -> str:
    try:
        return str(Path(path).resolve().relative_to(ROOT))
    except ValueError:
        return path


# cadgen itself, which a checkout of text-to-cad holds beside its projects: never a project's file.
_RUNTIME = Path(__file__).resolve().parents[1]


def _inside(path: str) -> bool:
    """A file of the project's own: under its folder, not in a hidden folder or an environment
    inside it (`.venv`), and not cadgen's own. The project itself may sit in a hidden folder
    (Studio's state folder)."""
    try:
        resolved = Path(path).resolve()
        parts = resolved.relative_to(ROOT).parts
    except ValueError:
        return False
    if resolved == _RUNTIME or _RUNTIME in resolved.parents:
        return False
    return not any(part.startswith(".") or part == "site-packages" for part in parts)


# This Python's own folders: its standard library, and a virtual environment's packages.
_PYTHON = tuple({Path(folder).resolve() for folder in (sys.prefix, sys.base_prefix, sys.exec_prefix)})
OUTSIDE: set[str] = set()
"""Files outside the project's folder whose code made build123d operations in a trace: the parts an
assembly in a folder of its own imports, when where the project starts could not be told."""
_BASELINE: set[str] = set()
"""The modules loaded before the first trace: build123d, cadgen and the rest this process runs on."""


@functools.lru_cache(maxsize=None)
def _outside_design(path: str) -> bool:
    """A script of a design that is not the project's: outside its folder, and not a library (this
    Python's, an installed package's or cadgen's own)."""
    if not path.endswith(".py"):
        return False
    resolved = Path(path).resolve()
    if resolved == _RUNTIME or _RUNTIME in resolved.parents:
        return False
    if any(part in ("site-packages", "dist-packages") for part in resolved.parts):
        return False
    return not any(folder in resolved.parents for folder in _PYTHON)


def _outside_note() -> str:
    """Why a model built wholly in files outside the folder read as its project shows nothing."""
    folders = sorted({os.path.relpath(Path(path).resolve().parent, ROOT.parent) for path in OUTSIDE})[:3]
    named = folders[0] if len(folders) == 1 else f"{', '.join(folders[:-1])} and {folders[-1]}"
    return (f"Edit mode can't tell where this project starts, so it read only the {ROOT.name} folder, and the "
            f"model is built in the {named} folder{'s' if len(folders) > 1 else ''}. Make the project's top folder "
            "a git repository, or add it to a Studio project, then open the model again.")


class _ProjectLoader(importlib.abc.Loader):
    def __init__(self, path: str):
        self.path = path

    def create_module(self, spec):
        return None

    def exec_module(self, module):
        unsaved = _unsaved(self.path)
        raw = unsaved.encode("utf-8") if unsaved is not None else Path(self.path).read_bytes()
        source = raw.decode("utf-8")
        rel = _relative(self.path)
        FILES[rel] = hashlib.sha256(raw).hexdigest()[:16]
        tree = ast.parse(source, self.path)
        numbers = _Numbers(self.path, rel, source)
        numbers.name_assignments(tree)
        tree = ast.fix_missing_locations(numbers.visit(tree))
        module.__dict__["__studio_number__"] = studio_number
        module.__file__ = self.path
        exec(compile(tree, self.path, "exec"), module.__dict__)


class _ProjectFinder(importlib.abc.MetaPathFinder):
    def find_spec(self, name, path, target=None):
        spec = importlib.machinery.PathFinder.find_spec(name, path)
        if spec is None or not spec.origin or not spec.origin.endswith(".py") or not _inside(spec.origin):
            return None
        spec.loader = _ProjectLoader(spec.origin)
        return spec


sys.meta_path.insert(0, _ProjectFinder())

# ---------------------------------------------------------------------------------------------
# The build123d operations the project's code performs, recorded as it runs.

import build123d as B  # noqa: E402

STEPS: list[dict] = []
RECORDING = False

# Operations that make or change geometry, as an engineer names them.
FUNCTIONS = {
    "extrude": "Extrude",
    "revolve": "Revolve",
    "loft": "Loft",
    "sweep": "Sweep",
    "fillet": "Fillet",
    "chamfer": "Chamfer",
    "offset": "Offset",
    "mirror": "Mirror",
    "split": "Split",
    "make_face": "Face",
    "thicken": "Thicken",
    "draft": "Draft",
}
CLASSES = {
    "Box": "Box",
    "Cylinder": "Cylinder",
    "Cone": "Cone",
    "Sphere": "Sphere",
    "Torus": "Torus",
    "Wedge": "Wedge",
    "Rectangle": "Rectangle",
    "RectangleRounded": "Rounded rectangle",
    "Circle": "Circle",
    "Ellipse": "Ellipse",
    "Polygon": "Polygon",
    "RegularPolygon": "Polygon",
    "SlotOverall": "Slot",
    "SlotCenterToCenter": "Slot",
    "Trapezoid": "Trapezoid",
    "Triangle": "Triangle",
    "Text": "Text",
    "Hole": "Hole",
    "CounterBoreHole": "Counterbore",
    "CounterSinkHole": "Countersink",
    # Where a pattern puts its copies: a row that uses them is a Pattern.
    "GridLocations": "Pattern",
    "PolarLocations": "Pattern",
}
PATTERNS = {"GridLocations", "PolarLocations"}


def _project_frames():
    """The project's own frames calling into build123d, outermost first."""
    frames = []
    frame = sys._getframe(2)
    while frame is not None:
        filename = frame.f_code.co_filename
        if filename != __file__ and _inside(filename):
            frames.append(
                {"file": _relative(filename), "line": frame.f_lineno, "function": frame.f_code.co_name}
            )
        frame = frame.f_back
    return list(reversed(frames))


def _called_from_project():
    frame = sys._getframe(2)
    # Skip the wrappers of this file.
    while frame is not None and frame.f_code.co_filename == __file__:
        frame = frame.f_back
    if frame is None:
        return False
    if _inside(frame.f_code.co_filename):
        return True
    if _outside_design(frame.f_code.co_filename):
        OUTSIDE.add(frame.f_code.co_filename)
    return False


def _parameters(fn, args, kwargs):
    try:
        bound = inspect_signature(fn).bind_partial(*args, **kwargs)
        return list(bound.arguments.items())
    except (TypeError, ValueError):
        return [(f"arg{i}", value) for i, value in enumerate(args)] + list(kwargs.items())


def inspect_signature(fn):
    import inspect

    return inspect.signature(fn)


def _record(op, label, fn, args, kwargs, result, extra=None):
    step = {
        "index": len(STEPS),
        "op": op,
        "label": label,
        "frames": _project_frames(),
        "args": [
            (name, value) for name, value in _parameters(fn, args, kwargs) if name not in ("self",)
        ],
        "result": result,
        **(extra or {}),
    }
    STEPS.append(step)
    try:
        result._studio_step = step["index"]
        result._studio_origin = step["index"]
    except Exception:
        pass
    return step


def _origin(shape):
    return getattr(shape, "_studio_origin", None)


def _wrap_function(name, label):
    original = getattr(B, name)

    @functools.wraps(original)
    def wrapper(*args, **kwargs):
        result = original(*args, **kwargs)
        if RECORDING and _called_from_project():
            base = _origin(args[0]) if args else None
            step = _record(name, label, original, args, kwargs, result, {"from": base})
            # A fillet, a chamfer or a draft changes the body it works on: its result is that body, changed.
            if name in ("fillet", "chamfer", "draft") and args:
                body = _body_of(args[0])
                if body is not None:
                    result._studio_origin = body
                    step["from"] = body
        return result

    setattr(B, name, wrapper)


def _body_of(edges):
    """The step that made the body these edges or faces belong to, when it is known."""
    try:
        first = edges[0] if hasattr(edges, "__getitem__") else edges
    except Exception:
        return None
    return getattr(first, "_studio_body", None)


def _wrap_class(name, label):
    cls = getattr(B, name)
    original = cls.__init__

    @functools.wraps(original)
    def init(self, *args, **kwargs):
        original(self, *args, **kwargs)
        if RECORDING and type(self).__name__ == name and _called_from_project():
            _record(name, label, original, (self, *args), kwargs, self)

    cls.__init__ = init


for _name, _label in FUNCTIONS.items():
    if hasattr(B, _name):
        _wrap_function(_name, _label)
for _name, _label in CLASSES.items():
    if hasattr(B, _name):
        _wrap_class(_name, _label)


def _wrap_plane_offset():
    """A plane offset in the project's own code (``plane1 = Plane.XY.offset(10)``) is recorded: a
    line that makes one alone is a reference Plane of the history, as SolidWorks lists Plane1."""
    original = B.Plane.offset

    @functools.wraps(original)
    def offset(self, amount):
        result = original(self, amount)
        if RECORDING and _called_from_project():
            _record("plane", "Plane", original, (self, amount), {}, result)
        return result

    B.Plane.offset = offset

    # Turned At angle (``Plane.XY.offset(10).rotated((30, 0, 0))``): recorded as how far about each
    # of its own axes, so the angle is the plane's to show and change.
    turned = B.Plane.rotated

    def angles(self, x_angle=0, y_angle=0, z_angle=0):
        """A plane's turn about its own x, y and z axes, in degrees, as the trace names them."""

    @functools.wraps(turned)
    def rotated(self, rotation=(0, 0, 0), *args, **kwargs):
        result = turned(self, rotation, *args, **kwargs)
        if RECORDING and _called_from_project() and isinstance(rotation, (tuple, list)) and len(rotation) == 3:
            _record("plane", "Plane", angles, (self, *rotation), {}, result)
        return result

    B.Plane.rotated = rotated


_wrap_plane_offset()


def _wrap_boolean(cls, method, op, label):
    original = cls.__dict__.get(method)
    if original is None:
        return

    @functools.wraps(original)
    def wrapper(self, other):
        result = original(self, other)
        if RECORDING and _called_from_project():
            others = other if isinstance(other, (list, tuple)) else [other]
            for each in others:
                # A tool used once: a copy of it later (a pattern's) leaves its place on the model.
                try:
                    each._studio_used = True
                except Exception:
                    pass
            step = _record(
                op,
                label,
                original,
                (self, other),
                {},
                result,
                {"from": _origin(self), "tools": [_origin(each) for each in others]},
            )
            # The body keeps its lineage through a join or a cut: it is still the same part.
            try:
                result._studio_origin = _origin(self) if _origin(self) is not None else step["index"]
            except Exception:
                pass
        return result

    setattr(cls, method, wrapper)


for _cls in (B.Shape, B.Compound):
    _wrap_boolean(_cls, "__add__", "join", "Join")
    _wrap_boolean(_cls, "__sub__", "cut", "Cut")
    _wrap_boolean(_cls, "__and__", "intersect", "Intersect")
# `part += tool` on a Part or a Sketch is build123d's own `__iadd__`, whose `self + other` runs
# from inside build123d, where the join above does not record it: it is recorded here, as the
# project's line asked for it.
for _cls in (B.Part, B.Sketch):
    _wrap_boolean(_cls, "__iadd__", "join", "Join")



_pos_init = B.Pos.__init__


@functools.wraps(_pos_init)
def _pos(self, *args, **kwargs):
    _pos_init(self, *args, **kwargs)
    # Where a placement's numbers came from: `Pos(x, y, z)` written with sizes.
    names = ("x", "y", "z")
    self._studio_args = [(names[i] if i < 3 else f"arg{i}", value) for i, value in enumerate(args) if _numeric(value)]


B.Pos.__init__ = _pos


_shape_rmul = B.Shape.__rmul__


@functools.wraps(_shape_rmul)
def _moved(self, other):
    # `Pos(...) * shape`: Location's own __mul__ declines a shape, so the shape moves itself.
    result = _shape_rmul(self, other)
    if not RECORDING or result is NotImplemented or not isinstance(result, B.Shape):
        return result
    origin = _origin(self)
    try:
        result._studio_origin = origin
        result._studio_step = getattr(self, "_studio_step", None)
    except Exception:
        pass
    # `Pos(...) * shape` and `Plane(face) * shape` place a shape; a copy of a tool already used
    # (a pattern's `loc * hole`) is another instance, and the dimensions stay on the first.
    if origin is not None and not getattr(self, "_studio_used", False):
        PLACED[origin] = result
    if getattr(other, "_studio_args", None) and _called_from_project():
        STEPS.append(
            {
                "index": len(STEPS),
                "op": "move",
                "label": "Place",
                "frames": _project_frames(),
                "args": list(other._studio_args),
                "result": result,
                "from": origin,
            }
        )
    return result


B.Shape.__rmul__ = _moved

_plane_rmul = B.Plane.__rmul__


@functools.wraps(_plane_rmul)
def _plane_moved(self, other):
    # `Pos(x, y) * Plane(face)`: the plane keeps where its numbers came from, so the shape it
    # places (a hole) is a Place with them.
    result = _plane_rmul(self, other)
    if getattr(other, "_studio_args", None) and isinstance(result, B.Plane):
        try:
            result._studio_args = other._studio_args
        except Exception:
            pass
    return result


B.Plane.__rmul__ = _plane_moved
PLACED: dict[int, object] = {}
"""The latest placed copy of each step's shape: where it sits in the world."""

# Edges and faces picked from a body know which body they came from, so a fillet keeps its lineage.
_shape_edges, _shape_faces = B.Shape.edges, B.Shape.faces


def _tag_children(method):
    @functools.wraps(method)
    def wrapper(self, *args, **kwargs):
        children = method(self, *args, **kwargs)
        origin = _origin(self)
        if origin is not None:
            for child in children:
                try:
                    child._studio_body = origin
                except Exception:
                    pass
        return children

    return wrapper


B.Shape.edges = _tag_children(_shape_edges)
B.Shape.faces = _tag_children(_shape_faces)

# A model inside the tracer is its plain function: calling one (the script's own call, a child model
# in a body) runs its body here, with no engine daemon, no build and nothing written. A @memo
# function already runs plainly outside a build.
from cadgen.engine import model as _engine_model  # noqa: E402

_engine_model.Model.__call__ = lambda self: self.function()

# Constrained sketches (`cadgen.sketch`), each kept with the place the script made it in (the
# frame's globals and its locals then), so sketch mode runs its block again on its own.
from cadgen.sketch import sketch as _sketch_api  # noqa: E402

SKETCHES: dict[tuple[str, int], dict] = {}
_CAPTURING = [True]


def _watch_sketch(sketch, frame):
    if not _CAPTURING[0] or frame is None or not _inside(frame.f_code.co_filename):
        return
    local = frame.f_locals
    SKETCHES[(str(Path(frame.f_code.co_filename).resolve()), frame.f_lineno)] = {
        "sketch": sketch,
        "globals": frame.f_globals,
        # A sketch made at a module's top level has no locals of its own.
        "locals": None if local is frame.f_globals else dict(local),
        "function": frame.f_code.co_name,
    }


_sketch_api.WATCHERS.append(_watch_sketch)


def _wrap_sketch(name, label):
    """A sketch's own operation that makes geometry of it (a rib, a thin feature's wall),
    recorded as build123d's are when the project's code calls it."""
    original = getattr(_sketch_api.Sketch, name)

    @functools.wraps(original)
    def wrapper(self, *args, **kwargs):
        result = original(self, *args, **kwargs)
        if RECORDING and _called_from_project():
            _record(name, label, original, (self, *args), kwargs, result)
        return result

    setattr(_sketch_api.Sketch, name, wrapper)


for _name, _label in (("rib", "Rib"), ("thin", "Thin")):
    _wrap_sketch(_name, _label)

# ---------------------------------------------------------------------------------------------
# Formulas, units and numbers as an engineer writes them.

UNIT_NAMES = {"INCH", "INCHES", "IN", "MM", "MM_PER_IN", "MM_PER_INCH"}


def _is_unit(expr):
    return expr[0] == "lit" and (LITERALS.get(expr[1], {}).get("name") or "").upper() in UNIT_NAMES


def strip_unit(expr):
    """`LENGTH*INCH` reads `LENGTH` in an inch project: the unit is how the code meets OCCT."""
    if expr[0] == "*":
        if _is_unit(expr[2]):
            return expr[1], LITERALS[expr[2][1]]["value"]
        if _is_unit(expr[1]):
            return expr[2], LITERALS[expr[1][1]]["value"]
    if expr[0] == "/" and _is_unit(expr[2]):
        return expr[1], 1 / LITERALS[expr[2][1]]["value"]
    return expr, None


PRECEDENCE = {"+": 1, "-": 1, "*": 2, "/": 2, "//": 2, "neg": 3, "**": 4}


def formula(expr, parent=0):
    kind = expr[0]
    if kind == "lit":
        literal = LITERALS.get(expr[1], {})
        return literal.get("name") or literal.get("text") or "?"
    if kind == "num":
        return _number_text(expr[1])
    if kind == "neg":
        return f"-{formula(expr[1], PRECEDENCE['neg'])}"
    if kind == "abs":
        return f"abs({formula(expr[1])})"
    precedence = PRECEDENCE.get(kind, 0)
    text = f"{formula(expr[1], precedence)}{kind}{formula(expr[2], precedence + (1 if kind in '-/' else 0))}"
    return f"({text})" if precedence < parent else text


def leaves(expr, out=None):
    out = [] if out is None else out
    if expr[0] == "lit":
        if expr[1] not in out:
            out.append(expr[1])
    elif expr[0] in ("neg", "abs"):
        leaves(expr[1], out)
    elif expr[0] not in ("num",):
        leaves(expr[1], out)
        leaves(expr[2], out)
    return out


def evaluate(expr, override=None):
    kind = expr[0]
    if kind == "lit":
        if override is not None and expr[1] == override[0]:
            return override[1]
        return LITERALS[expr[1]]["value"]
    if kind == "num":
        return expr[1]
    if kind == "neg":
        return -evaluate(expr[1], override)
    if kind == "abs":
        return abs(evaluate(expr[1], override))
    a, b = evaluate(expr[1], override), evaluate(expr[2], override)
    return {"+": a + b, "-": a - b, "*": a * b, "/": a / b, "//": a // b, "**": a**b}[kind]


def parse_number(text):
    """A number as typed, plain arithmetic allowed (`2.8 + .2`, `3/4`); anything else is refused."""
    tree = ast.parse(text.strip(), mode="eval")

    def value(node):
        if isinstance(node, ast.Constant) and _numeric(node.value):
            return node.value
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            inner = value(node.operand)
            return -inner if isinstance(node.op, ast.USub) else inner
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div)):
            a, b = value(node.left), value(node.right)
            return {ast.Add: a + b, ast.Sub: a - b, ast.Mult: a * b, ast.Div: a / b}[type(node.op)]
        raise ValueError(text)

    return float(value(tree.body))


def _number_text(value):
    if isinstance(value, int) or float(value).is_integer() and abs(value) < 1e9:
        return str(int(value))
    return f"{value:.6f}".rstrip("0").rstrip(".")


def literal_text(value, old_text):
    """A new value written the way the old one was: as many decimals (`.060` to `.050`, `2.80` to
    `3.10`), and without a leading zero where the old one had none."""
    if old_text.lstrip("+-").isdigit() and float(value).is_integer():
        return str(int(value))
    needed = f"{value:.6f}".rstrip("0").rstrip(".")
    places = len(needed.split(".")[1]) if "." in needed else 0
    written = len(old_text.split(".")[1]) if "." in old_text else 0
    text = f"{value:.{max(places, written)}f}"
    if re.match(r"^[+-]?\.", old_text) and re.match(r"^-?0\.", text):
        text = text.replace("0.", ".", 1)
    return text


def display(value_mm, units):
    """A length in the project's units, as a drawing writes it."""
    value = value_mm / 25.4 if units == "in" else value_mm
    rounded = round(value, 3 if units == "in" else 2)
    return f"{rounded:.3f}".rstrip("0").rstrip(".") if units == "in" else f"{rounded:g}"


# ---------------------------------------------------------------------------------------------
# A trace: the timeline, the sizes and the dimensions of one part.

STATE: dict[str, dict] = {}
# The part as each trace read it, by script, newest last: what Compare goes back to (`compare`).
VERSIONS: dict[str, list[dict]] = {}
_VERSION_COUNT = 12
"""The last trace of each script, kept so an edit can solve against it."""


def _scale_of(value):
    """The factor a length goes through to reach millimetres: 25.4 when written in inches."""
    if not isinstance(value, (TFloat, TInt)):
        return None
    _, unit = strip_unit(value._e)
    return unit


# build123d's argument names, as an engineer names the sizes: a profile's width runs along X.
LABELS = {
    ("Rectangle", "width"): "Length",
    ("Rectangle", "height"): "Width",
    ("RectangleRounded", "width"): "Length",
    ("RectangleRounded", "height"): "Width",
    ("extrude", "amount"): "Height",
    ("move", "x"): "X",
    ("move", "y"): "Y",
    ("move", "z"): "Z",
    ("chamfer", "length"): "Distance",
    ("chamfer", "length2"): "Distance 2",
    ("chamfer", "angle"): "Angle",
    ("offset", "amount"): "Offset",
    ("GridLocations", "x_spacing"): "Spacing",
    ("GridLocations", "y_spacing"): "Spacing",
    ("GridLocations", "x_count"): "Instances",
    ("GridLocations", "y_count"): "Instances",
    ("PolarLocations", "count"): "Instances",
    ("revolve", "revolution_arc"): "Angle",
    ("draft", "angle"): "Draft Angle",
    ("plane", "amount"): "Offset Distance",
    ("plane", "x_angle"): "Angle",
    ("plane", "y_angle"): "Angle",
}
# The sizes that are angles, shown in degrees.
ANGLES = {("revolve", "revolution_arc"), ("draft", "angle"), ("chamfer", "angle"), ("plane", "x_angle"), ("plane", "y_angle")}


def _input(name, value, units, op=None):
    if not isinstance(value, (TFloat, TInt)):
        return None
    shown, unit = strip_unit(value._e)
    length = unit is not None or name in LENGTH_ARGUMENTS
    return {
        "label": LABELS.get((op, name)) or name.replace("_", " ").capitalize(),
        "value": float(value),
        "display": display(float(value), units) if length else _number_text(_plain(value)),
        "unit": (units if length else "deg" if (op, name) in ANGLES else ""),
        "formula": formula(shown),
        "leaves": [leaf for leaf in leaves(value._e) if not _is_unit(("lit", leaf))],
        "expr": value._e,
        "length": length,
    }


LENGTH_ARGUMENTS = {
    "width",
    "height",
    "length",
    "length2",
    "radius",
    "amount",
    "depth",
    "diameter",
    "x_radius",
    "y_radius",
    "major_radius",
    "minor_radius",
    "arc_size",
    "size",
    "distance",
    "thickness",
}


def _bbox(shape):
    box = shape.bounding_box()
    return (box.min.X, box.min.Y, box.min.Z), (box.max.X, box.max.Y, box.max.Z)


def _dimension(identifier, step, item, a, b, anchor, lines, units, label=None):
    return {
        "expr": item["expr"],
        "name": item["label"],
        "id": identifier,
        "step": step,
        "label": label or item["display"],
        "display": item["display"],
        "formula": item["formula"],
        "leaves": item["leaves"],
        "anchor": anchor,
        "lines": lines,
    }


def _dimensions(steps, units):
    """Dimensions on the model for the steps whose shape and sizes line up with the world's axes."""
    dimensions = []
    for step in steps:
        args = dict(step["args"])
        if step["op"] in ("extrude",) and step["args"]:
            sketch = step["args"][0][1]
            sketch_step = getattr(sketch, "_studio_step", None)
            if sketch_step is None:
                continue
            profile = STEPS[sketch_step]
            if profile["op"] not in ("Rectangle", "RectangleRounded"):
                continue
            shape = PLACED.get(step["index"], step["result"])
            sizes = dict(profile["args"])
            amount = args.get("amount")
            dimensions += _box_dimensions(
                step, shape, sizes.get("width"), sizes.get("height"), amount, sizes.get("radius"), units
            )
        elif step["op"] == "Box":
            shape = PLACED.get(step["index"], step["result"])
            dimensions += _box_dimensions(
                step, shape, args.get("length"), args.get("width"), args.get("height"), None, units
            )
        elif step["op"] == "Cylinder":
            shape = PLACED.get(step["index"], step["result"])
            radius = args.get("radius")
            item = _input("diameter", radius * 2, units) if isinstance(radius, (TFloat, TInt)) else None
            if item is None:
                continue
            (x0, y0, z0), (x1, y1, z1) = _bbox(shape)
            cx, cy, cz = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
            r = float(radius)
            off = max(r * 0.8, 2)
            dimensions.append(
                _dimension(
                    f"{step['index']}:diameter",
                    step["index"],
                    item,
                    None,
                    None,
                    (cx + r * 0.71 + off, cy + r * 0.71 + off, cz),
                    [((cx - r * 0.71, cy - r * 0.71, cz), (cx + r * 0.71 + off, cy + r * 0.71 + off, cz))],
                    units,
                    label=f"Ø{item['display']}",
                )
            )
    return dimensions


def _box_dimensions(step, shape, x_size, y_size, z_size, radius, units):
    (x0, y0, z0), (x1, y1, z1) = _bbox(shape)
    span = max(x1 - x0, y1 - y0, z1 - z0, 1)
    off = max(span * 0.12, 2)
    near = lambda value, extent: value is not None and abs(float(value) - extent) <= max(1e-3 * span, 1e-3)  # noqa: E731
    out = []
    x_item = _input("length", x_size, units) if isinstance(x_size, (TFloat, TInt)) else None
    y_item = _input("width", y_size, units) if isinstance(y_size, (TFloat, TInt)) else None
    z_item = _input("height", z_size, units) if isinstance(z_size, (TFloat, TInt)) else None
    for item, label in ((x_item, "Length"), (y_item, "Width"), (z_item, "Height")):
        if item is not None:
            item["label"] = label
    if x_item and near(x_size, x1 - x0):
        y = y0 - off
        out.append(
            _dimension(
                f"{step['index']}:x", step["index"], x_item, None, None, ((x0 + x1) / 2, y, z0),
                [((x0, y0, z0), (x0, y - off * 0.15, z0)), ((x1, y0, z0), (x1, y - off * 0.15, z0)), ((x0, y, z0), (x1, y, z0))],
                units,
            )
        )
    if y_item and near(y_size, y1 - y0):
        x = x1 + off
        out.append(
            _dimension(
                f"{step['index']}:y", step["index"], y_item, None, None, (x, (y0 + y1) / 2, z0),
                [((x1, y0, z0), (x + off * 0.15, y0, z0)), ((x1, y1, z0), (x + off * 0.15, y1, z0)), ((x, y0, z0), (x, y1, z0))],
                units,
            )
        )
    if z_item and near(z_size, z1 - z0):
        x, y = x1 + off * 0.6, y0 - off * 0.6
        out.append(
            _dimension(
                f"{step['index']}:z", step["index"], z_item, None, None, (x, y, (z0 + z1) / 2),
                [((x1, y0, z0), (x, y, z0)), ((x1, y0, z1), (x, y, z1)), ((x, y, z0), (x, y, z1))],
                units,
            )
        )
    if radius is not None and isinstance(radius, (TFloat, TInt)) and float(radius) > 0:
        r = float(radius)
        item = _input("radius", radius, units)
        cx, cy = x1 - r, y1 - r
        rim = (cx + r * 0.71, cy + r * 0.71, z1)
        out.append(
            _dimension(
                f"{step['index']}:r", step["index"], item, None, None,
                (cx + r * 0.71 + off * 0.5, cy + r * 0.71 + off * 0.5, z1),
                [((cx, cy, z1), rim), (rim, (cx + r * 0.71 + off * 0.5, cy + r * 0.71 + off * 0.5, z1))],
                units, label=f"R{item['display']}",
            )
        )
    return out


def _rows(steps):
    """The timeline as the design reads it: one row per line of the function that designs the
    part (the deepest one every operation passes through), each with the operations it performed
    inside any helper it calls, a loop's repeats counted once. With the rows, the depth of that
    function in each operation's frames."""
    chains = [step["frames"] for step in steps if step["frames"]]
    if not chains:
        return [], 0
    depth = 0
    while all(len(chain) > depth for chain in chains) and len(
        {(chain[depth]["file"], chain[depth]["function"]) for chain in chains}
    ) == 1:
        depth += 1
    level = max(depth - 1, 0)
    rows: list[dict] = []
    by_key: dict[tuple, dict] = {}
    for step in steps:
        if not step["frames"]:
            continue
        frame = step["frames"][min(level, len(step["frames"]) - 1)]
        key = (frame["file"], frame["line"])
        row = by_key.get(key)
        if row is None:
            row = {"key": f"{frame['file']}:{frame['line']}", "file": frame["file"], "line": frame["line"], "function": frame["function"], "steps": []}
            by_key[key] = row
            rows.append(row)
        row["steps"].append(step)
    return rows, level


def _read(path):
    """A project file's text exactly as written: UTF-8, its line endings kept (as a preview runs it,
    while one does)."""
    unsaved = _unsaved(path)
    return unsaved if unsaved is not None else Path(path).read_bytes().decode("utf-8")


def _write(path, text):
    Path(path).write_bytes(text.encode("utf-8"))


def _source_line(rel, line):
    try:
        return _read(ROOT / rel).splitlines()[line - 1].strip()
    except (OSError, IndexError, UnicodeDecodeError):
        return ""


# Copies made one by one, as edit mode's Pattern writes them up Z or about a picked axis:
# `[Pos(0, 0, i * 12) * boss for i in range(1, 4)]`, `[boss.rotate(axis, i * 360 / 6) for i in range(1, 6)]`.
_COPIES = re.compile(r"\[\s*(?:\w+\.rotate\(|(?:\w+\.)?Pos\().*\bfor\s+\w+\s+in\s+range\(")


def _row_kind(steps, code=""):
    """What a row of the history is, as a CAD tree names it (``code``: its line, as written)."""
    ops = [step["op"] for step in steps]
    # A line that only offsets a plane is a reference Plane; one that offsets a plane to place
    # something is what it places.
    if ops and all(op == "plane" for op in ops):
        return "Plane"
    ops = [op for op in ops if op != "plane"] or ops
    if PATTERNS & set(ops) or _COPIES.search(code or ""):
        return "Pattern"
    if "mirror" in ops:
        return "Mirror"
    if any(step["op"] == "offset" and dict(step["args"]).get("openings") is not None for step in steps):
        return "Shell"
    if "rib" in ops:
        return "Rib"
    if "draft" in ops:
        return "Draft"
    # A cut by a cylinder alone is a hole.
    if "cut" in ops and "Cylinder" in ops and not {"extrude", "revolve", "Box", "sweep", "loft"} & set(ops):
        return "Hole"
    kind = next(
        (FUNCTIONS.get(op, CLASSES.get(op, op.capitalize())) for op in ("cut", "fillet", "chamfer", "extrude", "revolve", "join") if op in ops),
        None,
    ) or (CLASSES.get(ops[0], FUNCTIONS.get(ops[0], ops[0].capitalize())) if ops else "Step")
    return {"cut": "Cut", "join": "Join"}.get(kind, kind)


def _feature_input(kind, step, name, value, units, nth=1):
    """A step's number as the feature's input reads it: a hole's radius as its diameter (its
    second cylinder's as the counterbore's, its cone's top as the countersink's), a shell's inward
    offset as its thickness, a pattern's unused direction left out. ``nth``: which of the row's
    steps of this operation the step is."""
    if kind == "Hole" and step["op"] == "Cone" and name != "top_radius":
        return None  # the cone's foot is the hole's, and its height is worked out from its angle
    item = _input(name, value, units, step["op"])
    if item is None:
        return None
    if kind == "Hole" and (step["op"], name) in (("Cylinder", "radius"), ("Cylinder", "height"), ("Cone", "top_radius")):
        words = ("Countersink Diameter", "") if step["op"] == "Cone" else ("Diameter", "Depth") if nth == 1 \
            else ("Counterbore Diameter", "Counterbore Depth")
        if name == "height":
            return {**item, "label": words[1]}
        shown, _ = strip_unit(value._e)
        half = shown[0] == "/" and shown[2] == ("num", 2)
        return {**item, "label": words[0], "value": float(value) * 2, "display": display(float(value) * 2, units),
                "formula": formula(shown[1]) if half else formula(("*", shown, ("num", 2))), "expr": ("*", value._e, ("num", 2))}
    if kind == "Shell" and step["op"] == "offset" and name == "amount":
        shown, _ = strip_unit(value._e)
        plain = shown[0] == "lit" and not LITERALS[shown[1]]["name"]
        return {**item, "label": "Thickness", "value": -float(value), "display": display(-float(value), units),
                "formula": LITERALS[shown[1]]["text"].lstrip("-") if plain else formula(("neg", shown)), "expr": ("neg", value._e)}
    if step["op"] == "extrude" and nth == 2 and name in ("amount", "taper"):
        # Direction 2: the second extrude of a line, its depth as far as it goes the other way.
        if name == "amount" and float(value) < 0:
            shown, _ = strip_unit(value._e)
            item = {**item, "value": -float(value), "display": display(-float(value), units), "formula": formula(("neg", shown)),
                    "expr": ("neg", value._e)}
        return {**item, "label": f"{item['label']} 2"}
    if kind == "Pattern" and step["op"] in PATTERNS and float(value) in (0, 1) and name.endswith(("count", "spacing")):
        return None  # the direction a one-row pattern does not use
    if kind == "Pattern" and step["op"] == "move":
        # Copies placed up Z one by one: the first's place is the spacing (`12*1` reads `12`), read
        # as a linear pattern's spacing is.
        if name != "z" or nth != 1:
            return None
        expr = value._e
        if expr[0] == "*" and ("num", 1) in (expr[1], expr[2]):
            expr = expr[1] if expr[2] == ("num", 1) else expr[2]
        return _input("x_spacing", TFloat(float(value), expr), units, "GridLocations")
    return item


def _row_summary(row, units):
    text = _source_line(row["file"], row["line"])
    target = re.match(r"^([A-Za-z_]\w*)\s*(?:[-+*]?=)", text)
    kind = _row_kind(row["steps"], text)
    inputs, seen, made = [], set(), {}
    for step in row["steps"]:
        nth = made[step["op"]] = made.get(step["op"], 0) + 1
        for name, value in step["args"]:
            item = _feature_input(kind, step, name, value, units, nth)
            if item is None:
                continue
            key = tuple(item["leaves"])
            # A helper's own zero (`Pos(0, 0, z)`) is how it is written, not a size of this part.
            plain_zero = float(value) == 0 and all(not LITERALS[leaf]["name"] for leaf in key)
            if not key or key in seen or plain_zero:
                continue
            seen.add(key)
            inputs.append(item)
    # A constrained sketch's dimensions are the feature's inputs too, named as a CAD tool names
    # them (D1@Sketch1), so the sizes that drive the sketch are changed where the feature is.
    for step in row["steps"]:
        drawn = _profile_sketch(step)
        for relation in getattr(drawn, "relations", []):
            if not relation.dimension or not isinstance(relation.raw, (TFloat, TInt)):
                continue
            item = _input(SKETCH_DIMENSION_INPUTS.get(relation.kind, relation.kind), relation.raw, units)
            key = tuple(item["leaves"]) if item else ()
            if item is None or not key or key in seen:
                continue
            seen.add(key)
            inputs.append({**item, "label": f"{relation.name}@{drawn.name}"})
    # A line run more than once (in a loop) is counted; an operation written twice in it (an
    # extrude's Direction 2) is not.
    first_op = row["steps"][0]["op"]
    written = max(1, len(re.findall(rf"\b{re.escape(first_op)}\(", text)))
    repeats = len([s for s in row["steps"] if s["op"] == first_op]) // written
    return {
        "key": row["key"],
        "file": row["file"],
        "line": row["line"],
        "name": target.group(1) if target else None,
        "kind": kind,
        "code": text,
        "count": repeats if repeats > 1 else 1,
        "steps": [step["index"] for step in row["steps"]],
        "inputs": inputs,
    }


# A profile an extrude or revolve makes a solid from: what a CAD tree shows as its sketch.
SKETCH_PROFILES = {"Rectangle", "RectangleRounded", "Circle", "Ellipse", "Polygon", "RegularPolygon",
                   "SlotOverall", "SlotCenterToCenter", "Trapezoid", "Triangle", "Text"}
# A constrained sketch's plane as the tree names it (`cadgen.sketch` takes either).
SKETCH_PLANES = {"XY": "Top", "XZ": "Front", "YZ": "Right"}
# A sketch dimension's kind as the input it is: linear ones are lengths, an angle is not.
SKETCH_DIMENSION_INPUTS = {"length": "length", "distance": "length", "horizontal_distance": "length",
                           "vertical_distance": "length", "radius": "radius", "diameter": "diameter", "angle": "angle"}
# A primitive solid reads as an extrude of the sketch it implies.
PRIMITIVE_SKETCHES = {"Box": ("Rectangle", "Rectangle"), "Cylinder": ("Circle", "Circle")}
MAKES_SOLID = {"Extrude", "Revolve", "Sweep", "Loft", "Box", "Cylinder"}


def _plane_of(shape):
    """The plane a profile lies on, as a CAD tree names the origin's planes (Top is XY)."""
    try:
        normal = shape.faces()[0].normal_at()
    except Exception:
        return None
    weights = {"Top": abs(normal.Z), "Front": abs(normal.Y), "Right": abs(normal.X)}
    name, weight = max(weights.items(), key=lambda item: item[1])
    return name if weight > 0.999 else "Plane"


# The operations a solid is made from a sketch by.
SKETCH_MADE = ("extrude", "revolve", "sweep", "loft")


def _profile_of(step):
    """What a step makes its solid from: an extrude's, revolve's or sweep's profile, a loft's
    first; None for any other step."""
    if step["op"] not in SKETCH_MADE or not step["args"]:
        return None
    first = step["args"][0][1]
    if isinstance(first, (list, tuple)):
        first = first[0] if first else None
    return first


def _profile_sketch(step):
    """The constrained sketch (`cadgen.sketch`) a step makes its solid from: its profile's, or a
    rib's own. None for one made from no such sketch."""
    if step["op"] == "rib":
        return getattr(step.get("result"), "_cadgen_sketch", None)
    return getattr(_profile_of(step), "_cadgen_sketch", None)


def _sketch_of(steps):
    """The sketch a row makes its solid from: the profile its extrude, revolve, sweep or loft
    takes, a rib's sketch, or the rectangle or circle a box or cylinder implies, with the plane
    it lies on."""
    for step in steps:
        drawn = _profile_sketch(step)
        if drawn is not None:
            # A face made from a constrained sketch (`cadgen.sketch`): that sketch, by its name.
            profile = _profile_of(step)
            plane = drawn.plane if isinstance(drawn.plane, str) else _plane_of(profile) if profile is not None else "Plane"
            where = {"file": _relative(drawn.source[0]), "line": drawn.source[1]} if drawn.source else {}
            return {"op": "Sketch", "label": "Sketch", "name": drawn.name, "step": None,
                    "plane": SKETCH_PLANES.get(plane, plane), "status": _status_of(drawn), **where}
        if step["op"] in ("extrude", "revolve") and step["args"]:
            index = getattr(step["args"][0][1], "_studio_step", None)
            if index is not None and STEPS[index]["op"] in SKETCH_PROFILES:
                profile = STEPS[index]
                return {"op": profile["op"], "label": profile["label"], "step": index, "plane": _plane_of(profile["result"])}
        if step["op"] in PRIMITIVE_SKETCHES:
            op, label = PRIMITIVE_SKETCHES[step["op"]]
            return {"op": op, "label": label, "step": step["index"], "plane": "Top"}
    return None


def _status_of(drawn):
    """How defined a constrained sketch is, or that it cannot be solved."""
    try:
        return drawn.status
    except Exception:  # noqa: BLE001 - a sketch whose relations disagree still shows in the tree
        return "Not solved"


def _sketch_view(sketch, path, line, function):
    """A constrained sketch as sketch mode reads it: its solved state, where it is made, and the
    formula behind each dimension (``LENGTH/2``), its files named as the project names them."""
    view = {"name": sketch.name, "file": _relative(path), "line": line, "function": function, "state": None, "error": None}
    try:
        state = sketch.state()
    except Exception as error:  # noqa: BLE001 - said to the engineer: the relations that disagree
        view["error"] = str(error)
        return view
    for item in [*state["points"], *state["curves"], *state["relations"], *state["dimensions"]]:
        if item.get("file"):
            item["file"] = _relative(item["file"])
    raws = {relation.name: relation.raw for relation in sketch.relations if relation.dimension}
    for dimension in state["dimensions"]:
        raw = raws.get(dimension["id"])
        if isinstance(raw, (TFloat, TInt)):
            dimension["formula"] = formula(raw._e)
            dimension["named"] = any(LITERALS.get(leaf, {}).get("name") for leaf in leaves(raw._e))
        else:
            dimension["formula"] = _number_text(dimension["value"])
            dimension["named"] = False
    view["state"] = state
    return view


def _sketches(steps, rows):
    """Every constrained sketch the part made, with the history row of the feature that makes a
    solid of it (none for a sketch nothing uses yet)."""
    row_of = {index: row["key"] for row in rows for index in row["steps"]}
    consumed = {}
    for step in steps:
        drawn = _profile_sketch(step)
        if drawn is not None:
            consumed.setdefault(id(drawn), row_of.get(step["index"]))
    found = []
    for (path, line), entry in SKETCHES.items():
        view = _sketch_view(entry["sketch"], path, line, entry["function"])
        view["consumed"] = consumed.get(id(entry["sketch"]))
        plane = entry["sketch"].plane
        view["plane"] = SKETCH_PLANES.get(_sketch_api.PLANE_NAMES.get(plane, plane), "Plane") if isinstance(plane, str) else "Plane"
        view["offset"] = float(entry["sketch"].offset or 0) or None
        found.append(view)
    return found


def _with_sketches(features, sketches, component=None):
    """A part's features with its sketches nothing uses yet among them, where the script makes
    them, as a CAD tree lists a sketch of its own (Sketch3, after the feature before it)."""
    out = list(features)
    for sketch in sketches:
        if sketch["consumed"] is not None:
            continue
        if component is not None and (sketch["file"], sketch["function"]) != (component["file"], component["function"]):
            continue
        status = sketch["state"]["status"] if sketch["state"] else "Not solved"
        item = {"key": f"sketch@{sketch['file']}:{sketch['line']}", "rows": [], "name": None, "count": 1,
                "file": sketch["file"], "line": sketch["line"], "kind": "Sketch",
                "sketch": {"op": "Sketch", "label": "Sketch", "name": sketch["name"], "file": sketch["file"], "line": sketch["line"],
                           "plane": sketch["plane"], "offset": sketch.get("offset"), "status": status, "step": None}}
        at = next((index for index, feature in enumerate(out)
                   if feature.get("file") == sketch["file"] and (feature.get("line") or 0) > sketch["line"]), len(out))
        out.insert(at, item)
    return out


def _suppressed_in(rel, functions, sketches):
    """The features Suppress set aside in ``rel`` (`deleting.py`), inside the functions named: each
    as the design tree lists it, where its lines are, with the sketch it was made from under it
    (which is then not a sketch of its own, nor drawn on the model)."""
    from cadgen.edit import deleting

    try:
        text = _read(ROOT / rel)
        tree = ast.parse(text)
    except (OSError, SyntaxError, UnicodeDecodeError):
        return []
    spans = [(node.lineno, node.end_lineno) for node in ast.walk(tree)
             if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in functions]
    lines = text.splitlines(keepends=True)
    found = []
    for number, line in enumerate(lines, 1):
        if "# Suppressed (" not in line or not any(first <= number <= last for first, last in spans):
            continue
        span = deleting.suppressed_span(lines, number)
        if span is None:
            continue
        key = f"suppressed@{rel}:{number}"
        try:
            statements = ast.parse(textwrap.dedent("\n".join(span["code"]))).body
        except SyntaxError:
            statements = []
        # Its name, as a feature the part makes shows it: what its last line assigns.
        targets = [statement.targets[0] if isinstance(statement, ast.Assign) and len(statement.targets) == 1 else getattr(statement, "target", None)
                   for statement in statements]
        name = next((target.id for target in reversed(targets) if isinstance(target, ast.Name)), None)
        drawn = [node.func.value.id for statement in statements for node in ast.walk(statement)
                 if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in ("face", "faces")
                 and isinstance(node.func.value, ast.Name)]
        sketch = None
        for var in drawn:
            view = max((each for each in sketches if each["file"] == rel and 0 < each["line"] < number
                        and lines[each["line"] - 1].strip().startswith(f"{var} = ")), key=lambda each: each["line"], default=None)
            if view is not None and view["consumed"] is None:
                view["consumed"] = key
                sketch = {"op": "Sketch", "label": "Sketch", "name": view["name"], "file": view["file"], "line": view["line"],
                          "plane": view["plane"], "status": view["state"]["status"] if view["state"] else "Not solved", "step": None}
                break
        found.append({"key": key, "rows": [], "name": name, "count": 1, "file": rel, "line": number, "kind": span["kind"],
                      "sketch": sketch, "suppressed": True})
    return found


def _with_suppressed(features, suppressed):
    """A part's features with the ones Suppress set aside among them, where their lines are."""
    out = list(features)
    for item in suppressed:
        at = next((index for index, feature in enumerate(out)
                   if feature.get("file") == item["file"] and (feature.get("line") or 0) > item["line"]), len(out))
        out.insert(at, item)
    return out


def _editable(features, rows, steps, sketches, units):
    """Each feature a ribbon command writes, with what Edit Feature opens it with (``edit``): the
    command, its values in the part's units, what it keeps (its edges, faces, the feature it
    copies) and, for one made from a sketch, the sketch and the line it revolves about."""
    from cadgen.edit import commands, sketching

    by_key = {row["key"]: row for row in rows}
    files: dict = {}
    for feature in features:
        row = by_key.get(feature.get("key"))
        if row is None or feature.get("kind") == "Sketch":
            continue
        rel = row["file"]
        if rel not in files:
            try:
                text = _read(ROOT / rel)
                files[rel] = (text, ast.parse(text))
            except (OSError, SyntaxError, UnicodeDecodeError):
                files[rel] = None
        if files[rel] is None:
            continue
        text, tree = files[rel]
        functions = [node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                     and node.lineno <= row["line"] <= node.end_lineno]
        function = max(functions, key=lambda node: node.lineno, default=None)
        statement = commands._top_statement(function, row["line"]) if function is not None else None
        if statement is None or statement.lineno != row["line"]:
            continue
        # A name given in the design tree: the comment at the end of the feature's line (a hole's
        # Hole Wizard callout reads as one too, as SolidWorks names a hole by its size).
        named = commands.trailing_comment(text, statement)
        if named:
            feature["named"] = named
        read = commands.read_feature(statement, text, commands.recorded_numbers([steps[index] for index in row["steps"]]), units)
        if read is None:
            continue
        edit = {"command": read.command, "values": read.values, "keeps": read.keeps}
        if read.command == "hole":
            # The axes a hole moves along on its face, as its panel offers them: the two square to
            # the face's normal, which the placed tool's own axis is.
            cut = next((steps[index] for index in row["steps"] if steps[index]["op"] == "cut"), None)
            tool = dict(cut["args"]).get("other") if cut else None
            axes = commands.offset_axes(B.Plane(tool.location).z_dir) if isinstance(tool, B.Shape) else ()
            edit["axes"] = [axis.lower() for axis in axes]
            edit["values"] = {**{axis: "0" for axis in edit["axes"]}, **read.values}
        var = read.parts.get("sketch")
        if var:
            # The sketch is the last one made under that name before the feature's line.
            lines = text.splitlines()

            def named(name):
                return max((each for each in sketches if each["file"] == rel and 0 < each["line"] < statement.lineno
                            and lines[each["line"] - 1].strip().startswith(f"{name} = ")), key=lambda each: each["line"], default=None)

            view = named(var)
            if view is None or view.get("state") is None:
                continue
            edit["sketch"] = {"file": view["file"], "line": view["line"], "name": view["name"]}
            # A sweep's profile and path, a loft's profiles: each, in order.
            if read.parts.get("sketches"):
                views = [named(each) for each in read.parts["sketches"]]
                if any(each is None for each in views):
                    continue
                edit["sketches"] = [{"file": each["file"], "line": each["line"], "name": each["name"]} for each in views]
                edit["keeps"] = (f"{views[0]['name']} along {views[1]['name']}" if read.command.startswith("sweep")
                                 else "through " + ", ".join(each["name"] for each in views))
            if read.parts.get("axis"):
                try:
                    names = sketching.Names(sketching.find_block(text, view["line"], str(ROOT / rel)), view["state"])
                except sketching.SketchEditError:
                    continue
                axis = next((curve for curve, code in names.curve_code.items() if code == read.parts["axis"]), None)
                if axis is None:
                    continue
                edit["values"] = {**read.values, "axis": axis}
        feature["edit"] = edit
    return features


def _is_flat(step):
    """A step that draws: a profile, or a profile placed, joined or cut (a sketch's own lines)."""
    if step["op"] in SKETCH_PROFILES:
        return True
    return step["op"] in ("join", "cut", "intersect", "move") and isinstance(step.get("result"), (B.Sketch, B.Face))


def _features(summaries, timeline):
    """The history as a CAD tree reads it:
    - a solid made from a sketch and then cut from the body, or joined to it, is one Cut-Extrude
      or Boss-Extrude, the line that cut or joined it folded in;
    - lines that only draw a profile (`bloom = Circle(...)`, `bloom += Pos(...) * Circle(...)`) are
      the sketch of the extrude that makes a solid of it, under it, not features of their own;
    - every other line is a feature of its own (Fillet, Hole, Shell).
    Each feature keeps the rows of the history it stands for, in order."""
    row_of = {index: summary["key"] for summary in summaries for index in summary["steps"]}
    features, feature_of_row = [], {}
    for summary, row in zip(summaries, timeline):
        kind = summary["kind"]
        booleans = [step for step in row["steps"] if step["op"] in ("cut", "join", "intersect")]
        flat = bool(row["steps"]) and all(_is_flat(step) for step in row["steps"])
        if kind in ("Cut", "Join", "Intersect") and booleans and not flat:
            tool_rows = {row_of.get(tool) for step in booleans for tool in step.get("tools") or [] if tool is not None}
            targets = [feature_of_row.get(key) for key in tool_rows]
            if targets and all(target is not None and target["solid"] and not target["folded"] for target in targets):
                for target in {id(target): target for target in targets}.values():
                    target["kind"] = {"Cut": "Cut", "Join": "Boss", "Intersect": "Intersect"}[kind] + "-" + target["base"]
                    target["rows"].append(summary["key"])
                    target["folded"] = True
                feature_of_row[summary["key"]] = targets[0]
                continue
        makes = {step["op"] for step in row["steps"]} & {"extrude", "revolve", "sweep", "loft", "Box", "Cylinder"}
        # A cut or join whose tool is made on the same line is that tool's feature: a Cut-Extrude.
        inline = kind in ("Cut", "Join", "Intersect") and booleans and makes and not flat
        solid = kind in MAKES_SOLID or bool(inline)
        base = next((name for op, name in (("revolve", "Revolve"), ("sweep", "Sweep"), ("loft", "Loft")) if kind == name or op in makes),
                    "Extrude")
        # A rib keeps its sketch under it, as a CAD tree shows one.
        sketch = _sketch_of(row["steps"]) if solid or kind == "Rib" else None
        if solid and sketch is None:
            # A profile drawn over earlier lines (`bloom = Circle(...)`, `bloom += ...`): those
            # lines are this feature's sketch. They are the drawing lines just before it that
            # assign the variable it extrudes.
            drawn_name = re.search(r"(?:extrude|revolve)\(\s*([A-Za-z_]\w*)", summary["code"] or "")
            drawn = []
            for previous in reversed(features):
                if not previous["flat"] or not drawn_name or previous["name"] != drawn_name.group(1):
                    break
                drawn.insert(0, previous)
            if drawn:
                profile = next((step["args"][0][1] for step in row["steps"] if step["op"] in ("extrude", "revolve") and step["args"]), None)
                sketch = {"op": "Sketch", "label": "Sketch", "step": None, "plane": _plane_of(profile) if profile is not None else None,
                          "rows": [key for f in drawn for key in f["rows"]]}
                features = [f for f in features if f not in drawn]
        if inline:
            kind = {"Cut": "Cut", "Join": "Boss", "Intersect": "Intersect"}[kind]
        feature = {
            "key": summary["key"], "rows": [summary["key"]], "name": summary["name"], "count": summary["count"],
            "file": summary["file"], "line": summary["line"], "sketch": sketch,
            "kind": (f"{kind}-{base}" if inline else f"Boss-{base}") if solid else {"Move": "Move/Copy"}.get(kind, kind),
            "base": base, "solid": solid and not inline, "folded": bool(inline), "flat": flat,
        }
        if sketch and sketch.get("rows"):
            feature["rows"] = sketch["rows"] + feature["rows"]
        # A reference plane: where it is, for the view to draw it and a sketch to go on it.
        made_plane = ([step["result"] for step in row["steps"] if step["op"] == "plane"] or [None])[-1] if kind == "Plane" else None
        if isinstance(made_plane, B.Plane):
            feature["plane"] = {key: [float(vector.X), float(vector.Y), float(vector.Z)]
                                for key, vector in (("origin", made_plane.origin), ("x", made_plane.x_dir), ("z", made_plane.z_dir))}
        feature_of_row[summary["key"]] = feature
        features.append(feature)
    return [{key: value for key, value in feature.items() if key not in ("base", "solid", "folded", "flat")} for feature in features]


def _is_model(file, function):
    """Whether a project function is a part's model (`@step`, or any of the engine's decorators), so an
    assembly's call to it is a component."""
    try:
        return re.search(rf"^\s*@(?:step|xbf|model|stl|glb|threemf|dxf)\b[^\n]*\n(?:\s*@[^\n]*\n)*\s*def\s+{re.escape(function)}\s*\(",
                         _read(ROOT / file), re.M) is not None
    except (OSError, UnicodeDecodeError):
        return False


def _components(steps):
    """An assembly's parts: the operations split by the part model each runs in (`daisy_tray()`),
    when the assembly calls more than one; empty for a single part."""
    chains = [step["frames"] for step in steps if step["frames"]]
    if not chains:
        return []
    depth = 0
    while all(len(chain) > depth for chain in chains) and len({(c[depth]["file"], c[depth]["function"]) for c in chains}) == 1:
        depth += 1
    groups: dict[tuple, list] = {}
    for step in steps:
        frames = step["frames"]
        if len(frames) <= depth:
            return []
        groups.setdefault((frames[depth]["file"], frames[depth]["function"]), []).append(step)
    if len(groups) < 2 or not all(_is_model(file, function) for file, function in groups):
        return []
    return [{"file": file, "function": function, "steps": group} for (file, function), group in groups.items()]


def _component_step(component):
    """The STEP file a component's own part model writes, which Open Part opens: None for one that
    writes none."""
    # The engine's registry of the models scripts have defined, keyed as a model's address is.
    from cadgen.engine.model import _MODELS

    model = _MODELS.get(f"{(ROOT / component['file']).resolve()}::{component['function']}")
    if model is None:
        return None
    steps = [path for kind, path in model.targets() if kind == "step"]
    return str(steps[0]) if steps else None


def _bounds(shape):
    try:
        box = shape.bounding_box()
        return [[box.min.X, box.min.Y, box.min.Z], [box.max.X, box.max.Y, box.max.Z]]
    except Exception:
        return None


def _clean(item):
    return {key: value for key, value in item.items() if key != "expr"}


def _export_mesh(shape):
    handle, file = tempfile.mkstemp(suffix=".stl")
    os.close(handle)
    try:
        B.export_stl(shape, file, tolerance=0.02, angular_tolerance=0.2)
        return base64.b64encode(Path(file).read_bytes()).decode()
    finally:
        os.unlink(file)


def _units():
    project = ROOT / "project.json"
    for candidate in [project, *[p / "project.json" for p in ROOT.parents]]:
        try:
            data = json.loads(candidate.read_text(encoding="utf-8"))
            units = data.get("brief", {}).get("units") or data.get("units")
            if units in ("in", "mm"):
                return units
        except (OSError, ValueError):
            continue
    return None


def trace(request):
    global RECORDING, ROOT
    script = Path(request["script"]).resolve()
    ROOT = Path(request.get("root") or script.parent).resolve()
    # The project's modules are read afresh: this project's, and any an earlier trace loaded. So are
    # the design scripts a trace brought in from outside its project: left loaded, another project's
    # part of the same name would be read as that one.
    if not _BASELINE:
        _BASELINE.update(sys.modules)
    stale = [
        name
        for name, module in sys.modules.items()
        if isinstance(getattr(module, "__loader__", None), _ProjectLoader)
        or (getattr(module, "__file__", None) and _inside(module.__file__))
        or (name not in _BASELINE and getattr(module, "__file__", None) and _outside_design(module.__file__))
    ]
    for name in stale:
        del sys.modules[name]
    LITERALS.clear()
    FILES.clear()
    STEPS.clear()
    PLACED.clear()
    SKETCHES.clear()
    OUTSIDE.clear()
    sys.path[:0] = [str(script.parent)]
    try:
        spec = importlib.util.spec_from_file_location("__studio_part__", script, loader=_ProjectLoader(str(script)))
        module = importlib.util.module_from_spec(spec)
        printed = io.StringIO()
        with redirect_stdout(printed):
            spec.loader.exec_module(module)
            # The engine's models this script defines (`cadgen.engine.model.Model`), not those it imports.
            models = [
                value
                for value in vars(module).values()
                if getattr(value, "__xbf_model__", False) and Path(str(value.script)).resolve() == script
            ]
            if not models:
                return {"ok": False, "error": f"{script.name} declares no model (@step)."}
            model = models[0]
            RECORDING = True
            try:
                shape = model.function()
            finally:
                RECORDING = False
    except Exception:
        return {"ok": False, "error": traceback.format_exc(limit=6)}
    finally:
        sys.path.remove(str(script.parent))

    units = request.get("units") or _units() or ("in" if any(lit.get("name", "") and lit["name"].upper() in UNIT_NAMES for lit in LITERALS.values()) else "mm")
    steps = list(STEPS)
    # An assembly's history is its parts' histories, each read from that part's own model.
    components = _components(steps)
    if components:
        timeline, rows, level = [], [], 0
        for component in components:
            part_timeline, level = _rows(component["steps"])
            part_rows = [_row_summary(row, units) for row in part_timeline]
            component["features"] = _features(part_rows, part_timeline)
            timeline += part_timeline
            rows += part_rows
    else:
        timeline, level = _rows(steps)
        rows = [_row_summary(row, units) for row in timeline]
    if not rows and not components and OUTSIDE:
        # Said, rather than an empty tree that reads as a part with no features.
        return {"ok": False, "reason": "outside", "error": _outside_note()}
    sketches = _sketches(steps, rows)
    for component in components:
        hidden = _suppressed_in(component["file"], {component["function"]}, sketches)
        component["features"] = _editable(_with_suppressed(_with_sketches(component["features"], sketches, component), hidden),
                                          rows, steps, sketches, units)
    if not components:
        scopes: dict = {}
        for row in timeline:
            scopes.setdefault(row["file"], set()).add(row["function"])
        hidden = [item for rel, functions in scopes.items() for item in _suppressed_in(rel, functions, sketches)]
        features = _editable(_with_suppressed(_with_sketches(_features(rows, timeline), sketches), hidden), rows, steps, sketches, units)
    dimensions = _dimensions(steps, units)
    row_of = {index: row["key"] for row in rows for index in row["steps"]}
    for dimension in dimensions:
        dimension["row"] = row_of.get(dimension["step"])
    # The sizes an engineer changes: named numbers the part used, units aside.
    used = {leaf for step in steps for _, value in step["args"] if isinstance(value, (TFloat, TInt)) for leaf in leaves(value._e)}
    params = [
        {
            "id": literal["id"],
            "name": literal["name"],
            "file": literal["file"],
            "line": literal["line"],
            "text": literal["text"],
            "value": literal["value"],
            "unit": units if any(_scale_of_leaf(literal["id"], step) for step in steps) else "",
        }
        for literal in LITERALS.values()
        # Used by the part, or named at the top of its own script (a parameter added, not used yet).
        if literal["name"] and literal["name"].upper() not in UNIT_NAMES
        and (literal["id"] in used or (literal["name"].isupper() and Path(literal["path"]).resolve() == script))
    ]
    params.sort(key=lambda p: (p["file"], p["line"]))
    # The body and its making, for a command to act on (`commands.py`).
    _keep_version(str(script), shape, components)
    STATE[str(script)] = {"dimensions": {d["id"]: d for d in dimensions}, "rows": rows, "units": units,
                          "shape": shape, "steps": steps, "level": level, "components": [c["function"] for c in components]}
    # What a move of the rollback bar alone needs of this trace, while its files read the same.
    LAST.clear()
    LAST.update(script=str(script), root=ROOT, files=dict(FILES), features=[] if components else features,
                components=[{"file": c["file"]} for c in components])
    return {
        "ok": True,
        "script": str(script),
        "name": script.stem,
        "units": units,
        "files": dict(FILES),
        "params": params,
        "rows": [{**row, "inputs": [_clean(item) for item in row["inputs"]]} for row in rows],
        # The same history as a CAD tree reads it, and the part's extent for the origin's planes.
        "features": [] if components else features,
        "sketches": sketches,
        "components": [{"name": c["function"], "file": c["file"], "features": c["features"], "step": _component_step(c)} for c in components],
        # An assembly's mates, as its joints are labelled (`mates.py`), for the design tree's Mates.
        "mates": _mates_of(script, [c["function"] for c in components]) if components else [],
        "bounds": _bounds(shape) if isinstance(shape, B.Shape) else None,
        # The part's color as it shows, for Appearance to open on.
        "color": None if components else _shown_color(shape),
        "dimensions": [_clean(d) for d in dimensions],
        # The viewer draws the model from its STEP; a page of its own asks for the mesh.
        "mesh": _export_mesh(shape) if request.get("mesh", True) and isinstance(shape, B.Shape) else None,
        "printed": printed.getvalue()[-2000:],
    }


def _shown_color(shape):
    """A shape's color as the hex it shows on screen (its channels are linear), or None."""
    from cadgen.color import linear_to_srgb

    color = getattr(shape, "color", None) if isinstance(shape, B.Shape) else None
    if color is None:
        return None
    try:
        red, green, blue, *_ = tuple(color)
    except Exception:  # noqa: BLE001 - a color it cannot read shows none
        return None
    return "#" + "".join(f"{round(max(0.0, min(1.0, linear_to_srgb(channel))) * 255):02X}" for channel in (red, green, blue))


def _scale_of_leaf(literal_id, step):
    for _, value in step["args"]:
        if isinstance(value, (TFloat, TInt)) and literal_id in leaves(value._e) and _scale_of(value):
            return True
    return False


# ---------------------------------------------------------------------------------------------
# Edits: one number in the source, then the part traced again.


def _changed_since(path, expected_hash):
    return bool(expected_hash) and hashlib.sha256(Path(path).read_bytes()).hexdigest()[:16] != expected_hash


def _write_literal(literal, text, expected_hash):
    path = Path(literal["path"])
    source = _read(path)
    if _changed_since(path, expected_hash):
        raise RuntimeError(f"{literal['file']} changed since the editor read it. Look again and retry.")
    lines = source.splitlines(keepends=True)
    row = lines[literal["line"] - 1].encode()
    old = row[literal["col"] : literal["end"]].decode()
    if old != literal["text"]:
        raise RuntimeError(f"{literal['file']} line {literal['line']} no longer reads {literal['text']}.")
    lines[literal["line"] - 1] = (row[: literal["col"]] + text.encode() + row[literal["end"] :]).decode()
    _write(path, "".join(lines))


def _solve(expr, leaf, target):
    """The value of `leaf` that makes `expr` equal `target` (secant steps; exact for the linear
    formulas sizes usually go through)."""
    x0 = LITERALS[leaf]["value"]
    x1 = x0 * 1.1 + 1e-3
    f0, f1 = evaluate(expr, (leaf, x0)) - target, evaluate(expr, (leaf, x1)) - target
    for _ in range(30):
        if abs(f1) < 1e-9:
            return x1
        if f1 == f0:
            break
        x0, x1 = x1, x1 - f1 * (x1 - x0) / (f1 - f0)
        f0, f1 = f1, evaluate(expr, (leaf, x1)) - target
    if abs(f1) < 1e-6 * max(1, abs(target)):
        return x1
    raise RuntimeError("That value cannot be reached by changing this number.")


# What a change request may change; one with none of them only moves the rollback bar. A preview
# changes nothing, but is not a move of the bar either.
_CHANGES = ("command", "preview", "mass", "draft_check", "interference", "parameter", "rename", "appearance", "mate", "compare", "splice", "sketch", "remove", "suppress", "literal", "dimension",
            "input")


def edit(request):
    if not any(key in request for key in _CHANGES):
        return trace(request)
    if isinstance(request.get("preview"), dict):
        return preview(request)
    if isinstance(request.get("mass"), dict):
        return mass_properties(request)
    if isinstance(request.get("draft_check"), dict):
        return draft_analysis(request)
    if isinstance(request.get("interference"), dict):
        return interference_check(request)
    if isinstance(request.get("command"), dict):
        return command(request)
    if isinstance(request.get("splice"), dict):
        return splice(request)
    if isinstance(request.get("sketch"), dict):
        return sketch_edit(request)
    if isinstance(request.get("remove"), dict):
        return remove(request)
    if isinstance(request.get("suppress"), dict):
        return suppress(request)
    if isinstance(request.get("rename"), dict):
        return rename(request)
    if isinstance(request.get("parameter"), dict):
        return add_parameter(request)
    if isinstance(request.get("appearance"), dict):
        return appearance(request)
    if isinstance(request.get("mate"), dict):
        return mate(request)
    if isinstance(request.get("compare"), dict):
        return compare(request)
    script = str(Path(request["script"]).resolve())
    if script not in STATE:
        traced = trace(request)
        if not traced["ok"]:
            return traced
    files = request.get("files") or {}
    if "literal" in request:
        literal = LITERALS.get(request["literal"])
        if literal is None:
            return {"ok": False, "error": "That number is no longer in the source. Look again."}
        try:
            value = parse_number(request["text"])
        except Exception:
            return {"ok": False, "error": f"{request['text']} is not a number."}
        old_value = literal["value"]
        _write_literal(literal, literal_text(value, literal["text"]), files.get(literal["file"]))
        change = {"literal": literal["id"], "name": literal["name"] or literal["text"], "file": literal["file"], "line": literal["line"], "from": literal["text"], "to": literal_text(value, literal["text"]), "was": old_value}
    else:
        state = STATE[script]
        if "input" in request:
            # A size in a timeline row, edited like a dimension: solved back to the number behind it.
            row = next((row for row in state["rows"] if row["key"] == request["input"].get("row")), None)
            index = request["input"].get("index", -1)
            dimension = row["inputs"][index] if row is not None and 0 <= index < len(row["inputs"]) else None
        else:
            dimension = state["dimensions"].get(request["dimension"])
        if dimension is None:
            return {"ok": False, "error": "That size is no longer on the part. Look again."}
        # A formula's named sizes are what an engineer changes; its bare coefficients (`2*WALL`) are not.
        named = [leaf for leaf in dimension["leaves"] if LITERALS[leaf]["name"]]
        candidates = named or dimension["leaves"]
        leaf = request.get("leaf") or (candidates[0] if len(candidates) == 1 else None)
        if leaf is None:
            return {
                "ok": False,
                "choose": [
                    {"id": c, "name": LITERALS[c]["name"] or LITERALS[c]["text"], "file": LITERALS[c]["file"], "line": LITERALS[c]["line"]}
                    for c in candidates
                ],
            }
        try:
            typed = parse_number(request["text"])
        except Exception:
            return {"ok": False, "error": f"{request['text']} is not a number."}
        is_length = dimension.get("length", True)
        target = typed * 25.4 if state["units"] == "in" and is_length else typed
        expr = dimension["expr"]
        literal = LITERALS[leaf]
        value = _solve(expr, leaf, target)
        text = literal_text(round(value, 6), literal["text"])
        _write_literal(literal, text, files.get(literal["file"]))
        change = {"literal": literal["id"], "name": literal["name"] or literal["text"], "file": literal["file"], "line": literal["line"], "from": literal["text"], "to": text, "was": literal["value"]}
    traced = trace(request)
    traced["change"] = change
    return traced


# ---------------------------------------------------------------------------------------------
# Commands: a line of build123d written after the part's body (`commands.py`), then the part
# traced again. The line stands only if it runs and makes the feature asked for, on the faces or
# edges selected; otherwise the file is put back as it was.


def _refused_change(files):
    """Why a change is refused when a file it read changed since: the agent's edit, another view's."""
    for rel, digest in (files or {}).items():
        if FILES.get(rel) not in (None, digest):
            return {"ok": False, "error": f"{rel} changed since the editor read it. Look again and retry."}
    return None


# The commands that take material away, checked to take some.
_CUTS = ("cut", "revolve_cut", "sweep_cut", "loft_cut", "hole")


def _volume(shape):
    """A shape's solids' volume, or None when it has none to weigh."""
    try:
        solids = shape.solids() if isinstance(shape, B.Shape) else []
        return sum(solid.volume for solid in solids) if solids else None
    except Exception:  # noqa: BLE001 - a shape the kernel cannot weigh is not checked
        return None


def _check(script, traced, plan, scale):
    from cadgen.edit import commands

    if not traced.get("ok"):
        return commands.failure_words(plan.command, traced.get("error") or "")
    key = f"{plan.rel}:{plan.line}"
    row = next((row for row in traced["rows"] if row["key"] == key), None)
    made = [STATE[script]["steps"][index] for index in row["steps"]] if row else []
    step = next((step for step in made if step["op"] in plan.records), None)
    if step is None:
        return "The new line did not make the feature, so nothing changed. Ask the agent to make it."
    if plan.selected and not commands.same_items(dict(step["args"]).get(plan.selected["argument"]), plan.selected["items"], scale):
        return "The new line picked other faces or edges than the ones selected, so nothing changed."
    return None


def _planned(request, spec):
    """A command (``spec``) made into the part's script as the last trace read it (`commands.plan`),
    at the rollback bar unless it writes a feature again; or the words of why it cannot be."""
    from cadgen.edit import commands

    from cadgen.edit import sketching

    state = STATE[str(Path(request["script"]).resolve())]

    def resolved(drawn):
        # A sketch as the part makes it now, with how many regions it makes: one is made a solid
        # of as its face, more as its faces, none (an open sketch) is a path, a rib's lines or a wall.
        path = (ROOT / str(drawn.get("file") or "")).resolve()
        entry = SKETCHES.get((str(path), int(drawn.get("line") or 0)))
        if entry is None:
            raise LookupError(drawn)
        try:
            regions = len(entry["sketch"].faces())
        except _sketch_api.SketchError:
            regions = 0
        # Its plane, for a command to tell which side of it what it ends on lies (Direction 2 the other way).
        return path, entry, {**drawn, "name": entry["sketch"].name, "regions": regions, "frame": entry["sketch"].frame()}

    command = spec.get("command")
    try:
        if command in ("extrude", "cut", "revolve", "revolve_cut", "rib") and isinstance(spec.get("sketch"), dict):
            path, entry, drawn = resolved(spec["sketch"])
            spec = {**spec, "sketch": drawn}
            # A revolve's axis, a line of the sketch, as the script names it (`line5`).
            if command in ("revolve", "revolve_cut") and drawn.get("axis"):
                block = sketching.find_block(_read(path), int(drawn["line"]), str(path))
                names = sketching.Names(block, _sketch_view(entry["sketch"], path, int(drawn["line"]), entry["function"])["state"])
                spec["sketch"]["axis_code"] = names.curve(str(drawn["axis"]))
        if command in ("sweep", "sweep_cut", "loft", "loft_cut"):
            spec = {**spec, "sketches": [resolved(each)[2] for each in spec.get("sketches") or [] if isinstance(each, dict)]}
    except LookupError:
        return None, "That sketch is not made when the part runs. Pick it again in the design tree."
    except (_sketch_api.SketchError, sketching.SketchEditError) as error:
        return None, str(error)
    bar = _bar_place(request.get("bar"))
    try:
        return commands.plan(spec, steps=state["steps"], shape=state["shape"], level=state["level"],
                             units=state["units"], literals=LITERALS, root=ROOT, parse=parse_number,
                             bar=bar[1] if bar and not spec.get("replace") else None), None
    except commands.CommandError as error:
        return None, str(error)


def command(request):
    from cadgen.edit import commands

    script = str(Path(request["script"]).resolve())
    traced = trace(request)
    if not traced["ok"]:
        return traced
    refused = _refused_change(request.get("files"))
    if refused:
        return refused
    state = STATE[script]
    spec = request["command"]
    plan, why = _planned(request, spec)
    if plan is None:
        return {"ok": False, "error": why}
    scale = state["shape"].bounding_box().diagonal or 1.0
    before = _volume(state["shape"])
    _write(plan.path, plan.new)
    after = trace(request)
    failure = _check(script, after, plan, scale)
    # A cut or a hole that takes nothing away is refused, as SolidWorks refuses a cut that misses
    # the part, rather than written as a feature that does nothing.
    if not failure and plan.command in _CUTS and before:
        now = _volume(STATE[script]["shape"])
        if now is not None and abs(before - now) <= 1e-9 * before:
            words = "The hole" if plan.command == "hole" else "The cut"
            failure = (f"{words} does not reach the part, so nothing changed. "
                       f"{'Move it onto the part' if plan.command == 'hole' else 'Reverse its direction, or check where its sketch is'}.")
    if failure:
        _write(plan.path, plan.old)
        trace(request)
        return {"ok": False, "error": failure}
    after["change"] = {
        "kind": "command",
        "command": plan.command,
        # Edit Feature: the feature's own line written again, rather than a new one.
        "edited": bool(spec.get("replace")),
        **plan.summary,
        "file": plan.rel,
        "line": plan.line,
        "row": f"{plan.rel}:{plan.line}",
        "code": plan.code,
        # Undo puts the lines back as they were; Redo writes them again.
        "undo": {"file": plan.rel, "hunks": commands.hunks(plan.new, plan.old)},
        "redo": {"file": plan.rel, "hunks": commands.hunks(plan.old, plan.new)},
    }
    return after


# ---------------------------------------------------------------------------------------------
# Preview, as a CAD tool previews a feature while its PropertyManager is open: what a command's OK
# would make, made without writing it. The command's line is planned as OK plans it, the part is
# traced with that text in place of the file's own (`UNSAVED`) and checked as OK checks it, and
# the feature's change to the body is answered as the view draws it over the model: the material
# it adds and the material it takes away. The last trace is put back after, so every request that
# follows reads the part as it is.


def _as_last_traced(script, root):
    """Whether the last trace is of ``script`` in ``root`` and its files still read as it read them."""
    if LAST.get("script") != str(script) or LAST.get("root") != root:
        return False
    try:
        return all(_hash(root / rel) == digest for rel, digest in LAST["files"].items())
    except OSError:
        return False


def _kept_trace():
    """What the last trace left, for a preview to put back once it has traced the part its way."""
    return {"literals": dict(LITERALS), "files": dict(FILES), "steps": list(STEPS), "placed": dict(PLACED),
            "sketches": dict(SKETCHES), "outside": set(OUTSIDE), "state": dict(STATE), "last": dict(LAST), "root": ROOT}


def _put_back(kept):
    global ROOT
    for held, value in ((LITERALS, kept["literals"]), (FILES, kept["files"]), (PLACED, kept["placed"]),
                        (SKETCHES, kept["sketches"]), (STATE, kept["state"]), (LAST, kept["last"])):
        held.clear()
        held.update(value)
    STEPS[:] = kept["steps"]
    OUTSIDE.clear()
    OUTSIDE.update(kept["outside"])
    ROOT = kept["root"]


def _seams(shape):
    """The edges a closed face meets itself along (a cylinder's seam): where it is cut to be
    parametrized, not an edge of the part, so the view does not draw them."""
    from OCP.BRep import BRep_Tool
    from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE
    from OCP.TopExp import TopExp
    from OCP.TopoDS import TopoDS
    from OCP.TopTools import TopTools_IndexedDataMapOfShapeListOfShape

    faces = TopTools_IndexedDataMapOfShapeListOfShape()
    TopExp.MapShapesAndAncestors_s(shape.wrapped, TopAbs_EDGE, TopAbs_FACE, faces)
    found = []
    for index in range(1, faces.Extent() + 1):
        edge = TopoDS.Edge_s(faces.FindKey(index))
        if any(BRep_Tool.IsClosed_s(edge, TopoDS.Face_s(face)) for face in faces.FindFromIndex(index)):
            found.append(edge)
    return found


def _is_seam(edge, seams):
    # OCP compares shapes as Python objects: the same edge, found twice, is the same by `IsSame`.
    return any(seam.IsSame(edge.wrapped) for seam in seams)


# More than this many triangles a preview draws as its edges alone.
PREVIEW_TRIANGLES = 30_000


def _drawn(shape, tolerance):
    """A solid as the view draws a preview of it over the model: its triangles (``positions``, three
    numbers a corner, and ``triangles``, three corners each) and its edges (each the points along
    it), in the part's millimetres. None for no solid."""
    if shape is None or not shape.solids():
        return None
    vertices, triangles = shape.tessellate(tolerance, 0.25)
    if len(triangles) > PREVIEW_TRIANGLES:
        vertices, triangles = [], []
    seams = _seams(shape)
    edges = []
    for edge in shape.edges():
        if _is_seam(edge, seams):
            continue
        steps = 1 if edge.geom_type == B.GeomType.LINE else max(8, min(64, round(edge.length / (tolerance * 8))))
        points = edge.positions([index / steps for index in range(steps + 1)])
        edges.append([round(value, 4) for point in points for value in (point.X, point.Y, point.Z)])
    return {"positions": [round(value, 4) for vertex in vertices for value in (vertex.X, vertex.Y, vertex.Z)],
            "triangles": [corner for triangle in triangles for corner in triangle], "edges": edges}


def _change_drawn(before, made, scale):
    """What a feature does to the body, as its preview draws it: the material it adds (``added``,
    amber) and the material it takes away (``removed``, red), each a solid (`_drawn`) or None."""
    tolerance = max(0.005, scale * 0.001)
    try:
        removed, added = before - made, made - before
        return {"removed": _drawn(removed, tolerance), "added": _drawn(added, tolerance), "error": None}
    except Exception:  # noqa: BLE001 - a boolean the kernel cannot settle leaves only the preview undrawn
        return {"removed": None, "added": None, "error": "The feature can be made, but its preview cannot be drawn."}


def preview(request):
    from cadgen.edit import commands

    script = Path(request["script"]).resolve()
    root = Path(request.get("root") or script.parent).resolve()
    # The part as it is: the last trace of it, while its files read the same; else read again.
    if not _as_last_traced(script, root) or str(script) not in STATE:
        traced = trace(request)
        if not traced["ok"]:
            return traced
    refused = _refused_change(request.get("files"))
    if refused:
        return refused
    state = STATE[str(script)]
    plan, why = _planned(request, request["preview"])
    if plan is None:
        return {"ok": True, "preview": {"error": why}}
    scale = state["shape"].bounding_box().diagonal or 1.0
    kept = _kept_trace()
    UNSAVED[str(plan.path.resolve())] = plan.new
    try:
        after = trace({**request, "mesh": False})
        failure = _check(str(script), after, plan, scale)
        if failure:
            return {"ok": True, "preview": {"error": failure}}
        made = STATE[str(script)]
        # The body the new line works on, and the body it makes: the body just before its line
        # and just after it.
        before = commands.shape_at(made["steps"], made["shape"], made["level"], plan.rel, plan.line)
        result = commands.shape_at(made["steps"], made["shape"], made["level"], plan.rel, plan.line + 1)
        if before is None or result is None:
            return {"ok": True, "preview": {"error": "The feature can be made, but its preview cannot be drawn."}}
        return {"ok": True, "preview": _change_drawn(before, result, scale)}
    finally:
        UNSAVED.clear()
        _put_back(kept)


def _material(request):
    """The material the project's brief names: as Studio's record says it (``material``), else in a
    ``project.json`` of the project's own folders."""
    named = str(request.get("material") or "").strip()
    if named:
        return named
    for candidate in [ROOT / "project.json", *[folder / "project.json" for folder in ROOT.parents]]:
        try:
            data = json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        brief = data.get("brief") if isinstance(data, dict) else None
        if isinstance(brief, dict) and isinstance(brief.get("material"), str) and brief["material"].strip():
            return brief["material"].strip()
    return ""


def mass_properties(request):
    """Mass Properties, as SolidWorks' Evaluate tab works them out: the part's volume, its surface
    area, its center of mass and its overall size, in its millimetres, from its solids as the last
    trace made them (at the rollback bar, the part as it is there); and the materials it could be
    made of, each with its density in g/cm^3, the project's own (as its brief names it) said when
    the table has it. Its mass is its volume times the density of the material picked."""
    from cadgen._internal.fea.materials import MATERIALS, lookup_material
    from cadgen.edit import commands

    script = Path(request["script"]).resolve()
    root = Path(request.get("root") or script.parent).resolve()
    if not _as_last_traced(script, root) or str(script) not in STATE:
        traced = trace(request)
        if not traced["ok"]:
            return traced
    made = STATE[str(script)]
    shape = made["shape"]
    rel, _, line = str((request.get("bar") or {}).get("before") or "").rpartition(":") if isinstance(request.get("bar"), dict) else ("", "", "")
    if rel and line.isdigit():
        shape = commands.shape_at(made["steps"], made["shape"], made["level"], rel, int(line)) or shape
    solids = list(shape.solids()) if isinstance(shape, B.Shape) else []
    volume = sum(solid.volume for solid in solids)
    if not solids or volume <= 0:
        return {"ok": True, "mass": {"error": "This part has no solid to weigh."}}
    # The center of mass of them all: each solid's, by how much of the volume it holds.
    centers = [(solid.center(B.CenterOf.MASS), solid.volume) for solid in solids]
    center = [sum(getattr(point, axis) * share for point, share in centers) / volume for axis in ("X", "Y", "Z")]
    box = shape.bounding_box()
    try:
        own = lookup_material(_material(request)) if _material(request) else None
    except ValueError:
        own = None
    return {"ok": True, "mass": {
        "volume": volume,
        "area": sum(face.area for face in shape.faces()),
        "center": center,
        "box": [[box.min.X, box.min.Y, box.min.Z], [box.max.X, box.max.Y, box.max.Z]],
        "solids": len(solids),
        "material": next((key for key, value in MATERIALS.items() if value is own), None),
        "materials": [{"key": key, "name": value.name, "density": round(value.density * 1e9, 6)}
                      for key, value in sorted(MATERIALS.items(), key=lambda item: item[1].name)],
    }}


# More than this many triangles a Draft Analysis coarsens its mesh to stay under.
DRAFT_TRIANGLES = 60_000


def draft_analysis(request):
    """Draft Analysis, as SolidWorks shows a molded part's: each triangle of the part classed by its
    draft against the direction of pull (``pull``, a unit vector; ``angle``, the least draft in
    degrees): positive (it faces the pull, steeper than the angle), negative (faces away), or
    needing draft (between, the walls a mold would drag on). Answers the triangles as the view
    shades them (``positions``, three numbers a corner, three corners a triangle, no corner shared)
    with each triangle's class (0 positive, 1 negative, 2 needs draft) and each class's area."""
    script = Path(request["script"]).resolve()
    root = Path(request.get("root") or script.parent).resolve()
    if not _as_last_traced(script, root) or str(script) not in STATE:
        traced = trace(request)
        if not traced["ok"]:
            return traced
    shape = STATE[str(script)]["shape"]
    spec = request["draft_check"]
    if not isinstance(shape, B.Shape) or not shape.solids():
        return {"ok": True, "draft_check": {"error": "This part has no solid to check."}}
    try:
        pull = B.Vector(*[float(value) for value in spec.get("pull") or (0, 0, 1)])
        least = math.radians(float(spec.get("angle", 1)))
    except (TypeError, ValueError):
        return {"ok": True, "draft_check": {"error": "Draft Analysis needs a direction of pull and an angle."}}
    if pull.length == 0:
        return {"ok": True, "draft_check": {"error": "Pick a direction of pull."}}
    pull = pull.normalized()
    tolerance = max(0.01, shape.bounding_box().diagonal * 0.002)
    for _ in range(4):
        vertices, triangles = shape.tessellate(tolerance, 0.3)
        if len(triangles) <= DRAFT_TRIANGLES:
            break
        tolerance *= 2
    positions, classes, areas = [], [], [0.0, 0.0, 0.0]
    limit = math.sin(least)
    for a, b, c in triangles:
        pa, pb, pc = vertices[a], vertices[b], vertices[c]
        normal = (pb - pa).cross(pc - pa)
        double = normal.length
        if double <= 0:
            continue
        # A face's draft is how far its outward normal leans along the pull: its sine is the dot.
        lean = normal.dot(pull) / double
        kind = 0 if lean >= limit else 1 if lean <= -limit else 2
        classes.append(kind)
        areas[kind] += double / 2
        positions += [round(value, 4) for point in (pa, pb, pc) for value in (point.X, point.Y, point.Z)]
    return {"ok": True, "draft_check": {"positions": positions, "classes": classes,
                                         "areas": {"positive": areas[0], "negative": areas[1], "needs": areas[2]}}}


def interference_check(request):
    """Interference Detection, as SolidWorks' Evaluate tab runs it on an assembly: every two of its
    parts (or of a part's bodies) whose solids overlap, with the volume they share, largest first,
    and that shared material drawn (``removed``, red, as a preview draws a cut). Touching is not
    interfering: only overlap with volume counts."""
    from cadgen.geometry import overlap_volume

    script = Path(request["script"]).resolve()
    root = Path(request.get("root") or script.parent).resolve()
    if not _as_last_traced(script, root) or str(script) not in STATE:
        traced = trace(request)
        if not traced["ok"]:
            return traced
    shape = STATE[str(script)]["shape"]
    if not isinstance(shape, B.Shape):
        return {"ok": True, "interference": {"error": "This model has no solids to check."}}
    children = [child for child in (getattr(shape, "children", None) or []) if isinstance(child, B.Shape) and child.solids()]
    # Each part by the name the design tree gives it (its part function), its label, else its place.
    traced = STATE[str(script)].get("components") or []
    label = lambda index, child: child.label or (traced[index] if len(traced) == len(children) else f"Part{index + 1}")  # noqa: E731
    named = ([(label(index, child), child) for index, child in enumerate(children)] if len(children) > 1
             else [(f"Body{index + 1}", solid) for index, solid in enumerate(shape.solids())])
    if len(named) < 2:
        return {"ok": True, "interference": {"pairs": [], "parts": len(named), "shown": None}}
    scale = shape.bounding_box().diagonal or 1.0
    floor = (scale * 1e-6) ** 3
    pairs, shared = [], []
    for i in range(len(named)):
        for j in range(i + 1, len(named)):
            (name_a, a), (name_b, b) = named[i], named[j]
            if not a.bounding_box().overlaps(b.bounding_box()):
                continue  # boxes apart: nothing to share
            volume = 0.0
            for solid_a in a.solids():
                for solid_b in b.solids():
                    try:
                        volume += overlap_volume(solid_a, solid_b)
                    except Exception:  # noqa: BLE001 - a pair the kernel cannot settle is left out, not called clear
                        continue
            if volume > floor:
                pairs.append({"a": name_a, "b": name_b, "volume": volume})
                try:
                    shared.append(a & b)
                except Exception:  # noqa: BLE001 - listed, only not drawn
                    pass
    pairs.sort(key=lambda pair: -pair["volume"])
    shown = None
    if shared:
        together = shared[0] if len(shared) == 1 else B.Compound(children=shared)
        shown = {"removed": _drawn(together, max(0.005, scale * 0.001)), "added": None, "error": None}
    return {"ok": True, "interference": {"pairs": pairs, "parts": len(named), "shown": shown}}


def _feature_lines(feature, rel, title, verb):
    """The lines of the script that make a feature, the sketch it was made from left out: it stays,
    as SolidWorks keeps an absorbed sketch."""
    from cadgen.edit import deleting

    drawn = set((feature.get("sketch") or {}).get("rows") or [])
    lines = []
    for row in feature["rows"]:
        if row in drawn:
            continue
        row_file, _, row_line = row.rpartition(":")
        if row_file != rel:
            raise deleting.DeleteError(f"{title} is made across files. Ask the agent to {verb} it.")
        lines.append(int(row_line))
    return lines


def remove(request):
    """A feature of the design tree deleted, as SolidWorks' Delete takes one out (`deleting.py`):
    its lines taken out of the script, the sketch it was made from kept, or a sketch of its own
    taken out with its lines; then the part traced again, and put back if it no longer builds."""
    from cadgen.edit import commands, deleting

    traced = trace(request)
    if not traced["ok"]:
        return traced
    refused = _refused_change(request.get("files"))
    if refused:
        return refused
    spec = request["remove"]
    key = str(spec.get("feature") or "")
    title = str(spec.get("title") or "That feature")
    features = traced["features"] or [feature for component in traced["components"] for feature in component["features"]]
    feature = next((feature for feature in features if feature["key"] == key), None)
    if feature is None:
        return {"ok": False, "error": f"{title} is no longer in the design tree. Look again."}
    rel = str(feature.get("file") or "")
    path = (ROOT / rel).resolve()
    try:
        path.relative_to(ROOT)
    except ValueError:
        return {"ok": False, "error": f"{title} is not made in this project, so edit mode cannot delete it."}
    old = _read(path)
    try:
        if feature["kind"] == "Sketch":
            new, first = deleting.delete_sketch(old, int(feature["line"]), title, str(path))
        elif feature.get("suppressed"):
            new, first = deleting.delete_suppressed(old, int(feature["line"]), title)
        else:
            new, first = deleting.delete(old, _feature_lines(feature, rel, title, "remove"), title, str(path))
    except deleting.DeleteError as error:
        refusal = {"ok": False, "error": str(error)}
        if error.dependents:
            refusal["dependents"] = {**error.dependents, "file": rel}
        return refusal
    except SyntaxError:
        return {"ok": False, "error": f"{rel} does not parse, so edit mode cannot delete {title}."}
    _write(path, new)
    after = trace(request)
    if not after.get("ok"):
        _write(path, old)
        trace(request)
        return {"ok": False, "error": f"The part does not build without {title}, so nothing changed. Ask the agent to remove it."}
    after["change"] = {
        "kind": "delete",
        "feature": key,
        "title": title,
        "file": rel,
        "line": first,
        "undo": {"file": rel, "hunks": commands.hunks(new, old)},
        "redo": {"file": rel, "hunks": commands.hunks(old, new)},
    }
    return after


def suppress(request):
    """Suppress or Unsuppress on a feature of the design tree, as SolidWorks' sets one aside
    (`deleting.py`): its lines kept in the script as comments, or put back as they were; then the
    part traced again, and the script put back if it no longer builds."""
    from cadgen.edit import commands, deleting

    traced = trace(request)
    if not traced["ok"]:
        return traced
    refused = _refused_change(request.get("files"))
    if refused:
        return refused
    spec = request["suppress"]
    key = str(spec.get("feature") or "")
    title = str(spec.get("title") or "That feature")
    on = spec.get("on", True) is not False
    features = traced["features"] or [feature for component in traced["components"] for feature in component["features"]]
    feature = next((feature for feature in features if feature["key"] == key), None)
    if feature is None:
        return {"ok": False, "error": f"{title} is no longer in the design tree. Look again."}
    if feature["kind"] == "Sketch":
        return {"ok": False, "error": f"A sketch is not suppressed on its own. Suppress the feature made from {title}, or delete it."}
    if bool(feature.get("suppressed")) == on:
        return {"ok": False, "error": f"{title} is already {'suppressed' if on else 'in the part'}. Look again."}
    rel = str(feature.get("file") or "")
    path = (ROOT / rel).resolve()
    try:
        path.relative_to(ROOT)
    except ValueError:
        return {"ok": False, "error": f"{title} is not made in this project, so edit mode cannot suppress it."}
    old = _read(path)
    try:
        if on:
            new, first = deleting.suppress(old, _feature_lines(feature, rel, title, "suppress"), title, feature["kind"], str(path))
        else:
            new, first = deleting.unsuppress(old, int(feature["line"]), title)
    except deleting.DeleteError as error:
        refusal = {"ok": False, "error": str(error)}
        if error.dependents:
            refusal["dependents"] = {**error.dependents, "file": rel}
        return refusal
    except SyntaxError:
        return {"ok": False, "error": f"{rel} does not parse, so edit mode cannot suppress {title}."}
    _write(path, new)
    after = trace(request)
    if not after.get("ok"):
        _write(path, old)
        trace(request)
        return {"ok": False, "error": f"The part does not build without {title}, so nothing changed. Ask the agent to suppress it." if on
                else f"The part does not build with {title} back, so nothing changed. Ask the agent to look at it."}
    after["change"] = {
        "kind": "suppress",
        "on": on,
        "feature": key,
        "title": title,
        "file": rel,
        "line": first,
        "undo": {"file": rel, "hunks": commands.hunks(new, old)},
        "redo": {"file": rel, "hunks": commands.hunks(old, new)},
    }
    return after


def add_parameter(request):
    """Add Parameter, as SolidWorks' Equations adds a global variable: ``NAME = value`` written at the
    top of the part's script, after its imports and the sizes named there already, for dimensions
    and commands to use by name. The value is a number, or the part's sizes with plain arithmetic.
    Nothing is built: the part is the same until something uses it."""
    from cadgen.edit import commands, sketching

    traced = trace(request)
    if not traced["ok"]:
        return traced
    refused = _refused_change(request.get("files"))
    if refused:
        return refused
    spec = request["parameter"]
    name = "_".join(str(spec.get("name") or "").upper().split())
    if not re.fullmatch(r"[A-Z][A-Z0-9_]{0,39}", name):
        return {"ok": False, "error": "A parameter's name is letters, digits and underscores, starting with a letter: WALL, BOSS_DIAMETER."}
    script = Path(request["script"]).resolve()
    rel = str(script.relative_to(ROOT)) if script.is_relative_to(ROOT) else script.name
    old = _read(script)
    tree = ast.parse(old)
    known = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}
    known |= {(alias.asname or alias.name).split(".")[0] for node in ast.walk(tree)
              if isinstance(node, (ast.Import, ast.ImportFrom)) for alias in node.names}
    if name in known:
        return {"ok": False, "error": f"This part has a {name} already. Pick another name."}
    try:
        value = sketching._typed(spec.get("value"))
    except sketching.SketchEditError:
        return {"ok": False, "error": "A parameter's value is a number, or the part's sizes with plain arithmetic."}
    missing = [each for each in sketching.typed_names(value) if each not in known]
    if missing:
        return {"ok": False, "error": f"This part has no size called {missing[0]}."}
    # After the imports and the sizes the script names before its first function.
    at = 0
    for index, node in enumerate(tree.body):
        named = isinstance(node, ast.Assign) and all(isinstance(target, ast.Name) and target.id.isupper() for target in node.targets)
        docstring = index == 0 and isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant)
        if isinstance(node, (ast.Import, ast.ImportFrom)) or named or docstring:
            at = node.end_lineno
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            break
    edits = commands.Edits(old)
    edits.after(at, [f"{name} = {value}"])
    new = edits.apply()
    _write(script, new)
    after = trace(request)
    if not after.get("ok"):
        _write(script, old)
        trace(request)
        return {"ok": False, "error": f"The part does not read with {name} added, so nothing changed."}
    after["change"] = {
        "kind": "parameter", "name": name, "value": value, "file": rel, "line": at + 1, "build": False,
        "undo": {"file": rel, "hunks": commands.hunks(new, old)},
        "redo": {"file": rel, "hunks": commands.hunks(old, new)},
    }
    return after


def rename(request):
    """Rename, on a feature or a sketch of the design tree, as SolidWorks' tree renames one: a
    feature's name is the comment at the end of its line (``part -= ...  # Cable notch``), and an
    empty name gives it back the tree's own (Cut-Extrude2); a sketch's is its Sketch's own name
    (``Sketch("Cable notch", ...)``). No two share a name. Nothing is built: the part is the same."""
    from cadgen.edit import commands, sketching

    traced = trace(request)
    if not traced["ok"]:
        return traced
    refused = _refused_change(request.get("files"))
    if refused:
        return refused
    spec = request["rename"]
    title = str(spec.get("title") or "That feature")
    name = " ".join(str(spec.get("name") or "").split())
    if len(name) > 60:
        return {"ok": False, "error": "A name is 60 characters at most."}
    features = traced["features"] or [feature for component in traced["components"] for feature in component["features"]]
    taken = {str(feature.get("named") or "").lower() for feature in features}
    taken |= {str((feature.get("sketch") or {}).get("name") or "").lower() for feature in features}
    if name and name.lower() in taken - {title.lower()}:
        return {"ok": False, "error": f"Another feature is named {name}. Pick another name."}
    drawn = spec.get("sketch") if isinstance(spec.get("sketch"), dict) else None
    if drawn:
        rel, line = str(drawn.get("file") or ""), int(drawn.get("line") or 0)
    else:
        feature = next((each for each in features if each["key"] == str(spec.get("feature") or "")), None)
        if feature is None:
            return {"ok": False, "error": f"{title} is no longer in the design tree. Look again."}
        rel, line = str(feature.get("file") or ""), int(feature.get("line") or 0)
    path = (ROOT / rel).resolve()
    try:
        path.relative_to(ROOT)
    except ValueError:
        return {"ok": False, "error": f"{title} is not made in this project, so edit mode cannot rename it."}
    old = _read(path)
    try:
        tree = ast.parse(old)
        if drawn:
            if not name:
                return {"ok": False, "error": "A sketch needs a name."}
            block = sketching.find_block(old, line, str(path))
            call = next((node for node in ast.walk(block.body[block.start]) if isinstance(node, ast.Call)
                         and getattr(node.func, "id", getattr(node.func, "attr", None)) == "Sketch"), None)
            if call is None or not call.args or not isinstance(call.args[0], ast.Constant):
                return {"ok": False, "error": f"{title} is named in a way edit mode cannot change. Ask the agent to rename it."}
            new = commands.Edits(old)
            new.put(call.args[0].lineno, call.args[0].col_offset, json.dumps(name), until=call.args[0].end_col_offset)
            new = new.apply()
        else:
            functions = [node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                         and node.lineno <= line <= node.end_lineno]
            function = max(functions, key=lambda node: node.lineno, default=None)
            statement = commands._top_statement(function, line) if function is not None else None
            if statement is None:
                return {"ok": False, "error": f"{title} is made in a way edit mode cannot rename. Ask the agent to rename it."}
            new = commands.with_comment(old, statement, name)
    except (SyntaxError, sketching.SketchEditError) as error:
        return {"ok": False, "error": f"{rel} could not be read to rename {title} ({error})."}
    _write(path, new)
    after = trace(request)
    if not after.get("ok"):
        _write(path, old)
        trace(request)
        return {"ok": False, "error": f"The part does not read with {title} renamed, so nothing changed."}
    after["change"] = {
        "kind": "rename",
        "title": title,
        "name": name,
        "file": rel,
        "line": line,
        "build": False,
        "undo": {"file": rel, "hunks": commands.hunks(new, old)},
        "redo": {"file": rel, "hunks": commands.hunks(old, new)},
    }
    return after


def _call_name(node):
    """The name a call is made by: ``srgb`` for ``srgb(...)`` and for ``cadgen.srgb(...)``."""
    return getattr(node.func, "attr", None) or getattr(node.func, "id", None)


def appearance(request):
    """Appearance, as SolidWorks' Edit Appearance colors a part: ``color``, the hex the engineer
    picked, written where the part's body takes its color (``tray.color = srgb("#B7A1D7")``, its
    alpha kept), or put in just before the part is returned; then the part is built again, as its
    STEP carries the color."""
    from cadgen.edit import commands, sketching

    traced = trace(request)
    if not traced["ok"]:
        return traced
    refused = _refused_change(request.get("files"))
    if refused:
        return refused
    color = str(request["appearance"].get("color") or "").strip().upper()
    if not re.fullmatch(r"#[0-9A-F]{6}", color):
        return {"ok": False, "error": "A color is a hex code, like #B7A1D7."}
    if traced.get("components"):
        return {"ok": False, "error": "An assembly's parts are colored in their own files. Open a part to color it."}
    state = STATE[str(Path(request["script"]).resolve())]
    try:
        body = commands.find_body(state["steps"], state["shape"], state["level"], ROOT)
    except commands.CommandError as error:
        return {"ok": False, "error": str(error)}
    edits = commands.Edits(body.text)
    painted = f"srgb({json.dumps(color)})"
    var = body.name
    held = next((statement for statement in body.function.body if isinstance(statement, ast.Assign) and len(statement.targets) == 1
                 and isinstance(statement.targets[0], ast.Attribute) and statement.targets[0].attr == "color"
                 and isinstance(statement.targets[0].value, ast.Name) and statement.targets[0].value.id == var), None) if var else None
    if held is not None:
        value = held.value
        if isinstance(value, ast.Call) and _call_name(value) == "srgb" and value.args and isinstance(value.args[0], ast.Constant):
            # Its hex alone: an alpha after it stays.
            first = value.args[0]
            edits.put(first.lineno, first.col_offset, json.dumps(color), until=first.end_col_offset)
        elif value.lineno == value.end_lineno:
            edits.put(value.lineno, value.col_offset, painted, until=value.end_col_offset)
        else:
            return {"ok": False, "error": "The part's color is written over several lines. Ask the agent to change it."}
        line = held.lineno
    else:
        if var is None:
            # `return <body>` becomes `part = <body>`, its color, and `return part`.
            var = commands.fresh_name(body.tree, "part")
            value = body.statement.value
            edits.put(body.statement.lineno, body.statement.col_offset, f"{var} = ", until=value.col_offset)
            edits.after(body.statement.end_lineno, [f"{body.indent}{var}.color = {painted}", f"{body.indent}return {var}"])
            line = body.statement.end_lineno + 1
        else:
            returned = next((statement for statement in reversed(body.function.body) if isinstance(statement, ast.Return)), None)
            at = returned.lineno - 1 if returned is not None else body.function.end_lineno
            edits.after(at, [f"{body.indent}{var}.color = {painted}"])
            line = at + 1
    text = edits.apply()
    if not sketching.has_name(body.tree, "srgb"):
        last = max((node.end_lineno for node in body.tree.body if isinstance(node, (ast.Import, ast.ImportFrom))), default=0)
        lines = text.splitlines(keepends=True)
        lines.insert(last, "from cadgen.color import srgb\n")
        text = "".join(lines)
        line += 1
    old = body.text
    _write(body.path, text)
    after = trace(request)
    if not after.get("ok"):
        _write(body.path, old)
        trace(request)
        return {"ok": False, "error": "The part does not build with that color, so nothing changed."}
    after["change"] = {
        "kind": "appearance",
        "color": color,
        "file": body.rel,
        "line": line,
        "undo": {"file": body.rel, "hunks": commands.hunks(text, old)},
        "redo": {"file": body.rel, "hunks": commands.hunks(old, text)},
    }
    return after


def _keep_version(script: str, shape, components) -> None:
    """The part as this trace read it, kept for Compare when its files read differently from the
    last one kept: each agent's change, and each hand edit, is one."""
    if components or not isinstance(shape, B.Shape):
        return
    kept = VERSIONS.setdefault(script, [])
    if kept and kept[-1]["files"] == FILES:
        return
    number = kept[-1]["id"] + 1 if kept else 1
    kept.append({"id": number, "time": time.time(), "files": dict(FILES), "shape": shape})
    del kept[:-_VERSION_COUNT]


def compare(request):
    """Compare, as SolidWorks' Compare Geometry shows what changed: the versions of the part this
    session read (each agent's change, each hand edit), newest first, and with ``version`` the
    material the part has gained since it (``added``, amber) and lost (``removed``, red), with their
    volumes."""
    traced = trace(request)
    if not traced["ok"]:
        return traced
    if traced.get("components"):
        return {"ok": False, "error": "Compare shows a part's changes. Open a part to compare it."}
    script = str(Path(request["script"]).resolve())
    kept = VERSIONS.get(script) or []
    if not kept:
        return {"ok": False, "error": "This part makes no body to compare yet."}
    now = kept[-1]

    def changed(older, newer):
        return sorted(rel for rel in {*older["files"], *newer["files"]} if older["files"].get(rel) != newer["files"].get(rel))

    listed = [{"id": each["id"], "time": each["time"], "changed": changed(each, kept[index + 1])}
              for index, each in enumerate(kept[:-1])][::-1]
    reply = {"ok": True, "compareOnly": True, "compare": {"versions": listed, "now": now["id"]}}
    wanted = (request["compare"] or {}).get("version")
    if wanted is None:
        return reply
    then = next((each for each in kept if each["id"] == wanted), None)
    if then is None:
        return {"ok": False, "error": "That version is no longer kept. Pick another."}
    scale = max(now["shape"].bounding_box().diagonal, then["shape"].bounding_box().diagonal) or 1.0
    shown = _change_drawn(then["shape"], now["shape"], scale)
    try:
        added = sum(solid.volume for solid in (now["shape"] - then["shape"]).solids())
        removed = sum(solid.volume for solid in (then["shape"] - now["shape"]).solids())
    except Exception:  # noqa: BLE001 - a boolean the kernel cannot settle leaves the volumes unsaid
        added = removed = None
    reply["compare"].update(version=wanted, added=shown["added"], removed=shown["removed"], error=shown["error"],
                            addedVolume=added, removedVolume=removed)
    return reply


def _mates_of(script, components) -> list:
    from cadgen.edit import mates

    try:
        return mates.read(_read(script), components)
    except Exception:  # noqa: BLE001 - a script mates cannot read lists none
        return []


def mate(request):
    """Mate, as SolidWorks' Mate places the parts of an assembly (`mates.py`): a mate added from
    two picks, or one taken out (``delete``, its label), and the assembly built again."""
    from cadgen.edit import commands, mates

    traced = trace(request)
    if not traced["ok"]:
        return traced
    refused = _refused_change(request.get("files"))
    if refused:
        return refused
    if not traced.get("components"):
        return {"ok": False, "error": "Mates place the parts of an assembly. Open an assembly to mate its parts."}
    script = Path(request["script"]).resolve()
    state = STATE[str(script)]
    old = _read(script)
    spec = request["mate"]
    try:
        if spec.get("delete"):
            text, line, words = mates.delete(old, str(spec["delete"])), 1, f"took out {spec['delete']}"
        else:
            text, line, words = mates.change(old, state["shape"], spec, state["units"], [c["name"] for c in traced["components"]])
    except (mates.MateError, commands.CommandError) as error:
        return {"ok": False, "error": str(error)}
    _write(script, text)
    after = trace(request)
    if not after.get("ok"):
        _write(script, old)
        trace(request)
        return {"ok": False, "error": f"The assembly does not build with that mate, so nothing changed. {after.get('error') or ''}".strip()}
    rel = script.relative_to(ROOT).as_posix()
    after["change"] = {"kind": "mate", "words": words, "file": rel, "line": line,
                       "undo": {"file": rel, "hunks": commands.hunks(text, old)}, "redo": {"file": rel, "hunks": commands.hunks(old, text)}}
    return after


def splice(request):
    """Lines of a project file put back, or written again: a command's Undo and Redo."""
    from cadgen.edit import commands

    global ROOT
    script = Path(request["script"]).resolve()
    ROOT = Path(request.get("root") or script.parent).resolve()
    spec = request["splice"]
    rel = str(spec.get("file") or "")
    path = (ROOT / rel).resolve()
    try:
        path.relative_to(ROOT)
    except ValueError:
        return {"ok": False, "error": "That change is not in this project."}
    if path.suffix != ".py" or not path.is_file():
        return {"ok": False, "error": f"{rel} is no longer in the project."}
    if _changed_since(path, (request.get("files") or {}).get(rel)):
        return {"ok": False, "error": f"{rel} changed since the editor read it. Look again and retry."}
    old = _read(path)
    try:
        new = commands.splice(old, spec.get("hunks") or [])
    except commands.CommandError as error:
        return {"ok": False, "error": str(error)}
    _write(path, new)
    first = min((int(each["start"]) for each in spec.get("hunks") or []), default=1)
    # In sketch mode, Undo and Redo of a stroke answer with the sketch solved again; a sketch the
    # change takes away (its making undone) answers with the part.
    drawn = request.get("sketch") if isinstance(request.get("sketch"), dict) else None
    sketching_here = drawn is not None and str(drawn.get("file") or "") == rel
    if sketching_here:
        from cadgen.edit import sketching

        try:
            block, sketch, entry = _sketch_run(request, path, new, int(drawn.get("line") or 0))
        except (sketching.SketchEditError, _sketch_api.SketchError, SyntaxError):
            sketch = None
        if sketch is not None:
            FILES[rel] = _hash(path)
            return {"ok": True, "sketchOnly": True, "sketch": _sketch_view(sketch, path, int(drawn["line"]), entry["function"]),
                    "files": {rel: FILES[rel]},
                    "change": {"kind": "splice", "file": rel, "line": first, "build": False,
                               "undo": {"file": rel, "hunks": commands.hunks(new, old)}, "redo": spec}}
    traced = trace(request)
    if not traced["ok"]:
        _write(path, old)
        trace(request)
        return {"ok": False, "error": "The part does not build with that change, so nothing changed."}
    # Undo in sketch mode reaches only that sketch's session (a new sketch's making the furthest),
    # and nothing of it was built yet: the part builds again when the sketch is left, if at all.
    traced["change"] = {"kind": "splice", "file": rel, "line": first, "build": not sketching_here,
                        "undo": {"file": rel, "hunks": commands.hunks(new, old)}, "redo": spec}
    return traced


# ---------------------------------------------------------------------------------------------
# Sketch mode: a sketch changed as a CAD tool's sketcher changes it, a statement of its block at a
# time (`sketching.py`), then its block run again on its own, in the place its last trace made it,
# and solved: milliseconds, where the whole part takes seconds. Each drawn number the solve moved
# is written where it now is, so the script reads as the sketch stands. The part is built again
# when the engineer leaves the sketch.


class _Unplaced(Exception):
    """A sketch no trace has made yet: the part is run first."""


def _sketch_entry(path, line, statement):
    entry = SKETCHES.get((str(path), line))
    if entry is not None:
        return entry
    return next((value for (file, at), value in SKETCHES.items()
                 if file == str(path) and statement.lineno <= at <= statement.end_lineno), None)


def _run_block(path, text, line, prefer=()):
    """The sketch made at ``line`` of ``text`` (the file at ``path``), its block run on its own
    where the part's last trace made it, and solved. Raises SketchError when it cannot be."""
    from cadgen.edit import sketching

    block = sketching.find_block(text, line, str(path))
    entry = _sketch_entry(path, line, block.body[block.start])
    if entry is None:
        raise _Unplaced()
    module = ast.Module(body=block.statements, type_ignores=[])
    numbers = _Numbers(str(path), _relative(str(path)), text)
    code = compile(ast.fix_missing_locations(numbers.visit(module)), str(path), "exec")
    names = dict(entry["globals"] if entry["locals"] is None else entry["locals"])
    _CAPTURING[0] = False
    try:
        with redirect_stdout(io.StringIO()):
            exec(code, entry["globals"], names)  # noqa: S102 - the project's own lines, as the part runs them
    finally:
        _CAPTURING[0] = True
    sketch = names.get(block.var)
    if not isinstance(sketch, _sketch_api.Sketch):
        raise sketching.SketchEditError(f"{block.var} is not a sketch when its lines run. Ask the agent to look at it.")
    sketch.solve(prefer=prefer)
    return block, sketch, entry


def _sketch_run(request, path, text, line, prefer=()):
    from cadgen.edit import sketching

    try:
        return _run_block(path, text, line, prefer)
    except _Unplaced:
        trace(request)
    try:
        return _run_block(path, text, line, prefer)
    except _Unplaced:
        raise sketching.SketchEditError("This sketch is not made when the part runs, so edit mode cannot solve it.") from None


def _block_literal(literal, path, block):
    """A number written in the sketch's own lines, unnamed: one sketch mode may write."""
    return (literal is not None and not literal["name"] and Path(literal["path"]).resolve() == Path(path).resolve()
            and block.first_line <= literal["line"] <= block.last_line)


def _settle(text, path, block, sketch):
    """``text`` with each drawn number of the sketch's own lines that the solve moved written where
    it now is: a point's x and y, a circle's radius."""
    from cadgen.edit import sketching

    edits = sketching.TextEdits(text)
    done = set()
    scale = max([1.0, *(abs(c) for p in sketch.points for c in (p.x, p.y))])

    def put(literal_id, value):
        literal = LITERALS.get(literal_id) if literal_id else None
        if literal_id in done or not _block_literal(literal, path, block):
            return
        done.add(literal_id)
        if abs(float(literal["value"]) - value) > 1e-9 * scale:
            edits.replace(literal["line"], literal["col"], literal["line"], literal["end"], sketching.number(value))

    for point in sketch.points:
        for literal_id, value in zip(point.literals, (point.x, point.y)):
            put(literal_id, value)
    for curve in sketch.curves:
        if getattr(curve, "literal", None):
            put(curve.literal, curve.radius)
    return edits.apply()


def _hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()[:16]


def _evaluated(entry, typed):
    """A size as typed (a number, or the part's sizes with plain arithmetic) worked out where the
    sketch is made, for a tool to place what it draws."""
    from cadgen.edit import sketching

    try:
        value = float(eval(compile(ast.parse(typed, mode="eval"), "<typed>", "eval"),  # noqa: S307 - `_typed` lets through only numbers, names and arithmetic
                           entry["globals"], dict(entry["locals"] or {})))
    except Exception:  # noqa: BLE001 - said to the engineer as a size the part does not have
        raise sketching.SketchEditError(f"{typed} is not a size of the part. Type a number or a size's name.") from None
    return value


def _prune(request, path, old, text, line, block, sketch, entry):
    """The relations a sketch tool wrote that the sketch does not need taken back, the last first,
    until none of the tool's is redundant: a mirror's, an offset's or a trim's that the sketch's
    other relations already hold, which would make it Over defined."""
    from cadgen.edit import sketching

    before = {ast.unparse(statement) for statement in sketching.find_block(old, line, str(path)).statements}
    for _ in range(64):
        ours = []
        for relation in sketch.solve().redundant:
            if not relation.source or Path(relation.source[0]).resolve() != Path(path).resolve():
                continue
            statement = next((each for each in block.statements if each.lineno <= relation.source[1] <= each.end_lineno), None)
            if statement is not None and ast.unparse(statement) not in before:
                ours.append(statement)
        if not ours:
            break
        last = max(ours, key=lambda statement: statement.lineno)
        edits = sketching.TextEdits(text)
        edits.remove_lines(last.lineno, last.end_lineno)
        text = edits.apply()
        block, sketch, entry = _sketch_run(request, path, text, line)
    return text, block, sketch, entry


def _sketch_new(request, op):
    """A new sketch on a plane of the origin or a flat face of the body, written before the line
    that returns the part: ``sketch2 = Sketch("Sketch2", plane="Top")``."""
    from cadgen.edit import commands, sketching

    script = str(Path(request["script"]).resolve())
    traced = trace(request)
    if not traced["ok"]:
        return traced
    refused = _refused_change(request.get("files"))
    if refused:
        return refused
    if traced.get("components"):
        return {"ok": False, "error": "A sketch goes in a part. Open the part to sketch on it."}
    state = STATE[script]
    shape = state["shape"]
    if not isinstance(shape, B.Shape):
        return {"ok": False, "error": "This part's script makes no body to sketch on yet. Ask the agent to start it."}
    try:
        body = commands.find_body(state["steps"], shape, state["level"], ROOT)
        bar = _bar_place(request.get("bar"))
        bar = bar[1] if bar and bar[0] == body.rel else None
        if bar is not None:
            # Rolled back: the sketch goes right above the bar, on the body as it is there.
            shape, at_bar = commands.body_at(state["steps"], shape, state["level"], ROOT, body.rel, bar)
    except commands.CommandError as error:
        return {"ok": False, "error": str(error)}
    name, var = sketching.sketch_names(body.tree, str(op.get("name") or ""))
    module, named_import = commands.build123d_names(body.tree)
    names = commands.Names(module if module is not None else "bd")
    edits = commands.Edits(body.text)
    plane = op.get("plane")
    body_var, returned = (at_bar.name if bar is not None else body.name), []
    if plane in ("Top", "Front", "Right"):
        plane_code = f'"{plane}"'
    elif isinstance(plane, dict) and plane.get("feature"):
        # A reference Plane of the part (`plane1 = Plane.XY.offset(10)`): the sketch is on it, by its name.
        rel, _, line = str(plane["feature"]).rpartition(":")
        statement = commands._top_statement(body.function, int(line)) if rel == body.rel and line.isdigit() else None
        plane_code = commands._assigned(statement) if statement is not None else None
        if plane_code is None:
            return {"ok": False, "error": "Pick a plane of this part to sketch on."}
        if bar is not None and statement.end_lineno >= bar:
            return {"ok": False, "error": "That plane is below the rollback bar. Move the bar below it first."}
    elif isinstance(plane, dict) and plane.get("selector"):
        # A flat face of the body, said as build123d's selectors say where it is; a body returned
        # outright is named first (`part = ...`, then `return part`) so the face can be.
        if body_var is None and bar is None:
            body_var = commands.fresh_name(body.tree, "part")
            value = body.statement.value
            if value is None or value.lineno != body.statement.lineno:
                return {"ok": False, "error": "Edit mode cannot tell what this part returns. Ask the agent to add the sketch."}
            edits.put(body.statement.lineno, body.statement.col_offset, f"{body_var} = ", until=value.col_offset)
            returned = [f"{body.indent}return {body_var}"]
        selections = commands.Selections(shape, body_var, names)
        scale = shape.bounding_box().diagonal or 1.0
        try:
            numbers = commands.resolve(selections.topology["face"], [plane], scale)
        except commands.CommandError as error:
            return {"ok": False, "error": str(error)}
        if selections.topology["face"].describe(numbers[0])["type"] != "plane":
            return {"ok": False, "error": "A sketch goes on a flat face. Select a flat one, or a plane."}
        plane_code = selections.write("face", numbers, one=True)
    else:
        return {"ok": False, "error": "Pick a plane or a flat face to sketch on."}
    unit_code = None
    if state["units"] == "in":
        unit_code = commands.unit_name(body.tree) or "25.4"
    # An offset plane, as SolidWorks' Plane at an Offset distance: the plane or face moved along
    # its normal, in the sketch's (the part's) units.
    offset_code = None
    if str(op.get("offset") or "").strip():
        try:
            offset = float(parse_number(str(op["offset"])))
        except Exception:  # noqa: BLE001 - said to the engineer: what the box takes
            return {"ok": False, "error": "Offset distance needs a number."}
        if offset:
            offset_code = commands._number(offset, False)
    line_text = sketching.sketch_line(var, name, plane_code, unit_code, offset_code)
    # Before the line that returns the part, or after the body's line when it is that line.
    function = body.function
    last = function.body[-1]
    if bar is not None:
        at = bar - 1
    elif returned:
        at = body.statement.end_lineno
    elif isinstance(last, ast.Return):
        at = last.lineno - 1
    else:
        at = last.end_lineno
    edits.after(at, [f"{body.indent}{line_text}", *returned])
    added = commands._imports(edits, body, module, named_import, names)
    importing = sketching.sketch_import(body.tree)
    if importing:
        edits.after(importing[0], [importing[1]])
        added += 1
    new = edits.apply()
    line = at + 1 + added
    _write(body.path, new)
    after = trace(request)
    view = next((sketch for sketch in after.get("sketches") or [] if sketch["file"] == body.rel and sketch["name"] == name), None)
    if not after.get("ok") or view is None:
        _write(body.path, body.text)
        trace(request)
        return {"ok": False, "error": after.get("error") or "The new sketch did not run, so nothing changed."}
    after["sketch"] = view
    after["change"] = {"kind": "sketch", "op": "new", "sketch": name, "file": body.rel, "line": view["line"], "build": False,
                       "undo": {"file": body.rel, "hunks": commands.hunks(new, body.text)},
                       "redo": {"file": body.rel, "hunks": commands.hunks(body.text, new)}}
    return after


def _sketch_value(request, path, text, block, sketch, state, op, files):
    """A dimension's value typed: a number changes the number behind it (a plain one in the
    sketch's lines, or the named size it is, which the part's other features use too); a size's
    name or a formula is written as the dimension's value."""
    from cadgen.edit import sketching

    dimension = next((relation for relation in sketch.relations if relation.dimension and relation.name == op.get("dimension")), None)
    if dimension is None:
        raise sketching.SketchEditError("That dimension is no longer in the sketch. Look again.")
    typed = str(op.get("text") or "").strip()
    try:
        target = parse_number(typed)
    except Exception:  # noqa: BLE001 - a size's name, or a formula of them
        target = None
    if target is None:
        _known(block, sketch, typed)
        return sketching.set_value(text, block.first_line, state, dimension.name, typed, str(path)), None
    raw = dimension.raw
    if not isinstance(raw, (TFloat, TInt)):
        raise sketching.SketchEditError(f"{dimension.name} is not written as a number edit mode can change. Ask the agent to change it.")
    found = leaves(raw._e)
    named = [leaf for leaf in found if LITERALS[leaf]["name"]]
    candidates = named or found
    leaf = op.get("leaf") or (candidates[0] if len(candidates) == 1 else None)
    if leaf is None:
        return None, {"ok": False, "choose": [{"id": c, "name": LITERALS[c]["name"] or LITERALS[c]["text"], "file": LITERALS[c]["file"],
                                               "line": LITERALS[c]["line"]} for c in candidates]}
    literal = LITERALS[leaf]
    value = _solve(raw._e, leaf, target)
    written = literal_text(round(value, 6), literal["text"])
    if _block_literal(literal, path, block):
        edits = sketching.TextEdits(text)
        edits.replace(literal["line"], literal["col"], literal["line"], literal["end"], written)
        return edits.apply(), None
    # A named size: written where it is, and the part read again, as any size's change.
    _write_literal(literal, written, files.get(literal["file"]))
    traced = trace(request)
    traced["change"] = {"literal": literal["id"], "name": literal["name"] or literal["text"], "file": literal["file"],
                        "line": literal["line"], "from": literal["text"], "to": written, "was": literal["value"], "build": True}
    traced["sketch"] = next((view for view in traced.get("sketches") or []
                             if view["file"] == _relative(str(path)) and view["name"] == sketch.name), None)
    return None, traced


# The dimensions a sketch can be scaled to on its first, as SolidWorks' "Scale sketch on first
# dimension" does: sizes, not angles, and only those measured between the sketch's own entities.
_SCALES = ("length", "diameter", "radius", "distance", "horizontal_distance", "vertical_distance")


def _scaled_to_first(text, path, block, sketch, entry, state, op):
    """``text`` with the sketch scaled about its origin to its first size dimension, as SolidWorks
    scales a sketch on its first dimension: when nothing in it holds a size yet (no other size
    dimension, no point fixed, nothing brought in from the model) and every number of its places is
    written in its own lines, each point's place and each circle's radius are multiplied by what was
    typed over what is drawn, so the sketch keeps its shape instead of being pulled out of it.
    Otherwise ``text`` as it is."""
    from cadgen.edit import sketching

    kind = str(op.get("dimension") or "")
    refs = [str(ref) for ref in op.get("refs") or []]
    if kind not in _SCALES or any(each["kind"] in _SCALES and not each.get("driven") for each in state.get("dimensions") or []):
        return text
    # A curve alone has no shape to keep: a circle's first diameter sizes it where it is.
    if len([curve for curve in state.get("curves") or [] if not curve.get("derived")]) < 2:
        return text
    if any(point["fixed"] and point["id"] != "Origin" for point in state.get("points") or []) or any(
            curve.get("converted") for curve in state.get("curves") or []):
        return text
    measured = _measured(state, kind, refs)
    if not measured:
        return text
    try:
        wanted = _evaluated(entry, str(op.get("value") or ""))
    except sketching.SketchEditError:
        return text
    factor = wanted / measured
    if wanted <= 0 or abs(factor - 1) < 1e-9:
        return text
    numbers = [(literal_id, value) for point in sketch.points if point.name != "Origin"
               for literal_id, value in zip(point.literals, (point.x, point.y))]
    numbers += [(curve.literal, curve.radius) for curve in sketch.curves if getattr(curve, "literal", None)]
    edits = sketching.TextEdits(text)
    seen = set()
    for literal_id, value in numbers:
        # A place made from another (a rectangle's corners from its opposite one) follows it.
        if literal_id is None or literal_id in seen:
            continue
        # A number not the sketch's own to write (a size's name, one in another file): nothing is scaled.
        if not _block_literal(LITERALS.get(literal_id), path, block):
            return text
        seen.add(literal_id)
        literal = LITERALS[literal_id]
        edits.replace(literal["line"], literal["col"], literal["line"], literal["end"], sketching.number(value * factor))
    return edits.apply()


def _determined(request, path, text, line, state, op):
    """Whether the sketch already determines what a new dimension would size: written with what it
    measures now (so it can hold), the solve finds it adds nothing, as SolidWorks finds a dimension
    that would over define the sketch."""
    from cadgen.edit import sketching

    measured = _measured(state, str(op.get("dimension") or ""), [str(ref) for ref in op.get("refs") or []])
    if measured is None:
        return False
    had = {each["id"] for each in state.get("dimensions") or []}
    try:
        probe = sketching.change(text, line, state, {**op, "value": sketching.number(measured)}, str(path))
        _, sketch, _ = _sketch_run(request, path, probe, line)
        redundant = {relation.name for relation in sketch.solve().redundant}
    except (sketching.SketchEditError, _sketch_api.SketchError):
        return False
    return any(relation.dimension and relation.name not in had and relation.name in redundant for relation in sketch.relations)


def _measured(state, kind, refs):
    """What a size dimension on ``refs`` measures in the sketch as it is drawn, or None."""
    points = {point["id"]: (point["x"], point["y"]) for point in state.get("points") or []}
    curves = {curve["id"]: curve for curve in state.get("curves") or []}
    if kind in ("radius", "diameter") and len(refs) == 1 and refs[0] in curves and curves[refs[0]].get("radius"):
        radius = float(curves[refs[0]]["radius"])
        return radius * 2 if kind == "diameter" else radius
    if kind == "length" and len(refs) == 1 and curves.get(refs[0], {}).get("kind") == "line":
        line = curves[refs[0]]
        (x0, y0), (x1, y1) = points[line["start"]], points[line["end"]]
        return math.hypot(x1 - x0, y1 - y0)
    if kind in ("distance", "horizontal_distance", "vertical_distance") and len(refs) == 2 and all(ref in points for ref in refs):
        (x0, y0), (x1, y1) = points[refs[0]], points[refs[1]]
        return {"distance": math.hypot(x1 - x0, y1 - y0), "horizontal_distance": abs(x1 - x0),
                "vertical_distance": abs(y1 - y0)}[kind]
    lines = [curves.get(ref) for ref in refs]
    ends = [(points[line["start"]], points[line["end"]]) for line in lines if line and line.get("kind") == "line"]
    if kind == "distance" and len(refs) == 2 and len(ends) == 1 and any(ref in points for ref in refs):
        # A point to a line: how far it is square off the line.
        (x0, y0), (x1, y1) = ends[0]
        px, py = points[next(ref for ref in refs if ref in points)]
        return abs((x1 - x0) * (py - y0) - (y1 - y0) * (px - x0)) / (math.hypot(x1 - x0, y1 - y0) or 1)
    if kind == "distance" and len(ends) == 2:
        # Two lines, parallel: how far the second's start is square off the first.
        (x0, y0), (x1, y1) = ends[0]
        px, py = ends[1][0]
        return abs((x1 - x0) * (py - y0) - (y1 - y0) * (px - x0)) / (math.hypot(x1 - x0, y1 - y0) or 1)
    if kind == "angle" and len(ends) == 2:
        (a0, a1), (b0, b1) = ends
        da, db = (a1[0] - a0[0], a1[1] - a0[1]), (b1[0] - b0[0], b1[1] - b0[1])
        return math.degrees(math.atan2(abs(da[0] * db[1] - da[1] * db[0]), da[0] * db[0] + da[1] * db[1]))
    return None


def _known(block, sketch, typed):
    """Refuses a typed formula whose names the part does not have."""
    from cadgen.edit import sketching

    entry = _sketch_entry(Path(block.path), sketch.source[1] if sketch.source else block.first_line, block.body[block.start])
    scope = {**(entry["globals"] if entry else {}), **((entry or {}).get("locals") or {})}
    missing = [name for name in sketching.typed_names(typed) if name not in scope]
    if missing:
        raise sketching.SketchEditError(f"This part has no size called {missing[0]}.")


def _body_before(request, path, block, sketch):
    """The name that holds the part's body where a sketch is made, for a line of the sketch to use it."""
    from cadgen.edit import commands, sketching

    state = STATE.get(str(Path(request["script"]).resolve()))
    if state is None or not isinstance(state.get("shape"), B.Shape):
        raise sketching.SketchEditError("This part makes no body yet, so there is nothing for the sketch to cross.")
    try:
        _, before = commands.body_at(state["steps"], state["shape"], state["level"], ROOT, _relative(str(path)), block.first_line)
    except commands.CommandError:
        raise sketching.SketchEditError(f"{sketch.name} comes before the part's first feature, so it crosses nothing yet.") from None
    if before.name is None:
        raise sketching.SketchEditError("Edit mode cannot tell which name holds the body there. Ask the agent to bring the curves in.")
    return before.name


def _convert_edges(request, path, block, sketch, entry, op):
    """What Convert Entities brings into a sketch, as build123d's selectors on the body where the
    sketch is made: the edges picked (``op["items"]``, as the viewer read them), and every edge of a
    face picked. Returns the selector's code and the names it needs (``commands.Names``), which the
    sketch's lines can use at once. An edge the part makes only after the sketch is refused, as a
    CAD tool converts only what comes before the sketch in its tree."""
    from cadgen.edit import commands, sketching

    state = STATE.get(str(Path(request["script"]).resolve()))
    if state is None or not isinstance(state.get("shape"), B.Shape):
        raise sketching.SketchEditError("This part makes no body yet, so there are no edges to convert.")
    rel = _relative(str(path))
    try:
        shape, before = commands.body_at(state["steps"], state["shape"], state["level"], ROOT, rel, block.first_line)
    except commands.CommandError:
        raise sketching.SketchEditError(f"{sketch.name} comes before the part's first feature, so there are no edges to convert yet. "
                                        "Make the sketch after the feature whose edges it takes.") from None
    if before.name is None:
        raise sketching.SketchEditError("Edit mode cannot tell which name holds the body there. Ask the agent to convert the edges.")
    module, _ = commands.build123d_names(before.tree)
    if module is None:
        raise sketching.SketchEditError("This part's file does not import build123d, so edit mode cannot write its edges. Ask the agent.")
    names = commands.Names(module)
    selections = commands.Selections(shape, before.name, names)
    items = [item for item in op.get("items") or [] if isinstance(item, dict)]
    edge_items = [item for item in items if commands.selector_ordinal(item.get("selector"))[0] == "edge"]
    face_items = [item for item in items if commands.selector_ordinal(item.get("selector"))[0] == "face"]
    if not edge_items and not face_items:
        raise sketching.SketchEditError("Select edges or a face on the model to convert.")
    scale = shape.bounding_box().diagonal or 1.0
    try:
        numbers = commands.resolve(selections.topology["edge"], edge_items, scale) if edge_items else []
        edges = selections.topology["edge"]
        for face in commands.resolve(selections.topology["face"], face_items, scale) if face_items else []:
            for each in selections.topology["face"].item(face).edges():
                if (number := edges.number(each)) and number not in numbers:
                    numbers.append(number)
        code = selections.write("edge", numbers)
    except commands.CommandError as error:
        # Picked on the part as it is now: an edge a later feature makes is not on the body there.
        later = state["shape"]
        try:
            for kind, picked in (("edge", edge_items), ("face", face_items)):
                if picked:
                    commands.resolve(commands.Topology(later, kind), picked, later.bounding_box().diagonal or 1.0)
        except commands.CommandError:
            raise sketching.SketchEditError(str(error)) from None
        raise sketching.SketchEditError(f"That is made after {sketch.name} in the design tree, so {sketch.name} cannot use it. "
                                        f"Pick edges of a feature above {sketch.name}.") from None
    # A file that names build123d's classes bare gets the ones the selector uses in its import, and
    # the sketch's lines, run on their own until the part runs again, have them now.
    for name in names.needed:
        entry["globals"].setdefault(name, getattr(B, name))
    return code, names


def _converts_kept(request, path, block, sketch, entry, state, items):
    """Convert Entities' lines some of whose curves are deleted, not all: by each line, the
    selector of the edges whose curves stay (``edges``), written on the body where the sketch is
    made as `_convert_edges` writes one, and where each curve that stays comes in it now
    (``moved``: its place before, to its place after), with the names it needs (``commands.Names``)."""
    from cadgen.edit import commands, sketching

    names = sketching.Names(block, state)
    going: dict[int, tuple] = {}
    for item in items:
        made = names.statement_of(item)
        # An Intersection Curve goes whole: its curves are the section's, not edges of the body.
        call = sketching._call_of(made.statement, block.var) if made is not None and made.method == "convert" else None
        if call is not None and call.args and getattr(getattr(call.args[0], "func", None), "attr", None) == "intersection":
            continue
        if made is not None and made.method == "convert" and item in made.curves:
            going.setdefault(made.statement.lineno, (made, set()))[1].add(made.curves.index(item))
    partial = {lineno: each for lineno, each in going.items() if len(each[1]) < len(each[0].curves)}
    if not partial:
        return {}, None
    cad = STATE.get(str(Path(request["script"]).resolve()))
    try:
        shape, before = commands.body_at(cad["steps"], cad["shape"], cad["level"], ROOT, _relative(str(path)), block.first_line)
    except (TypeError, commands.CommandError):
        raise sketching.SketchEditError("Edit mode cannot find the body those curves are converted from. Ask the agent to change them.") from None
    module, _ = commands.build123d_names(before.tree)
    if module is None or before.name is None:
        raise sketching.SketchEditError("Edit mode cannot write which edges stay. Ask the agent to change the converted curves.")
    written = commands.Names(module)
    selections = commands.Selections(shape, before.name, written)
    scope = {**entry["globals"], **(entry.get("locals") or {})}
    found = {}
    for lineno, (made, places) in partial.items():
        # The edges as the line names them, run where the sketch is made: each curve's own, in order.
        expression = ast.Expression(sketching._call_of(made.statement, block.var).args[0])
        try:
            edges = sketch.converted_edges(eval(compile(expression, str(path), "eval"), scope))  # noqa: S307 - the part's own code
        except Exception:  # noqa: BLE001 - said to the engineer: the line cannot be rewritten
            raise sketching.SketchEditError("Edit mode cannot tell which edges those curves come from. Ask the agent to change them.") from None
        numbers = [selections.topology["edge"].number(edge) for place, edge in enumerate(edges) if place not in places]
        if not all(numbers):
            raise sketching.SketchEditError("Those curves are converted from edges of another body. Ask the agent to change them.")
        code = selections.write("edge", numbers)
        # The selector picks the edges that stay, in its own order: each curve's place in it.
        for name in written.needed:
            scope.setdefault(name, getattr(B, name))
        now = sketch.converted_edges(eval(compile(code, str(path), "eval"), scope))  # noqa: S307 - code edit mode wrote
        moved = {}
        for place, edge in enumerate(edges):
            if place not in places:
                moved[place] = next((at for at, each in enumerate(now) if each.wrapped.IsSame(edge.wrapped)), None)
        if None in moved.values() or len(now) != len(moved):
            raise sketching.SketchEditError("Edit mode cannot write which edges stay. Ask the agent to change the converted curves.")
        found[lineno] = {"edges": code, "moved": moved}
    for name in written.needed:
        entry["globals"].setdefault(name, getattr(B, name))
    return found, written


def _imported(text, names):
    """``text`` with the bare build123d names a written line uses added to the file's import."""
    from cadgen.edit import commands

    if not names.needed:
        return text
    tree = ast.parse(text)
    module, named_import = commands.build123d_names(tree)
    edits = commands.Edits(text)
    commands._imports(edits, SimpleNamespace(tree=tree), module, named_import, names)
    return edits.apply()


def sketch_edit(request):
    """A sketch mode change (``request["sketch"]``: the sketch's ``file`` and ``line``, and the
    ``op``): a new sketch, a stroke, a relation, a dimension or its value, entities moved or
    deleted or made construction geometry, a sketch tool (Sketch Fillet, Offset, Mirror, Trim or
    Convert Entities), or leaving the sketch (``exit``)."""
    from cadgen.edit import commands, sketch_tools, sketching

    global ROOT
    script = Path(request["script"]).resolve()
    ROOT = Path(request.get("root") or script.parent).resolve()
    spec = request["sketch"]
    op = spec.get("op") if isinstance(spec.get("op"), dict) else {}
    kind = op.get("kind")
    files = request.get("files") or {}
    if kind == "new":
        return _sketch_new(request, op)
    if kind == "exit":
        traced = trace(request)
        if traced.get("ok"):
            # The parts that use the sketch's file are built again when the sketch changed.
            traced["change"] = {"kind": "sketch-exit", "file": str(spec.get("file") or ""), "build": bool(op.get("changed", True))}
        return traced
    rel = str(spec.get("file") or "")
    path = (ROOT / rel).resolve()
    try:
        path.relative_to(ROOT)
    except ValueError:
        return {"ok": False, "error": "That sketch is not in this project."}
    if path.suffix != ".py" or not path.is_file():
        return {"ok": False, "error": f"{rel} is no longer in the project."}
    if _changed_since(path, files.get(rel)):
        return {"ok": False, "error": f"{rel} changed since the editor read it. Look again and retry."}
    line = int(spec.get("line") or 0)
    old = _read(path)
    try:
        block, sketch, entry = _sketch_run(request, path, old, line)
        state = _sketch_view(sketch, path, line, entry["function"])["state"]
        broken = set(state.get("errors") or [])
        text, prefer = old, []
        if kind == "move":
            # Points dragged to where the pointer left them, and circles or arcs dragged by their
            # edge to a radius (``{"curve", "radius"}``); the solve holds what was dragged and moves
            # the rest. ``live``: a drag still going, solved and answered but not written.
            edits = sketching.TextEdits(text)
            seen = set()

            def put(literal_id, value):
                literal = LITERALS.get(literal_id) if literal_id else None
                if literal_id in seen or not _block_literal(literal, path, block):
                    return False
                seen.add(literal_id)
                edits.replace(literal["line"], literal["col"], literal["line"], literal["end"], sketching.number(float(value)))
                return True

            for move in op.get("points") or []:
                point = next((p for p in sketch.points if p.name == move.get("point")), None)
                if point is None or point.fixed:
                    continue
                for literal_id, value in zip(point.literals, move.get("to") or ()):
                    put(literal_id, value)
                prefer.append(point.name)
            for move in op.get("curves") or []:
                curve = next((c for c in sketch.curves if c.name == move.get("curve")), None)
                radius = move.get("radius")
                if curve is None or not isinstance(radius, (int, float)) or radius <= 0:
                    continue
                if put(getattr(curve, "literal", None), radius):
                    prefer.append(curve.name)
            text = edits.apply()
            if op.get("live"):
                block, sketch, entry = _sketch_run(request, path, text, line, prefer=prefer)
                return {"ok": True, "sketchOnly": True, "live": True, "sketch": _sketch_view(sketch, path, line, entry["function"]),
                        "files": {rel: FILES.get(rel) or _hash(path)}}
        elif kind == "value":
            text, reply = _sketch_value(request, path, text, block, sketch, state, op, files)
            if reply is not None:
                return reply
        elif kind == "delete":
            items = [str(item) for item in op.get("items") or []]
            if sketching.explodes(text, line, state, items, str(path)):
                text = sketching.explode(text, line, state, items, str(path))
                block, sketch, entry = _sketch_run(request, path, text, line)
                state = _sketch_view(sketch, path, line, entry["function"])["state"]
            # Convert Entities' curves deleted alone keep their line, its edges written again.
            converts, written = _converts_kept(request, path, block, sketch, entry, state, items)
            text = sketching.delete(text, line, state, items, str(path), converts=converts)
            if written is not None:
                text = _imported(text, written)
        elif kind in ("draw", "relate", "dimension", "construction"):
            if kind == "dimension":
                _known(block, sketch, str(op.get("value") or ""))
                scaled = _scaled_to_first(text, path, block, sketch, entry, state, op)
                # One the sketch already determines made driven, as SolidWorks offers: it measures, holding nothing.
                if scaled == text and op.get("if_redundant") == "driven" and _determined(request, path, text, line, state, op):
                    op = {**op, "driven": True}
                text = scaled
            text = sketching.change(text, line, state, op, str(path))
        elif kind == "copy":
            # Copy Entities: the selection drawn again, moved, held to nothing.
            text = sketching.copy(text, line, state, [str(item) for item in op.get("items") or []], op.get("by"), str(path))
        elif kind == "driven":
            # A dimension made driven, or driving again unless the sketch already determines what it sizes.
            dimension, on = str(op.get("dimension") or ""), bool(op.get("on", True))
            text = sketching.set_driven(text, line, state, dimension, on, str(path))
            if not on:
                # Driving again, it keeps what it measures now (a number typed over, not a size's name).
                shown = next((each for each in state.get("dimensions") or [] if each["id"] == dimension), None)
                if shown and shown.get("driven") and shown.get("literal") and shown.get("value") is not None:
                    text = sketching.set_value(text, line, state, dimension, sketching.number(float(shown["value"])), str(path))
                _, probe, _ = _sketch_run(request, path, text, line)
                if dimension in {relation.name for relation in probe.solve().redundant}:
                    raise sketching.SketchEditError(f"{dimension} would over define {sketch.name}: what it sizes is already set. "
                                                    "Delete what sets it, or keep it driven.")
        elif kind == "convert":
            edges = _convert_edges(request, path, block, sketch, entry, op)
            text = _imported(sketch_tools.convert(text, line, state, {**op, "edges": edges[0]}, str(path)), edges[1])
        elif kind == "intersection":
            # Intersection Curve: where the body made before the sketch crosses its plane, held there.
            text = sketch_tools.convert(text, line, state, {**op, "edges": f"{block.var}.intersection({_body_before(request, path, block, sketch)})"},
                                        str(path))
        elif kind in ("fillet", "chamfer", "offset", "mirror", "trim", "extend", "pattern"):
            if kind in ("fillet", "chamfer", "offset", "pattern"):
                typed = str(op.get("radius" if kind == "fillet" else "spacing" if kind == "pattern" and op.get("type") != "circular"
                               else "angle" if kind == "pattern" else "distance") or "").strip()
                _known(block, sketch, typed)
                if kind == "offset":
                    op = {**op, "value": _evaluated(entry, typed)}
            if kind == "trim" and sketching.explodes(text, line, state, [str(op.get("curve") or "")], str(path)):
                # A rectangle's line is trimmed on its own: the rectangle is written as its lines first.
                text = sketching.explode(text, line, state, [str(op.get("curve") or "")], str(path))
                block, sketch, entry = _sketch_run(request, path, text, line)
                state = _sketch_view(sketch, path, line, entry["function"])["state"]
            # A spline is shaped by its points: the tools that cut, run on or copy curves take lines, arcs and circles.
            kinds = {curve["id"]: curve["kind"] for curve in state.get("curves", [])}
            picked = [*(op.get("items") or []), *(op.get("lines") or []), op.get("curve"), op.get("about")]
            if any(kinds.get(str(each)) == "spline" for each in picked if each):
                words = {"offset": "Offset Entities", "mirror": "Mirror Entities", "trim": "Trim Entities", "extend": "Extend Entities",
                         "pattern": "A sketch pattern", "fillet": "Sketch Fillet", "chamfer": "Sketch Chamfer"}[kind]
                return {"ok": False, "error": f"{words} works on lines, arcs and circles. A spline is shaped by its points: drag them, or dimension them."}
            text = getattr(sketch_tools, kind)(text, line, state, op, str(path))
        else:
            return {"ok": False, "error": f"Edit mode cannot make that sketch change ({kind or 'none'})."}
        block, sketch, entry = _sketch_run(request, path, text, line, prefer=prefer)
        if kind in ("offset", "mirror", "trim", "extend"):
            text, block, sketch, entry = _prune(request, path, old, text, line, block, sketch, entry)
        try:
            sketch.fillet_arcs()
        except _sketch_api.SketchError as error:
            # A change that leaves a fillet unable to fit its corner is not made.
            if str(error) not in broken:
                raise
        text = _settle(text, path, block, sketch)
    except (sketching.SketchEditError, _sketch_api.SketchError) as error:
        return {"ok": False, "error": str(error)}
    if text != old:
        _write(path, text)
        FILES[rel] = _hash(path)
    view = _sketch_view(sketch, path, line, entry["function"])
    return {
        "ok": True,
        "sketchOnly": True,
        "sketch": view,
        "files": {rel: FILES.get(rel) or _hash(path)},
        "change": {"kind": "sketch", "op": kind, "sketch": sketch.name, "file": rel, "line": line, "build": False,
                   "undo": {"file": rel, "hunks": commands.hunks(text, old)},
                   "redo": {"file": rel, "hunks": commands.hunks(old, text)}},
    }


# ---------------------------------------------------------------------------------------------


# ---------------------------------------------------------------------------------------------
# The rollback bar, as SolidWorks' FeatureManager has it: the part shown as it was above a feature
# of the tree, the features below it not made yet. A request names where it is (``bar``:
# ``{"before": "<file>:<line>"}``, the first line of the statement it sits above, as a reply said
# it; or ``{"item": <key>}``, the tree item it goes above), and the reply says where it is now
# (``bar``, or None once rolled forward): lines a change puts in or takes out above it move it with
# them. Commands act on the body there, and write their line at it.


def _bar_place(spec, features=None):
    """``(file, line)`` of a request's bar, or None. A tree item is found among ``features``."""
    if not isinstance(spec, dict):
        return None
    if spec.get("item") and features is not None:
        feature = next((each for each in features if each.get("key") == spec["item"]), None)
        rel = str((feature or {}).get("file") or "")
        try:
            return (rel, _statement_line(ast.parse(_read(ROOT / rel)), _first_line(feature, rel))) if rel else None
        except (OSError, SyntaxError, UnicodeDecodeError):
            return None
    rel, _, line = str(spec.get("before") or "").rpartition(":")
    return (rel, int(line)) if rel and line.isdigit() else None


def _statement_line(tree, line):
    """The first line of the statement of a function's own body that holds ``line``: a loop's line
    for a line inside it. A suppressed feature's first line is its own (`deleting.py`)."""
    functions = [node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                 and node.lineno <= line <= node.end_lineno]
    function = max(functions, key=lambda node: node.lineno, default=None)
    statement = next((each for each in function.body if each.lineno <= line <= each.end_lineno), None) if function else None
    return statement.lineno if statement is not None else line


def _first_line(feature, rel):
    lines = [int(row.rpartition(":")[2]) for row in feature.get("rows") or [] if row.rpartition(":")[0] == rel]
    return min(lines) if lines else int(feature.get("line") or 0)


def _bar(script, rel, line, reply):
    """The rollback bar at ``line`` of ``rel``: the tree item it sits above, the body there as a
    document of the engine's the viewer draws in place of the part's (`_bar_document`), and the name
    that holds it. None when that line no longer starts a tree item (the agent changed the file)."""
    from cadgen.edit import commands

    state = STATE.get(str(script))
    if state is None or reply.get("components") or not isinstance(state["shape"], B.Shape):
        return None
    try:
        tree = ast.parse(_read(ROOT / rel))
    except (OSError, SyntaxError, UnicodeDecodeError):
        return None
    item = next((feature for feature in reply.get("features") or [] if feature.get("file") == rel
                 and _statement_line(tree, _first_line(feature, rel)) == line), None)
    if item is None:
        return None
    where = {"before": f"{rel}:{line}", "item": item["key"]}
    try:
        shape, body = commands.body_at(state["steps"], state["shape"], state["level"], ROOT, rel, line)
    except commands.CommandError as error:
        return {**where, "step": None, "error": str(error)}
    return {**where, **_bar_document(script, shape), "name": body.name}


def _bar_model(script):
    """The engine's name for a part's body at its bar: the script's stem and a digest of its path, so
    two projects' parts of one name never share one, and one part's bar always has the same."""
    stem = re.sub(r"\W", "_", Path(script).stem) or "part"
    digest = hashlib.sha1(str(Path(script).resolve()).encode("utf-8")).hexdigest()[:8]
    return f"{stem if stem[0].isalpha() else 'part_' + stem}_bar_{digest}"


def _bar_document(script, shape):
    """The body at a bar built as a document of the engine's, from the shape this process made
    (`cadgen.build` of a shape: the worker writes its document and nothing to disk), so the viewer
    draws it, and picks its faces and edges, as it does the part's own. One model per part: moving
    the bar again is a new version of the same document, at the same address."""
    from cadgen.engine import api

    model = _bar_model(script)
    built = api.build(shape, model=model)
    if not built.ok:
        raise RuntimeError(built.report.get("error") or "the body at the bar did not build")
    assembly = isinstance(shape, B.Compound) and bool(getattr(shape, "children", ()))
    return {"document": {"model": model, "cwd": str(Path.cwd()), "address": built.report.get("address"),
                         "url": built.report.get("url")},
            "kind": "assembly" if assembly else "part"}


def _with_bar(request, reply):
    """``reply`` with the bar the part is at after ``request``: ``bar_after`` when the request says
    where it goes once made (Edit Feature's own rollback ends with it), else ``bar``, moved with
    the lines the change put in or took out above it."""
    if ("bar" not in request and "bar_after" not in request) or not reply.get("ok") or reply.get("choose"):
        return reply
    where = _bar_place(request.get("bar_after") if "bar_after" in request else request.get("bar"), reply.get("features"))
    if where is None:
        reply["bar"] = None
        return reply
    from cadgen.edit import commands

    rel, line = where
    applied = request["splice"] if isinstance(request.get("splice"), dict) else (reply.get("change") or {}).get("redo") or {}
    if applied.get("file") == rel:
        line = commands.shifted(line, applied.get("hunks") or [])
    # A sketch solved on its own leaves the body as it was: only where the bar is moves.
    reply["bar"] = {"before": f"{rel}:{line}"} if reply.get("sketchOnly") else _bar(Path(request["script"]).resolve(), rel, line, reply)
    return reply


LAST: dict = {}
"""The last trace, for a bar moved alone: its script, project, files' hashes and tree items."""


def _bar_only(request):
    """A move of the rollback bar alone, the part's files as the last trace of it read them: the
    bar placed from that trace, the part not run again, and only the bar answered (`unchanged`).
    A step down the tree is the bar's, not the part's. None for anything else."""
    global ROOT
    if request.get("op") != "edit" or "bar" not in request or any(key in request for key in _CHANGES):
        return None
    script = Path(request["script"]).resolve()
    if not _as_last_traced(script, Path(request.get("root") or script.parent).resolve()):
        return None
    ROOT = LAST["root"]
    placed = _with_bar(request, {"ok": True, "features": LAST["features"], "components": LAST["components"]})
    return {"ok": True, "unchanged": True, "files": dict(LAST["files"]), "bar": placed.get("bar")}


def handle(request):
    try:
        quick = _bar_only(request)
        if quick is not None:
            return quick
        if request.get("op") == "edit":
            reply = edit(request)
            # A preview, or Mass Properties, leaves the part, and so the rollback bar, as they were.
            return reply if any(isinstance(request.get(key), dict) for key in ("preview", "mass", "draft_check", "interference")) else _with_bar(request, reply)
        return _with_bar(request, trace(request))
    except Exception as error:
        return {"ok": False, "error": str(error), "detail": traceback.format_exc(limit=4)}


def main():
    if "--serve" in sys.argv:
        for line in sys.stdin:
            if not line.strip():
                continue
            request = json.loads(line)
            reply = handle(request)
            reply["id"] = request.get("id")
            sys.stdout.write(json.dumps(reply, default=_plain) + "\n")
            sys.stdout.flush()
        return
    print(json.dumps(handle(json.loads(sys.argv[1])), default=_plain, indent=1))


if __name__ == "__main__":
    main()
