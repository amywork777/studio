# A sole unit

Read this when designing a sole. It is a whole script for a running shoe's sole unit (a midsole with
a heel-to-toe drop, toe spring, a bevelled heel and a cupped footbed, on a lugged outsole in two
pods), the spec sheet a sole is read from, and the pattern for other soles. Save the block at the end
as `sole.py` and run `cad run sole.py`.

## Contents

- [How the script is laid out](#how-the-script-is-laid-out)
- [Sizes](#sizes)
- [The last's bottom](#the-lasts-bottom)
- [The side profile](#the-side-profile)
- [The midsole and the outsole](#the-midsole-and-the-outsole)
- [The spec sheet](#the-spec-sheet)
- [sole.py](#solepy)

## How the script is laid out

1. **The foot**: its length, its width across the ball and across the heel, and the toe allowance.
2. **The sole's choices**: stack heights, toe spring, heel bevel, the sidewall, the outsole and its lugs.
3. **`last_bottom()`** and **`plan()`**: where the foot stands, and the sole seen from above.
4. **`ground`, `tread`, `footbed`, `rim`**: the side profile, as heights along the length.
5. **`midsole_body()`** and **`outsole_body()`**, then three models: each alone, and the two together.
6. **`write_spec()`**: the spec sheet, drawn from the same outline and the same profile as the solids.
7. **`__main__`**: the sizes, the volumes and the spec sheet.

The back of the last's bottom is at the origin, the toes along +x, the big toe on the -y side (a right
foot), z up from the ground.

## Sizes

- **Mondopoint** (ISO 9407) is the foot itself: its length and width in millimetres.
- **EU** sizes count Paris points of 2/3 cm along the last; **UK** sizes count barleycorns of
  1/3 in along the last, less 25 for an adult size.

The script has no last, so it counts along the last's bottom, which is the foot plus the toe
allowance (13 to 17 mm is usual). Brands disagree about that allowance and round differently, so two
shoes marked the same size differ. Give the Mondopoint figures as the fact and the EU and UK numbers
as "about", and use the brand's own chart when the person names a brand. US sizes are offset from UK
by an amount that differs between men's, women's and brands: look it up in the brand's chart and do
not compute it.

## The last's bottom

`last_bottom()` passes one closed curve through thirteen points placed as fractions of the length and
of the foot's two widths: round the heel, in along the arch, out to the inside ball, round the toes,
back along the outside ball. It reads as a sole and scales with the foot, and it is a starting shape:
it was not fitted to foot scans. With a last in hand, replace it with the outline of the last's
bottom (its feather edge). With a tracing of the person's foot, move the points to the tracing.

`plan()` is that outline and the sidewall round it: the sole is `WALL` wider than the last all round.

## The side profile

Four lines along the length, each a height above the ground, make the sole's side:

| Line      | What it is                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ground`  | The underside. Flat under the foot, rising behind the heel (`HEEL_BEVEL`) and ahead of the ball to the toe's tip (`TOE_SPRING`) |
| `tread`   | The top of the rubber: `ground` plus `OUTSOLE`                                                                                  |
| `footbed` | Where the foot stands: `HEEL_STACK` above the ground at the heel, falling to `FOREFOOT_STACK`                                   |
| `rim`     | The top of the sidewall: `HEEL_CUP` above the footbed at the heel, falling to `FORE_CUP`                                        |

- **Stack** is midsole and outsole together under the foot, measured where shoes are measured: 12%
  and 75% of the inside length (World Athletics' points). **Drop** is the heel's stack less the
  forefoot's. A shoe's quoted stack usually includes its sockliner, 4 to 5 mm more: say which you give.
- **Toe spring** is how far the toe's tip stands off the ground; about 15 mm on a running last. With a
  last in hand, take it and the heel's lift from the last: the sole follows the last, not the reverse.

## The midsole and the outsole

- Each solid is the sole's plan, cut to the part of the side profile it fills: the outsole between
  `ground` and `tread`, the midsole between `tread` and `rim`, less the hollow the foot stands in
  (the last's bottom, above `footbed`).
- **The pods.** Rubber covers the heel and the forefoot (`PODS`); the waist between them is bare
  midsole, as on most running shoes.
- **The lugs.** Two sets of grooves cross at `LUG_ANGLE`, every `LUG_PITCH`, `LUG_DEPTH` deep, and
  leave diamond lugs. The script raises when the lugs are as deep as the rubber is thick.

Each part's volume times its material's density, from the datasheet, is its weight. The script
prints volumes and leaves the weight to the materials the person names.

## The spec sheet

`out/sole_spec.pdf` (and a `.png`) is the page a sole is read from, as a footwear tech pack sets it
out: the lateral view with the stacks, the drop, the toe spring and the sole's length on it; the
bottom view with the lugs; the top view with the footbed inside its sidewall and the widths; a
section under the heel and one under the ball; and the table. `out/sole_spec.csv` is the table as
data. Show the page when you show the sole.

The table's materials, hardness (Asker C for a midsole, Shore A for rubber) and colours read "not
given" until the person gives them. Never fill them in.

## sole.py

<!-- file: sole.py -->

```python
"""A running shoe's sole unit from a foot's measurements: a midsole with a heel-to-toe drop, toe spring,
a bevelled heel and a cupped footbed, on a lugged outsole in two pods, with its spec sheet.

Run: cad run sole.py     (three models: the midsole, the outsole, and the two together; and
                          out/sole_spec.pdf, out/sole_spec.png and out/sole_spec.csv)
"""
import csv
import math
import pathlib

import build123d as bd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from shapely import affinity
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

from cad import model

STYLE = "RUN-001"

# The foot, in mm, measured standing. Mondopoint (ISO 9407) is this length and width.
FOOT_LENGTH = 265.0
BALL_WIDTH = 100.0          # across the ball joints
HEEL_WIDTH = 68.0
TOE_ALLOWANCE = 15.0        # room in front of the toes: a choice of the last, not of the foot (13 to 17 is usual)

# The sole, in mm. Every one is a design choice.
HEEL_STACK, FOREFOOT_STACK = 32.0, 22.0     # midsole and outsole together, without a sockliner, where stack is measured
OUTSOLE = 3.5               # rubber thickness
TOE_SPRING = 15.0           # how far the toe's tip stands off the ground
HEEL_BEVEL = 6.0            # how far the back of the heel stands off the ground
HEEL_CUP, FORE_CUP = 14.0, 5.0              # how far the sidewall stands above the footbed, at the heel and the forefoot
WALL = 4.0                  # the sidewall's thickness: the sole is this much wider than the last's bottom all round
PODS = {"heel": (-0.05, 0.30), "forefoot": (0.46, 1.05)}    # where the outsole's rubber is, from and to (of the length)
LUG_PITCH, GROOVE_W, LUG_DEPTH, LUG_ANGLE = 14.0, 2.6, 2.0, 22.0

LENGTH = FOOT_LENGTH + TOE_ALLOWANCE        # the last's bottom
HEEL_X, BALL_X = 0.12 * LENGTH, 0.75 * LENGTH               # where stack is measured: 12% and 75% of the inside length


def last_bottom() -> bd.Face:
    """The bottom of the last, where the foot stands: heel at the origin, toes along +X, the big toe
    on the -Y side (a right foot). A starting shape: with a last in hand, use the last's own."""
    L, b, h = LENGTH, BALL_WIDTH, HEEL_WIDTH
    points = [
        (0, 0), (0.05 * L, -0.42 * h), (0.16 * L, -0.50 * h),           # round the heel, inside
        (0.42 * L, -0.34 * b), (0.72 * L, -0.52 * b),                    # the arch, the inside ball
        (0.90 * L, -0.42 * b), (L, -0.16 * b), (0.95 * L, 0.18 * b),     # the toes
        (0.82 * L, 0.40 * b), (0.62 * L, 0.48 * b),                      # the outside ball
        (0.38 * L, 0.40 * b), (0.16 * L, 0.50 * h), (0.05 * L, 0.42 * h),
    ]
    return bd.make_face(bd.Wire([bd.Spline(*points, periodic=True)])).faces()[0]


def plan() -> bd.Face:
    """The sole seen from above: the last's bottom and the sidewall round it."""
    return bd.offset(last_bottom(), amount=WALL).faces()[0]


# The side profile, as heights above the ground along the length. Each is smooth, so the sole is.
def _blend(x: float, x0: float, x1: float, a: float, b: float) -> float:
    t = min(1.0, max(0.0, (x - x0) / (x1 - x0)))
    return a + (b - a) * (1 - math.cos(math.pi * t)) / 2


def ground(x: float) -> float:
    """The underside: flat under the foot, rising behind the heel (the bevel) and ahead of the ball (toe spring)."""
    back, front = 0.10 * LENGTH, 0.64 * LENGTH
    if x < back:
        return HEEL_BEVEL * ((back - x) / (back + WALL)) ** 2
    if x > front:
        return TOE_SPRING * ((x - front) / (LENGTH + WALL - front)) ** 2
    return 0.0


def footbed(x: float) -> float:
    """Where the foot stands: the stack above the ground, falling from the heel's to the forefoot's (the drop)."""
    return ground(x) + _blend(x, HEEL_X, BALL_X, HEEL_STACK, FOREFOOT_STACK)


def rim(x: float) -> float:
    """The top of the sidewall, which cups the heel and falls away to the forefoot."""
    return footbed(x) + _blend(x, 0.22 * LENGTH, 0.62 * LENGTH, HEEL_CUP, FORE_CUP)


def tread(x: float) -> float:
    return ground(x) + OUTSOLE


X0, X1 = -WALL - 2.0, LENGTH + WALL + 2.0


def _between(lower, upper, n: int = 56) -> bd.Solid:
    """Everything between two profile lines, right across the sole."""
    xs = [X0 + (X1 - X0) * i / n for i in range(n + 1)]
    low = bd.Spline(*[(x, 0, lower(x)) for x in xs])
    high = bd.Spline(*[(x, 0, upper(x)) for x in reversed(xs)])
    ends = [bd.Line(low @ 1, high @ 0), bd.Line(high @ 1, low @ 0)]
    return bd.extrude(bd.make_face(bd.Wire([low, ends[0], high, ends[1]])), amount=BALL_WIDTH, both=True)


def _column(face: bd.Face) -> bd.Solid:
    return bd.Pos(0, 0, -20) * bd.extrude(face, amount=140)


def groove_lines() -> list[tuple[float, float]]:
    """The tread's grooves, each as where it crosses the centre line and its angle from straight across:
    two sets that cross, leaving diamond lugs."""
    lines = []
    for start, end in PODS.values():
        x = start * LENGTH
        while x < end * LENGTH + BALL_WIDTH * math.tan(math.radians(LUG_ANGLE)) / 2:
            lines += [(x, LUG_ANGLE), (x, -LUG_ANGLE)]
            x += LUG_PITCH
    return lines


def midsole_body() -> bd.Solid:
    body = _column(plan()) & _between(tread, rim)
    body = body - (_column(last_bottom()) & _between(footbed, lambda x: rim(x) + 30))
    body = body.solids()[0]
    body.label, body.color = "midsole", "#ece8df"
    return body


def outsole_body() -> bd.Compound:
    if LUG_DEPTH >= OUTSOLE:
        raise ValueError("the lugs are as deep as the outsole is thick: they would cut it into pieces")
    rubber = _column(plan()) & _between(ground, tread)
    zones = [bd.Pos((a + b) / 2 * LENGTH, 0, 0) * bd.Box((b - a) * LENGTH, 3 * BALL_WIDTH, 200) for a, b in PODS.values()]
    cuts = bd.Sketch() + [bd.Pos(x, 0) * bd.Rot(0, 0, 90 + angle) * bd.Rectangle(3 * BALL_WIDTH, GROOVE_W) for x, angle in groove_lines()]
    grooves = _column(cuts) & _between(lambda x: ground(x) - 5, lambda x: ground(x) + LUG_DEPTH)
    pods = [(rubber & zone) - grooves for zone in zones]
    body = bd.Compound(children=[solid for pod in pods for solid in pod.solids()], label="outsole")
    body.color = "#2f2f2f"
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


# ---------------------------------------------------------------- the spec sheet
INK, RED, QUIET, MID, RUBBER = "#111111", "#c0392b", "#6b6b6b", "#ece8df", "#3a3a3a"


def _ring(face: bd.Face, n: int = 240) -> Polygon:
    wire = face.outer_wire()
    return Polygon([(p.X, p.Y) for p in (wire.position_at(i / n) for i in range(n))])


def _dim(ax, a, b, word: str, off=(0.0, 0.0), side: str = "center") -> None:
    """A dimension between two points, drawn off to one side, with its figure."""
    a, b = (a[0] + off[0], a[1] + off[1]), (b[0] + off[0], b[1] + off[1])
    ax.annotate("", xy=a, xytext=b, arrowprops=dict(arrowstyle="<|-|>", color=RED, lw=0.7, shrinkA=0, shrinkB=0, mutation_scale=7))
    upright = abs(b[0] - a[0]) < abs(b[1] - a[1])
    ax.text((a[0] + b[0]) / 2 + (3 if upright else 0), (a[1] + b[1]) / 2 + (0 if upright else 3), word, color=RED, fontsize=7,
            ha="left" if upright else side, va="center" if upright else "bottom")


def write_spec(stem: str, volumes: dict[str, float]) -> None:
    """The sole's spec sheet, A4 landscape: lateral, bottom and top views at 1:2 with their dimensions,
    sections under the heel and the ball, and the table. STEM.pdf, STEM.png and STEM.csv."""
    sole, last = _ring(plan()), _ring(last_bottom())
    cuts = unary_union([affinity.rotate(box(x - GROOVE_W / 2, -2 * BALL_WIDTH, x + GROOVE_W / 2, 2 * BALL_WIDTH), angle, origin=(x, 0))
                        for x, angle in groove_lines()])
    pods = [sole.intersection(box(a * LENGTH, -200, b * LENGTH, 200)) for a, b in PODS.values()]
    lugs = unary_union(pods).difference(cuts)
    x0, _, x1, _ = sole.bounds
    xs = [x0 + (x1 - x0) * i / 200 for i in range(201)]
    drop = HEEL_STACK - FOREFOOT_STACK

    def across(shape: Polygon, x: float) -> tuple[float, float]:
        hit = shape.intersection(LineString([(x, -300), (x, 300)]))
        return hit.bounds[1], hit.bounds[3]

    heel_w, ball_w = (b - a for a, b in (across(sole, HEEL_X), across(sole, BALL_X)))
    rows = [
        ("Foot (Mondopoint, ISO 9407)", f"{FOOT_LENGTH:.0f} / {BALL_WIDTH:.0f} mm"),
        ("About EU / UK", f"{LENGTH / (20 / 3):.1f} / {LENGTH / (25.4 / 3) - 25:.1f}"),
        ("Last bottom length (foot + toe allowance)", f"{LENGTH:.0f} mm"),
        ("Sole length", f"{x1 - x0:.0f} mm"),
        ("Sole width at ball / heel", f"{ball_w:.0f} / {heel_w:.0f} mm"),
        ("Stack at heel / forefoot, no sockliner", f"{HEEL_STACK:g} / {FOREFOOT_STACK:g} mm"),
        ("Drop", f"{drop:g} mm"),
        ("Toe spring / heel bevel", f"{TOE_SPRING:g} / {HEEL_BEVEL:g} mm"),
        ("Outsole rubber / lug depth", f"{OUTSOLE:g} / {LUG_DEPTH:g} mm"),
        ("Sidewall above footbed, heel / forefoot", f"{HEEL_CUP:g} / {FORE_CUP:g} mm"),
        ("Midsole / outsole volume", f"{volumes['midsole']:.0f} / {volumes['outsole']:.0f} cm3"),
        ("Weight", "needs each material's density"),
        ("Midsole material, hardness (Asker C), colour", "not given"),
        ("Outsole rubber, hardness (Shore A), colour", "not given"),
    ]
    with open(f"{stem}.csv", "w", newline="", encoding="utf-8") as handle:
        csv.writer(handle).writerows([("spec", "value"), *rows])

    fig = plt.figure(figsize=(297 / 25.4, 210 / 25.4))
    page = fig.add_axes([0, 0, 1, 1])
    page.set_xlim(0, 297)
    page.set_ylim(0, 210)
    page.axis("off")
    page.text(12, 198, STYLE, fontsize=16, fontweight="bold", va="center")
    page.text(12, 190, f"Sole unit  ·  right foot  ·  Mondopoint {FOOT_LENGTH:.0f}/{BALL_WIDTH:.0f}  ·  views at 1:2, millimetres",
              fontsize=8.5, va="center", color=QUIET)
    page.plot([12, 285], [184, 184], color=INK, lw=0.8)

    def view(title: str, left: float, bottom: float, w: float, h: float, cx: float, cy: float):
        """Axes at 1:2 on the page, centred on (cx, cy) in the model's millimetres."""
        ax = fig.add_axes([left / 297, bottom / 210, w / 297, h / 210])
        ax.set_xlim(cx - w, cx + w)
        ax.set_ylim(cy - h, cy + h)
        ax.axis("off")
        page.text(left, bottom + h, title, fontsize=8, fontweight="bold", color=QUIET, va="top")
        return ax

    mid_x = (x0 + x1) / 2
    ax = view("LATERAL", 12, 132, 150, 48, mid_x, 22)                    # the side: rubber, midsole, the footbed inside
    ax.fill(xs + xs[::-1], [rim(x) for x in xs] + [tread(x) for x in xs[::-1]], color=MID, lw=0)
    ax.plot(xs + xs[::-1] + xs[:1], [rim(x) for x in xs] + [ground(x) for x in xs[::-1]] + [rim(xs[0])], color=INK, lw=1.1)
    for a, b in PODS.values():
        px = [x for x in xs if a * LENGTH <= x <= b * LENGTH]
        ax.fill(px + px[::-1], [tread(x) for x in px] + [ground(x) for x in px[::-1]], color=RUBBER, lw=0)
    ax.plot(xs, [tread(x) for x in xs], color=INK, lw=0.5)
    inner = [x for x in xs if 0 <= x <= LENGTH]
    ax.plot(inner, [footbed(x) for x in inner], color=INK, lw=0.6, ls=(0, (4, 2)))
    ax.plot([x0 - 8, x1 + 8], [0, 0], color=QUIET, lw=0.5)
    _dim(ax, (HEEL_X, 0), (HEEL_X, footbed(HEEL_X)), f"heel {HEEL_STACK:g}")
    _dim(ax, (BALL_X, ground(BALL_X)), (BALL_X, footbed(BALL_X)), f"forefoot {FOREFOOT_STACK:g}")
    _dim(ax, (x1, 0), (x1, ground(x1)), "", off=(5, 0))
    ax.text(x1 + 8, -3, f"toe spring {TOE_SPRING:g}", color=RED, fontsize=7, ha="right", va="top")
    _dim(ax, (x0, -16), (x1, -16), f"sole length {x1 - x0:.0f}")
    ax.text((HEEL_X + BALL_X) / 2, footbed((HEEL_X + BALL_X) / 2) + 16, f"drop {drop:g}", color=RED, fontsize=7, ha="center")

    ax = view("BOTTOM (outsole)", 12, 72, 150, 56, mid_x, 0)             # the tread: lugs dark on the exposed midsole
    ax.fill(*sole.exterior.xy, color=MID, lw=0)
    for lug in getattr(lugs, "geoms", [lugs]):
        ax.fill(*lug.exterior.xy, color=RUBBER, lw=0)
    ax.plot(*sole.exterior.xy, color=INK, lw=1.1)

    ax = view("TOP (footbed)", 12, 12, 150, 56, mid_x, 0)                # the footbed inside its sidewall
    ax.fill(*sole.exterior.xy, color=MID, lw=0)
    ax.fill(*last.exterior.xy, color="#fbfaf7", lw=0)
    ax.plot(*sole.exterior.xy, color=INK, lw=1.1)
    ax.plot(*last.exterior.xy, color=INK, lw=0.6)
    for x, word, wide in ((HEEL_X, "A", heel_w), (BALL_X, "B", ball_w)):
        ax.plot([x, x], [-56, 56], color=QUIET, lw=0.5, ls=(0, (8, 2, 1, 2)))
        ax.text(x - 3, -54, word, fontsize=7, ha="right", va="bottom", color=QUIET)
        _dim(ax, (x + 12, across(sole, x + 12)[0]), (x + 12, across(sole, x + 12)[1]), f"{wide:.0f}")
    _dim(ax, (0, 0), (LENGTH, 0), f"last bottom {LENGTH:.0f}")

    for i, (x, word) in enumerate(((HEEL_X, "SECTION A (heel)"), (BALL_X, "SECTION B (ball)"))):   # across the sole
        ax = view(word, 166 + 62 * i, 132, 58, 48, 0, 22)
        (s0, s1), (l0, l1) = across(sole, x), across(last, x)
        ax.fill([s0, s1, s1, l1, l1, l0, l0, s0], [tread(x), tread(x), rim(x), rim(x), footbed(x), footbed(x), rim(x), rim(x)],
                color=MID, ec=INK, lw=0.9)
        ax.fill([s0, s1, s1, s0], [ground(x), ground(x), tread(x), tread(x)], color=RUBBER, lw=0)
        ax.plot([s0 - 6, s1 + 6], [0, 0], color=QUIET, lw=0.5)
        _dim(ax, (s1, ground(x)), (s1, footbed(x)), f"{footbed(x) - ground(x):g}", off=(4, 0))

    y = 122.0                                                            # the table
    for name, value in rows:
        long = len(name) + len(value) > 58                      # too long for one line: the value goes under its name
        page.text(172, y, name, fontsize=7.5, va="center", color=QUIET)
        y -= 4.4 if long else 0
        page.text(285, y, value, fontsize=7.5, va="center", ha="right", color=INK)
        page.plot([172, 285], [y - 3.6] * 2, color="#d9d4c8", lw=0.4)
        y -= 7.2
    page.text(172, y - 2, "Not wear tested. Cushioning, grip and durability are not predicted by anything here.",
              fontsize=6.5, va="center", color=QUIET)
    for path in (f"{stem}.pdf", f"{stem}.png"):
        fig.savefig(path, dpi=200)
    plt.close(fig)


if __name__ == "__main__":
    mid, out = midsole(), outsole()
    sole_unit()
    volumes = {"midsole": mid.shape.volume / 1000, "outsole": out.shape.volume / 1000}
    pathlib.Path("out").mkdir(exist_ok=True)
    write_spec("out/sole_spec", volumes)
    print(f"foot {FOOT_LENGTH:.0f} x {BALL_WIDTH:.0f} mm (Mondopoint {FOOT_LENGTH:.0f}/{BALL_WIDTH:.0f}) · last bottom {LENGTH:.0f} mm · "
          f"stack {HEEL_STACK:g}/{FOREFOOT_STACK:g} mm · drop {HEEL_STACK - FOREFOOT_STACK:g} mm · toe spring {TOE_SPRING:g} mm")
    print(f"about EU {LENGTH / (20 / 3):.1f} (the last's length in Paris points of 2/3 cm) · "
          f"about UK {LENGTH / (25.4 / 3) - 25:.1f} (in barleycorns of 1/3 in, less 25)")
    print(f"midsole {volumes['midsole']:.0f} cm3 · outsole {volumes['outsole']:.0f} cm3 · spec sheet out/sole_spec.pdf")
```
