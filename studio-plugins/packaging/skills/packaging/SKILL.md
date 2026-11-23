---
name: packaging
description: Designs folding cartons and their dielines - a carton sized from the product and the board's thickness, its dieline as a sheet with named panels, sizes and rule lengths, a 1:1 artwork template with bleed and safe areas, and a cut and crease DXF, and the same panels folded up in 3D to check that the carton closes and the product fits. Use for dielines, folding cartons, tuck end boxes, artwork templates and packaging mock-ups. Not for corrugated shipper strength or print artwork.
---

# Packaging: cartons and dielines

A carton is one list of panels. The dieline is those panels laid flat, with cuts and creases on their
own layers; the folded carton is the same panels turned about their creases with the board's real
thickness. Because both come from one list, the flat file and the folded check cannot disagree.

The cad skill ($cad) is how models run, export and are shown; read it first. This skill adds what a
carton needs.

## Start with the task

| Task                                            | Start with                                                              | Reference                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **A carton for a product**                      | The product's three sizes and the board's caliper, in the worked carton | [A reverse tuck end carton](references/carton.md)                                              |
| **The dieline, to read or to quote from**       | `out/carton_dieline.pdf`, which the run writes                          | [The sheet, the template and the DXF](references/carton.md#the-sheet-the-template-and-the-dxf) |
| **A template for the artwork**                  | `out/carton_artwork_template.pdf`, at 1:1 with bleed and safe areas     | [The sheet, the template and the DXF](references/carton.md#the-sheet-the-template-and-the-dxf) |
| **The dieline file for a die maker**            | `out/carton_dieline.dxf`, which the run writes                          | [Run, export, check](#run-export-check)                                                        |
| **Does it close, does the product fit?**        | `cad model interference <packed id>`                                    | [Run, export, check](#run-export-check)                                                        |
| **Another style** (straight tuck, sleeve, tray) | The same panel list, with that style's panels                           | [Another style](references/carton.md#another-style)                                            |
| **A flap, a clearance, a glue flap**            | The constants at the top of the script                                  | [The allowances](references/carton.md#the-allowances)                                          |
| **Cut a sample**                                | The DXF, to a cutting table or a laser service                          | [Handing it over](#handing-it-over)                                                            |

## Setup

This skill runs the `cad` command. Run `cad --version` before first use in a chat; in Studio it is
already there. If it is missing, say so and stop: do not install it yourself.

## Run, export, check

Start from [the worked carton](references/carton.md): save it as `carton.py`, set the product's size
and the board's caliper, and run it.

```bash
cad run carton.py
```

```text
built carton.py::carton_dieline cold in 1.52s: ...
  id: 090f96b4-51c4-5a77-ab0b-c0432086bc22
built carton.py::carton_folded warm in 0.05s: ...
  id: 5eed324e-fe45-507b-b396-253a9de74d30
built carton.py::carton_packed warm in 0.05s: ...
  id: 61b855f8-0e3d-5dea-91af-9f850a5443d2
built carton.py::carton_open warm in 0.05s: ...
  id: 7c1d2a40-9a1e-5c3b-8a55-2f0b6f4f9d11
clear inside 61.5 x 26.5 x 111.5 mm (crease to crease 61.96 x 27.42 x 111.50) · blank 191.3 x 195.3 mm · board 0.46 mm
cut rule 948 mm · crease rule 791 mm · blank area 287 cm2 · sheet out/carton_dieline.pdf · artwork template out/carton_artwork_template.pdf · out/carton_dieline.dxf
```

Four models, each with its own id: the dieline, the folded carton, the folded carton with a block
the product's size inside it, and that carton with its top open. `clear inside` is the room left for
the product once the glue flap and the tucks are in. The run also writes, into `out/`:

| File                          | What it is                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `carton_dieline.pdf`, `.png`  | The dieline's sheet: named panels, sizes, and the table a converter quotes from                |
| `carton_artwork_template.pdf` | The blank at 1:1 from the print side, with bleed, safe areas and the glue flap's no-print area |
| `carton_dieline.dxf`          | The cut in red on `CUT`, the creases dashed in blue on `CREASE`, for a die maker               |

Below, each `$..._ID` is the `id:` line that model's run printed.

```bash
cad model interference "$PACKED_ID"              # the fit check
cad model snapshot "$OPEN_ID" open.png           # the carton open, the product in it
```

```text
OK carton_packed: no two parts share volume (14 parts at 1 pose, the boxes of 17 pairs met: 1 kept, 16 measured, in 1.4 s)
```

The fit check is exact, on the panels' own solids: a panel that passes through another, or through
the product, is named with the volume they share.

```text
error: overlapping_parts, 3 place(s). ...
  carton_packed/top_tuck: shares 370.8 mm^3 with carton_packed/product (as built)
  carton_packed/bottom_closure: shares 242.2 mm^3 with carton_packed/dust_bottom_right (as built)
```

Read each finding as what would happen in the hand: a tuck that shares volume with the product means
the product is in the tuck's way; a closure that shares volume with a dust flap means the two are
scored at the same level and one has to sit over the other. Fix the allowance, never the check: the
finding's hint offers `--fit A B` to name a pair that is meant to share volume, and no two panels of
a carton are. Glued faces touch; they do not overlap.

Look at `out/carton_dieline.png` yourself. Then show the person the dieline's sheet and the open
carton (`carton_open`), as the cad skill's Show the model section says: the sheet is the carton as a
structural designer's software draws it, and the open carton shows the product in place. The closed
`carton_packed` is for the fit check, not for showing: nothing of the product can be seen in it.

## The rules a dieline keeps

- **Sizes are score to score, inside.** The carton is sized from the product, a clearance each side,
  and one caliper for each layer of board that ends up inside a wall: the glue flap, and each tuck.
- **The caliper is measured.** 18 pt board is 0.018 in, 0.457 mm, but boards vary: use the thickness
  of the board that will be run. Ask for it; do not assume one and present the result as final.
- **The fit is a choice.** `FIT` is the air on each side of the product, 0.75 mm in the example. Say
  what you used, and ask how snug the product should sit when it matters (a bottle that must not
  rattle, a product in a sleeve of its own).
- **Two layers, by what the knife does.** `CUT` is one closed outline, solid. `CREASE` holds every
  score as an open line, dashed. Add a perforation or a kiss cut as a layer and a line style of its
  own, named for it (`PERF`), in the DXF, the sheet and the sheet's key alike.
- **The die is drawn from inside, the artwork from outside.** The sheet and the DXF show the blank
  seen from inside the carton; the artwork template is its mirror, the print side. Each says which.
- **Bleed and safe area are the printer's.** The template's 3 mm each is typical: ask for theirs.
- **A crease is drawn once**, between the two panels that share it. Panels that do not share their
  score exactly do not join, and the script raises before anything is exported.
- **Every flap default is a trade rule of thumb**, kept as a named constant with a comment. A
  converter has its own rules for its machines: when the person names one, use theirs.

## Check each change

| Change                                     | Check                                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| The product's size, the fit or the caliper | The run's `clear inside` line holds the product; `cad model interference` on the packed model is OK                                |
| A flap's depth, a relief, a clearance      | `cad model interference` on the packed model; the folded snapshot                                                                  |
| A new panel or a new style                 | The run does not raise (the panels join into one blank); the dieline snapshot; interference                                        |
| The dieline for a cutter                   | The run completes (the panels join into one closed blank); the sheet shows the cut solid and every crease dashed, each panel named |
| The blank on a sheet                       | The run's `blank` size against the sheet or the cutting table's bed                                                                |

An OK from the fit check establishes that, with ideal folds, no panel passes through another or
through the product, and the product's block sits inside. It does not establish that the carton
erects on a machine, that its tucks hold shut, that the board cracks or not on a score, or how
much it carries: those are found by cutting and folding a sample. Say "not checked on a sample"
until one has been made.

## Handing it over

- **To a die maker or a cutting table**: `out/carton_dieline.dxf`, millimetres at 1:1, cuts on `CUT`
  and creases on `CREASE`, seen from inside. Say so, with the board and its caliper, and send the
  sheet with it. For a sheet-cutting service, the sendcutsend skill ($sendcutsend) checks a file
  against that service's guide.
- **To whoever makes the artwork**: `out/carton_artwork_template.pdf`, at 1:1 from the print side.
  They keep artwork inside the bleed line, text inside each safe area, and the glue flap bare. The
  artwork itself is theirs: nothing here makes it.
- **To a converter for a quote**: the sheet. Its table has what they ask first: style, sizes, blank,
  board, rule lengths.
- The grain of the board and the direction of the flutes in corrugated matter to how it folds. This
  skill does not model them, and the sheet reads "not given": ask the converter.
