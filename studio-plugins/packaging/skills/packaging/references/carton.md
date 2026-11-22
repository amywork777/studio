# A reverse tuck end carton

Read this when designing a carton. It is a whole script for a reverse tuck end carton (the common
retail box whose top tucks in at the front and whose bottom tucks in at the back) and the pattern for
any other style. Save the block at the end as `carton.py` and run `cad run carton.py`.

## Contents

- [How the script is laid out](#how-the-script-is-laid-out)
- [The allowances](#the-allowances)
- [How the fold works](#how-the-fold-works)
- [Another style](#another-style)
- [carton.py](#cartonpy)

## How the script is laid out

1. **The product, the fit and the caliper**, then the flap constants.
2. **The score-to-score sizes** `L`, `W`, `D`, worked out from them.
3. **`panels()`**: every panel as its flat outline, the panel it hangs from, and the score they share.
4. **`carton_dieline`**: the panels joined into one blank, its outline on `CUT`, each score on
   `CREASE_FOLD`.
5. **`carton_folded`** and **`carton_packed`**: the same panels as board, each turned 90 degrees
   about its scores, alone and with the product's block inside.

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

## Another style

Keep the layout and change `panels()`:

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

Run: cad run carton.py     (three models: the dieline, the folded carton, the carton with its product)
"""
import math
from dataclasses import dataclass, field

import build123d as bd
from cad import model

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


@model
def carton_dieline():
    parts = panels()
    blank = face(parts["back"])
    for p in list(parts.values())[1:]:
        blank = blank + face(p)
    if len(blank.faces()) != 1:
        raise ValueError("the panels do not join into one blank: a panel does not share its score with its parent")
    cut = blank.faces()[0].outer_wire()
    cut.label = "CUT"
    creases = scores(parts)
    for line in creases:
        line.label = "CREASE_FOLD"      # "fold" in the name: open lines that are never cut
    return bd.Compound(children=[cut, *creases], label="carton_dieline")


def upright(shape):
    """The carton stood on its bottom: flat, the back panel lies on the ground with the height along y."""
    return shape.rotate(bd.Axis.X, 90)


def folded(parts: dict[str, Panel]) -> list:
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
            angle = 90 if side > 0 else -90
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


@model
def carton_packed():
    """The folded carton with a block the product's size where the product sits: what the fit check reads."""
    product = bd.Box(PRODUCT[0], PRODUCT[2], PRODUCT[1], align=bd.Align.MIN)
    product = upright(product.moved(bd.Location((c + FIT, FIT, TUCKS_AT_BACK * c + FIT))))
    product.label, product.color = "product", "#6c8ebf"
    return bd.Compound(children=[*folded(panels()), product], label="carton_packed")


if __name__ == "__main__":
    flat = carton_dieline()
    carton_folded()
    carton_packed()
    size = flat.shape.bounding_box().size
    clear_w = W - (TUCKS_AT_FRONT + TUCKS_AT_BACK) * c
    print(f"clear inside {L - c:.1f} x {clear_w:.1f} x {D:.1f} mm (score to score {L:.2f} x {W:.2f} x {D:.2f}) · "
          f"blank {size.X:.1f} x {size.Y:.1f} mm · board {c} mm")
```
