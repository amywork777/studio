# A sole unit

Read this when designing a sole. It is a whole script for a sole unit (a midsole with a heel-to-toe
drop and cored cushioning, on an outsole with flex grooves) and the pattern for others. Save the
block at the end as `sole.py` and run `cad run sole.py`.

## Contents

- [How the script is laid out](#how-the-script-is-laid-out)
- [Sizes](#sizes)
- [The outline](#the-outline)
- [The midsole and the outsole](#the-midsole-and-the-outsole)
- [sole.py](#solepy)

## How the script is laid out

1. **The foot**: its length, its width across the ball and across the heel, and the toe allowance.
2. **The sole's choices**: stack heights, outsole thickness, the cores and the grooves.
3. **`outline()`**: the sole's outline as one closed curve.
4. **`midsole_body()`** and **`outsole_body()`**, then three models: each alone, and the two together.
5. **`__main__`**: the sizes and the volumes.

The heel is at the origin, the toes along +x, the big toe on the -y side (a right foot), z up from
the ground side of the midsole.

## Sizes

- **Mondopoint** (ISO 9407) is the foot itself: its length and width in millimetres.
- **EU** sizes count Paris points of 2/3 cm along the last; **UK** sizes count barleycorns of
  1/3 in along the last, less 25 for an adult size.

The script has no last, so it counts along the sole, which is the foot plus the toe allowance.
Brands disagree about that allowance and round differently, so two shoes marked the same size
differ. Give the Mondopoint figures as the fact and the EU and UK numbers as "about", and use the
brand's own chart when the person names a brand. US sizes are offset from UK by an amount that
differs between men's, women's and brands: look it up in the brand's chart and do not compute it.

## The outline

`outline()` passes one closed curve through thirteen points placed as fractions of the sole's length
and of the foot's two widths: round the heel, in along the arch, out to the inside ball, round the
toes, back along the outside ball. It reads as a sole and scales with the foot, and it is a starting
shape: it was not fitted to foot scans. With a last in hand, replace it with the outline of the
last's bottom. With a tracing of the person's foot, move the points to the tracing.

## The midsole and the outsole

- **The drop.** The midsole is extruded to the heel's stack, then its top is cut by a plane that
  falls from the heel's stack at the heel's centre to the forefoot's stack under the ball.
- **The cores** are hexagonal pockets cut from the top in two zones, each given as where it starts
  and ends along the length and the pitch of its grid. Every pocket stays `RIM` inside the edge and
  leaves `SKIN` of midsole under it. Smaller pockets, closer together, make a firmer zone; that is a
  direction, not a prediction of how it feels.
- **The grooves** run across the outsole every `GROOVE_PITCH`, leaving the waist plain. The script
  raises when grooves cut the outsole into pieces.

Midsole volume times the material's density, from its datasheet, is the midsole's weight. The script
prints volumes and leaves the weight to the material the person names.

## sole.py

<!-- file: sole.py -->

```python
"""A sole unit from a foot's measurements: a cored midsole with a heel-to-toe drop, on a grooved outsole.

Run: cad run sole.py     (three models: the midsole, the outsole, and the two together)
"""
import math

import build123d as bd
from cad import model

# The foot, in mm, measured standing. Mondopoint (ISO 9407) is this length and width.
FOOT_LENGTH = 265.0
BALL_WIDTH = 100.0          # across the ball joints
HEEL_WIDTH = 68.0
TOE_ALLOWANCE = 12.0        # room in front of the toes: a choice of the last, not of the foot

# The sole, in mm. Every one is a design choice.
HEEL_STACK, FOREFOOT_STACK = 28.0, 18.0     # midsole thickness under the heel and under the ball
OUTSOLE = 4.0
SKIN = 3.0                  # midsole left under each core
RIM = 7.0                   # uncored band inside the edge
CORES = {"heel": (0.06, 0.30, 15.0), "forefoot": (0.52, 0.86, 11.0)}   # from, to (of the length), pitch
CORE_WALL = 2.6
GROOVE_W, GROOVE_D, GROOVE_PITCH = 3.0, 2.0, 12.0

LENGTH = FOOT_LENGTH + TOE_ALLOWANCE


def outline() -> bd.Face:
    """The sole's outline, heel at the origin, toes along +X, the big toe on the -Y side (a right foot)."""
    L, b, h = LENGTH, BALL_WIDTH, HEEL_WIDTH
    points = [
        (0, 0), (0.05 * L, -0.42 * h), (0.16 * L, -0.50 * h),           # round the heel, inside
        (0.42 * L, -0.34 * b), (0.72 * L, -0.52 * b),                    # the arch, the inside ball
        (0.90 * L, -0.42 * b), (L, -0.16 * b), (0.95 * L, 0.18 * b),     # the toes
        (0.82 * L, 0.40 * b), (0.62 * L, 0.48 * b),                      # the outside ball
        (0.38 * L, 0.40 * b), (0.16 * L, 0.50 * h), (0.05 * L, 0.42 * h),
    ]
    return bd.make_face(bd.Wire([bd.Spline(*points, periodic=True)]))


def midsole_body() -> bd.Solid:
    body = bd.extrude(outline(), amount=HEEL_STACK)
    # The top slopes from the heel's stack to the forefoot's: the drop, between the heel centre and the ball.
    heel_x, ball_x = 0.16 * LENGTH, 0.70 * LENGTH
    slope = math.degrees(math.atan2(HEEL_STACK - FOREFOOT_STACK, ball_x - heel_x))
    top = bd.Plane(origin=(heel_x, 0, HEEL_STACK)).rotated((0, slope, 0))
    body = bd.split(body, bisect_by=top, keep=bd.Keep.BOTTOM)

    # Cores from the top, a hexagon grid in each zone, kept inside the rim.
    inside = bd.offset(outline(), amount=-RIM).faces()[0]
    cells = None
    for start, end, pitch in CORES.values():
        spots = []
        rows = int(BALL_WIDTH / (pitch * math.sin(math.radians(60)))) + 2
        for row in range(-rows, rows + 1):
            y = row * pitch * math.sin(math.radians(60))
            x = start * LENGTH + (pitch / 2 if row % 2 else 0)
            while x <= end * LENGTH:
                spots.append((x, y))
                x += pitch
        with bd.BuildSketch() as zone:
            with bd.Locations(*spots):
                bd.RegularPolygon((pitch - CORE_WALL) / 2, 6, major_radius=False)
        kept = [f for f in zone.sketch.faces() if all(inside.is_inside(v.center()) for v in f.vertices())]
        made = bd.Sketch(kept)
        cells = made if cells is None else cells + made
    body = body - bd.Pos(0, 0, SKIN) * bd.extrude(cells, amount=HEEL_STACK)
    body.label, body.color = "midsole", "#e8e4da"
    return body


def outsole_body() -> bd.Solid:
    body = bd.Pos(0, 0, -OUTSOLE) * bd.extrude(outline(), amount=OUTSOLE)
    x = 0.08 * LENGTH
    while x < 0.94 * LENGTH:
        if not 0.34 * LENGTH < x < 0.50 * LENGTH:          # the waist stays plain
            groove = bd.Box(GROOVE_W, 2 * BALL_WIDTH, GROOVE_D, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))
            body = body - bd.Pos(x, 0, -OUTSOLE) * groove
        x += GROOVE_PITCH
    if len(body.solids()) != 1:
        raise ValueError("the grooves cut the outsole into pieces: make them shallower than the outsole")
    body = body.solids()[0]
    body.label, body.color = "outsole", "#3a3a3a"
    return body


@model
def midsole():
    return midsole_body()


@model
def outsole():
    return outsole_body()


@model
def sole_unit():
    return bd.Compound(children=[midsole_body(), outsole_body()], label="sole_unit")


if __name__ == "__main__":
    mid, out = midsole(), outsole()
    sole_unit()
    print(f"foot {FOOT_LENGTH:.0f} x {BALL_WIDTH:.0f} mm (Mondopoint {FOOT_LENGTH:.0f}/{BALL_WIDTH:.0f}) · sole {LENGTH:.0f} mm long · "
          f"drop {HEEL_STACK - FOREFOOT_STACK:.0f} mm")
    print(f"EU {LENGTH / (20 / 3):.1f} (the sole's length in Paris points of 2/3 cm) · "
          f"UK {LENGTH / (25.4 / 3) - 25:.1f} (in barleycorns of 1/3 in, less 25)")
    print(f"midsole {mid.shape.volume / 1000:.0f} cm3 · outsole {out.shape.volume / 1000:.0f} cm3")
```
