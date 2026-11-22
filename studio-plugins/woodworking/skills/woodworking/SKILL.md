---
name: woodworking
description: Designs furniture and cabinets from sheet goods and boards - the piece as a model with its joints cut, a cut list checked against that model, the boards laid out on sheets with the saw kerf, and edge banding lengths. Use for bookcases, cabinets, shelves, tables, cut lists, sheet layouts, plywood and joinery such as dados and rabbets. Not for CNC router toolpaths (the cam skill) or whether a shelf holds a load (the fea skill).
---

# Woodworking: furniture and cut lists

A piece of furniture is one list of boards. The model is those boards standing where they go with
their joints cut; the cut list is the same boards as blanks; the sheet layout is the blanks on stock.
Because all three come from one list, the cut list cannot disagree with what was drawn.

The cad skill ($cad) is how models run, export and are shown; read it first. This skill adds what a
piece of furniture needs.

## Start with the task

| Task                                             | Start with                                              | Reference                                             |
| ------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------- |
| **Design a piece**                               | Its outside sizes and its stock, in the worked bookcase | [A plywood bookcase](references/bookcase.md)          |
| **The cut list**                                 | The run's printed list and `out/cutlist.csv`            | [Run and check](#run-and-check)                       |
| **How many sheets, and where each board is cut** | The sheets model, exported as a DXF                     | [Run and check](#run-and-check)                       |
| **A joint** (dado, rabbet, groove)               | How a board is housed in another                        | [Joints](references/bookcase.md#joints)               |
| **Another piece** (cabinet, table, drawer box)   | The same board list, with that piece's boards           | [Another piece](references/bookcase.md#another-piece) |
| **Cut it on a CNC router**                       | The cam skill ($cam), on the model                      | Its own references                                    |
| **Will the shelf sag or hold?**                  | The fea skill ($fea), on the model                      | Its own references                                    |

## Setup

This skill runs the `cad` command. Run `cad --version` before first use in a chat; in Studio it is
already there. If it is missing, say so and stop: do not install it yourself.

## Run and check

Start from [the worked bookcase](references/bookcase.md): save it as `bookcase.py`, set the sizes and
the stock, and run it.

```bash
cad run bookcase.py
```

```text
built bookcase.py::bookcase cold in 1.61s: ...
  parts 9 · bounds 800 × 300 × 1,200 mm · joints 0 · sequences 0
  id: 2430cf34-a060-5a67-b227-883feb69911d
built bookcase.py::bookcase_sheets warm in 1.14s: ...
  parts 20 · bounds 2,440 × 2,540 × 0 mm · joints 0 · sequences 0
  id: 8b941797-5cec-5eed-a302-6a2a54ba5a57
2 x 1200 x 300 x 18  side_left side_right
5 x 776 x 294 x 18  bottom shelf_1 shelf_2 shelf_3 top
1 x 764 x 70 x 18  kick
1 x 1130 x 776 x 6  back
18 mm: 1 sheet(s) of 2440 x 1220, 64% used
6 mm: 1 sheet(s) of 2440 x 1220, 29% used
edge banding 6.28 m
```

Before printing the list, the script measures every board in the built model and stops if one is not
the blank the list says (`side_left: the model's board is [...], the cut list says ...`).

Each `$..._ID` below is the `id:` line that model's run printed.

```bash
cad model interference "$BOOKCASE_ID"            # every joint seats without two boards sharing wood
cad model snapshot "$BOOKCASE_ID" bookcase.png
cad model export "$SHEETS_ID" sheets.dxf
cad dxf snapshot sheets.dxf sheets.png
```

```text
OK bookcase: no two parts share volume (9 parts at 1 pose, the boxes of 20 pairs met: 20 measured, in 1.54 s)
```

Show the piece and its sheets as the cad skill's Show the model section says.

## The rules a piece keeps

- **Stock is measured.** Plywood sold as 18 mm is often 17.5; a dado cut for 18 is then loose. Ask
  for the measured thickness, the sheet size and the blade's kerf, and say when a default stood in.
- **A blank is the board before its joints are cut.** Length runs along the grain. The cut list gives
  blanks; the model shows the boards after the dados and rabbets.
- **A housed board is longer than the gap it spans** by the depth of the joint at each end. The board
  list says so once, and the joint is cut by subtracting the housed board from the one that holds it.
- **Grain runs along the sheet.** The layout never turns a board, so every board's face grain runs
  the sheet's length. Solid timber is not laid out on sheets: list it by length and section.
- **The layout is one a saw can cut**, rip by rip. It is not the tightest there is: say the number of
  sheets and the percentage used, and do not call it optimal.

## Check each change

| Change                                   | Check                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| A size, the number of shelves, the stock | The run completes (every blank matches its board); the cut list reads sensibly               |
| A joint or a new board                   | `cad model interference` is OK; the snapshot shows the board seated in its joint             |
| The sheets                               | The run's sheet count; `cad dxf snapshot` shows every board inside a sheet, none overlapping |
| Edge banding                             | A banded edge is one that shows: read the list against the snapshot                          |

An OK here establishes that the boards are the sizes listed, that they fit on the sheets, and that no
two boards share wood. It does not establish that the piece is strong, that a shelf will not sag
under books, that it will not rack, or that it suits the wood's movement with the seasons. A load
question goes to the fea skill; without that run, say "not checked for load".

## Handing it over

- `out/cutlist.csv` is the list for the shop: quantity, length, width, thickness, edge banding and
  the boards' names.
- `sheets.dxf` has the boards on `CUT`, the sheet edges on `SHEET_REF` and each board's name on
  `NAME_ENGRAVE`, in millimetres at 1:1. A panel saw operator reads it; a CNC router needs toolpaths
  with the bit's diameter, which is the cam skill's work.
- Hardware (screws, shelf pins, hinges, slides) is not in the board list. List what the design needs
  when the person names it; never invent a part number.
- A price is the sheets, the banding and the hardware at prices the person gives. Without their
  prices there is no cost: say how many sheets and metres, and stop there.
