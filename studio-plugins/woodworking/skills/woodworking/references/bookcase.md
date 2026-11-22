# A plywood bookcase

Read this when designing a piece of furniture. It is a whole script for a plywood bookcase (two
sides, fixed shelves housed in dados, a back in a rabbet, a toe kick) and the pattern for any other
piece. Save the block at the end as `bookcase.py` and run `cad run bookcase.py`.

## Contents

- [How the script is laid out](#how-the-script-is-laid-out)
- [Joints](#joints)
- [The sheet layout](#the-sheet-layout)
- [Another piece](#another-piece)
- [bookcase.py](#bookcasepy)

## How the script is laid out

1. **The piece's outside sizes and the stock**: thicknesses, sheet size, kerf, the trim off a
   sheet's factory edges and the depth of a joint.
2. **`boards()`**: every board as a blank (length along the grain, width, thickness), where its low
   corner stands, and which way its length, width and thickness run (`"zyx"`: length up, width
   front to back, thickness side to side).
3. **`bookcase`**: the boards standing in place, with the joints cut.
4. **`cut_list`** and **`nest`**: the same boards grouped into a list and placed on sheets.
5. **`bookcase_sheets`**: the layout as a drawing.
6. **`__main__`**: builds both, measures each board in the model against its blank, and prints.

x runs across the front, y from front to back, z up.

## Joints

A housed joint is not drawn. The housed board is made its full length (the gap it spans, plus the
joint's depth at each end) and placed where it goes; `machined` then subtracts every housed board
from the side that holds it. The dado is exactly the board's section and the rabbet exactly the
back's, so they seat with no gap and no shared wood, which `cad model interference` confirms.

- **Dado**: a shelf, top or bottom housed across a side. Its depth is `JOINT`, a third of the
  plywood's thickness here.
- **Rabbet**: the back, housed in the rear edge of each side. Every horizontal is `BACK` shallower
  than the sides, so the back covers their rear edges.
- **A butt joint** (the kick) is a board that touches and is not housed: leave it out of what
  `machined` subtracts.

A joint cut exactly to size is what the model shows. A real joint needs a little room for glue and
for the stock's true thickness: that is set at the saw from the measured board, and is the shop's.

## The sheet layout

`nest` lays the boards of one thickness in rows across a trimmed sheet: widest board first, each row
as tall as its first board, a kerf between neighbours, and a new sheet when a row will not fit.
Boards are never turned, so the grain of every board runs the sheet's length.

It raises when a board is larger than a trimmed sheet, by name. It gives a layout a panel saw can
cut with straight rips and crosscuts. A tighter layout may exist: do not present this one as the
fewest sheets possible when the count is close to a whole sheet.

## Another piece

Keep the layout and change `boards()`:

- **A base cabinet**: sides, a bottom housed in dados, stretchers butted at the top, a back, a kick.
- **A drawer box**: a front, a back, two sides, and a bottom housed in a groove around all four.
  A groove is a dado along the grain: house the bottom the same way.
- **A table**: a top, four legs and four aprons. Legs and aprons are solid timber, not sheet: give
  them a thickness of their own, list them by section and length, and leave them out of the sheets.

Name every board, give its blank and where it stands, and let `machined` cut what is housed. A
mortise and tenon, a dovetail or a mitre is geometry of its own: model it on the two boards with
the cad skill's modelling references and keep the blank's sizes in the board list.

## bookcase.py

<!-- file: bookcase.py -->

```python
"""A plywood bookcase: the model, its cut list and its sheets, all from one list of boards.

Run: cad run bookcase.py     (two models: the bookcase, and its boards laid out on sheets; writes out/cutlist.csv)
"""
import csv
import pathlib
from dataclasses import dataclass

import build123d as bd
from cad import model

# The piece, outside sizes in mm.
WIDTH, HEIGHT, DEPTH = 800.0, 1200.0, 300.0
SHELVES = 3                 # fixed shelves between the top and the bottom
KICK = 70.0                 # toe kick height
KICK_SETBACK = 20.0

# The stock. Measure the sheet: "18 mm" plywood is often 17.5.
T = 18.0                    # carcass plywood
BACK = 6.0                  # back panel
SHEET = (2440.0, 1220.0)    # length along the face grain, width
KERF = 3.2                  # saw blade
TRIM = 10.0                 # factory edge trimmed off each side of a sheet
JOINT = 6.0                 # depth of a dado and of the back's rabbet: a third of the plywood


@dataclass(frozen=True)
class Board:
    name: str
    length: float           # along the grain
    width: float
    thickness: float
    at: tuple               # the low corner where it stands in the piece
    axes: str               # which way its length, width and thickness run, as "xyz" letters
    banded: float = 0.0     # edge banding on its front edge, mm

    def box(self) -> bd.Solid:
        size = dict(zip(self.axes, (self.length, self.width, self.thickness)))
        solid = bd.Box(size["x"], size["y"], size["z"], align=bd.Align.MIN)
        return solid.moved(bd.Location(self.at))


def boards() -> list[Board]:
    across = WIDTH - 2 * T + 2 * JOINT          # a horizontal, housed JOINT deep in each side
    deep = DEPTH - BACK                         # the back covers every horizontal's rear edge
    levels = [KICK + i * (HEIGHT - T - KICK) / (SHELVES + 1) for i in range(SHELVES + 2)]
    names = ["bottom", *[f"shelf_{i + 1}" for i in range(SHELVES)], "top"]
    made = [
        Board("side_left", HEIGHT, DEPTH, T, (0, 0, 0), "zyx", banded=HEIGHT),
        Board("side_right", HEIGHT, DEPTH, T, (WIDTH - T, 0, 0), "zyx", banded=HEIGHT),
        *[Board(name, across, deep, T, (T - JOINT, 0, z), "xyz", banded=across) for name, z in zip(names, levels)],
        Board("kick", WIDTH - 2 * T, KICK, T, (T, KICK_SETBACK, 0), "xzy"),
        Board("back", HEIGHT - KICK, across, BACK, (T - JOINT, DEPTH - BACK, KICK), "zxy"),
    ]
    return made


def machined(board: Board, others: list[Board]) -> bd.Solid:
    """A side with its dados and rabbet: whatever a housed board buries in it is cut away."""
    solid = board.box()
    if board.name.startswith("side"):
        for other in others:
            if other.name not in ("kick", board.name) and not other.name.startswith("side"):
                solid = solid - other.box()
    solid.label = board.name
    solid.color = "#d9b98a" if board.thickness == T else "#c4a070"
    return solid


@model
def bookcase():
    made = boards()
    return bd.Compound(children=[machined(b, made) for b in made], label="bookcase")


# ---------------------------------------------------------------- cut list and sheets
def cut_list(made: list[Board]) -> list[dict]:
    rows: dict[tuple, dict] = {}
    for b in made:
        key = (b.thickness, b.length, b.width)
        row = rows.setdefault(key, {"parts": [], "qty": 0, "length": b.length, "width": b.width,
                                    "thickness": b.thickness, "banding_mm": 0.0})
        row["parts"].append(b.name)
        row["qty"] += 1
        row["banding_mm"] += b.banded
    return sorted(rows.values(), key=lambda r: (-r["thickness"], -r["length"], -r["width"]))


def nest(made: list[Board], thickness: float) -> list[list[tuple]]:
    """Boards of one thickness on sheets, grain along the sheet: rows across the sheet, longest board
    first, each row as tall as its first board (first-fit decreasing height). A saw can cut every
    layout it makes, rip by rip; it is not the tightest layout there is."""
    usable = (SHEET[0] - 2 * TRIM, SHEET[1] - 2 * TRIM)
    todo = sorted((b for b in made if b.thickness == thickness), key=lambda b: (-b.width, -b.length))
    sheets: list[list[dict]] = []           # each sheet is its rows: {"y", "height", "x", "boards"}
    for b in todo:
        if b.length > usable[0] or b.width > usable[1]:
            raise ValueError(f"{b.name} ({b.length:.0f} x {b.width:.0f}) is larger than a trimmed sheet")
        placed = False
        for rows in sheets:
            for row in rows:
                if b.width <= row["height"] and row["x"] + b.length <= usable[0]:
                    row["boards"].append((b, row["x"], row["y"]))
                    row["x"] += b.length + KERF
                    placed = True
                    break
            if placed:
                break
            top = rows[-1]["y"] + rows[-1]["height"] + KERF
            if top + b.width <= usable[1]:
                rows.append({"y": top, "height": b.width, "x": b.length + KERF, "boards": [(b, 0.0, top)]})
                placed = True
                break
        if not placed:
            sheets.append([{"y": 0.0, "height": b.width, "x": b.length + KERF, "boards": [(b, 0.0, 0.0)]}])
    return [[(b, x + TRIM, y + TRIM) for row in rows for b, x, y in row["boards"]] for rows in sheets]


@model
def bookcase_sheets():
    """Every sheet with its boards, as a drawing: boards on CUT, sheet edges and names for reference."""
    made, shapes, row = boards(), [], 0.0
    for thickness in sorted({b.thickness for b in made}, reverse=True):
        for sheet in nest(made, thickness):
            edge = bd.Rectangle(*SHEET, align=bd.Align.MIN).moved(bd.Location((0, row, 0))).wire()
            edge.label = "SHEET_REF"
            shapes.append(edge)
            for b, x, y in sheet:
                part = bd.Rectangle(b.length, b.width, align=bd.Align.MIN).moved(bd.Location((x, row + y, 0))).wire()
                part.label = "CUT"
                name = bd.Text(f"{b.name} {b.thickness:g}", font_size=28, align=bd.Align.MIN)
                name = name.moved(bd.Location((x + 15, row + y + 15, 0)))
                name.label = "NAME_ENGRAVE"
                shapes += [part, name]
            row -= SHEET[1] + 100
    return bd.Compound(children=shapes, label="bookcase_sheets")


if __name__ == "__main__":
    made = boards()
    built = bookcase()
    bookcase_sheets()

    # The cut list is only as good as its match with the model: every blank must be the box its solid fills.
    solids = {child.label: child for child in built.shape.children}
    for b in made:
        box = solids[b.name].bounding_box().size
        size = sorted((box.X, box.Y, box.Z))
        if any(abs(a - e) > 1e-6 for a, e in zip(size, sorted((b.length, b.width, b.thickness)))):
            raise SystemExit(f"{b.name}: the model's board is {size}, the cut list says {b.length} x {b.width} x {b.thickness}")

    rows = cut_list(made)
    out = pathlib.Path("out")
    out.mkdir(exist_ok=True)
    with open(out / "cutlist.csv", "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["qty", "length_mm", "width_mm", "thickness_mm", "edge_banding_mm", "parts"])
        for r in rows:
            writer.writerow([r["qty"], r["length"], r["width"], r["thickness"], r["banding_mm"], " ".join(r["parts"])])
            print(f"{r['qty']} x {r['length']:.0f} x {r['width']:.0f} x {r['thickness']:g}  {' '.join(r['parts'])}")
    for thickness in sorted({b.thickness for b in made}, reverse=True):
        sheets = nest(made, thickness)
        used = sum(b.length * b.width for b in made if b.thickness == thickness)
        print(f"{thickness:g} mm: {len(sheets)} sheet(s) of {SHEET[0]:.0f} x {SHEET[1]:.0f}, "
              f"{100 * used / (len(sheets) * SHEET[0] * SHEET[1]):.0f}% used")
    print(f"edge banding {sum(b.banded for b in made) / 1000:.2f} m")
```
