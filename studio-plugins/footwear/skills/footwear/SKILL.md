---
name: footwear
description: Designs shoe soles and flattens uppers - a midsole and outsole from a foot's length and width (Mondopoint, EU, UK), with stack heights, heel-to-toe drop, cored cushioning and tread grooves, checked for 3D printing; and a curved piece of an upper flattened into its flat pattern, with the stretch it needs reported. Use for soles, midsoles, outsoles, shoe sizes, and upper pattern pieces taken from a last. Does not model a last.
---

# Footwear: soles and upper pieces

Two jobs. A sole unit is a script: a foot's length and width and the sole's design choices go in, a
midsole and an outsole come out. An upper piece is a curved face of a last made flat: the flat
outline comes out with a measure of how far the material must stretch or gather to take the shape.

The cad skill ($cad) is how models run, export and are shown; read it first. This skill adds what
footwear needs.

## Start with the task

| Task                                  | Start with                                                       | Reference                                                      |
| ------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| **A sole from a foot's measurements** | The foot and the stack heights, in the worked sole               | [A sole unit](references/sole.md)                              |
| **Shoe sizes** (Mondopoint, EU, UK)   | The run's size line                                              | [Sizes](references/sole.md#sizes)                              |
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
built sole.py::midsole cold in 2.78s: ...
  parts 1 · bounds 277.4 × 100.2 × 28 mm · joints 0 · sequences 0
  id: 3e787281-71ab-561d-af47-41d56ee6e81a
built sole.py::outsole warm in 0.37s: ...
  id: 357bfb04-f25f-5d0f-8627-f56e5be3bc47
built sole.py::sole_unit warm in 1.35s: ...
  parts 2 · bounds 277.5 × 100.2 × 32 mm · joints 0 · sequences 0
  id: 22540197-3f3f-5b0c-b4e9-5d503ef58040
foot 265 x 100 mm (Mondopoint 265/100) · sole 277 mm long · drop 10 mm
EU 41.5 (the sole's length in Paris points of 2/3 cm) · UK 7.7 (in barleycorns of 1/3 in, less 25)
midsole 340 cm3 · outsole 75 cm3
```

Each `$..._ID` below is the `id:` line that model's run printed.

```bash
cad model interference "$SOLE_UNIT_ID"                            # midsole and outsole meet without overlapping
cad model dfm "$MIDSOLE_ID" --process printing --technology mjf   # walls, overhangs, the build volume
cad model snapshot "$SOLE_UNIT_ID" sole.png --camera 40:35
cad model snapshot "$SOLE_UNIT_ID" tread.png --camera bottom
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
cad run flatten.py toe.stl toe.dxf
cad dxf snapshot toe.dxf toe.png
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
wrote toe.dxf: the net piece, no allowances
```

That is a domed toe cap: flat, its outline is 196.2 mm where the last's is 189.1, so the edge has
to gather by up to 8.8% when it is lasted, and the middle stretch by 3%. A piece that only bends
(a cone, a cylinder) flattens with every figure at zero. [Reading the report](references/flatten.md#reading-the-report)
says what to do with the numbers.

## The rules footwear keeps

- **A foot is measured standing, in millimetres**: its length and its width across the ball.
  Mondopoint (ISO 9407) is those two numbers. Ask for them; do not work a foot back from a shoe size.
- **A sole is longer than the foot** by the toe allowance, which belongs to the last. With a last in
  hand, the sole's outline is the last's bottom: take it from the last, not from the example's curve.
- **Stack heights, drop, core sizes and groove depths are design choices**, each a named constant.
  Say which you chose. Cushioning, energy return and grip are not predicted by anything here.
- **A flat piece is the net piece.** The DXF holds the outline as it lies on the last, with no
  lasting margin, no seam allowance, no underlay. Add them as the maker specifies.
- **The flat piece is drawn as seen from the surface's outer side.** Use `--mirror` for the other
  foot or to see it from inside.

## Check each change

| Change                              | Check                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| The foot, or the sole's outline     | The bottom snapshot reads as a sole for that foot; the run's sizes                                |
| A stack height, the drop, the cores | The print check's `walls min` against the material's minimum; the run's volumes                   |
| The tread                           | The script does not raise (a groove deeper than the outsole cuts it apart); the bottom snapshot   |
| A flattened piece                   | The report's figures against what the material takes; `cad dxf snapshot` shows one closed outline |
| A piece that will not flatten       | Split it along a design line, or add a dart, and flatten each part                                |

An OK here establishes that the parts are the sizes given, do not overlap, and print within general
rules; and that a flat piece has the area and outline reported. It does not establish that the sole
is comfortable, durable or safe to run in, or that a pattern piece lasts cleanly in a given
material: those take wear testing and a pulled-over sample. Say "not wear tested" and "not lasted"
until they have been.

## What it does not do

- **Lasts.** Nothing here models a last. A last comes from a last maker or a scan, as an STL or a
  STEP, and is read into a model with the cad skill's inputs (`stl.read`, `step.read`).
- **Lattice midsoles.** The example's cushioning is cores cut from the top. A graded lattice is not
  something this skill builds.
- **Grading a pattern across sizes** and **stitch, lace and eyelet marks** are not written.
