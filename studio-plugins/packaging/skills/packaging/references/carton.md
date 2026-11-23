# A reverse tuck end carton

Read this when designing a carton. It is a whole script for a reverse tuck end carton (the common
retail box whose top tucks in at the front and whose bottom tucks in at the back) and the pattern for
any other style. Save the block at the end as `carton.py` and run `cad run carton.py`.

## Contents

- [How the script is laid out](#how-the-script-is-laid-out)
- [The allowances](#the-allowances)
- [How the fold works](#how-the-fold-works)
- [The sheet, the template and the DXF](#the-sheet-the-template-and-the-dxf)
- [Another style](#another-style)
- [carton.py](#cartonpy)

## How the script is laid out

1. **The carton's name, its style and its board**, which the sheets print.
2. **The product, the fit and the caliper**, then the flap constants and the artwork's margins.
3. **The score-to-score sizes** `L`, `W`, `D`, worked out from them.
4. **`panels()`**: every panel as its flat outline, the panel it hangs from, and the score they share.
5. **`carton_dieline`**: the panels joined into one blank, its outline on `CUT`, each score on
   `CREASE_FOLD`.
6. **`carton_folded`** and **`carton_packed`**: the same panels as board, each turned 90 degrees
   about its scores, alone and with the product's block inside. **`carton_open`** is the packed
   carton with its top open (`OPEN`), to show.
7. **`write_sheet`**, **`write_template`** and **`write_dxf`**: the dieline as a converter, a
   designer and a die maker each read it.

Flat, the inside of the board faces up. The four body panels run along x (back, left side, front,
right side) with the glue flap on the back's free edge; y is the carton's height.

## The allowances

Each of these was found or confirmed by the fit check on this carton, and each is a named constant:

| Allowance                                                                                              | Why                                                                       |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `L` is the product, two fits and **one caliper**                                                       | The glue flap lies inside the last side panel                             |
| `W` is the product, two fits and **a caliper for each tuck layer** (`TUCKS_AT_FRONT`, `TUCKS_AT_BACK`) | A reverse tuck has one tuck inside the front wall and one inside the back |
| The closures score **one caliper past** the dust flaps (`top`, `low`)                                  | A closure lies over the dust flaps, not through them                      |
| `CLOSURE = W - c - EDGE_GAP`                                                                           | The tuck comes down inside the far wall, so the closure stops short of it |
| `RELIEF` on each dust flap, on its tuck's side                                                         | The tuck passes that corner on its way in                                 |
| `TRIM` off the last side panel                                                                         | Its raw edge stays inside the corner                                      |
| `DUST = min(L / 2 - 1, W)`                                                                             | Two dust flaps never meet over the opening                                |

`GLUE_FLAP`, `TUCK`, `TUCK_RADIUS`, `EDGE_GAP` and `TRIM` are trade defaults for small retail
cartons. They are not a standard, and a converter's own rules replace them.

## How the fold works

Each panel is extruded one caliper down from its flat outline, so the inside face stays on the score
plane, then turned 90 degrees toward the inside about its own score and about each score between it
and the root panel, nearest first. Last, the whole carton is stood on its bottom (`upright`). Board therefore always stands outside the score planes, the inside
of the carton is exactly score to score, and two panels at a corner touch along the score without
sharing volume.

A panel that is glued inside its neighbour (`inset=True`, the glue flap) is moved one caliper into
the carton after folding, so it lies against the neighbour's inside face.

Panels must be given so that each shares its score with its parent exactly. The script checks that
they join into one blank and raises when they do not.

## The sheet, the template and the DXF

All three are drawn from the same panels as the models, so none can disagree with the carton.

- **The dieline sheet** (`out/carton_dieline.pdf`, and a `.png`) is the page a converter quotes
  from: the blank seen from inside the carton, as structural drawings are, with the cut solid in red
  and the creases dashed in blue, every panel named, `L`, `W`, `D` and the blank's size on it, and a
  table of the style, the sizes, the board and its caliper, the lengths of cut and crease rule and
  the blank's area. Grain, print and finish read "not given" until the person gives them.
- **The artwork template** (`out/carton_artwork_template.pdf`) is the blank at 1:1 seen from the
  print side, which is the dieline mirrored: cut, crease, the bleed line `BLEED` outside every cut,
  each panel's safe area `SAFE` inside its cuts and creases, and the glue flap hatched, where nothing
  is printed or varnished. A designer places it under the artwork. `BLEED` and `SAFE` are 3 mm,
  typical figures: the printer's own replace them. Its lines are plain colours, not the spot colours
  a printer's own template uses: it goes on a layer that does not print.
- **The DXF** (`out/carton_dieline.dxf`) is for a die maker or a cutting table: millimetres at 1:1,
  the cut in red on `CUT`, the creases dashed in blue on `CREASE`, arcs kept as arcs. There is no
  standard for layer names: say these two to whoever receives it.

There is no one colour standard for dielines. Red for cut and blue for crease are common, and every
sheet here carries its own key: when a converter names their colours, change `CUT` and `CREASE` in
the script.

## Another style

Keep the layout and change `panels()`, and change `STYLE` with it: the example's ECMA code is the
reverse tuck's alone. Give another style its code only when you know it.

- **Straight tuck end**: hang the bottom closure and its tuck from the back, like the top
  (`"back"` as the parent, the back's x range, still at `low` and going down), and move the bottom
  dust flaps' relief to the front (`dust(x1, x2, 0, -1)` and `dust(x4, x3, 0, -1)`). Both tucks then
  hang inside the front wall, one above the other in the same layer, and none inside the back: set
  `TUCKS_AT_FRONT, TUCKS_AT_BACK = 1, 0`. `W` and where the product's block sits both follow from
  those two numbers.
- **A sleeve**: the four body panels and the glue flap alone.
- **A tray or a lid**: a base panel as the root, four walls hung from it, and corner flaps hung from
  two of the walls with `inset=True`.

For each new panel give its outline, its parent and the score they share, then run the fit check.
`carton_packed` places the product's block from the back wall and the glue flap's side: a style that
puts board inside another wall needs its caliper in the size and in that placement, as the tucks have.

Not modelled: slit locks on a tuck, a thumb notch, and a crash-lock or auto bottom, which folds on
diagonal scores that are not 90 degrees (this script turns every score 90 degrees).

## carton.py

<!-- file: carton.py -->

```python
"""A reverse tuck end carton from the product's size: the dieline, and the same panels folded up.

Run: cad run carton.py     (four models: the dieline, the folded carton, the carton with its product, and the
                            carton open with the product in it; writes out/: the dieline sheet, the 1:1 artwork
                            template and the dieline as a DXF)
"""
import math
import pathlib
from dataclasses import dataclass, field

import build123d as bd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from cad import model
from shapely.geometry import Polygon
from shapely.ops import unary_union

NAME = "CARTON-001"
STYLE = "Reverse tuck end, ECMA A20.20.03.01"
BOARD = "18 pt SBS"             # the board's name, as the converter calls it; its caliper is below

# What goes in the carton, in mm, and how loosely.
PRODUCT = (60.0, 25.0, 110.0)   # length (the front panel's width), width (the side's), depth (the height)
FIT = 0.75                      # air on each side of the product
CALIPER = 0.46                  # board thickness: 18 pt SBS is 0.018 in = 0.457 mm; measure the board to be used

# Flaps. Trade defaults, each a choice: change them to the converter's own rules.
GLUE_FLAP = 13.0
TUCK = 15.0                     # tuck flap depth
TUCK_RADIUS = 4.0
EDGE_GAP = 0.5                  # a free edge kept clear of the wall it closes against
TRIM = 0.5                      # the last side panel is this much narrow, so its raw edge does not pass the corner
TUCKS_AT_FRONT, TUCKS_AT_BACK = 1, 1   # layers of tuck inside each wall: reverse tuck has one at each

# The artwork template's margins. Typical figures: the printer's own replace them.
BLEED = 3.0                     # artwork runs this far past every cut
SAFE = 3.0                      # text and logos stay this far inside every cut and crease

c = CALIPER
L = PRODUCT[0] + 2 * FIT + c    # score to score; the glue flap takes one caliper inside
W = PRODUCT[1] + 2 * FIT + (TUCKS_AT_FRONT + TUCKS_AT_BACK) * c   # each tuck takes a caliper inside its wall
D = PRODUCT[2] + 2 * FIT
CLOSURE = W - c - EDGE_GAP      # the tuck hangs inside the far wall, so the closure stops a caliper short of it
DUST = min(L / 2 - 1.0, W)      # dust flap depth: two never meet
RELIEF = c + EDGE_GAP + 0.5     # dust flaps stand clear of the tuck that passes them


@dataclass
class Panel:
    name: str
    points: list            # the outline, flat, inside face up
    parent: str | None = None
    hinge: tuple | None = None   # the score shared with the parent, as two points
    rounded: tuple = ()     # indexes of corners rounded to TUCK_RADIUS
    inset: bool = False     # glued inside its neighbour: moved one caliper into the carton after folding
    chain: list = field(default_factory=list)


def panels() -> dict[str, Panel]:
    x1, x2, x3, x4 = L, L + W, 2 * L + W, 2 * L + 2 * W - TRIM
    top, low = D + c, -c        # the closures score one caliper past the dust flaps, to lie over them
    taper = DUST * math.tan(math.radians(15))

    def tuck(x_a: float, x_b: float, y: float, away: float) -> list:
        return [(x_a, y), (x_a, y + away * TUCK), (x_b, y + away * TUCK), (x_b, y)]

    def dust(x_free: float, x_tuck: float, y: float, away: float) -> list:
        """A dust flap between a plain corner (x_free) and the corner its closure's tuck passes (x_tuck)."""
        s = 1 if x_tuck > x_free else -1
        return [(x_free + s * EDGE_GAP, y), (x_free + s * (EDGE_GAP + taper), y + away * DUST),
                (x_tuck - s * (RELIEF + 3), y + away * DUST), (x_tuck - s * RELIEF, y + away * (DUST - 3)),
                (x_tuck - s * RELIEF, y)]

    made = [
        Panel("back", [(0, low), (x1, low), (x1, top), (0, top)]),
        Panel("glue_flap", [(0, 2), (0, D - 2), (-GLUE_FLAP, D - 6), (-GLUE_FLAP, 6)], "back", ((0, 2), (0, D - 2)), inset=True),
        Panel("side_left", [(x1, 0), (x2, 0), (x2, D), (x1, D)], "back", ((x1, 0), (x1, D))),
        Panel("front", [(x2, low), (x3, low), (x3, top), (x2, top)], "side_left", ((x2, 0), (x2, D))),
        Panel("side_right", [(x3, 0), (x4, 0), (x4, D), (x3, D)], "front", ((x3, 0), (x3, D))),
        Panel("top_closure", [(EDGE_GAP, top), (x1 - EDGE_GAP, top), (x1 - EDGE_GAP, top + CLOSURE), (EDGE_GAP, top + CLOSURE)],
              "back", ((EDGE_GAP, top), (x1 - EDGE_GAP, top))),
        Panel("top_tuck", tuck(EDGE_GAP + 1, x1 - EDGE_GAP - 1, top + CLOSURE, 1), "top_closure",
              ((EDGE_GAP + 1, top + CLOSURE), (x1 - EDGE_GAP - 1, top + CLOSURE)), rounded=(1, 2)),
        Panel("bottom_closure", [(x2 + EDGE_GAP, low), (x3 - EDGE_GAP, low), (x3 - EDGE_GAP, low - CLOSURE), (x2 + EDGE_GAP, low - CLOSURE)],
              "front", ((x2 + EDGE_GAP, low), (x3 - EDGE_GAP, low))),
        Panel("bottom_tuck", tuck(x2 + EDGE_GAP + 1, x3 - EDGE_GAP - 1, low - CLOSURE, -1), "bottom_closure",
              ((x2 + EDGE_GAP + 1, low - CLOSURE), (x3 - EDGE_GAP - 1, low - CLOSURE)), rounded=(1, 2)),
        # The top tuck comes down inside the front wall, the bottom tuck up inside the back wall.
        Panel("dust_top_left", dust(x1, x2, D, 1), "side_left", ((x1, D), (x2, D))),
        Panel("dust_top_right", dust(x4, x3, D, 1), "side_right", ((x3, D), (x4, D))),
        Panel("dust_bottom_left", dust(x2, x1, 0, -1), "side_left", ((x1, 0), (x2, 0))),
        Panel("dust_bottom_right", dust(x3, x4, 0, -1), "side_right", ((x3, 0), (x4, 0))),
    ]
    by_name = {p.name: p for p in made}
    for p in made:                      # the scores from this panel back to the root
        at = p
        while at.parent:
            p.chain.append(at)
            at = by_name[at.parent]
    return by_name


def face(p: Panel) -> bd.Sketch:
    points = p.points
    turn = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1]))
    if turn < 0:                        # counter-clockwise, so every face looks up and the panels join
        points = points[::-1]
    shape = bd.Polygon(*points, align=None)
    if p.rounded:
        round_these = [p.points[i] for i in p.rounded]
        corners = [v for v in shape.vertices()
                   if any(abs(v.X - x) < 1e-6 and abs(v.Y - y) < 1e-6 for x, y in round_these)]
        shape = bd.fillet(corners, TUCK_RADIUS)
    return shape


def scores(parts: dict[str, Panel]) -> list:
    """Each score once, clipped to the edge its two panels share."""
    lines = []
    for p in parts.values():
        if p.hinge:
            lines.append(bd.Line((*p.hinge[0], 0), (*p.hinge[1], 0)))
    return lines


def blank(parts: dict[str, Panel]) -> bd.Wire:
    """The panels joined into one blank: its outline, which is the cut."""
    joined = face(parts["back"])
    for p in list(parts.values())[1:]:
        joined = joined + face(p)
    if len(joined.faces()) != 1:
        raise ValueError("the panels do not join into one blank: a panel does not share its score with its parent")
    return joined.faces()[0].outer_wire()


@model
def carton_dieline():
    parts = panels()
    cut = blank(parts)
    cut.label = "CUT"
    creases = scores(parts)
    for line in creases:
        line.label = "CREASE_FOLD"      # "fold" in the name: open lines that are never cut
    return bd.Compound(children=[cut, *creases], label="carton_dieline")


def upright(shape):
    """The carton stood on its bottom: flat, the back panel lies on the ground with the height along y."""
    return shape.rotate(bd.Axis.X, 90)


# How far each top panel is turned when the carton is shown open: 90 is closed, 0 is flat with its parent.
OPEN = {"top_closure": 12, "top_tuck": 40, "dust_top_left": 25, "dust_top_right": 25}


def folded(parts: dict[str, Panel], turned: dict[str, float] | None = None) -> list:
    turned = turned or {}
    solids = []
    for p in parts.values():
        solid = bd.extrude(face(p), amount=-c)          # the board, outside face down
        cx = sum(x for x, _ in p.points) / len(p.points)
        cy = sum(y for _, y in p.points) / len(p.points)
        inward = bd.Vector(0, 0, 1)
        for at in p.chain:                              # this panel's own score first, then each parent's
            (ax, ay), (bx, by) = at.hinge
            side = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
            if at is not p:                             # which way a parent's score turns is the parent's side of it
                mx = sum(x for x, _ in at.points) / len(at.points)
                my = sum(y for _, y in at.points) / len(at.points)
                side = (bx - ax) * (my - ay) - (by - ay) * (mx - ax)
            axis = bd.Axis((ax, ay, 0), (bx - ax, by - ay, 0))
            angle = turned.get(at.name, 90) * (1 if side > 0 else -1)
            solid = solid.rotate(axis, angle)
            inward = inward.rotate(axis, angle)
        if p.inset:
            solid = solid.moved(bd.Location(tuple(inward * c)))
        solid = upright(solid)
        solid.label = p.name
        solid.color = "#c9a66b" if "dust" not in p.name and p.name != "glue_flap" else "#b08d57"
        solids.append(solid)
    return solids


@model
def carton_folded():
    return bd.Compound(children=folded(panels()), label="carton_folded")


def carton_packed_product() -> bd.Solid:
    product = bd.Box(PRODUCT[0], PRODUCT[2], PRODUCT[1], align=bd.Align.MIN)
    product = upright(product.moved(bd.Location((c + FIT, FIT, TUCKS_AT_BACK * c + FIT))))
    product.label, product.color = "product", "#6c8ebf"
    return product


@model
def carton_packed():
    """The folded carton with a block the product's size where the product sits: what the fit check reads."""
    return bd.Compound(children=[*folded(panels()), carton_packed_product()], label="carton_packed")


@model
def carton_open():
    """The carton with its top open and the product in it: the one to show. The fit check reads carton_packed."""
    product = carton_packed_product()
    return bd.Compound(children=[*folded(panels(), OPEN), product], label="carton_open")


# ---------------------------------------------------------------- the dieline as a converter and a designer read it
CUT, CREASE, BLEED_INK, SAFE_INK, QUIET, INK = "#d0021b", "#1f5fa8", "#00a651", "#8e8e8e", "#6b6b6b", "#111111"


def _outline(wire: bd.Wire) -> list:
    """A wire as points, corners kept and arcs in short steps."""
    points = []
    for edge in wire.order_edges():
        steps = 1 if edge.geom_type == bd.GeomType.LINE else 12
        points += [((edge @ (i / steps)).X, (edge @ (i / steps)).Y) for i in range(steps)]
    return points


def _names(parts: dict[str, Panel]) -> dict[str, str]:
    plain = {"side_left": "SIDE", "side_right": "SIDE", "top_closure": "TOP", "bottom_closure": "BOTTOM",
             "top_tuck": "TUCK", "bottom_tuck": "TUCK", "glue_flap": "GLUE"}
    return {name: plain.get(name, "DUST" if name.startswith("dust") else name.replace("_", " ").upper()) for name in parts}


def _draw_dieline(ax, parts: dict[str, Panel], mirror: bool, artwork: bool, text: float = 1.0) -> None:
    """The dieline on axes in mm: cut solid, crease dashed, each panel named; for artwork, bleed, the safe
    area of each panel and the glue flap's no-print area as well. Mirrored, it is seen from the print side."""
    flip = -1 if mirror else 1
    cut = [(flip * x, y) for x, y in _outline(blank(parts))]
    if artwork:
        bleed = Polygon(cut).buffer(BLEED, join_style="mitre")
        ax.plot(*bleed.exterior.xy, color=BLEED_INK, lw=0.6)
        for p in parts.values():
            shape = Polygon([(flip * x, y) for x, y in p.points])
            if p.name == "glue_flap":
                ax.fill(*shape.exterior.xy, fc="none", ec=QUIET, lw=0, hatch="////")
            elif not shape.buffer(-SAFE).is_empty:
                ax.plot(*shape.buffer(-SAFE).exterior.xy, color=SAFE_INK, lw=0.5, ls=(0, (2, 2)))
    for p in parts.values():
        if p.hinge:
            (ax_, ay), (bx, by) = p.hinge
            ax.plot([flip * ax_, flip * bx], [ay, by], color=CREASE, lw=0.9, ls=(0, (6, 3)))
    ax.plot(*zip(*(cut + cut[:1])), color=CUT, lw=1.1, solid_joinstyle="miter")
    for name, word in _names(parts).items():
        p = parts[name]
        spot = Polygon([(flip * x, y) for x, y in p.points]).representative_point()
        xs, ys = [x for x, _ in p.points], [y for _, y in p.points]
        tall = max(ys) - min(ys) > 1.4 * (max(xs) - min(xs)) and max(xs) - min(xs) < 22
        ax.text(spot.x, spot.y, word, fontsize=(7 if max(xs) - min(xs) > 30 else 5) * text, color=QUIET, ha="center", va="center",
                rotation=90 if tall else 0)


def _legend(page, x: float, y: float, artwork: bool) -> None:
    rows = [("cut", CUT, "-", 1.1), ("crease", CREASE, (0, (6, 3)), 0.9)]
    rows += [("bleed: artwork runs to here", BLEED_INK, "-", 0.6), ("safe area: text stays inside", SAFE_INK, (0, (2, 2)), 0.5)] if artwork else []
    for i, (word, ink, dash, lw) in enumerate(rows):
        page.plot([x, x + 14], [y - 5.5 * i] * 2, color=ink, ls=dash, lw=lw)
        page.text(x + 17, y - 5.5 * i, word, fontsize=7, va="center", color=INK)


def write_sheet(stem: str, parts: dict[str, Panel]) -> dict[str, float]:
    """The dieline's sheet, A4 landscape: the blank with its sizes, and the table a converter quotes
    from. STEM.pdf and STEM.png. Returns the figures in the table."""
    wire = blank(parts)
    cut = _outline(wire)
    xs, ys = [x for x, _ in cut], [y for _, y in cut]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    figures = {"blank_x": x1 - x0, "blank_y": y1 - y0, "cut_mm": wire.length, "area_cm2": Polygon(cut).area / 100,
               "crease_mm": sum(math.dist(*p.hinge) for p in parts.values() if p.hinge)}
    fig = plt.figure(figsize=(297 / 25.4, 210 / 25.4))
    page = fig.add_axes([0, 0, 1, 1])
    page.set_xlim(0, 297)
    page.set_ylim(0, 210)
    page.axis("off")
    page.text(12, 198, NAME, fontsize=16, fontweight="bold", va="center")
    page.text(12, 190, f"{STYLE}  ·  dieline, seen from inside the carton  ·  millimetres", fontsize=8.5, va="center", color=QUIET)
    page.plot([12, 285], [184, 184], color=INK, lw=0.8)
    w, h, pad = 160.0, 164.0, 0.16 * max(x1 - x0, y1 - y0)
    scale = max((x1 - x0 + 2 * pad) / w, (y1 - y0 + 2 * pad) / h)
    ax = fig.add_axes([12 / 297, 12 / 210, w / 297, h / 210])
    ax.set_xlim((x0 + x1) / 2 - w * scale / 2, (x0 + x1) / 2 + w * scale / 2)
    ax.set_ylim((y0 + y1) / 2 - h * scale / 2, (y0 + y1) / 2 + h * scale / 2)
    ax.axis("off")
    _draw_dieline(ax, parts, mirror=False, artwork=False)

    def dim(a, b, word):
        ax.annotate("", xy=a, xytext=b, arrowprops=dict(arrowstyle="<|-|>", color=INK, lw=0.6, shrinkA=0, shrinkB=0, mutation_scale=6))
        upright = abs(b[0] - a[0]) < abs(b[1] - a[1])                  # an upright one's figure runs up beside it
        ax.text((a[0] + b[0]) / 2 - (1.0 * scale if upright else 0), (a[1] + b[1]) / 2 + (0 if upright else 1.2 * scale), word,
                fontsize=6.5, rotation=90 if upright else 0, ha="right" if upright else "center", va="center" if upright else "bottom")

    mid = D * 0.3
    dim((0, mid), (L, mid), f"L {L:.1f}")
    dim((L, mid), (L + W, mid), f"W {W:.1f}")
    dim((L + W + L * 0.88, 0), (L + W + L * 0.88, D), f"D {D:.1f}")
    dim((x0, y0 - pad * 0.45), (x1, y0 - pad * 0.45), f"blank {x1 - x0:.1f}")
    dim((x1 + pad * 0.3, y0), (x1 + pad * 0.3, y1), f"blank {y1 - y0:.1f}")
    _legend(page, 182, 174, artwork=False)
    rows = [
        ("Style", STYLE),
        ("Product, L x W x D", f"{PRODUCT[0]:g} x {PRODUCT[1]:g} x {PRODUCT[2]:g} mm"),
        ("Clear inside, L x W x D", f"{L - c:.1f} x {W - (TUCKS_AT_FRONT + TUCKS_AT_BACK) * c:.1f} x {D:.1f} mm"),
        ("Crease to crease, L x W x D", f"{L:.2f} x {W:.2f} x {D:.2f} mm"),
        ("Blank", f"{x1 - x0:.1f} x {y1 - y0:.1f} mm"),
        ("Blank area", f"{figures['area_cm2']:.0f} cm2"),
        ("Board, caliper", f"{BOARD}, {c:g} mm"),
        ("Cut rule / crease rule", f"{figures['cut_mm']:.0f} / {figures['crease_mm']:.0f} mm"),
        ("Glue flap / tuck / dust flap", f"{GLUE_FLAP:g} / {TUCK:g} / {DUST:.1f} mm"),
        ("Fit: air each side of the product", f"{FIT:g} mm"),
        ("Grain, print, finish", "not given"),
    ]
    y = 156.0
    for name, value in rows:
        long = len(name) + len(value) > 52                      # too long for one line: the value goes under its name
        page.text(182, y, name, fontsize=7.5, va="center", color=QUIET)
        y -= 4.4 if long else 0
        page.text(285, y, value, fontsize=7.5, va="center", ha="right", color=INK)
        page.plot([182, 285], [y - 3.6] * 2, color="#d9d4c8", lw=0.4)
        y -= 7.2
    page.text(182, y - 2, "Flap sizes are trade defaults: the converter's own rules replace them.", fontsize=6.5, va="center", color=QUIET)
    page.text(182, y - 7, "Not checked on a cut and folded sample.", fontsize=6.5, va="center", color=QUIET)
    for path in (f"{stem}.pdf", f"{stem}.png"):
        fig.savefig(path, dpi=200)
    plt.close(fig)
    return figures


def write_template(path: str, parts: dict[str, Panel]) -> None:
    """The artwork template at 1:1, seen from the print side: cut, crease, bleed, each panel's safe area and
    the glue flap's no-print area. A PDF to place under the artwork in a layout program."""
    cut = _outline(blank(parts))
    xs, ys = [-x for x, _ in cut], [y for _, y in cut]
    m = BLEED + 12
    w, h = max(xs) - min(xs) + 2 * m, max(ys) - min(ys) + 2 * m + 22
    fig = plt.figure(figsize=(w / 25.4, h / 25.4))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(min(xs) - m, max(xs) + m)
    ax.set_ylim(min(ys) - m, max(ys) + m + 22)
    ax.axis("off")
    _draw_dieline(ax, parts, mirror=True, artwork=True)
    top = max(ys) + m + 16
    ax.text(min(xs) - m + 6, top, f"{NAME}   {STYLE}   artwork template, 1:1, outside (print side) view", fontsize=9, fontweight="bold", va="center")
    ax.text(min(xs) - m + 6, top - 6, f"red: cut   blue dashed: crease   green: bleed {BLEED:g} mm   grey dashed: safe area {SAFE:g} mm   "
            "hatched: glue flap, no print or varnish", fontsize=6.5, va="center", color=QUIET)
    fig.savefig(path)
    plt.close(fig)


def write_dxf(path: str, parts: dict[str, Panel]) -> None:
    """The dieline for a die maker or a cutting table: millimetres at 1:1, the cut in red on CUT and the
    creases dashed in blue on CREASE, with arcs kept as arcs."""
    out = bd.ExportDXF(unit=bd.Unit.MM)
    out.add_layer("CUT", color=bd.ColorIndex.RED, line_type=bd.LineType.CONTINUOUS)
    out.add_layer("CREASE", color=bd.ColorIndex.BLUE, line_type=bd.LineType.DASHED)
    out.add_shape(blank(parts), layer="CUT")
    out.add_shape(scores(parts), layer="CREASE")
    out.write(path)


if __name__ == "__main__":
    carton_dieline()
    carton_folded()
    carton_packed()
    carton_open()
    parts = panels()
    out = pathlib.Path("out")
    out.mkdir(exist_ok=True)
    figures = write_sheet(str(out / "carton_dieline"), parts)
    write_template(str(out / "carton_artwork_template.pdf"), parts)
    write_dxf(str(out / "carton_dieline.dxf"), parts)
    clear_w = W - (TUCKS_AT_FRONT + TUCKS_AT_BACK) * c
    print(f"clear inside {L - c:.1f} x {clear_w:.1f} x {D:.1f} mm (crease to crease {L:.2f} x {W:.2f} x {D:.2f}) · "
          f"blank {figures['blank_x']:.1f} x {figures['blank_y']:.1f} mm · board {c} mm")
    print(f"cut rule {figures['cut_mm']:.0f} mm · crease rule {figures['crease_mm']:.0f} mm · blank area {figures['area_cm2']:.0f} cm2 · "
          "sheet out/carton_dieline.pdf · artwork template out/carton_artwork_template.pdf · out/carton_dieline.dxf")
```
