"""The part an agent built, measured: does it build to one valid solid, does its STEP read back, which exact holes and
how much exact flat base it kept, how much of it is a meshed field (small flat triangles), and is it printable.

Run with text-to-cad's Python (it imports cad and build123d):

    python build_check.py --project DIR [--part parts/x.py] [--seed fixtures/parts/x.py] --out result.json

Each script is built in a child process of its own, with a time limit, by calling its models' plain functions (no
CAD server): the part is the largest solid its models return.
"""

from __future__ import annotations

import argparse
import json
import runpy
import subprocess
import sys
import tempfile
import time
from pathlib import Path

LIMIT_S = 900
FACET_AREA_MM2 = 5.0


def child(script: Path, out: Path) -> None:
    """Build every model ``script`` declares and write its part as a BREP file: the model named as the script, else
    the largest solid."""
    import build123d as bd
    from OCP.BRepTools import BRepTools

    sys.path.insert(0, str(script.parent))
    started = time.time()
    names = runpy.run_path(str(script), run_name="__build_check__")
    from cad.engine.model import Model

    best, failures, named = None, [], False
    for name, value in names.items():
        plain = getattr(value, "__wrapped__", None)
        if not isinstance(value, Model) or not callable(plain):
            continue
        try:
            shape = plain()
        except Exception as error:  # noqa: BLE001 - one model that fails is said, the others still built
            failures.append(f"{name}: {type(error).__name__}: {error}")
            continue
        shape = getattr(shape, "shape", shape)
        if not isinstance(shape, bd.Shape) or shape.volume <= 0:
            continue
        # The model named as its script is the part (a script may keep a solid one beside it to compare);
        # otherwise the largest.
        if name == script.stem:
            best, named = shape, True
        elif not named and (best is None or shape.volume > best.volume):
            best = shape
    if best is None:
        raise SystemExit("; ".join(failures) or "no model returned a solid")
    BRepTools.Write_s(best.wrapped, str(out))
    print(json.dumps({"seconds": time.time() - started}))


def built(project: Path, script: Path) -> tuple[object | None, float, str]:
    """``script``'s part, built from the project's folder, else (a file it reads not found there) from the script's
    own: ``step.read("x.step")`` is read from the folder ``cad run`` ran in, which a script does not say."""
    import build123d as bd
    from OCP.BRep import BRep_Builder
    from OCP.BRepTools import BRepTools
    from OCP.TopoDS import TopoDS_Shape

    said = "failed"
    for folder_run in (project, script.parent):
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder) / "part.brep"
            try:
                done = subprocess.run([sys.executable, __file__, "--child", str(script), str(out)], cwd=folder_run,
                                      capture_output=True, text=True, timeout=LIMIT_S)
            except subprocess.TimeoutExpired:
                return None, LIMIT_S, f"build took over {LIMIT_S} s"
            if done.returncode == 0 and out.exists():
                shape = TopoDS_Shape()
                BRepTools.Read_s(shape, str(out), BRep_Builder())
                seconds = json.loads(done.stdout.strip().splitlines()[-1])["seconds"]
                return bd.Shape.cast(shape) if hasattr(bd.Shape, "cast") else bd.Compound(shape), seconds, ""
            said = (done.stderr.strip().splitlines() or ["failed"])[-1][:300]
            if "cannot read" not in said and "No such file" not in said:
                break
    return None, 0.0, said


def faces(shape) -> dict:
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Plane

    cylinders, facets, base, blends = [], 0, 0.0, 0
    low = shape.bounding_box().min.Z
    for face in shape.faces():
        surface = BRepAdaptor_Surface(face.wrapped)
        kind = surface.GetType()
        if kind == GeomAbs_Cylinder:
            cylinders.append(round(surface.Cylinder().Radius(), 4))
        elif kind != GeomAbs_Plane:
            blends += 1
        elif kind == GeomAbs_Plane:
            small_triangle = len(face.edges()) == 3 and face.area < FACET_AREA_MM2
            facets += small_triangle
            normal = face.normal_at()
            if not small_triangle and abs(normal.Z) > 0.999 and abs(face.center().Z - low) < 1e-3:
                base += face.area
    return {"cylinders": sorted(cylinders), "facets": facets, "baseArea": base, "blends": blends}


def gsl_steps(project: Path, folder: Path) -> list[dict]:
    """``cad gsl step`` at its defaults on each ``.gsl`` the project holds (the three largest): whether it writes a
    STEP as it is, at which depth, how near, how big and how long."""
    cad = Path(sys.executable).with_name("cad")
    found = []
    models = sorted(project.rglob("*.gsl"), key=lambda path: path.stat().st_size, reverse=True)[:3]
    for index, model in enumerate(m for m in models if not m.name.endswith(".baked.gsl")):
        out = folder / f"gsl{index}.step"
        started = time.time()
        try:
            done = subprocess.run([str(cad), "gsl", "step", str(model), str(out), "--json"], cwd=model.parent,
                                  capture_output=True, text=True, timeout=LIMIT_S)
            answer = json.loads(done.stdout.strip().splitlines()[-1]) if done.stdout.strip() else {}
        except (subprocess.TimeoutExpired, ValueError) as error:
            answer = {"ok": False, "summary": f"{type(error).__name__}"}
        said = answer.get("measurements") or {}
        found.append({"file": str(model.relative_to(project)), "ok": bool(answer.get("ok")), "depth": said.get("depth"),
                      "faces": said.get("faces"), "bytes": said.get("bytes"), "seconds": round(time.time() - started, 1),
                      "within": max(said.get("field_at_step_mm", 0), said.get("surface_to_step_mm", 0)) or None,
                      "said": "; ".join(f.get("message", "") for f in answer.get("findings") or [])[:300],
                      "step": str(out) if answer.get("ok") else None})
    return found


def measure(project: Path, scripts: list[Path], seed: Path | None, folder: Path) -> dict:
    import build123d as bd
    import trimesh

    import cad.trimesh as printing
    from cad._internal.step_readback import read_back

    best, seconds, error = None, 0.0, "no script declares a model"
    for script in scripts:
        shape, took, said = built(project, script)
        if shape is not None and (best is None or shape.volume > best.volume):
            best, seconds, error = shape, took, ""
        elif best is None:
            error = f"{script.relative_to(project)}: {said}"
    steps = gsl_steps(project, folder)
    if best is None and not scripts:
        # A part made in GSL alone (no script declares a model) is judged by the STEP cad gsl step writes of it.
        for each in steps:
            if each["step"]:
                shape = bd.import_step(each["step"])
                if best is None or shape.volume > best.volume:
                    best, seconds, error = shape, each["seconds"], ""
    result: dict = {"built": best is not None, "gslSteps": [{k: v for k, v in s.items() if k != "step"} for s in steps]}
    if best is None:
        return {**result, "error": error}
    result.update(valid=best.is_valid, solids=len(best.solids()), volume=best.volume, buildSeconds=seconds, **faces(best))
    with tempfile.TemporaryDirectory() as folder:
        step = Path(folder) / "part.step"
        started = time.time()
        bd.export_step(best, str(step))
        read = read_back(step)
        result.update(stepValid=bool(read and read[0]), stepBytes=step.stat().st_size,
                      stepSeconds=time.time() - started)
        stl = Path(folder) / "part.stl"
        bd.export_stl(best, str(stl), tolerance=0.1, angular_tolerance=0.3)
        report = printing.printing(trimesh.load(str(stl)), samples=500)
        result.update(watertight=report["mesh"]["watertight"], bodies=report["mesh"]["body_count"],
                      minWall=report["wall_thickness"].get("min_mm"),
                      supportArea=report["overhangs"].get("down_facing_area_below_limit_mm2"))
    if seed is not None:
        with tempfile.TemporaryDirectory() as folder:
            original = Path(folder) / seed.name
            original.write_bytes(seed.read_bytes())
            shape, _took, _said = built(Path(folder), original)
            if shape is not None:
                result.update(seedVolume=shape.volume, seedBaseArea=faces(shape)["baseArea"])
    return result


def main() -> None:
    if sys.argv[1:2] == ["--child"]:
        child(Path(sys.argv[2]).resolve(), Path(sys.argv[3]))
        return
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--part")
    parser.add_argument("--seed")
    parser.add_argument("--out", required=True)
    parser.add_argument("--limit", type=int, default=LIMIT_S, help="seconds each build and each gsl step may take")
    args = parser.parse_args()
    globals()["LIMIT_S"] = args.limit
    project = Path(args.project).resolve()
    if args.part:
        scripts = [project / args.part]
    else:
        scripts = sorted(path for path in project.rglob("*.py")
                         if "@model" in path.read_text(encoding="utf-8", errors="replace"))
    try:
        with tempfile.TemporaryDirectory() as folder:
            result = measure(project, [s for s in scripts if s.exists()], Path(args.seed) if args.seed else None,
                             Path(folder))
    except Exception as error:  # noqa: BLE001 - a part that cannot be measured is a result, said
        result = {"built": False, "error": f"{type(error).__name__}: {error}"[:300]}
    Path(args.out).write_text(json.dumps(result, indent=1))


if __name__ == "__main__":
    main()
