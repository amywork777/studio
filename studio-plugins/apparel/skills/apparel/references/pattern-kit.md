# The pattern kit

Read this before writing or changing a design script. Copy the block at the end into the project as
`pattern_kit.py`, unchanged, beside the design script. It needs `ezdxf` and `shapely`, which the
design script's header names.

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
], grain=((x, y0), (x, y1)), quantity=1, note="on fold")
```

- `allowance` is how far the cut line stands outside that edge's sew line, in mm.
- `kind="seam"` (the default) is mitred to its neighbours. A corner too sharp to mitre (further than
  three allowances from the sew corner) is squared off.
- `kind="hem"` is a straight, turned-up hem: its corners are its neighbours mirrored in the fold line.
  A hem's neighbours must rise from it; a hem parallel to its neighbour is refused.
- `kind="fold"` has allowance 0 and is written as the piece's mirror line. The piece is half of the
  cut part.
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

- `write_aama(sized, path, style)` writes one DXF for `{size: [pieces]}`: see
  [Handing it over](handoff.md).
- `write_svg(pieces, path, title)` writes one size at 1:1 with a 100 mm square to check the print.
- `layout(pieces)` is the side-by-side arrangement both use. It is for looking, not for cutting.

## pattern_kit.py

<!-- file: pattern_kit.py -->

```python
"""Flat pattern kit: pieces, seam allowances, notches, seam checks, AAMA/ASTM DXF and 1:1 SVG.

Geometry is millimetres, y up. A piece is a closed loop of named edges on the SEW line; the cut line
is derived from each edge's allowance. Nothing here knows a garment: a design is a function that
returns pieces (see the design script beside this file).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import ezdxf
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
    notches: list[Notch] = field(default_factory=list)

    def __post_init__(self) -> None:
        for e, nxt in zip(self.edges, self.edges[1:] + self.edges[:1]):
            if math.dist(e.pts[-1], nxt.pts[0]) > 1e-6:
                raise ValueError(f"{self.name}: edge {e.name} does not end where {nxt.name} starts")
        ring = self.sew_line()
        if not Polygon(ring).is_valid:
            raise ValueError(f"{self.name}: the sew line crosses itself")
        self._out = 1.0 if not LinearRing(ring).is_ccw else -1.0   # outward is left of travel on a clockwise loop

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
def layout(pieces: list[Piece], gap: float = 40.0) -> dict[str, Pt]:
    """Pieces side by side, by their cut lines: the move each takes. Not a marker: no nesting."""
    x, moves = 0.0, {}
    for p in pieces:
        minx, _, maxx, maxy = Polygon(p.cut_line()).bounds
        moves[p.name] = (x - minx, -maxy)
        x += maxx - minx + gap
    return moves


# ---------------------------------------------------------------- AAMA / ASTM D6673 DXF
LAYER = {"cut": "1", "notch": "4", "mirror": "6", "grain": "7", "sew": "14"}


def write_aama(sized: dict[str, list[Piece]], path: str, style: str) -> None:
    """One R12 DXF in mm: a BLOCK per piece per size, on the AAMA layer numbers, each size in a row."""
    doc = ezdxf.new("R12")
    for name in LAYER.values():
        doc.layers.add(name)
    msp = doc.modelspace()
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
            text = [f"Piece Name: {p.name}", f"Size: {size}", f"Quantity: {p.quantity}", f"Style Name: {style}"]
            text += [f"Annotation: {p.note}"] if p.note else []
            for i, line in enumerate(text):
                blk.add_text(line, dxfattribs={"layer": LAYER["cut"], "height": 6,
                                               "insert": (c.x - 60, c.y - 10 * i)})
            dx, dy = moves[p.name]
            msp.add_blockref(blk.name, (dx, dy + row))
        row -= max(Polygon(p.cut_line()).bounds[3] - Polygon(p.cut_line()).bounds[1] for p in pieces) + 80
    doc.saveas(path)


# ---------------------------------------------------------------- SVG, 1:1 in mm
def write_svg(pieces: list[Piece], path: str, title: str) -> None:
    moves = layout(pieces)
    bounds = [Polygon(p.cut_line()).bounds for p in pieces]
    width = max(moves[p.name][0] + b[2] for p, b in zip(pieces, bounds)) + 20
    height = max(-(moves[p.name][1] + b[1]) for p, b in zip(pieces, bounds)) + 150
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.1f}mm" height="{height:.1f}mm" '
           f'viewBox="0 0 {width:.1f} {height:.1f}" font-family="sans-serif">',
           f'<text x="10" y="20" font-size="10">{title}: printed at 100%, this square is 100 mm</text>',
           '<rect x="10" y="28" width="100" height="100" fill="none" stroke="#000" stroke-width="0.4"/>']
    for p in pieces:
        dx, dy = moves[p.name]

        def at(pt: Pt, dx: float = dx, dy: float = dy) -> str:
            return f"{pt[0] + dx + 10:.2f},{-(pt[1] + dy) + 140:.2f}"

        def line(pts: list[Pt], style: str) -> str:
            return f'<polyline points="{" ".join(at(q) for q in pts)}" fill="none" {style}/>'

        cut, sew = p.cut_line(), p.sew_line()
        out.append(line(cut + cut[:1], 'stroke="#000" stroke-width="0.6"'))
        out.append(line(sew + sew[:1], 'stroke="#b03a2e" stroke-width="0.4" stroke-dasharray="4,2.5"'))
        for e in p.edges:
            if e.kind == "fold":
                out.append(line(e.pts, 'stroke="#1f5fa8" stroke-width="1" stroke-dasharray="12,4,2,4"'))
        for nt in p.notches:
            c = nt.on_cut
            out.append(line([c, (c[0] - nt.normal[0] * nt.depth, c[1] - nt.normal[1] * nt.depth)],
                            'stroke="#000" stroke-width="0.8"'))
        (g0, g1) = p.grain
        out.append(line([g0, g1], 'stroke="#000" stroke-width="0.5"'))
        for tip, tail in ((g0, g1), (g1, g0)):
            ang = math.atan2(tail[1] - tip[1], tail[0] - tip[0])
            for s in (0.4, -0.4):
                out.append(line([tip, (tip[0] + 10 * math.cos(ang + s), tip[1] + 10 * math.sin(ang + s))],
                                'stroke="#000" stroke-width="0.5"'))
        c = Polygon(sew).representative_point()
        x, y = at((c.x, c.y)).split(",")
        label = [p.name, f"cut {p.quantity}" + (f", {p.note}" if p.note else "")]
        for i, text in enumerate(label):
            out.append(f'<text x="{float(x) + 8:.1f}" y="{float(y) + 12 * i:.1f}" font-size="9">{text}</text>')
    out.append("</svg>")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(out))
```
