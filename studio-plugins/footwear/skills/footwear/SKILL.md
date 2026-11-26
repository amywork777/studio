---
name: footwear
description: Designs shoe soles and flattens uppers - a running sole unit from a foot's length and width (Mondopoint, EU, UK) with stack heights, drop, toe spring, a cupped footbed and a lugged outsole, its spec sheet of lateral, bottom, top and section views, and a 3D print check; and a curved piece of an upper flattened into its pattern, with a picture of where it must stretch or gather. Use for soles, midsoles, outsoles, shoe sizes and upper pattern pieces taken from a last. Does not model a last.
---

# Footwear: soles and upper pieces

Two jobs. A sole unit is a script: a foot's length and width and the sole's design choices go in, a
midsole, an outsole and the sole's spec sheet come out. An upper piece is a curved face of a last made flat: the flat
outline comes out with a measure of how far the material must stretch or gather to take the shape.

The cad skill ($cad) is how models run, export and are shown; read it first. This skill adds what
footwear needs.

## Start with the task

| Task                                  | Start with                                                       | Reference                                                      |
| ------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| **A sole from a foot's measurements** | The foot and the stack heights, in the worked sole               | [A sole unit](references/sole.md)                              |
| **Shoe sizes** (Mondopoint, EU, UK)   | The run's size line                                              | [Sizes](references/sole.md#sizes)                              |
| **A sole's spec sheet**               | `out/sole_spec.pdf`, which the run writes                        | [The spec sheet](references/sole.md#the-spec-sheet)            |
| **Stack, drop, toe spring**           | The named constants, then the spec sheet's lateral view          | [The side profile](references/sole.md#the-side-profile)        |
| **Can the midsole be printed?**       | `cad model dfm <midsole id> --process printing --technology mjf` | [Run and check a sole](#run-and-check-a-sole)                  |
| **A flat pattern piece from a last**  | One face of the last as an STL, then `cad run flatten.py`        | [Flattening an upper piece](references/flatten.md)             |
| **How much will this piece stretch?** | The flattening's report                                          | [Reading the report](references/flatten.md#reading-the-report) |
| **A last**                            | Not covered: bring one                                           | [What it does not do](#what-it-does-not-do)                    |

## Setup

This skill runs the `cad` command. Run `cad --version` before first use in a chat; in Studio it is
already there. If it is missing, say so and stop: do not install it yourself.

## Run and check a sole

Start from [the worked sole](references/sole.md): save it as `sole.py`, set the foot and the sole,
and run it.

```bash
cad run sole.py
```

```text
built sole.py::midsole cold in 6.1s: ...
  id: 3e787281-71ab-561d-af47-41d56ee6e81a
built sole.py::outsole warm in 3.4s: ...
  id: 357bfb04-f25f-5d0f-8627-f56e5be3bc47
built sole.py::sole_unit warm in 0.4s: ...
  id: 22540197-3f3f-5b0c-b4e9-5d503ef58040
foot 265 x 100 mm (Mondopoint 265/100) · last bottom 280 mm · stack 32/22 mm · drop 10 mm · toe spring 15 mm
about EU 42.0 (the last's length in Paris points of 2/3 cm) · about UK 8.1 (in barleycorns of 1/3 in, less 25)
midsole 557 cm3 · outsole 56 cm3 · spec sheet out/sole_spec.pdf
```

Look at `out/sole_spec.png` yourself, then show the person the spec sheet and the sole unit: the
sheet is the sole as a footwear tech pack draws it, with the figures a shoemaker asks for.

Each `$..._ID` below is the `id:` line that model's run printed.

```bash
cad model interference "$SOLE_UNIT_ID"                            # midsole and outsole meet without overlapping
cad model dfm "$MIDSOLE_ID" --process printing --technology mjf   # walls, overhangs, the build volume
cad model snapshot "$SOLE_UNIT_ID" sole.png --camera 40:35
```

```text
OK sole_unit: no two parts share volume (2 parts at 1 pose, the boxes of 1 pair met: 1 measured, in 1.41 s)
warning: printing.warp_length at build_volume: part length 277.6 mm is over the 177.8 mm recommended maximum ...
OK 3e787281-...: 1 warning(s); printing mjf: 340403 mm3, 1 body(ies); overhangs under 0 deg 0 mm2; walls min 3, p05 3, median 14.8837 mm; support ~0 mm3
```

A sole is longer than the length general printing rules warn about, so `printing.warp_length` is
expected: pass it on, with the printer's own build volume when the person names one
(`--build-volume`). Show the sole as the cad skill's Show the model section says. A right foot is
drawn; the left is its mirror.

## Flatten an upper piece

Save [the flattening script](references/flatten.md) as `flatten.py`. Give it one piece of the
upper's surface as an STL, a single face with one outline:

```bash
cad model export "$PATCH_ID" toe.stl
cad run flatten.py toe.stl toe.dxf --name "toe cap" --size 42
```

```text
{
  "area_mm2": 2369.4,
  "flat_area_mm2": 2366.0,
  "outline_mm": 189.1,
  "flat_outline_mm": 196.2,
  "must_stretch_max_pct": 2.96,
  "must_compress_max_pct": 8.77,
  "strain_p95_pct": 3.27
}
wrote toe.dxf and its picture: the net piece, no allowances
```

`toe.png` is the flat piece coloured by where it must stretch (blue) and gather (red): show it.

That is a domed toe cap: flat, its outline is 196.2 mm where the last's is 189.1, so the edge has
to gather by up to 8.8% when it is lasted, and the middle stretch by 3%. A piece that only bends
(a cone, a cylinder) flattens with every figure at zero. [Reading the report](references/flatten.md#reading-the-report)
says what to do with the numbers.

## The rules footwear keeps

- **A foot is measured standing, in millimetres**: its length and its width across the ball.
  Mondopoint (ISO 9407) is those two numbers. Ask for them; do not work a foot back from a shoe size.
- **A sole is longer than the foot** by the toe allowance, which belongs to the last. With a last in
  hand, the sole's outline is the last's bottom: take it from the last, not from the example's curve.
- **Stack heights, drop, toe spring, the sidewall and the lugs are design choices**, each a named
  constant. Say which you chose. Cushioning, energy return and grip are not predicted by anything here.
- **Stack is midsole and outsole together, without a sockliner**, at 12% and 75% of the inside
  length. A shoe's quoted stack usually includes 4 to 5 mm of sockliner: say which figure you give.
- **Materials, hardness and colours are the maker's.** The spec sheet reads "not given" until the
  person gives them.
- **A flat piece is the net piece.** The DXF holds the outline as it lies on the last. `--margin` adds
  one allowance all round; a lasting margin, an underlay and a fold each differ by edge, and are added
  as the maker specifies.
- **The flat piece is drawn as seen from the surface's outer side.** Use `--mirror` for the other
  foot or to see it from inside.

## Check each change

| Change                            | Check                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| The foot, or the sole's outline   | The spec sheet's top view reads as a sole for that foot; the run's sizes                          |
| A stack height, the drop, the cup | The spec sheet's lateral view and sections; the print check's `walls min`; the run's volumes      |
| The tread                         | The script does not raise (lugs as deep as the rubber cut it apart); the spec sheet's bottom view |
| A flattened piece                 | The report's figures against what the material takes; the picture shows one closed outline        |
| A piece that will not flatten     | Split it along a design line, or add a dart, and flatten each part                                |

An OK here establishes that the parts are the sizes given, do not overlap, and print within general
rules; and that a flat piece has the area and outline reported. It does not establish that the sole
is comfortable, durable or safe to run in, or that a pattern piece lasts cleanly in a given
material: those take wear testing and a pulled-over sample. Say "not wear tested" and "not lasted"
until they have been.

## What it does not do

- **Lasts.** Nothing here models a last. A last comes from a last maker or a scan, as an STL or a
  STEP, and is read into a model with the cad skill's inputs (`stl.read`, `step.read`).
- **Lattice midsoles.** The example's midsole is solid. A graded lattice is not something this skill
  builds.
- **A flared or sculpted sidewall.** The sidewall stands straight up from the sole's plan.
- **A size run.** One foot gives one sole: run the script again for each size, with that size's foot.
- **Grading a pattern across sizes** and **stitch, lace and eyelet marks** are not written.
