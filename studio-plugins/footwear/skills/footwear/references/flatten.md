# Flattening an upper piece

Read this when a flat pattern piece is wanted from a curved surface: a quarter, a vamp or a toe cap
taken from a last. Save the second block at the end as `flatten.py`.

## Contents

- [What goes in](#what-goes-in)
- [What it does](#what-it-does)
- [Reading the report](#reading-the-report)
- [Two pieces to try it on](#two-pieces-to-try-it-on)
- [flatten.py](#flattenpy)

## What goes in

One piece of the upper's surface as a triangle mesh (STL): a single surface with one outline and no
holes. Make it from the last: read the last into a model (`stl.read` or `step.read`, the cad skill's
inputs), split its surface along the design lines, return the one face that is the piece from a
`@model`, and export that model as an STL.

The script refuses, saying which, a closed shape (no outline), a piece with a hole or two separate
pieces (more than one outline), and a mesh whose triangles share an edge three ways.

## What it does

It lays the mesh flat in two steps: first keeping angles (least squares conformal maps), then
relaxing so that each triangle keeps its true size as nearly as its neighbours allow (as rigid as
possible). It writes the flat outline as one closed polyline in a DXF in millimetres, a picture of the
flat piece beside it, and prints a report.

- **The DXF.** Alone, the net outline is on the `CUT` layer. With `--margin 5` the net outline is on
  `NET` and a line 5 mm outside it on `CUT`. `--name` and `--size` put the piece's label on `TEXT`.
- **The picture** (`PIECE.png`) is the flat piece as a flattening tool shows it: blue where it must
  stretch to take the last's shape, red where it must gather, the net line, the cut line and a 50 mm
  bar. Show it with the report.
- **One margin all round is a start, not a pattern piece.** A real piece takes a different allowance
  on each edge: about 15 to 20 mm to last over, 6 to 8 mm where it lies under another piece, 5 mm to
  fold, 1.5 to 2 mm on a closed seam. The script does not know which edge is which: add those in the
  maker's CAD, or ask which allowance each edge takes. A surface that only bends, a cone or a cylinder, comes out with
  its true lengths and areas. A surface that domes or saddles cannot, and the report says by how much.

If triangles fold over one another when flat, it stops: the shape is too curved to be one piece.

## Reading the report

| Field                           | What it says                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `area_mm2`, `flat_area_mm2`     | The piece's area on the last, and flat                                       |
| `outline_mm`, `flat_outline_mm` | The length of its edge on the last, and flat                                 |
| `must_stretch_max_pct`          | The most any part of the flat piece has to stretch to reach the last's shape |
| `must_compress_max_pct`         | The most any part has to gather or compress                                  |
| `strain_p95_pct`                | Nineteen twentieths of the piece changes length by less than this            |

- **All near zero**: the piece only bends. It lies on the last as cut.
- **The outline longer flat than on the last**: the edge gathers when lasted. On a toe cap that is the
  pleating a laster works out; on a seam it means the seam will be eased.
- **The outline shorter flat**: the edge must stretch to reach.
- **How much is too much depends on the material**, and this script does not know it. Ask what the
  material is and how far it stretches, or quote the figures and let the maker judge. Where the
  figures are more than the material takes, split the piece along a design line or add a dart, and
  flatten each part.

An edge that will be sewn to another piece must match it in length: flatten both pieces and compare
their edges, as a garment's seams are compared.

The numbers describe geometry alone. Leather is pulled and set over the last and textile behaves
differently along and across its weave: neither is modelled.

## Two pieces to try it on

Two stand-in pieces, to see the script work before a last is in hand: one that only bends and one
that domes. Save as `upper_patch.py`, run `cad run upper_patch.py`, export each model as an STL and
flatten it. The first reports figures near zero; the second reports the toe cap figures shown in
the skill.

<!-- file: upper_patch.py -->

```python
"""Two stand-in pieces of an upper's surface, to try the flattening on: one that only bends (a cone,
like a quarter wrapped round the heel) and one that domes (a toe cap). With a last in hand, the
pieces are faces of the last instead: split its surface along the design lines and take each face.

Run: cad run upper_patch.py
"""
import build123d as bd
from cad import model


@model
def quarter_patch():
    cone = bd.Cone(34, 26, 60).faces().sort_by(bd.SortBy.AREA)[-1]      # the sloping face alone
    return bd.split(cone, bisect_by=bd.Plane.XZ, keep=bd.Keep.TOP)


@model
def toe_patch():
    dome = bd.Sphere(42).faces()[0]
    dome = bd.split(dome, bisect_by=bd.Plane.XY.offset(24), keep=bd.Keep.TOP)   # a cap
    return bd.split(dome, bisect_by=bd.Plane.XZ, keep=bd.Keep.TOP)              # half of it


if __name__ == "__main__":
    quarter_patch()
    toe_patch()
```

## flatten.py

<!-- file: flatten.py -->

```python
# /// script
# dependencies = ["numpy", "scipy", "trimesh", "ezdxf", "shapely", "matplotlib"]
# ///
"""Flatten one curved piece of an upper (a mesh patch with a single edge loop) into its flat pattern,
and say how much the material has to stretch or compress to take that shape.

Run: cad run flatten.py PATCH.stl PIECE.dxf [--name VAMP] [--size 42] [--margin 5] [--mirror]

Writes PIECE.dxf (the net outline on layer NET, the cut line on CUT when a margin is given, the piece's
name on TEXT) and PIECE.png: the flat piece coloured by how far each part must stretch or gather.
"""
import json
import pathlib
import sys

import ezdxf
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla
import trimesh


def local_frames(v: np.ndarray, f: np.ndarray):
    """Each triangle laid flat without stretch: corner 0 at the origin, corner 1 on +x. (m, 3, 2)."""
    e1, e2 = v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]]
    x1 = np.linalg.norm(e1, axis=1)
    ex = e1 / x1[:, None]
    normal = np.cross(e1, e2)
    double_area = np.linalg.norm(normal, axis=1)
    ey = np.cross(normal / double_area[:, None], ex)
    q = np.zeros((len(f), 3, 2))
    q[:, 1, 0] = x1
    q[:, 2, 0], q[:, 2, 1] = (e2 * ex).sum(1), (e2 * ey).sum(1)
    return q, double_area / 2


def boundary_loop(f: np.ndarray) -> list[int]:
    edges = np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    keys, counts = np.unique(np.sort(edges, axis=1), axis=0, return_counts=True)
    if (counts > 2).any():
        raise SystemExit("the patch is not a surface: an edge is shared by more than two triangles")
    open_edges = {tuple(k) for k in keys[counts == 1]}
    follow = {int(a): int(b) for a, b in edges if (min(a, b), max(a, b)) in open_edges}   # in the triangles' own winding
    if not follow:
        raise SystemExit("the patch has no edge: it is a closed shape, and has to be cut open to lie flat")
    start = next(iter(follow))
    loop, at = [start], follow[start]
    while at != start:
        loop.append(at)
        at = follow[at]
    if len(loop) != len(follow):
        raise SystemExit("the patch has more than one edge loop (a hole, or two pieces): flatten one piece with one outline")
    return loop


def conformal(v: np.ndarray, f: np.ndarray, q: np.ndarray, area: np.ndarray, loop: list[int]) -> np.ndarray:
    """A first flattening that keeps angles (least squares conformal maps): the start for the next step."""
    z = q[..., 0] + 1j * q[..., 1]
    w = np.stack([z[:, 2] - z[:, 1], z[:, 0] - z[:, 2], z[:, 1] - z[:, 0]], axis=1) / np.sqrt(2 * area)[:, None]
    rows = np.repeat(np.arange(len(f)), 3)
    m = sp.csr_matrix((w.ravel(), (rows, f.ravel())), shape=(len(f), len(v)))
    edge = np.array(loop)
    a = edge[np.argmax(np.linalg.norm(v[edge] - v[edge].mean(0), axis=1))]
    b = edge[np.argmax(np.linalg.norm(v[edge] - v[a], axis=1))]
    pinned = np.array([a, b])
    free = np.setdiff1d(np.arange(len(v)), pinned)
    target = np.array([0, np.linalg.norm(v[a] - v[b])], dtype=complex)
    mf, rhs = m[:, free], -(m[:, pinned] @ target)
    big = sp.bmat([[mf.real, -mf.imag], [mf.imag, mf.real]]).tocsr()
    solved = spla.spsolve((big.T @ big).tocsc(), big.T @ np.concatenate([rhs.real, rhs.imag]))
    uv = np.zeros((len(v), 2))
    uv[pinned, 0] = target.real
    uv[free, 0], uv[free, 1] = solved[: len(free)], solved[len(free):]
    return uv


def as_rigid_as_possible(f: np.ndarray, q: np.ndarray, uv: np.ndarray, rounds: int = 60) -> np.ndarray:
    """Then trade angle for length: each triangle keeps its true size as nearly as its neighbours allow."""
    n, weights, deltas, pairs = len(uv), [], [], []
    for i in range(3):
        j, k = (i + 1) % 3, (i + 2) % 3
        a, b = q[:, i] - q[:, k], q[:, j] - q[:, k]
        cot = (a * b).sum(1) / np.abs(a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0])
        weights.append(np.maximum(cot, 1e-6))          # an obtuse corner would weigh negative
        deltas.append(q[:, i] - q[:, j])
        pairs.append((f[:, i], f[:, j]))
    lap = sp.lil_matrix((n, n))
    for w, (i, j) in zip(weights, pairs):
        lap += sp.coo_matrix((np.concatenate([w, w, -w, -w]),
                              (np.concatenate([i, j, i, j]), np.concatenate([i, j, j, i]))), shape=(n, n))
    solve = spla.factorized(lap.tocsc()[1:, 1:])       # vertex 0 stays put
    for _ in range(rounds):
        s = np.zeros((len(f), 2, 2))
        for w, d, (i, j) in zip(weights, deltas, pairs):
            s += w[:, None, None] * np.einsum("ti,tj->tij", uv[i] - uv[j], d)
        angle = np.arctan2(s[:, 1, 0] - s[:, 0, 1], s[:, 0, 0] + s[:, 1, 1])
        cos, sin = np.cos(angle), np.sin(angle)
        rhs = np.zeros((n, 2))
        for w, d, (i, j) in zip(weights, deltas, pairs):
            turned = w[:, None] * np.stack([cos * d[:, 0] - sin * d[:, 1], sin * d[:, 0] + cos * d[:, 1]], axis=1)
            np.add.at(rhs, i, turned)
            np.subtract.at(rhs, j, turned)
        new = np.zeros_like(uv)
        new[1:, 0], new[1:, 1] = solve(rhs[1:, 0]), solve(rhs[1:, 1])
        if np.abs(new - new[0] - (uv - uv[0])).max() < 1e-5:
            uv = new
            break
        uv = new
    return uv


def flatten(v: np.ndarray, f: np.ndarray) -> tuple[np.ndarray, list[int], dict]:
    q, area = local_frames(v, f)
    loop = boundary_loop(f)
    uv = as_rigid_as_possible(f, q, conformal(v, f, q, area, loop))
    a, b, c = uv[f[:, 0]], uv[f[:, 1]], uv[f[:, 2]]
    flat_area = ((b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0])) / 2
    if (flat_area <= 0).any():
        raise SystemExit(f"{int((flat_area <= 0).sum())} triangles fold over in the flat piece: the shape is too curved "
                         "for one piece; split it along a seam or add a dart")
    edges = np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    strain = np.linalg.norm(uv[edges[:, 0]] - uv[edges[:, 1]], axis=1) / np.linalg.norm(v[edges[:, 0]] - v[edges[:, 1]], axis=1) - 1
    ring = np.array(loop + loop[:1])
    edge_3d = np.linalg.norm(v[ring[1:]] - v[ring[:-1]], axis=1).sum()
    edge_flat = np.linalg.norm(uv[ring[1:]] - uv[ring[:-1]], axis=1).sum()
    report = {
        "area_mm2": round(float(area.sum()), 1), "flat_area_mm2": round(float(flat_area.sum()), 1),
        "outline_mm": round(float(edge_3d), 1), "flat_outline_mm": round(float(edge_flat), 1),
        "must_stretch_max_pct": round(float(max(-strain.min(), 0) * 100), 2),    # flat is shorter here than on the last
        "must_compress_max_pct": round(float(max(strain.max(), 0) * 100), 2),    # flat is longer here: it gathers
        "strain_p95_pct": round(float(np.percentile(np.abs(strain), 95) * 100), 2),
    }
    return uv, loop, report, strain.reshape(3, -1).mean(axis=0)


def picture(path: str, uv: np.ndarray, f: np.ndarray, loop: list[int], strain: np.ndarray, cut, title: str, report: dict) -> None:
    """The flat piece as a flattening tool shows it: blue where it must stretch to take the last's
    shape, red where it must gather, with the net line, the cut line and a 50 mm bar for scale."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(9, 6.5))
    most = max(2.0, float(np.abs(strain).max()) * 100)
    shade = ax.tripcolor(uv[:, 0], uv[:, 1], f, facecolors=strain * 100, cmap="RdBu_r", vmin=-most, vmax=most)
    net = uv[loop + loop[:1]]
    ax.plot(net[:, 0], net[:, 1], color="#111111", lw=1.4 if cut is None else 0.9, ls="-" if cut is None else (0, (5, 3)))
    if cut is not None:
        ax.plot(cut[:, 0], cut[:, 1], color="#111111", lw=1.4)
    x0, y0 = (net if cut is None else cut).min(axis=0)
    ax.plot([x0, x0 + 50], [y0 - 8, y0 - 8], color="#111111", lw=2)
    ax.text(x0 + 25, y0 - 10, "50 mm", ha="center", va="top", fontsize=8)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_title(title, loc="left", fontsize=13, fontweight="bold")
    fig.text(0.125, 0.04, f"flat {report['flat_area_mm2']:.0f} mm2 (on the last {report['area_mm2']:.0f})  ·  outline flat "
             f"{report['flat_outline_mm']:.0f} mm (on the last {report['outline_mm']:.0f})  ·  stretch up to "
             f"{report['must_stretch_max_pct']:g}%  ·  gather up to {report['must_compress_max_pct']:g}%", fontsize=8, color="#6b6b6b")
    fig.colorbar(shade, ax=ax, shrink=0.6, label="must stretch  ←  % change in length, flat against the last  →  must gather")
    fig.savefig(path, dpi=160)
    plt.close(fig)


if __name__ == "__main__":
    import argparse

    ask = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ask.add_argument("patch")
    ask.add_argument("dxf")
    ask.add_argument("--name", default="", help="the piece's name: VAMP, QUARTER, TOE CAP")
    ask.add_argument("--size", default="", help="the size the last is")
    ask.add_argument("--margin", type=float, default=0.0, help="one allowance all round the net piece, in mm")
    ask.add_argument("--mirror", action="store_true", help="the other foot, or seen from inside")
    args = ask.parse_args()
    mesh = trimesh.load(args.patch, force="mesh", process=True)
    mesh.merge_vertices()
    mesh.update_faces(mesh.nondegenerate_faces(height=1e-6))    # slivers a kernel leaves at a pole or a seam
    mesh.update_faces(mesh.unique_faces())
    mesh.remove_unreferenced_vertices()
    trimesh.repair.fix_winding(mesh)
    faces = np.asarray(mesh.faces)
    uv, loop, report, strain = flatten(np.asarray(mesh.vertices, dtype=float), faces)
    if args.mirror:
        uv[:, 0] = -uv[:, 0]
    cut = None
    if args.margin > 0:
        from shapely.geometry import Polygon

        cut = np.array(Polygon(uv[loop]).buffer(args.margin, join_style="mitre", mitre_limit=2.0).exterior.coords)
    label = "  ".join(part for part in (args.name.upper(), f"SIZE {args.size}" if args.size else "") if part)
    doc = ezdxf.new("R2010", setup=False)
    doc.units = ezdxf.units.MM
    for layer in ("NET", "CUT", "TEXT"):
        doc.layers.add(layer)
    space = doc.modelspace()
    space.add_lwpolyline([tuple(p) for p in uv[loop]], close=True, dxfattribs={"layer": "NET" if cut is not None else "CUT"})
    if cut is not None:
        space.add_lwpolyline([tuple(p) for p in cut[:-1]], close=True, dxfattribs={"layer": "CUT"})
    if label:
        space.add_text(label, dxfattribs={"layer": "TEXT", "height": 4, "insert": tuple(uv[loop].mean(axis=0))})
    doc.saveas(args.dxf)
    allowance = f"net piece + {args.margin:g} mm all round" if cut is not None else "net piece, no allowances"
    picture(str(pathlib.Path(args.dxf).with_suffix(".png")), uv, faces, loop, strain, cut,
            f"{label or pathlib.Path(args.dxf).stem}   {allowance}", report)
    print(json.dumps(report, indent=2))
    print(f"wrote {args.dxf} and its picture: the {allowance}")
```
