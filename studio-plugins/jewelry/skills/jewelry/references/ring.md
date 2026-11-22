# A solitaire ring

Read this when designing a ring. It is a whole script for a four-prong solitaire (a band, a tapered
collet, prongs, a round stone) and the pattern for other pieces. Save the block at the end as
`ring.py` and run `cad run ring.py`.

## Contents

- [How the script is laid out](#how-the-script-is-laid-out)
- [The stone](#the-stone)
- [The head](#the-head)
- [Another piece](#another-piece)
- [ring.py](#ringpy)

## How the script is laid out

1. **The finger**: a US size turned into an inside diameter.
2. **The band, the stone and the head**, in millimetres.
3. **`stone()`**: the stone as a solid, culet down, standing over the finger.
4. **`metal()`**: the band, the collet and the prongs fused, then the stone and the finger's cylinder
   cut out of them, and a check that one body is left.
5. **`ring`** (the metal) and **`ring_set`** (the metal with the stone).
6. **`__main__`**: the size, the stone's height over the finger, and the weight in each metal.

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

## Another piece

- **A plain band**: return the band alone from `metal()`. A comfort-fit band has a rounded inside:
  round the profile's inside corners more than its outside ones.
- **A signet**: fuse a flat-topped block to the band at the top and blend it with a fillet.
- **A pendant or an earring** has no finger: start from the stone and the head, and add a bail or a
  post.

Keep three things in any of them: everything in metal fused into one body, the stone subtracted to
make its seat, and the weight read from the model.

## ring.py

<!-- file: ring.py -->

```python
"""A four-prong solitaire ring from a ring size and a stone: the metal as one castable body, the
stone in its seat, and the numbers a caster and a setter ask for.

Run: cad run ring.py     (two models: the metal alone, and the ring with its stone)
"""
import math

import build123d as bd
from cad import model

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

# Grams per cm3. Fine metals are handbook values; a karat alloy's density is its supplier's.
DENSITY = {"sterling silver 925": 10.36, "fine gold": 19.32, "platinum": 21.45}

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


if __name__ == "__main__":
    built = ring()
    ring_set()
    cm3 = built.shape.volume / 1000
    print(f"US size {US_SIZE:g}: inside diameter {INSIDE_D:.2f} mm, circumference {math.pi * INSIDE_D:.1f} mm (ISO 8653 size)")
    print(f"stone {STONE_D} mm: depth {pavilion_h + girdle_h + crown_h:.2f} mm, girdle {GIRDLE_Z - R_IN:.2f} mm above the finger")
    print(f"metal {cm3 * 1000:.1f} mm3: " + ", ".join(f"{cm3 * d:.2f} g in {name}" for name, d in DENSITY.items()))
```
