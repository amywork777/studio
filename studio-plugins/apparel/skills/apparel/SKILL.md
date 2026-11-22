---
name: apparel
description: Drafts sewing patterns from body measurements as code - pattern pieces with seam allowances, notches, grainlines and fold lines, graded across sizes, checked seam against seam, and written as an AAMA/ASTM DXF for a cutting room, a 1:1 SVG to print, and a graded size spec for a tech pack. Use for garment patterns, blocks, grading, made-to-measure, seam allowances and tech pack measurements. Not for 3D drape or fit on a body.
---

# Apparel patterns

A pattern is a Python script: body measurements and style choices go in, pattern pieces come out,
and every seam that will be sewn to another is measured against it before anything is written. The
script is the pattern. A change of size, ease or seam allowance is a changed number and a rerun.

The cad skill ($cad) is how scripts run and files are shown; read it first. This skill adds what a
pattern needs.

## Start with the task

| Task                                          | Start with                                                    | Reference                                                                   |
| --------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Draft a garment from measurements**         | The kit beside a design script, then `cad run <design>.py`    | [The kit](references/pattern-kit.md), [a worked T-shirt](references/tee.md) |
| **Make it to one person's measure**           | One row in the design's size table, with their measurements   | [A worked T-shirt](references/tee.md#sizes-and-made-to-measure)             |
| **Grade it across sizes**                     | One row per size: each size is drafted from its own row       | [A worked T-shirt](references/tee.md#sizes-and-made-to-measure)             |
| **Change a seam allowance, a hem or a notch** | The edge's `allowance` or `kind`, or the piece's `notch` call | [The kit](references/pattern-kit.md#pieces-edges-and-allowances)            |
| **Hand it to a cutting room or a factory**    | The AAMA DXF and the size spec the run writes                 | [Handing it over](references/handoff.md)                                    |
| **Print it at home**                          | The run's SVG, printed at 100%                                | [Handing it over](references/handoff.md#the-svg)                            |
| **See how it hangs on a body**                | Not covered: this skill makes flat patterns                   | [What it does not do](#what-it-does-not-do)                                 |

## Setup

This skill runs the `cad` command. Run `cad --version` before first use in a chat; in Studio it is
already there. If it is missing, say so and stop: do not install it yourself.

## Draft, run, look

A project holds two files: `pattern_kit.py`, copied as it is from [the kit](references/pattern-kit.md),
and a design script that imports it. Start a new garment from [the T-shirt](references/tee.md) and
change its `draft` function.

```bash
cad run tee.py
```

```text
 XS: finished chest 94 cm, armhole 350 mm, cap 360 mm, checks pass
  S: finished chest 100 cm, armhole 374 mm, cap 384 mm, checks pass
  M: finished chest 106 cm, armhole 396 mm, cap 406 mm, checks pass
  L: finished chest 114 cm, armhole 423 mm, cap 433 mm, checks pass
 XL: finished chest 122 cm, armhole 450 mm, cap 460 mm, checks pass
```

The run writes, into `out/`: one SVG per size, one AAMA DXF holding every size, the size spec as a
CSV and the checks as JSON. It exits 1 when a check fails and names the size and the seam
(`FAILED S: neckline over the head`). `ezdxf` prints `Drawing units ($INSUNITS) are not exported for
DXF R12.` on every run: the cutting-room format is R12, which carries no units field, so the file's
millimetres are stated in [the handover](references/handoff.md) instead.

Look at the pieces, then show the person:

```bash
cad dxf snapshot out/tee_aama.dxf out/tee.png
```

Show the DXF as the cad skill's Show the model section says. The viewer draws the cut line, the sew
line, the grainline and the fold line of every piece; it does not draw notches, which the DXF holds
as points (`warning: ... not drawn: 40 POINT`). The SVG draws them.

## The rules a pattern keeps

- **Measurements are in centimetres, as a tape reads them. Geometry is in millimetres.** The design
  converts once, at the top of `draft`.
- **A measurement is the person's or the brand's. Ease and allowances are choices.** The size table in
  the example is illustrative and says so: replace it with the brand's size chart or the person's own
  measurements, and say which ease you chose and why. Never present the example's rows as a standard.
- **A piece is drawn on the sew line.** The cut line is derived from each edge's allowance. Never draw
  a cut line by hand.
- **Seams that are sewn together are checked together.** Every pair goes in the design's
  `seam_checks`, with the ease one is meant to have over the other. A new seam without a check is not
  finished.
- **A turned-up hem is `kind="hem"`.** Its corners are mirrored in the fold line, so the hem lies flat
  on a tapered seam. A plain `allowance` there makes a hem too narrow to turn.
- **Notches are walked, not placed by eye.** The same walked distance on both pieces of a seam, from
  the same end. One notch marks a front, two a back.

## Check each change

| Change                          | Check                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| A measurement, an ease, a curve | The run's checks pass; read `out/<name>_checks.json` for how far each seam is off             |
| A new piece or seam             | Its pair is in `seam_checks`; the snapshot shows the piece closed, its grainline inside it    |
| An allowance or a hem           | The snapshot: the cut line stays outside the sew line everywhere but the fold                 |
| A new size                      | Its row drafts and passes; the size spec's column steps sensibly from its neighbours          |
| The neckline or its band        | `neckline over the head` and `neckband on neckline` pass with the fabric's measured stretch   |
| Before handing over             | [Handing it over](references/handoff.md#before-it-leaves): the DXF opens in the receiving CAD |

A passing run establishes that the pieces close, the seams match in length and the allowances are
drawn. It does not establish that the garment fits, hangs well or is comfortable: that takes a sewn
sample on a body. Say "not checked on a body" until one has been made.

## What it does not do

- **Drape and fit in 3D.** Nothing here simulates cloth or a body. Say so if asked, and offer the flat
  pattern and its size spec.
- **Marker making.** `layout` sets pieces side by side to look at. It does not nest them to save fabric.
- **Grade rules.** Each size is drafted from its own measurements and written as its own pieces. No
  grade rule table (an AAMA `.rul` file) is written, so a receiving CAD sees sizes as separate pieces.
- **Darts, pleats and gathers** are not in the kit yet. A fitted bodice needs them: say so, and do not
  fake one with a curved seam.
