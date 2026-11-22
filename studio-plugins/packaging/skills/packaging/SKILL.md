---
name: packaging
description: Designs folding cartons and their dielines - a carton sized from the product and the board's thickness, its cut and crease lines as a DXF for a die maker or a cutting table, and the same panels folded up in 3D to check that the carton closes and the product fits. Use for dielines, folding cartons, tuck end boxes, cut and crease files, and packaging mock-ups. Not for corrugated shipper strength or print artwork.
---

# Packaging: cartons and dielines

A carton is one list of panels. The dieline is those panels laid flat, with cuts and creases on their
own layers; the folded carton is the same panels turned about their creases with the board's real
thickness. Because both come from one list, the flat file and the folded check cannot disagree.

The cad skill ($cad) is how models run, export and are shown; read it first. This skill adds what a
carton needs.

## Start with the task

| Task                                            | Start with                                                              | Reference                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| **A carton for a product**                      | The product's three sizes and the board's caliper, in the worked carton | [A reverse tuck end carton](references/carton.md)     |
| **The dieline file**                            | `cad model export <dieline id> carton.dxf`                              | [Run, export, check](#run-export-check)               |
| **Does it close, does the product fit?**        | `cad model interference <packed id>`                                    | [Run, export, check](#run-export-check)               |
| **Another style** (straight tuck, sleeve, tray) | The same panel list, with that style's panels                           | [Another style](references/carton.md#another-style)   |
| **A flap, a clearance, a glue flap**            | The constants at the top of the script                                  | [The allowances](references/carton.md#the-allowances) |
| **Cut a sample**                                | The DXF, to a cutting table or a laser service                          | [Handing it over](#handing-it-over)                   |

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
  parts 13 · bounds 191.3 × 195.3 × 0 mm · joints 0 · sequences 0
  id: 090f96b4-51c4-5a77-ab0b-c0432086bc22
built carton.py::carton_folded warm in 0.05s: ...
  parts 13 · bounds 62.88 × 28.34 × 113.3 mm · joints 0 · sequences 0
  id: 5eed324e-fe45-507b-b396-253a9de74d30
built carton.py::carton_packed warm in 0.05s: ...
  parts 14 · bounds 62.88 × 28.34 × 113.3 mm · joints 0 · sequences 0
  id: 61b855f8-0e3d-5dea-91af-9f850a5443d2
clear inside 61.5 x 26.5 x 111.5 mm (score to score 61.96 x 27.42 x 111.50) · blank 191.3 x 195.3 mm · board 0.46 mm
```

Three models, each with its own id: the dieline, the folded carton, and the folded carton with a
block the product's size inside it. `clear inside` is the room left for the product once the glue
flap and the tucks are in. Below, each `$..._ID` is the `id:` line that model's run printed.

```bash
cad model export "$DIELINE_ID" carton.dxf        # refuses a dieline whose cut line does not close
cad dxf snapshot carton.dxf dieline.png
cad model snapshot "$FOLDED_ID" folded.png
cad model snapshot "$PACKED_ID" inside.png --display xray    # the tucks and the product, through the walls
cad model interference "$PACKED_ID"              # the fit check
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

Show the dieline and the folded carton as the cad skill's Show the model section says.

## The rules a dieline keeps

- **Sizes are score to score, inside.** The carton is sized from the product, a clearance each side,
  and one caliper for each layer of board that ends up inside a wall: the glue flap, and each tuck.
- **The caliper is measured.** 18 pt board is 0.018 in, 0.457 mm, but boards vary: use the thickness
  of the board that will be run. Ask for it; do not assume one and present the result as final.
- **The fit is a choice.** `FIT` is the air on each side of the product, 0.75 mm in the example. Say
  what you used, and ask how snug the product should sit when it matters (a bottle that must not
  rattle, a product in a sleeve of its own).
- **Two layers, by what the knife does.** `CUT` is one closed outline. `CREASE_FOLD` holds every
  score as an open line. The export refuses an open line on a cut layer, and a line drawn twice. Add a
  perforation or a kiss cut as a layer of its own, named for it (`PERF_FOLD`).
- **A crease is drawn once**, between the two panels that share it. Panels that do not share their
  score exactly do not join, and the script raises before anything is exported.
- **Every flap default is a trade rule of thumb**, kept as a named constant with a comment. A
  converter has its own rules for its machines: when the person names one, use theirs.

## Check each change

| Change                                     | Check                                                                                                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The product's size, the fit or the caliper | The run's `clear inside` line holds the product; `cad model interference` on the packed model is OK                                                                     |
| A flap's depth, a relief, a clearance      | `cad model interference` on the packed model; the folded snapshot                                                                                                       |
| A new panel or a new style                 | The run does not raise (the panels join into one blank); the dieline snapshot; interference                                                                             |
| The dieline for a cutter                   | `cad model export` succeeds (it refuses an open cut and a doubled line); `cad dxf snapshot` shows the outline and every crease, drawn alike: the layers tell them apart |
| The blank on a sheet                       | The run's `blank` size against the sheet or the cutting table's bed                                                                                                     |

An OK from the fit check establishes that, with ideal folds, no panel passes through another or
through the product, and the product's block sits inside. It does not establish that the carton
erects on a machine, that its tucks hold shut, that the board cracks or not on a score, or how
much it carries: those are found by cutting and folding a sample. Say "not checked on a sample"
until one has been made.

## Handing it over

- The DXF is millimetres, 1:1, cuts on `CUT` and creases on `CREASE_FOLD`. Say so to whoever
  receives it, with the board and its caliper.
- A laser or knife-table service wants cuts and scores as separate layers or colours, which this is.
  For a sheet-cutting service, the sendcutsend skill ($sendcutsend) checks a file against that
  service's guide.
- Print artwork is not in this file. An artwork template is the same dieline placed under the
  artwork in a layout program; bleed and safe margins are the printer's to give.
- The grain of the board and the direction of the flutes in corrugated matter to how it folds. This
  skill does not model them: ask the converter.
