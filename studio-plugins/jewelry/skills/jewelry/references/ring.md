# A solitaire ring

Read this when designing a ring. It is a whole script for a four-prong solitaire (a band, a tapered
collet, prongs, a round stone) and the pattern for other pieces. Save the block at the end as
`ring.py` and run `cad run ring.py`.

## Contents

- [How the script is laid out](#how-the-script-is-laid-out)
- [The stone](#the-stone)
- [The head](#the-head)
- [The spec sheet](#the-spec-sheet)
- [Another piece](#another-piece)
- [ring.py](#ringpy)

## How the script is laid out

1. **The finger**: a US size turned into an inside diameter.
2. **The band, the stone and the head**, in millimetres.
3. **`stone()`**: the stone as a solid, culet down, standing over the finger.
4. **`metal()`**: the band, the collet and the prongs fused, then the stone and the finger's cylinder
   cut out of them, and a check that one body is left.
5. **`ring`** (the metal) and **`ring_set`** (the metal with the stone).
6. **`write_spec`**: the spec sheet, its views drawn from the built solids.
7. **`__main__`**: the spec sheet, the casting pattern, the size, the stone's height over the finger,
   and the weight in each alloy.

The finger runs along y. The stone stands on the z axis, table up.

## The stone

A round brilliant is described by its girdle diameter and four proportions, each a fraction of that
diameter or an angle: the table's width, the crown's angle, the pavilion's angle and the girdle's
thickness. The script turns them into a crown height, a pavilion depth and a total depth, and
revolves the outline. The example's values (table 57%, crown 34.5 degrees, pavilion 40.8 degrees,
girdle 3%) give a total depth of 61%, which is in the range well-cut round brilliants fall in, and
they are a stand-in: when the stone is in hand, put its measured diameter, depth and table in.

Facets are left out. A seat cut from a smooth stone is slightly generous at the facet junctions,
which is what a setter wants. A fancy shape (oval, emerald, pear) is not a solid of revolution:
model its outline and loft or extrude it, with the cad skill's modelling references.

## The head

- **The collet** is a tapered tube from inside the band up to just under the girdle, which carries
  the stone's pavilion.
- **Each prong** climbs the outside of the collet from its foot to a knee level with the collet's
  top, then stands straight to `PRONG_ABOVE` over the girdle. Its axis sits a quarter of its
  diameter inside the girdle's edge, so the seat cut takes a bite out of it for the girdle to rest
  in.
- **`CULET_CLEAR`** is how far the stone's point stays above the finger. The culet must not touch
  skin. The example keeps half a millimetre: the person's jeweller sets theirs.

Change `PRONGS` to 6 for a six-prong head. A bezel is the collet taken up past the girdle by the
height that will be pushed over, with no prongs: raise the collet's top above `GIRDLE_Z` and drop
the prong loop.

## The spec sheet

`out/ring_spec.pdf` (and a `.png`) is the page a custom jeweller sends for approval and a caster
reads, as jewellery CAD lays it out: the ring from the front (through the finger), the side and the
top at 4:1, the stone tinted, with the inside diameter, the band's width and thickness, the overall
height and the height off the finger on them; and a table of the finger size in US and ISO, the
stone with its estimated carat weight, the setting, the metal's volume and its weight in each alloy,
and the sections checked against a casting house's minimums. `out/ring_spec.csv` is the table as data.

- **The carat weight is an estimate**: diameter squared times depth times 0.0061, the trade's formula
  for a round brilliant. Say "about". The stone's own certificate replaces it.
- **The weights are estimates**: the model's volume times a typical density for each alloy in
  `DENSITY`. A karat gold's density moves a few percent with its colour and its maker. Say "about",
  and put the supplier's figure in when the person has it.
- **The minimums are one casting house's published ones** (`MINIMUMS`): 1.7 mm of band at the base,
  0.5 mm of air under the culet, 0.8 mm for a wall that carries load. They are a starting point. The
  person's own caster's replace them, and the sheet says "UNDER" beside any section below its minimum.
- **Alloy, colour, finish, and the caster's own minimums, shrinkage and sprue** read "not given"
  until the person gives them. Never fill them in.

`out/ring_pattern.stl` is the metal alone, the pattern a caster or a wax printer takes. A view's
lines come from the solids, so the sheet shows the ring that was built; the dimensions on it are the
script's own constants.

## Another piece

- **A plain band**: return the band alone from `metal()`. A comfort-fit band has a rounded inside:
  round the profile's inside corners more than its outside ones.
- **A signet**: fuse a flat-topped block to the band at the top and blend it with a fillet.
- **A pendant or an earring** has no finger: start from the stone and the head, and add a bail or a
  post.

Keep three things in any of them: everything in metal fused into one body, the stone subtracted to
make its seat, and the weight read from the model. `write_spec` dimensions a ring with a round
stone: for another piece keep its views and its tables, and change the dimensions it draws.

## ring.py

<!-- file: ring.py -->

```python
"""A four-prong solitaire ring from a ring size and a stone: the metal as one castable body, the
stone in its seat, and the numbers a caster and a setter ask for.

Run: cad run ring.py     (two models: the metal alone, and the ring with its stone; writes out/: the spec
                          sheet, its table as CSV, and the metal as an STL pattern for the caster)
"""
import csv
import math
import pathlib

import build123d as bd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from cad import model

NAME = "RING-001"

# The finger. US and Canadian sizes step 0.032 in of inside diameter from 0.458 in at size 0;
# an ISO 8653 size is the inside circumference in mm.
US_SIZE = 7.0
INSIDE_D = (0.458 + 0.032 * US_SIZE) * 25.4

# The band, in mm.
BAND_W = 2.2
BAND_T = 1.8

# The stone: a round brilliant, by its girdle diameter. Proportions as fractions of that diameter;
# measure the stone that will be set when it is in hand, since every stone is cut differently.
STONE_D = 6.5
TABLE, CROWN_ANGLE, PAVILION_ANGLE, GIRDLE = 0.57, 34.5, 40.8, 0.03

# The head.
PRONGS = 4
PRONG_D = 1.1
PRONG_ABOVE = 1.0           # prong left standing above the girdle, for the setter to push over
COLLET_WALL = 0.8
CULET_CLEAR = 0.5           # culet above the finger

# Grams per cm3, typical figures for common casting alloys. A karat gold's density moves a few percent
# with its colour and its maker (14k runs 12.6 to 13.3, 18k 14.6 to 15.6): use the supplier's when given.
DENSITY = {"sterling silver 925": 10.36, "14k yellow gold": 13.07, "18k yellow gold": 15.58, "platinum 950 (Pt/Ru)": 20.7}

# What a casting house will make, in mm: Stuller's published CAD/CAM production standards, as a
# starting point. The person's own caster's minimums replace them.
MINIMUMS = {"Band thickness at the base": (BAND_T, 1.7), "Culet above the finger": (CULET_CLEAR, 0.5),
            "Collet wall": (COLLET_WALL, 0.8)}

crown_h = (1 - TABLE) / 2 * math.tan(math.radians(CROWN_ANGLE)) * STONE_D
pavilion_h = 0.5 * math.tan(math.radians(PAVILION_ANGLE)) * STONE_D
girdle_h = GIRDLE * STONE_D
R_IN = INSIDE_D / 2
CULET_Z = R_IN + BAND_T + CULET_CLEAR         # the finger runs along Y; the stone points up Z
GIRDLE_Z = CULET_Z + pavilion_h


def stone() -> bd.Solid:
    """The stone as a solid of revolution: its facets are left out, its girdle, table and depth are not."""
    r = STONE_D / 2
    profile = bd.Polygon((0, 0), (r, pavilion_h), (r, pavilion_h + girdle_h),
                         (r * TABLE, pavilion_h + girdle_h + crown_h), (0, pavilion_h + girdle_h + crown_h), align=None)
    solid = bd.revolve(bd.Plane.XZ * profile, bd.Axis.Z)
    solid = solid.moved(bd.Location((0, 0, CULET_Z)))
    solid.label, solid.color = "stone", "#bfe3f2"
    return solid


def metal() -> bd.Solid:
    band_profile = bd.Pos(R_IN + BAND_T / 2, 0) * bd.RectangleRounded(BAND_T, BAND_W, 0.45 * BAND_T)
    band = bd.revolve(band_profile, bd.Axis.Y)

    # A tapered collet from inside the band up to just under the girdle, then the prongs on it.
    low, high = R_IN + 0.5 * BAND_T, GIRDLE_Z - 0.3
    r_low, r_high = 1.6, STONE_D / 2 + 0.25
    outer = bd.Pos(0, 0, low) * bd.Cone(r_low, r_high, high - low, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))
    inner = bd.Pos(0, 0, low) * bd.Cone(r_low - COLLET_WALL, r_high - COLLET_WALL, high - low,
                                        align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))
    head = outer - inner
    reach = STONE_D / 2 + 0.25 * PRONG_D              # each prong's axis: a quarter of it bites the girdle
    top = GIRDLE_Z + girdle_h + PRONG_ABOVE
    foot = (r_low, low + 0.2)                         # each prong climbs the collet from here ...
    knee = (reach, high - 0.6)                        # ... to here, then stands straight past the girdle
    run = math.hypot(knee[0] - foot[0], knee[1] - foot[1])
    lean = math.degrees(math.atan2(knee[0] - foot[0], knee[1] - foot[1]))
    up = (bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN)
    prong = (bd.Pos(foot[0], 0, foot[1]) * bd.Rot(0, lean, 0) * bd.Cylinder(PRONG_D / 2, run, align=up)
             + bd.Pos(knee[0], 0, knee[1]) * bd.Sphere(PRONG_D / 2)
             + bd.Pos(knee[0], 0, knee[1]) * bd.Cylinder(PRONG_D / 2, top - knee[1], align=up))
    for i in range(PRONGS):
        head = head + bd.Rot(0, 0, 45 + i * 360 / PRONGS) * prong
    ring = band + head
    ring = ring - stone()                                       # the seat each prong and the collet carry
    ring = ring - bd.Cylinder(R_IN, 20, rotation=(90, 0, 0))    # nothing stands into the finger
    if len(ring.solids()) != 1:
        raise ValueError(f"the metal is {len(ring.solids())} bodies: a casting is one")
    ring = ring.solids()[0]
    ring.label, ring.color = "metal", "#d4af37"
    return ring


@model
def ring():
    return metal()


@model
def ring_set():
    return bd.Compound(children=[metal(), stone()], label="ring_set")


# ---------------------------------------------------------------- the spec sheet
INK, RED, QUIET, GOLD, GEM = "#111111", "#c0392b", "#6b6b6b", "#f3e6b8", "#bfe3f2"
TOP_Z = GIRDLE_Z + girdle_h + PRONG_ABOVE            # the prongs' tips, before setting
TABLE_Z = GIRDLE_Z + girdle_h + crown_h
CARAT = STONE_D ** 2 * (pavilion_h + girdle_h + crown_h) * 0.0061     # the trade's estimate for a round brilliant


def _edges(shape, eye: tuple, up: tuple) -> list[list[tuple]]:
    """The shape's visible edges seen from eye, as lines of points in that view's own millimetres."""
    visible, _ = shape.project_to_viewport(eye, up, look_at=(0, 0, 0))
    lines = []
    for edge in visible:
        steps = 1 if edge.geom_type == bd.GeomType.LINE else max(12, min(160, int(edge.length / 0.12)))
        lines.append([((edge @ (i / steps)).X, (edge @ (i / steps)).Y) for i in range(steps + 1)])
    return lines


def write_spec(stem: str, metal_shape, stone_shape, cm3: float) -> list[tuple[str, str]]:
    """The ring's spec sheet, A4 landscape: top, front and side views at 4:1 with the sizes a jeweller
    reads off them, and the tables of the stone, the metal's weight in each alloy and what is still to
    be given. STEM.pdf, STEM.png and STEM.csv. Returns the table's rows."""
    whole = bd.Compound(children=[metal_shape, stone_shape])
    r, low = STONE_D / 2, -(R_IN + BAND_T)
    rows = [
        ("Finger size", f"US {US_SIZE:g}  ·  ISO {math.pi * INSIDE_D:.1f}  ·  inside diameter {INSIDE_D:.2f} mm"),
        ("Band, width x thickness", f"{BAND_W:g} x {BAND_T:g} mm"),
        ("Height off the finger, to the table", f"{TABLE_Z - R_IN:.2f} mm"),
        ("Stone", f"round brilliant, {STONE_D:g} mm, about {CARAT:.2f} ct"),
        ("Stone depth / table", f"{pavilion_h + girdle_h + crown_h:.2f} mm / {TABLE:.0%}"),
        ("Setting", f"{PRONGS} prongs, {PRONG_D:g} mm, {PRONG_ABOVE:g} mm left above the girdle"),
        ("Metal volume", f"{cm3 * 1000:.0f} mm3"),
        *[(f"About, in {name}", f"{cm3 * d:.2f} g") for name, d in DENSITY.items()],
        *[(name, f"{have:g} mm, minimum {least:g}: {'ok' if have >= least else 'UNDER'}") for name, (have, least) in MINIMUMS.items()],
        ("Thinnest wall anywhere", "from the print check"),
        ("Caster's own minimums, shrinkage, sprue", "not given"),
        ("Alloy, colour, finish", "not given"),
    ]
    with open(f"{stem}.csv", "w", newline="", encoding="utf-8") as handle:
        csv.writer(handle).writerows([("spec", "value"), *rows])

    fig = plt.figure(figsize=(297 / 25.4, 210 / 25.4))
    page = fig.add_axes([0, 0, 1, 1])
    page.set_xlim(0, 297)
    page.set_ylim(0, 210)
    page.axis("off")
    page.text(12, 198, NAME, fontsize=16, fontweight="bold", va="center")
    page.text(12, 190, f"{PRONGS}-prong solitaire  ·  US size {US_SIZE:g}  ·  {STONE_D:g} mm round  ·  views at 4:1, millimetres",
              fontsize=8.5, va="center", color=QUIET)
    page.plot([12, 285], [184, 184], color=INK, lw=0.8)

    def view(title: str, left: float, bottom: float, w: float, h: float, cy: float, eye: tuple, up: tuple):
        ax = fig.add_axes([left / 297, bottom / 210, w / 297, h / 210])
        ax.set_xlim(-w / 8, w / 8)
        ax.set_ylim(cy - h / 8, cy + h / 8)
        ax.axis("off")
        page.text(left, bottom + h, title, fontsize=8, fontweight="bold", color=QUIET, va="top")
        for line in _edges(whole, eye, up):
            ax.plot(*zip(*line), color=INK, lw=0.7, solid_capstyle="round")
        return ax

    def dim(ax, a, b, word, side=1):
        ax.annotate("", xy=a, xytext=b, arrowprops=dict(arrowstyle="<|-|>", color=RED, lw=0.7, shrinkA=0, shrinkB=0, mutation_scale=7))
        upright = abs(b[0] - a[0]) < abs(b[1] - a[1])
        ax.text((a[0] + b[0]) / 2 + (0.45 * side if upright else 0), (a[1] + b[1]) / 2 + (0 if upright else 0.4), word, color=RED,
                fontsize=7, rotation=90 if upright else 0, ha=("left" if side > 0 else "right") if upright else "center",
                va="center" if upright else "bottom")

    stone_side = [(0, CULET_Z), (r, GIRDLE_Z), (r, GIRDLE_Z + girdle_h), (r * TABLE, TABLE_Z), (-r * TABLE, TABLE_Z),
                  (-r, GIRDLE_Z + girdle_h), (-r, GIRDLE_Z)]
    mid = (low + TOP_Z) / 2
    ax = view("FRONT (through the finger)", 12, 62, 112, 118, mid, (0, -200, 0), (0, 0, 1))
    ax.fill(*zip(*stone_side), color=GEM, alpha=0.6, lw=0)
    dim(ax, (-R_IN, 0), (R_IN, 0), f"inside {INSIDE_D:.2f}")
    dim(ax, (R_IN + BAND_T + 2.2, low), (R_IN + BAND_T + 2.2, TOP_Z), f"{TOP_Z - low:.2f}")
    dim(ax, (-R_IN - BAND_T - 2.2, R_IN), (-R_IN - BAND_T - 2.2, TABLE_Z), f"{TABLE_Z - R_IN:.2f} off finger", side=-1)
    dim(ax, (0, low), (0, -R_IN), f"{BAND_T:g}")
    ax = view("SIDE", 126, 62, 40, 118, mid, (200, 0, 0), (0, 0, 1))
    ax.fill(*zip(*stone_side), color=GEM, alpha=0.6, lw=0)
    dim(ax, (-BAND_W / 2, low - 1.2), (BAND_W / 2, low - 1.2), f"{BAND_W:g}")
    ax = view("TOP", 12, 8, 112, 50, -0.6, (0, 0, 200), (0, 1, 0))
    ring_of = [(r * math.cos(a / 30 * math.pi), r * math.sin(a / 30 * math.pi)) for a in range(61)]
    ax.fill(*zip(*ring_of), color=GEM, alpha=0.6, lw=0)
    dim(ax, (-r, -r - 2.2), (r, -r - 2.2), f"stone {STONE_D:g}")

    y = 174.0
    for name, value in rows:
        long = len(name) + len(value) > 58                      # too long for one line: the value goes under its name
        page.text(172, y, name, fontsize=7.5, va="center", color=QUIET)
        y -= 4.4 if long else 0
        page.text(285, y, value, fontsize=7.5, va="center", ha="right", color=INK)
        page.plot([172, 285], [y - 3.6] * 2, color="#d9d4c8", lw=0.4)
        y -= 7.2
    notes = ["The stone is a stand-in from its diameter and proportions: measure the real one before the seat is final.",
             "Weights are the model's volume times a typical density for each alloy: the supplier's own differs a little.",
             "Minimums are a casting house's published ones (Stuller). Not checked by a caster or a setter."]
    for i, note in enumerate(notes):
        page.text(172, y - 2 - 5 * i, note, fontsize=6.3, va="center", color=QUIET)
    for path in (f"{stem}.pdf", f"{stem}.png"):
        fig.savefig(path, dpi=200)
    plt.close(fig)
    return rows


if __name__ == "__main__":
    built = ring()
    ring_set()
    cm3 = built.shape.volume / 1000
    out = pathlib.Path("out")
    out.mkdir(exist_ok=True)
    write_spec(str(out / "ring_spec"), built.shape, stone(), cm3)
    bd.export_stl(built.shape, str(out / "ring_pattern.stl"), tolerance=0.005, angular_tolerance=0.05)
    print(f"US size {US_SIZE:g}: inside diameter {INSIDE_D:.2f} mm, circumference {math.pi * INSIDE_D:.1f} mm (ISO 8653 size)")
    print(f"stone {STONE_D} mm, about {CARAT:.2f} ct: depth {pavilion_h + girdle_h + crown_h:.2f} mm, girdle {GIRDLE_Z - R_IN:.2f} mm above the finger")
    print(f"metal {cm3 * 1000:.1f} mm3, about: " + ", ".join(f"{cm3 * d:.2f} g in {name}" for name, d in DENSITY.items()))
    print("against a caster's published minimums: " + ", ".join(
        f"{name.lower()} {have:g} mm ({'ok' if have >= least else 'UNDER'} {least:g})" for name, (have, least) in MINIMUMS.items()))
    print("spec sheet out/ring_spec.pdf · casting pattern out/ring_pattern.stl (the metal alone)")
```
