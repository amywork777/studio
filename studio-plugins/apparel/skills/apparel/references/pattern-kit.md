# The pattern kit

Read this before writing or changing a design script. Put the block at the end into the project as
`pattern_kit.py`, unchanged, beside the design script. It is long: do not retype it, write it out of
this page:

````bash
awk '/^<!-- file: pattern_kit.py -->/{f=1;next} f&&/^```python/{p=1;next} p&&/^```/{exit} p' <this page> > pattern_kit.py
````

It needs `ezdxf`, `shapely` and `matplotlib`, which the design script's header names.

## Contents

- [Pieces, edges and allowances](#pieces-edges-and-allowances)
- [Curves, lengths and notches](#curves-lengths-and-notches)
- [Seam checks](#seam-checks)
- [Writing files](#writing-files)
- [pattern_kit.py](#pattern_kitpy)

## Pieces, edges and allowances

Geometry is millimetres with y up. A `Piece` is a closed loop of `Edge`s, each a list of points on the
**sew line**, in loop order: an edge ends exactly where the next begins, and the loop may run either
way round.

```python
Piece("BACK", [
    Edge("neckline", bezier(...), 6),
    Edge("shoulder", [(nw, 0), (sx, sy)], 10),
    Edge("armhole", bezier(...), 10),
    Edge("side", [(w, arm), (w, hem)], 10),
    Edge("hem", [(w, hem), (0, hem)], 25, kind="hem"),
    Edge("centre", [(0, hem), (0, -neck_depth)], 0, kind="fold"),
], grain=((x, y0), (x, y1)), quantity=1, material="SELF")
```

- `allowance` is how far the cut line stands outside that edge's sew line, in mm.
- `kind="seam"` (the default) is mitred to its neighbours. A corner too sharp to mitre (further than
  three allowances from the sew corner) is squared off.
- `kind="hem"` is a straight, turned-up hem: its corners are its neighbours mirrored in the fold line.
  A hem's neighbours must rise from it; a hem parallel to its neighbour is refused.
- `kind="fold"` has allowance 0 and is written as the piece's mirror line. The piece is half of the
  cut part.
- `material` is the fabric a piece is cut from, in a pattern room's words: `SELF` (the main fabric),
  `RIB`, `LINING`, `FUSING`. `note` is anything else to print on the piece.
- `piece.cut_text()` is how many to cut, as a pattern says it: `CUT 1 ON FOLD SELF` for a piece with a
  fold edge, `CUT 2 (1 PAIR) SELF` for a quantity of two.
- `piece.sew_line()` and `piece.cut_line()` return the two outlines; `piece.edge(name)` one edge.
- A piece whose edges do not join, or whose sew line crosses itself, raises when it is made, by name.

## Curves, lengths and notches

- `bezier(p0, p1, p2, p3)` is a cubic curve as points. It leaves `p0` heading for `p1` and arrives at
  `p3` coming from `p2`: set those two so a curve meets its neighbours square where a seam needs it
  (an armhole meets the side seam at a right angle, a neckline meets the centre fold at one).
- `length(points)` is a line's walked length. Measure one edge at a time: joining two edges' point
  lists and measuring the result adds the jump between them.
- `walk(points, d)` is the point a distance `d` along a line and the direction there.
- `piece.notch(edge, d)` puts a notch a walked distance `d` from the edge's start, or from its end
  with `from_end=True`. Match a seam's notches by walking the same distance from the same corner on
  both pieces. A notch's slit is 5 mm deep, or half the allowance where that is less.

## Seam checks

```python
checks = seam_checks([
    ("sleeve cap to armhole", length(cap), length(back_armhole) + length(front_armhole), 10),
    ("shoulder, back to front", length(back_shoulder), length(front_shoulder), 0),
])
```

Each row is a name, two lengths and the ease the first is meant to have over the second. A row
passes when it is within 0.5 mm (`tol`). The result is a list of dictionaries (`seam`, `a`, `b`,
`ease`, `off`, `ok`) the design writes to JSON and fails on.

Where one length depends on another, solve for it and still check it. The worked T-shirt fixes
the sleeve's width and solves the cap's height until the cap is the armhole plus its ease, then checks
the result like any other seam.

## Writing files

Every sheet draws a piece the way pattern software and printed patterns do: the cut line solid, the
sew line dashed inside it, a fold edge as a dash-dot line with a PLACE ON FOLD bracket, notches as a
T on the cut line, each edge's allowance beside it, and the grainline as a double arrow carrying the
style, the piece's name, its size and how many to cut.

| Call                                                       | Writes                                                                                                                                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `write_nest(sized, stem, style, base)`                     | The graded nest, every size stacked on its drafting origin with a line of its own and the base size drawn whole: `STEM.svg` at 1:1 and `STEM.png` to look at                        |
| `write_pattern(pieces, path, style, size)`                 | One size at 1:1 with a 10 cm test square, as an SVG or a PDF by the path's ending, for a plotter or a copy shop                                                                     |
| `write_print(sized, stem, style, base, papers)`            | The nest as pages to print at home and tape: `STEM_A4.pdf`, `STEM_Letter.pdf`, `STEM_A0.pdf`. A cover with the test square, the size key and the map of pages, then a page per tile |
| `write_marker(pieces, stem, style, size, fabric_width)`    | A lay plan for one garment, `STEM.png`, and returns the lay's length and the share of fabric used                                                                                   |
| `write_techpack(stem, style, title, base, specs, poms, …)` | The tech pack's measurement page, A4 landscape: flat sketches with each point of measure lettered on them, and the graded table. `STEM.pdf` and `STEM.png`                          |
| `write_aama(sized, path, style, base)`                     | One DXF for a cutting room: see [Handing it over](handoff.md)                                                                                                                       |

- A printed page has a border to trim on, a triangle on each side to match with its neighbour's, and
  its name large in grey: `B3` is row B, column 3. Pages no piece reaches are left out.
- `write_marker` opens fold pieces out, mirrors pairs, turns every grainline along the fabric and sets
  the pieces side by side. It does not nest one piece into another's hollows, so a marker maker's lay
  is shorter: give its figure as a first one for fabric, and say so.
- `layout(pieces, width=None)` is the arrangement the sheets use, in rows when a width is given.

## pattern_kit.py

<!-- file: pattern_kit.py -->

```python
"""Flat pattern kit: pieces, seam allowances, notches, seam checks, and the files a pattern is read
from: a 1:1 sheet per size, the graded nest, tiled pages to print at home, a lay plan, a tech pack
page and an AAMA/ASTM DXF.

Geometry is millimetres, y up. A piece is a closed loop of named edges on the SEW line; the cut line
is derived from each edge's allowance. Nothing here knows a garment: a design is a function that
returns pieces (see the design script beside this file).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import ezdxf
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from shapely import affinity
from shapely.geometry import LinearRing, LineString, Polygon

Pt = tuple[float, float]


# ---------------------------------------------------------------- curves and lengths
def bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: int = 48) -> list[Pt]:
    """A cubic Bezier as n+1 points. The tangent at p0 points at p1, at p3 it comes from p2."""
    out = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t**2, t**3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def length(pts: list[Pt]) -> float:
    return sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))


def walk(pts: list[Pt], d: float) -> tuple[Pt, Pt]:
    """The point a walked distance d along a polyline, and the unit tangent there."""
    if not 0 <= d <= length(pts) + 1e-6:
        raise ValueError(f"walk of {d:.1f} mm is off a line {length(pts):.1f} mm long")
    for a, b in zip(pts, pts[1:]):
        seg = math.dist(a, b)
        if seg and d <= seg + 1e-9:
            t = d / seg
            return (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])), ((b[0] - a[0]) / seg, (b[1] - a[1]) / seg)
        d -= seg
    a, b = pts[-2], pts[-1]
    seg = math.dist(a, b)
    return b, ((b[0] - a[0]) / seg, (b[1] - a[1]) / seg)


def _meet(a0: Pt, a1: Pt, b0: Pt, b1: Pt) -> Pt | None:
    """Where the infinite lines a0-a1 and b0-b1 cross; None when parallel."""
    d = (a1[0] - a0[0]) * (b1[1] - b0[1]) - (a1[1] - a0[1]) * (b1[0] - b0[0])
    if abs(d) < 1e-9:
        return None
    t = ((b0[0] - a0[0]) * (b1[1] - b0[1]) - (b0[1] - a0[1]) * (b1[0] - b0[0])) / d
    return (a0[0] + t * (a1[0] - a0[0]), a0[1] + t * (a1[1] - a0[1]))


# ---------------------------------------------------------------- pieces
@dataclass
class Edge:
    name: str
    pts: list[Pt]             # on the sew line, in the piece's loop order
    allowance: float          # mm outside the sew line; 0 on a fold
    kind: str = "seam"        # "seam", "hem" (straight, turned up: its corners are mirrored) or "fold"


@dataclass
class Notch:
    edge: str
    at: Pt                    # on the sew line
    normal: Pt                # unit, pointing out of the piece
    allowance: float

    @property
    def on_cut(self) -> Pt:
        return (self.at[0] + self.normal[0] * self.allowance, self.at[1] + self.normal[1] * self.allowance)

    @property
    def depth(self) -> float:  # a slit never reaches the sew line
        return min(5.0, self.allowance / 2)


@dataclass
class Piece:
    name: str
    edges: list[Edge]
    grain: tuple[Pt, Pt]
    quantity: int = 1
    note: str = ""
    material: str = "SELF"    # the fabric it is cut from: SELF (the main fabric), RIB, LINING, FUSING
    notches: list[Notch] = field(default_factory=list)

    def __post_init__(self) -> None:
        for e, nxt in zip(self.edges, self.edges[1:] + self.edges[:1]):
            if math.dist(e.pts[-1], nxt.pts[0]) > 1e-6:
                raise ValueError(f"{self.name}: edge {e.name} does not end where {nxt.name} starts")
        ring = self.sew_line()
        if not Polygon(ring).is_valid:
            raise ValueError(f"{self.name}: the sew line crosses itself")
        self._out = 1.0 if not LinearRing(ring).is_ccw else -1.0   # outward is left of travel on a clockwise loop

    @property
    def fold(self) -> Edge | None:
        return next((e for e in self.edges if e.kind == "fold"), None)

    def cut_text(self) -> str:
        """How many to cut, as a pattern says it: CUT 1 ON FOLD, CUT 2 (1 PAIR)."""
        text = f"CUT {self.quantity}" + (" ON FOLD" if self.fold else " (1 PAIR)" if self.quantity == 2 else "")
        return f"{text} {self.material}"

    def edge(self, name: str) -> Edge:
        return next(e for e in self.edges if e.name == name)

    def sew_line(self) -> list[Pt]:
        return [p for e in self.edges for p in e.pts[:-1]]

    def notch(self, edge: str, d: float, from_end: bool = False) -> None:
        """A notch a walked distance d along an edge's sew line, from its start or its end."""
        e = self.edge(edge)
        at, (tx, ty) = walk(e.pts[::-1] if from_end else e.pts, d)
        if from_end:
            tx, ty = -tx, -ty
        self.notches.append(Notch(edge, at, (-ty * self._out, tx * self._out), e.allowance))

    def _offset(self, e: Edge) -> list[Pt]:
        if e.allowance == 0:
            return list(e.pts)
        g = LineString(e.pts).offset_curve(self._out * e.allowance, join_style="mitre")
        if g.geom_type != "LineString":      # a tight curve whose allowance folds on itself
            g = max(g.geoms, key=lambda part: part.length)
        pts = [(x, y) for x, y in g.coords]
        return pts[::-1] if math.dist(pts[0], e.pts[0]) > math.dist(pts[-1], e.pts[0]) else pts

    def cut_line(self) -> list[Pt]:
        """The cut line: each edge moved out by its allowance, mitred at corners, hems mirrored."""
        offs = [self._offset(e) for e in self.edges]
        out: list[Pt] = []
        n = len(self.edges)
        for i in range(n):
            cur, nxt = self.edges[i], self.edges[(i + 1) % n]
            a, b = offs[i], offs[(i + 1) % n]
            out.extend(a[1:-1])
            if nxt.kind == "hem" and cur.kind != "hem":
                out.extend(_hem_corner(a[-2], a[-1], nxt, self._out))
            elif cur.kind == "hem" and nxt.kind != "hem":
                out.extend(reversed(_hem_corner(b[1], b[0], cur, self._out)))
            else:
                corner = _meet(a[-2], a[-1], b[0], b[1])
                limit = 3 * max(cur.allowance, nxt.allowance, 1.0)
                if corner is None or math.dist(corner, cur.pts[-1]) > limit:
                    out.extend([a[-1], b[0]])        # too sharp to mitre: square it off
                else:
                    out.append(corner)
        return out


def _hem_corner(far: Pt, near: Pt, hem: Edge, out_sign: float) -> list[Pt]:
    """A turned-up hem's corner: the neighbouring cut line runs to the hem's fold line (A), then the
    allowance is that neighbour mirrored in the fold line (C), so the hem lies flat when turned up."""
    h0, h1 = hem.pts[0], hem.pts[-1]
    hx, hy = (h1[0] - h0[0]) / math.dist(h0, h1), (h1[1] - h0[1]) / math.dist(h0, h1)
    nx, ny = -hy * out_sign, hx * out_sign                      # out of the piece
    a = _meet(far, near, h0, h1)
    if a is None:
        raise ValueError(f"hem {hem.name}: its neighbour runs parallel to it")
    dx, dy = far[0] - near[0], far[1] - near[1]                 # along the neighbour, into the piece
    inward = -(dx * nx + dy * ny)
    if inward <= 1e-9:
        raise ValueError(f"hem {hem.name}: its neighbour does not rise from it")
    t = hem.allowance / inward
    bx, by = a[0] + t * dx, a[1] + t * dy                       # the neighbour, one allowance up
    return [a, (bx + 2 * hem.allowance * nx, by + 2 * hem.allowance * ny)]


# ---------------------------------------------------------------- checks
def seam_checks(pairs: list[tuple[str, float, float, float]], tol: float = 0.5) -> list[dict]:
    """Each pair is (name, length a, length b, ease), lengths walked on the sew lines: a must be
    b + ease, within tol mm."""
    rows = []
    for name, a, b, ease in pairs:
        rows.append({"seam": name, "a": round(a, 1), "b": round(b, 1), "ease": ease,
                     "off": round(a - b - ease, 2), "ok": abs(a - b - ease) <= tol})
    return rows


# ---------------------------------------------------------------- layout
Box = tuple[float, float, float, float]


def _shelves(boxes: dict[str, Box], gap: float, width: float | None) -> tuple[dict[str, Pt], float, float]:
    """Boxes left to right in rows no wider than width: the move each takes, and the sheet's size."""
    x = top = row = wide = 0.0
    moves = {}
    for name, (minx, miny, maxx, maxy) in boxes.items():
        w, h = maxx - minx, maxy - miny
        if width is not None and x > 0 and x + w > width:
            x, top, row = 0.0, top + row + gap, 0.0
        moves[name] = (x - minx, -top - maxy)
        x, row, wide = x + w + gap, max(row, h), max(wide, x + w)
    return moves, wide, top + row


def _box(pieces: list[Piece]) -> Box:
    b = [Polygon(p.cut_line()).bounds for p in pieces]
    return (min(v[0] for v in b), min(v[1] for v in b), max(v[2] for v in b), max(v[3] for v in b))


def layout(pieces: list[Piece], gap: float = 40.0, width: float | None = None) -> dict[str, Pt]:
    """Pieces side by side by their cut lines, in rows when a width is given. For looking at and
    printing: a lay plan for cutting is `write_marker`."""
    return _shelves({p.name: _box([p]) for p in pieces}, gap, width)[0]


# ---------------------------------------------------------------- drawing a piece as a pattern shows it
INK, SEW, FOLD, FILL, QUIET = "#111111", "#c0392b", "#1f5fa8", "#f6f1e7", "#6b6b6b"
# One line per size in a nest, as a multi-size pattern prints them: the base size is solid black.
NEST = [("#1b6ca8", (0, (1, 2))), ("#2a9d5c", (0, (6, 2))), ("#d1730f", (0, (10, 2, 2, 2))),
        ("#8e44ad", (0, (4, 2, 1, 2, 1, 2))), ("#c0392b", (0, (12, 3))), ("#16a085", (0, (2, 4)))]


def _text(k: float) -> float:
    """How large words are on a sheet drawn at scale k: true size at 1:1, legible on a small picture."""
    return k if k >= 1 else max(k, 0.45)


def _upright(angle: float) -> float:
    return angle - 180 if angle > 90 else angle + 180 if angle <= -90 else angle


def _arrow(ax, tip: Pt, back: Pt, k: float, color: str = INK, size: float = 9.0) -> None:
    ang = math.atan2(back[1] - tip[1], back[0] - tip[0])
    wings = [(tip[0] + size * math.cos(ang + s), tip[1] + size * math.sin(ang + s)) for s in (0.3, -0.3)]
    ax.fill(*zip(tip, *wings), color=color, lw=0, zorder=5)


def _draw_piece(ax, p: Piece, move: Pt, size: str, style: str, k: float = 1.0, ink: str = INK,
                dash="-", full: bool = True) -> None:
    """One piece: the cut line, and when full its sew line, fold, notches, grainline, label and allowances."""
    dx, dy = move
    lw, k = max(k, 0.3) ** 0.5, _text(k)

    def mv(pts: list[Pt]) -> list[Pt]:
        return [(x + dx, y + dy) for x, y in pts]

    cut = mv(p.cut_line())
    if full:
        ax.fill(*zip(*cut), color=FILL, lw=0, zorder=1)
    ax.plot(*zip(*(cut + cut[:1])), color=ink, lw=(1.3 if full else 1.0) * lw, ls=dash, zorder=4 if full else 3,
            solid_joinstyle="miter")
    if not full:
        return
    sew = mv(p.sew_line())
    ax.plot(*zip(*(sew + sew[:1])), color=SEW, lw=0.7 * lw, ls=(0, (5, 3)), zorder=2)
    out = p._out
    for e in p.edges:
        mid, (tx, ty) = walk(e.pts, length(e.pts) / 2)
        nx, ny = ty * out, -tx * out                                  # into the piece
        rot = _upright(math.degrees(math.atan2(ty, tx)))
        mid = (mid[0] + dx, mid[1] + dy)
        if e.kind == "fold":                                          # the fold line and its bracket
            a, b = mv([e.pts[0], e.pts[-1]])
            ax.plot(*zip(a, b), color=FOLD, lw=1.6 * lw, ls=(0, (12, 3, 2, 3)), zorder=4)
            span = math.dist(a, b)
            q = [(a[0] + tx * span * f, a[1] + ty * span * f) for f in (0.25, 0.75)]
            r = [(x + nx * 16, y + ny * 16) for x, y in q]
            ax.plot(*zip(q[0], r[0], r[1], q[1]), color=FOLD, lw=0.9 * lw, zorder=4)
            for tip, back in zip(q, r):
                _arrow(ax, tip, back, k, FOLD, 7)
            ax.text(mid[0] + nx * 24, mid[1] + ny * 24, "PLACE ON FOLD", color=FOLD, fontsize=9 * k, rotation=rot,
                    rotation_mode="anchor", ha="center", va="center", clip_on=True)
        elif e.allowance and length(e.pts) > 60:                      # what each edge's allowance is
            word = f"HEM {e.allowance:g}" if e.kind == "hem" else f"{e.allowance:g}"
            ax.text(mid[0] + nx * 7, mid[1] + ny * 7, word, color=QUIET, fontsize=6.5 * k, rotation=rot,
                    rotation_mode="anchor", ha="center", va="center", clip_on=True)
    for nt in p.notches:                                              # a T on the cut line
        c = (nt.on_cut[0] + dx, nt.on_cut[1] + dy)
        tip = (c[0] - nt.normal[0] * nt.depth, c[1] - nt.normal[1] * nt.depth)
        bar = [(tip[0] - nt.normal[1] * s, tip[1] + nt.normal[0] * s) for s in (-2, 2)]
        ax.plot(*zip(c, tip), color=ink, lw=1.2 * lw, zorder=5)
        ax.plot(*zip(*bar), color=ink, lw=1.2 * lw, zorder=5)
    g0, g1 = mv(list(p.grain))                                        # the grainline, with the piece's label on it
    ax.plot(*zip(g0, g1), color=ink, lw=0.9 * lw, zorder=5)
    _arrow(ax, g0, g1, k)
    _arrow(ax, g1, g0, k)
    gx, gy = (g0[0] + g1[0]) / 2, (g0[1] + g1[1]) / 2
    rot = _upright(math.degrees(math.atan2(g1[1] - g0[1], g1[0] - g0[0])))
    ux, uy = -math.sin(math.radians(rot)), math.cos(math.radians(rot))  # above the line, as the label reads
    words = dict(rotation=rot, rotation_mode="anchor", ha="center", color=ink, clip_on=True, zorder=5)
    ax.text(gx + ux * 4, gy + uy * 4, f"{style}  {p.name}", fontsize=15 * k, fontweight="bold", va="bottom", **words)
    detail = f"SIZE {size}  ·  {p.cut_text()}" + (f"\n{p.note}" if p.note else "")
    ax.text(gx - ux * 4, gy - uy * 4, detail, fontsize=9 * k, va="top", linespacing=1.4, **words)


Group = tuple[str, list[tuple[Piece, str, str, object, bool]]]        # a place on the sheet, and what is drawn there


def _sheet(groups: list[Group], style: str, width: float | None, gap: float = 35.0, pad: float = 15.0):
    """Groups set out on a sheet: a function that draws it on axes, its size in mm, and each group's box."""
    moves, w, h = _shelves({name: _box([e[0] for e in entries]) for name, entries in groups}, gap, width)
    moves = {name: (dx + pad, dy - pad) for name, (dx, dy) in moves.items()}
    boxes = []
    for name, entries in groups:
        b = _box([e[0] for e in entries])
        boxes.append((b[0] + moves[name][0], b[1] + moves[name][1], b[2] + moves[name][0], b[3] + moves[name][1]))

    def draw(ax, k: float = 1.0) -> None:
        for name, entries in groups:
            for piece, size, ink, dash, full in entries:
                _draw_piece(ax, piece, moves[name], size, style, k, ink, dash, full)

    return draw, w + 2 * pad, h + 2 * pad, boxes


def _axes(fig, rect, x0: float, x1: float, y0: float, y1: float):
    ax = fig.add_axes(rect)
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.axis("off")
    return ax


def _mm_figure(w: float, h: float, k: float = 1.0):
    """A figure w by h mm (times k) whose axes are in sheet millimetres: x right, y from -h up to 0."""
    fig = plt.figure(figsize=(w * k / 25.4, h * k / 25.4))
    return fig, _axes(fig, [0, 0, 1, 1], 0, w, -h, 0)


def _test_square(ax, x: float, y: float, k: float = 1.0) -> None:
    """A 100 mm square with a 2 in square in it, top left at (x, y): measure it to check the print's scale."""
    for side, word in ((100.0, "10 cm"), (50.8, "2 in")):
        ax.plot([x, x + side, x + side, x, x], [y, y, y - side, y - side, y], color=INK, lw=0.8)
        ax.text(x + side - 2, y - side + 2, word, fontsize=7 * k, ha="right", va="bottom", color=INK)


def _legend(ax, x: float, y: float, sizes: list[tuple[str, str, object]], k: float = 1.0) -> None:
    """What each line is, and in a nest which size each line is."""
    rows = [("cut line", INK, "-", 1.3), ("sew line", SEW, (0, (5, 3)), 0.7), ("fold line", FOLD, (0, (12, 3, 2, 3)), 1.6)]
    rows += [(f"size {name}", ink, dash, 1.0) for name, ink, dash in sizes]
    k = _text(k)
    for i, (word, ink, dash, lw) in enumerate(rows):
        ax.plot([x, x + 30 * k], [y - 7 * k * i] * 2, color=ink, ls=dash, lw=lw)
        ax.text(x + 35 * k, y - 7 * k * i, word, fontsize=8 * k, va="center", color=INK)


def _nest_groups(sized: dict[str, list[Piece]], base: str) -> tuple[list[Group], list[tuple[str, str, object]]]:
    others = [s for s in sized if s != base]
    look = {s: NEST[i % len(NEST)] for i, s in enumerate(others)}
    groups = []
    for i, piece in enumerate(sized[base]):
        entries = [(sized[s][i], s, *look[s], False) for s in others] + [(piece, base, INK, "-", True)]
        groups.append((piece.name, entries))
    return groups, [(s, *look[s]) for s in others] + [(f"{base} (base)", INK, "-")]


def _save(fig, *paths: str, dpi: int = 200) -> None:
    for path in paths:
        fig.savefig(path, dpi=dpi)
    plt.close(fig)


# ---------------------------------------------------------------- the sheets a pattern is read from
def write_pattern(pieces: list[Piece], path: str, style: str, size: str) -> None:
    """One size at 1:1 (SVG or PDF by the path's ending), for a plotter or a copy shop's wide printer."""
    draw, w, h, _ = _sheet([(p.name, [(p, size, INK, "-", True)]) for p in pieces], style, 1100.0)
    fig, ax = _mm_figure(w, h + 120)
    ax.set_ylim(-h, 120)
    draw(ax)
    _test_square(ax, 15, 110)
    ax.text(130, 106, f"{style}   SIZE {size}", fontsize=18, fontweight="bold", va="top")
    ax.text(130, 92, "Printed at 100%. Millimetres. Seam allowances are included: each edge says its own.", fontsize=9, va="top")
    _legend(ax, 130, 74, [])
    _save(fig, path)


def write_nest(sized: dict[str, list[Piece]], stem: str, style: str, base: str) -> None:
    """Every size stacked on its drafting origin, the base size drawn whole: STEM.svg at 1:1 and
    STEM.png to look at."""
    groups, sizes = _nest_groups(sized, base)
    draw, w, h, _ = _sheet(groups, style, 1300.0)
    for k, path in ((1.0, f"{stem}.svg"), (0.22, f"{stem}.png")):
        fig, ax = _mm_figure(w, h + 120, k)
        ax.set_ylim(-h, 120)
        draw(ax, k)
        ax.text(15, 110, f"{style}   GRADED NEST   {' '.join(sized)}", fontsize=18 * _text(k), fontweight="bold", va="top")
        _legend(ax, 15, 84, sizes, k)
        if k == 1:
            _test_square(ax, w - 115, 110)
        _save(fig, path)


PAPER = {"A4": (210.0, 297.0), "Letter": (215.9, 279.4), "A0": (841.0, 1189.0)}


def write_print(sized: dict[str, list[Piece]], stem: str, style: str, base: str,
                papers: tuple[str, ...] = ("A4", "Letter", "A0"), margin: float = 10.0) -> dict[str, int]:
    """The nest as pages to print at 100% and tape together: STEM_<paper>.pdf, with a cover page that
    has the test square and the map of pages. Pages no piece reaches are left out. Returns the page counts."""
    groups, sizes = _nest_groups(sized, base)
    counts = {}
    for paper in papers:
        pw, ph = PAPER[paper]
        cw, ch = pw - 2 * margin, ph - 2 * margin
        draw, w, h, boxes = _sheet(groups, style, max(cw, min(1300.0, 6 * cw)) - 30, pad=0.0)
        cols, rows = math.ceil(w / cw), math.ceil(h / ch)
        used = [(r, c) for r in range(rows) for c in range(cols)
                if any(b[0] < (c + 1) * cw and b[2] > c * cw and -b[3] < (r + 1) * ch and -b[1] > r * ch for b in boxes)]

        def name(r: int, c: int) -> str:                                  # A1 is the top left page
            return f"{chr(65 + r)}{c + 1}"

        with PdfPages(f"{stem}_{paper}.pdf") as pdf:
            # The cover: how to print it, the test square, which line is which size, and the map of pages.
            fig = plt.figure(figsize=(pw / 25.4, ph / 25.4))
            ax = _axes(fig, [0, 0, 1, 1], 0, pw, -ph, 0)
            ax.text(margin, -margin, f"{style}   sizes {' '.join(sized)}", fontsize=16, fontweight="bold", va="top")
            ax.text(margin, -margin - 10, f"{len(used)} pages of {paper}. Print at 100% (actual size), not 'fit to page'.\n"
                    "Measure the square before printing the rest. Trim each page on its border,\n"
                    "match the triangles on neighbouring pages and tape. Cut on your size's line.",
                    fontsize=9, va="top", linespacing=1.5)
            _test_square(ax, margin, -margin - 34)
            _legend(ax, margin + 115, -margin - 38, sizes)
            scale = min((pw - 2 * margin) / (cols * cw), (ph - 175) / (rows * ch))
            mini = _axes(fig, [margin / pw, margin / ph, cols * cw * scale / pw, rows * ch * scale / ph],
                         0, cols * cw, -rows * ch, 0)
            draw(mini, scale)
            for r in range(rows):
                for c in range(cols):
                    on = (r, c) in used
                    mini.plot([c * cw, (c + 1) * cw, (c + 1) * cw, c * cw, c * cw],
                              [-r * ch, -r * ch, -(r + 1) * ch, -(r + 1) * ch, -r * ch], color=QUIET, lw=0.4)
                    mini.text((c + 0.5) * cw, -(r + 0.5) * ch, name(r, c) if on else "", fontsize=max(5, 60 * scale),
                              color=QUIET, alpha=0.7, ha="center", va="center")
            pdf.savefig(fig)
            plt.close(fig)
            # The pages: one window of the sheet each, with its border, its name and its matching marks.
            fig = plt.figure(figsize=(pw / 25.4, ph / 25.4))
            ax = _axes(fig, [margin / pw, margin / ph, cw / pw, ch / ph], 0, cw, -ch, 0)
            draw(ax)
            deco = _axes(fig, [0, 0, 1, 1], 0, pw, 0, ph)
            deco.plot([margin, pw - margin, pw - margin, margin, margin], [margin, margin, ph - margin, ph - margin, margin],
                      color=QUIET, lw=0.5)
            for x, y, dx, dy in ((pw / 2, margin, 0, 1), (pw / 2, ph - margin, 0, -1), (margin, ph / 2, 1, 0), (pw - margin, ph / 2, -1, 0)):
                deco.fill([x - 4 * dy, x + 4 * dy, x + 4 * dx], [y - 4 * dx, y + 4 * dx, y + 4 * dy], color=QUIET, lw=0)
            mark = deco.text(pw / 2, ph / 2, "", fontsize=60, color=QUIET, alpha=0.18, ha="center", va="center")
            foot = deco.text(margin, margin / 2, "", fontsize=7, color=QUIET, va="center")
            for r, c in used:
                ax.set_xlim(c * cw, (c + 1) * cw)
                ax.set_ylim(-(r + 1) * ch, -r * ch)
                mark.set_text(name(r, c))
                foot.set_text(f"{style}  ·  page {name(r, c)}: row {r + 1} of {rows}, column {c + 1} of {cols}  ·  print at 100%")
                pdf.savefig(fig)
            plt.close(fig)
        counts[paper] = len(used)
    return counts


def write_marker(pieces: list[Piece], stem: str, style: str, size: str, fabric_width: float = 1500.0,
                 gap: float = 5.0) -> dict[str, float]:
    """A lay plan for one garment on open fabric: every piece whole (a fold piece opened, a pair
    mirrored), its grainline along the fabric, set side by side in columns. STEM.png.
    Returns the lay's length and how much of the fabric it uses. Pieces are not nested into one
    another, so a marker maker's lay is shorter: this is a first figure for fabric, not the cutting plan."""
    shapes = []
    for p in pieces:
        poly = Polygon(p.cut_line())
        if p.fold:                                                       # open it out about the fold
            (ax_, ay), (bx, by) = p.fold.pts[0], p.fold.pts[-1]
            ang = math.degrees(math.atan2(by - ay, bx - ax_))
            turned = affinity.rotate(poly, -ang, origin=(ax_, ay))
            poly = affinity.rotate(turned.union(affinity.scale(turned, yfact=-1, origin=(ax_, ay))), ang, origin=(ax_, ay))
        (g0, g1) = p.grain
        poly = affinity.rotate(poly, -math.degrees(math.atan2(g1[1] - g0[1], g1[0] - g0[0])), origin=(0, 0))
        for i in range(p.quantity):
            shapes.append((p.name, affinity.scale(poly, yfact=-1) if i % 2 else poly))
    shapes.sort(key=lambda s: -(s[1].bounds[2] - s[1].bounds[0]))
    x = y = col = 0.0
    placed = []
    for name, poly in shapes:
        minx, miny, maxx, maxy = poly.bounds
        if maxy - miny > fabric_width:
            raise ValueError(f"{name} is {maxy - miny:.0f} mm across: wider than the {fabric_width:.0f} mm fabric")
        if y > 0 and y + maxy - miny > fabric_width:
            x, y, col = x + col + gap, 0.0, 0.0
        placed.append((name, affinity.translate(poly, x - minx, y - miny)))
        y, col = y + maxy - miny + gap, max(col, maxx - minx)
    lay = x + col
    used = sum(poly.area for _, poly in placed) / (lay * fabric_width)
    for k, path in ((0.25, f"{stem}.png"),):
        fig = plt.figure(figsize=((lay + 60) * k / 25.4, (fabric_width + 110) * k / 25.4))
        ax = _axes(fig, [0, 0, 1, 1], -30, lay + 30, -40, fabric_width + 70)
        ax.fill([0, lay, lay, 0], [0, 0, fabric_width, fabric_width], color="#fbfaf7", lw=0)
        for y_ in (0, fabric_width):
            ax.plot([0, lay], [y_, y_], color=INK, lw=1.2)
        ax.plot([lay, lay], [0, fabric_width], color=QUIET, lw=0.8, ls=(0, (6, 3)))
        ax.plot([0, 0], [0, fabric_width], color=QUIET, lw=0.8, ls=(0, (6, 3)))
        for name, poly in placed:
            ax.fill(*poly.exterior.xy, color=FILL, lw=0)
            ax.plot(*poly.exterior.xy, color=INK, lw=0.8)
            c = poly.representative_point()
            ax.plot([c.x - 60, c.x + 60], [c.y, c.y], color=INK, lw=0.6)
            _arrow(ax, (c.x - 60, c.y), (c.x, c.y), k, size=14)
            _arrow(ax, (c.x + 60, c.y), (c.x, c.y), k, size=14)
            ax.text(c.x, c.y + 12, name, fontsize=28 * k, ha="center", va="bottom", color=INK)
        ax.text(0, fabric_width + 50, f"{style}   SIZE {size}   LAY PLAN, 1 GARMENT", fontsize=44 * k, fontweight="bold", va="center")
        ax.text(0, fabric_width + 20, f"fabric {fabric_width / 10:.0f} cm wide  ·  lay {lay / 10:.1f} cm long  ·  {used:.0%} of the fabric used"
                "  ·  pieces side by side, not nested", fontsize=30 * k, va="center", color=QUIET)
        ax.text(lay / 2, -20, "selvedge", fontsize=26 * k, ha="center", va="center", color=QUIET)
        _save(fig, path)
    return {"fabric_width_mm": fabric_width, "lay_length_mm": round(lay, 1), "used": round(used, 3)}


def write_techpack(stem: str, style: str, title: str, base: str, specs: dict[str, dict[str, float]],
                   poms: list[tuple[str, str, float]], views: dict[str, list[list[Pt]]],
                   lines: dict[str, tuple[str, Pt, Pt]], notes: list[str]) -> None:
    """The tech pack's measurement page, A4 landscape: flat sketches with each point of measure drawn
    on them, and the graded table. STEM.pdf and STEM.png.

    specs is {size: {name: value}}, poms rows are (code, name, tolerance), views is {"FRONT": polylines,
    "BACK": polylines} in mm, and lines is {code: (view, from, to)}, with a fourth number from 0 to 1
    to move a letter along its line. A polyline that starts with None is drawn dashed, as stitching."""
    fig = plt.figure(figsize=(297 / 25.4, 210 / 25.4))
    page = _axes(fig, [0, 0, 1, 1], 0, 297, 0, 210)
    page.text(12, 198, f"{style}", fontsize=16, fontweight="bold", va="center")
    page.text(12, 190, f"{title}  ·  measurement spec  ·  cm, garment laid flat  ·  base size {base}", fontsize=8.5, va="center", color=QUIET)
    page.plot([12, 285], [184, 184], color=INK, lw=0.8)
    for i, (view, polylines) in enumerate(views.items()):                 # the flats, one above the other
        solid = [[q for q in line if q is not None] for line in polylines]
        xs = [x for line in solid for x, _ in line]
        ys = [y for line in solid for _, y in line]
        span = max(max(xs) - min(xs), (max(ys) - min(ys)) * 1.25) * 1.18
        cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
        ax = _axes(fig, [12 / 297, (100 - 86 * i + 2) / 210, 110 / 297, 80 / 210], cx - span / 2, cx + span / 2,
                   cy - span * 80 / 110 / 2, cy + span * 80 / 110 / 2)
        ax.text(cx - span / 2, cy + span * 80 / 110 / 2, view, fontsize=8, fontweight="bold", va="top", color=QUIET)
        for line, pts in zip(polylines, solid):
            ax.plot(*zip(*pts), color=INK, lw=0.5 if line[0] is None else 1.1, ls=(0, (3, 2)) if line[0] is None else "-",
                    solid_joinstyle="round")
        for code, (where, a, b, *at) in lines.items():
            if where != view:
                continue
            ax.plot(*zip(a, b), color=SEW, lw=0.8)
            for end, other in ((a, b), (b, a)):
                _arrow(ax, end, other, 1, SEW, span / 45)
            f = at[0] if at else 0.5                                      # where along the line its letter sits
            mx, my = a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f
            ax.text(mx, my, code, fontsize=7, fontweight="bold", color="white", ha="center", va="center",
                    bbox=dict(boxstyle="circle,pad=0.25", fc=SEW, ec="none"))
    sizes = list(specs)                                                   # the graded table
    x0, y0, row = 132.0, 176.0, 8.0
    cols = [x0, x0 + 10, x0 + 62, x0 + 78]
    step = (285 - cols[3]) / len(sizes)
    page.fill([cols[3] + step * sizes.index(base), cols[3] + step * (sizes.index(base) + 1),
               cols[3] + step * (sizes.index(base) + 1), cols[3] + step * sizes.index(base)],
              [y0 + row / 2, y0 + row / 2, y0 - row * (len(poms) + 0.5), y0 - row * (len(poms) + 0.5)], color=FILL, lw=0)
    head = dict(fontsize=7.5, fontweight="bold", va="center", color=INK)
    for x, word in zip(cols, ("POM", "Description", "Tol +/-")):
        page.text(x, y0, word, **head)
    for j, size in enumerate(sizes):
        page.text(cols[3] + step * (j + 0.5), y0, size + (" *" if size == base else ""), ha="center", **head)
    page.plot([x0, 285], [y0 - row / 2] * 2, color=INK, lw=0.8)
    for i, (code, name, tolerance) in enumerate(poms):
        y = y0 - row * (i + 1)
        page.text(cols[0] + 3, y, code, fontsize=7, fontweight="bold", color="white", ha="center", va="center",
                  bbox=dict(boxstyle="circle,pad=0.25", fc=SEW, ec="none"))
        page.text(cols[1], y, name.capitalize(), fontsize=8, va="center")
        page.text(cols[2], y, f"{tolerance:g}", fontsize=8, va="center")
        for j, size in enumerate(sizes):
            page.text(cols[3] + step * (j + 0.5), y, f"{specs[size][name]:g}", fontsize=8, ha="center", va="center",
                      fontweight="bold" if size == base else "normal")
        page.plot([x0, 285], [y - row / 2] * 2, color="#d9d4c8", lw=0.4)
    for i, note in enumerate([f"* base size {base}: the size the sample is made in.", *notes]):
        page.text(x0, y0 - row * (len(poms) + 1.4) - 5 * i, note, fontsize=7, va="center", color=QUIET)
    _save(fig, f"{stem}.pdf", f"{stem}.png")


# ---------------------------------------------------------------- AAMA / ASTM D6673 DXF
LAYER = {"cut": "1", "notch": "4", "mirror": "6", "grain": "7", "sew": "14"}


def write_aama(sized: dict[str, list[Piece]], path: str, style: str, base: str | None = None) -> None:
    """One R12 DXF in mm: a BLOCK per piece per size, on the AAMA layer numbers, each size in a row,
    with the style's own text (its name, its sample size and METRIC units) beside the pieces."""
    doc = ezdxf.new("R12")
    for name in LAYER.values():
        doc.layers.add(name)
    msp = doc.modelspace()
    for i, line in enumerate([f"Style Name: {style}", f"Sample Size: {base or list(sized)[len(sized) // 2]}", "Units: METRIC"]):
        msp.add_text(line, dxfattribs={"layer": LAYER["cut"], "height": 6, "insert": (0, 60 - 10 * i)})
    row = 0.0
    for size, pieces in sized.items():
        moves = layout(pieces)
        for p in pieces:
            blk = doc.blocks.new(name=f"{p.name}_{size}")
            cut = p.cut_line()
            blk.add_polyline2d(cut, close=True, dxfattribs={"layer": LAYER["cut"]})
            blk.add_polyline2d(p.sew_line(), close=True, dxfattribs={"layer": LAYER["sew"]})
            for e in p.edges:
                if e.kind == "fold":
                    blk.add_line(e.pts[0], e.pts[-1], dxfattribs={"layer": LAYER["mirror"]})
            for nt in p.notches:      # a point on the cut line; its thickness is the slit's depth
                blk.add_point(nt.on_cut, dxfattribs={"layer": LAYER["notch"], "thickness": nt.depth})
            blk.add_line(*p.grain, dxfattribs={"layer": LAYER["grain"]})
            c = Polygon(p.sew_line()).representative_point()
            text = [f"Piece Name: {p.name}", f"Size: {size}", f"Quantity: {p.quantity}", f"Material: {p.material}",
                    f"Style Name: {style}"]
            text += [f"Annotation: {p.note}"] if p.note else []
            for i, line in enumerate(text):
                blk.add_text(line, dxfattribs={"layer": LAYER["cut"], "height": 6,
                                               "insert": (c.x - 60, c.y - 10 * i)})
            dx, dy = moves[p.name]
            msp.add_blockref(blk.name, (dx, dy + row))
        row -= max(Polygon(p.cut_line()).bounds[3] - Polygon(p.cut_line()).bounds[1] for p in pieces) + 80
    doc.saveas(path)
```
