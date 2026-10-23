"""Hand edits to a part's script, for the viewer's edit mode.

The part script stays the source. Edit mode reads it as a design: a warm tracer process
(``tracer.py``, in this Python) runs the script with every number in the project's files
remembering where it is written and each build123d operation recorded, and answers with the part's
history, its named sizes and its dimensions. A change rewrites one number in the source; then every
part script that uses the changed file is built again in the engine's warm worker, as the agent's
call builds it, so its document, and the viewer showing it, take the new version at once, and its
STEP is written as its decorators declare.

The CAD kernel never loads into the server: the tracer is a process of its own and the builds are
the engine's workers (``test_module_boundaries``). This module only starts them and passes JSON.
"""

from __future__ import annotations

import hashlib
import json
import os
import queue
import re
import subprocess
import sys
import threading
import time
from pathlib import Path

__all__ = ["EditService", "dependents", "project_root", "script_for", "shared_service"]

# A cold trace imports build123d and runs the part once: seconds. A part that runs longer than this
# is stopped, and the next request starts a fresh tracer.
TRACE_TIMEOUT = 180
BUILD_TIMEOUT = 900
# Folders a project's own scripts never live in.
_SKIP = re.compile(r"^(\.|node_modules$|__pycache__$|tmp$|dist$|build$|vendor$|site-packages$)")
_SCAN_LIMIT = 4000
# A part script declares a model with any of the engine's decorators (`cadgen.engine.model`).
_PART = re.compile(r"^\s*@(?:step|xbf|model|stl|glb|threemf|dxf)\b", re.M)
_IMPORT = re.compile(r"^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))", re.M)
# What a change may name: a number (`literal`), a dimension on the model, or a feature's input, and
# the value typed; `leaf` answers which size to change when several make the value. A `command`
# writes a feature's line after the part's body (`commands.py`); a `splice` puts lines back or
# writes them again (a command's Undo and Redo). A `sketch` change is sketch mode's
# (`sketching.py`): its strokes are not built, as a CAD tool rebuilds when the sketch is left. A
# `remove` deletes a feature of the design tree (`deleting.py`), and `suppress` sets one aside. `bar`
# is where the rollback bar is (the part shown as it was above a feature; a change with nothing else
# only moves it), and `bar_after` where it goes once the change is made. A `preview` is a command
# made without writing it, for its panel to draw what OK would make; it changes nothing, so nothing
# is built.
_CHANGE_KEYS = ("literal", "dimension", "input", "leaf", "text", "files", "command", "preview", "mass", "draft_check", "interference", "parameter", "rename", "appearance", "mate", "compare", "splice",
                "sketch", "remove",
                "suppress", "bar", "bar_after")


def _no_window() -> dict:
    return {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}


def is_part(path: Path) -> bool:
    try:
        return bool(_PART.search(path.read_text(encoding="utf-8")))
    except (OSError, UnicodeDecodeError):
        return False


def script_for(file_ref: str) -> Path | None:
    """The part script a viewer file is built from: the script itself, or the one beside a STEP
    of the same name. None when there is none, or it declares no model (``@step``)."""
    if not file_ref:
        return None
    path = Path(str(file_ref).split("#", 1)[0]).expanduser()
    if path.suffix.lower() in (".step", ".stp"):
        path = path.with_suffix(".py")
    if path.suffix.lower() != ".py" or not path.is_absolute():
        return None
    return path.resolve() if path.is_file() and is_part(path) else None


def _studio_projects() -> list[tuple[Path, dict]]:
    """Studio's projects: each folder a project lists, with the project's record. Studio keeps the
    records apart from the folders, one ``<id>/project.json`` each under ``$STUDIO_PROJECTS_DIR``
    (else ``~/studio-projects``), so a copy or a folder added from elsewhere is a project's folder
    without a git repository of its own."""
    records = Path((os.environ.get("STUDIO_PROJECTS_DIR") or "").strip() or "~/studio-projects").expanduser()
    listed = []
    for path in sorted(records.glob("*/project.json")):
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
            listed += [(Path(str(folder["path"])).expanduser().resolve(), record) for folder in record.get("folders") or ()]
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            continue
    return listed


def project_root(script: Path) -> Path:
    """The project a part belongs to: the nearest folder holding a git repository or Studio's
    ``project.json``, or that a Studio project lists, else the script's own folder."""
    listed = {folder for folder, _record in _studio_projects()}
    for folder in [script.parent, *script.parent.parents]:
        if (folder / ".git").exists() or (folder / "project.json").is_file() or folder in listed:
            return folder
    return script.parent


def _project_units(root: Path) -> dict:
    """The units and the material the brief of the Studio project listing ``root`` names, as a
    trace request's."""
    for folder, record in _studio_projects():
        brief = record.get("brief") if folder == root else None
        if not isinstance(brief, dict):
            continue
        named = {**({"units": brief["units"]} if brief.get("units") in ("in", "mm") else {}),
                 **({"material": brief["material"].strip()} if isinstance(brief.get("material"), str) and brief["material"].strip() else {})}
        if named:
            return named
    return {}


def _relative(root: Path, path: Path) -> str:
    try:
        return Path(path).resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return str(path)


def _drawing_of(root: Path, step: Path) -> dict | None:
    """A part's drawing, for the Drawing panel: its script, the PDF it writes (and whether that is
    there), and its sheet as the panel opens on it."""
    from cadgen.edit import drawings

    try:
        found = drawings.find(root, step)
        if found is None:
            return None
        sheet = drawings.read(found.read_text(encoding="utf-8"))
    except (OSError, SyntaxError, drawings.DrawingError):
        return None
    out = sheet.pop("out", None)
    pdf = (found.parent / out).resolve() if out else None
    return {"script": _relative(root, found), "pdf": _relative(root, pdf) if pdf else "", "drawn": bool(pdf and pdf.exists()), **sheet}


def _python_files(root: Path) -> list[Path]:
    found: list[Path] = []
    folders = [root]
    while folders and len(found) < _SCAN_LIMIT:
        folder = folders.pop()
        try:
            entries = sorted(os.scandir(folder), key=lambda entry: entry.name)
        except OSError:
            continue
        for entry in entries:
            if _SKIP.match(entry.name):
                continue
            if entry.is_dir(follow_symlinks=False):
                folders.append(Path(entry.path))
            elif entry.name.endswith(".py"):
                found.append(Path(entry.path))
    return found


def dependents(root: Path, changed: str) -> list[Path]:
    """Every part script that uses ``changed`` (a file relative to ``root``), directly or through
    others, parts before the assemblies that import them."""
    root = root.resolve()
    uses: dict[Path, set[str]] = {}
    for path in _python_files(root):
        try:
            source = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        uses[path] = {(match.group(1) or match.group(2)).split(".")[-1] for match in _IMPORT.finditer(source)}
    touched = {(root / changed).resolve()}
    grew = True
    while grew:
        grew = False
        for path, imported in uses.items():
            if path not in touched and any(each.stem in imported for each in touched):
                touched.add(path)
                grew = True
    parts = [path for path in touched if path in uses and is_part(path)]
    return sorted(parts, key=lambda path: ("assembl" in str(path).lower(), str(path)))


def _hash_inside(root: Path, rel: str) -> str | None:
    """A project file's hash as the tracer records it, for a file inside the project only."""
    try:
        path = (root / str(rel)).resolve()
        path.relative_to(root.resolve())
        return hashlib.sha256(path.read_bytes()).hexdigest()[:16]
    except (OSError, ValueError):
        return None


class _Tracer:
    """The warm tracer: one process, one request at a time."""

    def __init__(self, python: str) -> None:
        self.python = python
        self._lock = threading.Lock()
        self._process: subprocess.Popen | None = None
        self._lines: queue.Queue[str | None] = queue.Queue()
        self._next = 0

    def _start(self) -> None:
        self._process = subprocess.Popen(
            [self.python, "-m", "cadgen.edit.tracer", "--serve"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            bufsize=1,
            **_no_window(),
        )
        self._lines = queue.Queue()
        threading.Thread(target=self._read, args=(self._process, self._lines), daemon=True).start()

    @staticmethod
    def _read(process: subprocess.Popen, lines: queue.Queue) -> None:
        with process.stdout:
            for line in process.stdout:
                lines.put(line)
        lines.put(None)

    def stop(self) -> None:
        process, self._process = self._process, None
        if process is None:
            return
        if process.poll() is None:
            process.kill()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pass
        try:
            process.stdin.close()  # its stdout is the reader's, closed when it reads the end
        except OSError:
            pass

    def ask(self, request: dict, timeout: float = TRACE_TIMEOUT) -> dict:
        with self._lock:
            if self._process is None or self._process.poll() is not None:
                self._start()
            self._next += 1
            ident = self._next
            try:
                self._process.stdin.write(json.dumps({**request, "id": ident}) + "\n")
                self._process.stdin.flush()
            except OSError:
                self.stop()
                return {"ok": False, "error": "The part could not be read. Try again."}
            deadline = time.monotonic() + timeout
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    self.stop()
                    return {"ok": False, "error": "Reading the part took too long."}
                try:
                    line = self._lines.get(timeout=remaining)
                except queue.Empty:
                    continue
                if line is None:
                    self._process = None
                    return {"ok": False, "error": "Reading the part stopped. Try again."}
                try:
                    reply = json.loads(line)
                except ValueError:
                    continue  # something the part printed past the tracer
                if isinstance(reply, dict) and reply.get("id") == ident:
                    reply.pop("id", None)
                    return reply


class _Builds:
    """The parts built again after a change: one batch at a time, in order. A part script's models
    build in the engine's warm worker, whose memo replays what the change left alone, and the open
    document takes the new version in place; a script with no model of the engine's (a drawing's)
    runs as it is."""

    def __init__(self, python: str) -> None:
        self.python = python
        self._lock = threading.Lock()
        self._batches: queue.Queue[tuple[int, list[Path]]] = queue.Queue()
        self._batch = 0
        self.status: dict = {"scripts": [], "done": 0, "error": None}
        threading.Thread(target=self._work, daemon=True).start()

    def start(self, scripts: list[Path]) -> None:
        with self._lock:
            self._batch += 1
            self.status = {"scripts": [path.name for path in scripts], "done": 0, "error": None}
            self._batches.put((self._batch, list(scripts)))

    def snapshot(self) -> dict:
        with self._lock:
            return dict(self.status)

    def _build(self, script: Path) -> str | None:
        """Build one script again; None, or why it failed."""
        try:
            from cadgen.engine import api

            report = api.build_script(script)
            if report.models:
                if report.ok:
                    return None
                return next((str(row.get("error") or "") for row in report.models if not row.get("ok")), "") or "the build failed"
        except Exception as failure:  # noqa: BLE001 - a build that cannot run says why, as a failed one does
            return str(failure) or type(failure).__name__
        # No model of the engine's: the script runs as it is, as `python <script>` runs it.
        try:
            run = subprocess.run(
                [self.python, str(script)],
                cwd=script.parent,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                timeout=BUILD_TIMEOUT,
                **_no_window(),
            )
        except (OSError, subprocess.TimeoutExpired) as failure:
            return str(failure)
        return None if run.returncode == 0 else " ".join(run.stderr.strip().splitlines()[-2:])

    def _work(self) -> None:
        while True:
            batch, scripts = self._batches.get()
            for script in scripts:
                error = self._build(script)
                with self._lock:
                    if batch != self._batch:
                        continue  # a newer change's batch is the one shown; this one still finishes
                    if error:
                        self.status["error"] = f"{script.name}: {error}"
                    self.status["done"] += 1


class EditService:
    """Edit mode for one viewer server: its tracer, and the builds its changes start."""

    def __init__(self, python: str | None = None, *, build: bool = True) -> None:
        self.python = python or sys.executable
        self._tracer = _Tracer(self.python)
        self._builds = _Builds(self.python) if build else None
        # One change to a drawing's sheet at a time: each reads the script the last one wrote.
        self._sheet_lock = threading.Lock()

    def building(self) -> dict:
        return self._builds.snapshot() if self._builds else {"scripts": [], "done": 0, "error": None}

    def rebuild(self, root: Path, changed: str) -> dict:
        """Every part that uses ``changed`` (a file relative to ``root``) built again, as after a
        change here: for a size changed from Studio's Sizes (``sizes.py``)."""
        if self._builds is not None:
            self._builds.start(dependents(root, changed))
        return self.building()

    def editable(self, file_ref: str) -> dict:
        """Whether a viewer file has a part script beside it to edit: answered at once, so a view
        that cannot be edited never changes its layout for edit mode while the part is read."""
        return {"ok": True, "editable": script_for(file_ref) is not None}

    def state(self, file_ref: str, files: dict | None = None, bar: dict | None = None) -> dict:
        """The part as a design: its history, named sizes and dimensions. ``files`` is the hashes a
        page read last; when none of them changed, the answer says so and the part is not run.
        ``bar``: where the page has the rollback bar, said again as the part now reads."""
        script = script_for(file_ref)
        if script is None:
            return {"ok": False, "reason": "no-script", "error": "This model has no part script beside it."}
        root = project_root(script)
        if isinstance(files, dict) and files and all(_hash_inside(root, rel) == digest for rel, digest in files.items()):
            return {"ok": True, "unchanged": True, "building": self.building()}
        reply = self._tracer.ask({"script": str(script), "root": str(root), "mesh": False, **_project_units(root),
                                  **({"bar": bar} if bar else {})})
        drawing = _drawing_of(root, Path(file_ref)) if reply.get("ok") else None
        return {**reply, "root": str(root), "building": self.building(), **({"drawing": drawing} if drawing else {})}

    def change(self, payload: dict) -> dict:
        """One number changed in the part's source, or a command's line written, then the parts
        that use the changed file built again."""
        script = script_for(payload.get("file") or "")
        if script is None:
            return {"ok": False, "error": "This model has no part script to change."}
        root = project_root(script)
        if isinstance(payload.get("drawing"), dict):
            return {**self.drawing(root, script, Path(payload["file"]), payload["drawing"]), "root": str(root), "building": self.building()}
        if isinstance(payload.get("sheet"), dict):
            return {**self.sheet(root, Path(payload["file"]), payload["sheet"]), "root": str(root), "building": self.building()}
        request = {key: payload[key] for key in _CHANGE_KEYS if key in payload}
        reply = self._tracer.ask({**request, "script": str(script), "root": str(root), "op": "edit", "mesh": False,
                                  **_project_units(root)})
        made = reply.get("change") if reply.get("ok") else None
        if isinstance(made, dict) and made.get("build", True) and self._builds is not None:
            self._builds.start(dependents(root, made["file"]))
        return {**reply, "root": str(root), "building": self.building()}

    def drawing(self, root: Path, script: Path, step: Path, spec: dict) -> dict:
        """Make Drawing, and the Drawing panel's changes to its sheet (`drawings.py`): the drawing's
        script written beside the part, then run, which writes its PDF. The part is not run."""
        from cadgen.edit import drawings

        found = drawings.find(root, step)
        old = None
        try:
            if spec.get("make"):
                if found is not None:
                    return {"ok": False, "error": f"{step.stem} has a drawing already ({_relative(root, found)}). Change its sheet in the Drawing panel."}
                found = script.parent / f"{step.stem}_drawing.py"
                named = _project_units(root)
                found.write_text(drawings.template(step.stem, step, found, material=named.get("material", ""), units=named.get("units", "mm")),
                                 encoding="utf-8")
                words = "made a drawing of it: top, front, right and isometric views, each with its overall size, on an A3 sheet"
            else:
                if found is None:
                    return {"ok": False, "error": f"{step.stem} has no drawing yet. Make one first."}
                old = found.read_text(encoding="utf-8")
                made, said = drawings.change(old, spec.get("sheet") or {})
                found.write_text(made, encoding="utf-8")
                words = f"changed its drawing's sheet: {said}"
            pdf = drawings.build(found)
        except drawings.DrawingError as error:
            if old is not None:
                found.write_text(old, encoding="utf-8")
            return {"ok": False, "error": str(error), **({"drawing": _drawing_of(root, step)} if found else {})}
        return {"ok": True, "drawingOnly": True, "drawing": _drawing_of(root, step),
                "change": {"kind": "drawing", "file": _relative(root, found), "line": 1, "words": words, "pdf": _relative(root, pdf), "build": False}}

    def sheet(self, root: Path, step: Path, spec: dict) -> dict:
        """The part's drawing as its sheet is edited, as a SolidWorks drawing is: sheet ``index``
        drawn, and with ``edit``, one change made on it first (`drawings.edit`), the drawing's
        script then drawn again, its PDF too. ``hash`` is the script the sheet was drawn from: a
        change made on an older one is refused (``stale``). The part is not run."""
        from cadgen.edit import drawings

        found = drawings.find(root, step)
        if found is None:
            return {"ok": False, "error": f"{step.stem} has no drawing yet. Make one first."}
        try:
            index = max(1, int(spec.get("index") or 1))
        except (TypeError, ValueError):
            index = 1
        change = spec.get("edit")
        rel = _relative(root, found)
        with self._sheet_lock:
            old = found.read_text(encoding="utf-8")
            if not isinstance(change, dict):
                try:
                    drawn = drawings.sheet(found, index)
                except drawings.DrawingError as error:
                    return {"ok": False, "error": str(error)}
                return {"ok": True, "drawingOnly": True, "drawing": _drawing_of(root, step),
                        "sheet": {**drawn, "hash": drawings.digest(old), "file": rel}}
            if spec.get("hash") != drawings.digest(old):
                return {"ok": False, "stale": True, "error": "The drawing's script changed since the sheet was drawn. Here it is as it is now."}
            written = False
            try:
                made, words = drawings.edit(old, change)
                found.write_text(made, encoding="utf-8")
                written = True
                drawn = drawings.sheet(found, index, pdf=True)
            except drawings.DrawingError as error:
                if written:
                    found.write_text(old, encoding="utf-8")
                return {"ok": False, "error": str(error)}
        undo, redo = drawings.hunks(made, old), drawings.hunks(old, made)
        pdf = drawn.get("sheet", {}).get("pdf")
        return {"ok": True, "drawingOnly": True, "drawing": _drawing_of(root, step),
                "sheet": {**drawn, "hash": drawings.digest(made), "file": rel},
                "sheetEdit": {"undo": undo, "redo": redo},
                "change": {"kind": "drawing", "file": rel, "line": min((each["start"] for each in redo), default=1), "words": words,
                           "pdf": _relative(root, Path(pdf)) if pdf else "", "build": False}}

    def close(self) -> None:
        self._tracer.stop()


_shared: EditService | None = None
_shared_lock = threading.Lock()


def shared_service() -> EditService:
    """The server's one edit service, started on first use."""
    global _shared
    with _shared_lock:
        if _shared is None:
            _shared = EditService()
        return _shared
