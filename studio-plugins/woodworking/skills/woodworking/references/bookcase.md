# A plywood bookcase

Read this when designing a piece of furniture. It is a whole script for a plywood bookcase (two
sides, fixed shelves housed in dados, a back in a rabbet, a toe kick) and the pattern for any other
piece. Save the block at the end as `bookcase.py` and run `cad run bookcase.py`.

## Contents

- [How the script is laid out](#how-the-script-is-laid-out)
- [Joints](#joints)
- [The sheet layout](#the-sheet-layout)
- [The plan and the cutting diagrams](#the-plan-and-the-cutting-diagrams)
- [Another piece](#another-piece)
- [bookcase.py](#bookcasepy)

## How the script is laid out

1. **The piece's outside sizes and the stock**: thicknesses, sheet size, kerf, the trim off a
   sheet's factory edges and the depth of a joint.
2. **`boards()`**: every board as a blank (length along the grain, width, thickness), where its low
   corner stands, and which way its length, width and thickness run (`"zyx"`: length up, width
   front to back, thickness side to side).
3. **`bookcase`**: the boards standing in place, with the joints cut. **`bookcase_exploded`** is the
   same boards pulled apart, to show how it goes together.
4. **`cut_list`** and **`nest`**: the same boards grouped into a lettered list and placed on sheets,
   and **`cuts`**: how many saw cuts a sheet takes.
5. **`bookcase_sheets`**: the layout as a drawing for a saw or a router.
6. **`write_plan`** and **`write_cutting`**: the plan with its cut list, and the cutting diagrams.
7. **`__main__`**: builds the models, measures each board in the model against its blank, writes the
   files and prints.

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

## The plan and the cutting diagrams

Both are drawn from the board list, so neither can disagree with the model or the cut list.

- **The plan** (`out/bookcase_plan.pdf`, and a `.png`) is the page a woodworker builds from, as a
  published plan sets it out: a front and a side view with the overall sizes, the clear height of
  an opening and the kick; every board lettered; the cut list those letters key to (part, how many,
  length, width, thickness, edge banding); and the joints in words, each with its depth. Length
  always runs with the grain, and sizes are blanks, before joints are cut.
- **The cutting diagrams** (`out/bookcase_cutting.pdf`, and a `.png`) show each sheet as a cut
  optimiser does: every board with its letter, its name and its size, the offcut hatched, an arrow
  for the grain, and over each sheet its thickness, the share of it used, and how many cuts and
  metres of sawing its layout takes. The kerf and the trim off the factory edges are in the title.
- **`out/cutlist.csv`** is the cut list as data, one row per letter, with the material and the grain.
  A cut optimiser imports length, width and quantity from it.

`MATERIAL` names what each thickness is cut from. It reads "plywood" until the person says the
species and grade: put theirs in, never one of your own.

## Another piece

Keep the layout and change `boards()`:

- **A base cabinet**: sides, a bottom housed in dados, stretchers butted at the top, a back, a kick.
- **A drawer box**: a front, a back, two sides, and a bottom housed in a groove around all four.
  A groove is a dado along the grain: house the bottom the same way.
- **A table**: a top, four legs and four aprons. Legs and aprons are solid timber, not sheet: give
  them a thickness of their own, list them by section and length, and leave them out of the sheets.

`write_plan` reads a carcass: it draws every board in a front and a side view and dimensions the
piece's `WIDTH`, `HEIGHT` and `DEPTH`. For another piece, set `NAME`, keep those three as its
outside sizes, and rewrite the plan's notes on joints for its own.

Name every board, give its blank and where it stands, and let `machined` cut what is housed. A
mortise and tenon, a dovetail or a mitre is geometry of its own: model it on the two boards with
the cad skill's modelling references and keep the blank's sizes in the board list.

## bookcase.py

<!-- file: bookcase.py -->

```python
"""A plywood bookcase: the model, its cut list and its sheets, all from one list of boards.

Run: cad run bookcase.py     (three models: the bookcase, the same pulled apart, and its boards laid out on
                              sheets; writes out/: the plan with its cut list, the cutting diagrams, and the
                              cut list as CSV)
"""
import csv
import pathlib
from dataclasses import dataclass

import build123d as bd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from cad import model

NAME = "Bookcase"

# The piece, outside sizes in mm.
WIDTH, HEIGHT, DEPTH = 800.0, 1200.0, 300.0
SHELVES = 3                 # fixed shelves between the top and the bottom
KICK = 70.0                 # toe kick height
KICK_SETBACK = 20.0

# The stock. Measure the sheet: "18 mm" plywood is often 17.5.
T = 18.0                    # carcass plywood
BACK = 6.0                  # back panel
MATERIAL = {T: "plywood", BACK: "plywood"}      # what each thickness is cut from: the species and grade, when given
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


@model
def bookcase_exploded():
    """The boards pulled apart, to see how it goes together: the sides out, the back off, the kick forward."""
    made, gap = boards(), 0.2 * WIDTH
    apart = {"side_left": (-gap, 0, 0), "side_right": (gap, 0, 0), "back": (0, 1.5 * gap, 0), "kick": (0, -gap, 0)}
    return bd.Compound(children=[machined(b, made).moved(bd.Location(apart.get(b.name, (0, 0, 0)))) for b in made],
                       label="bookcase_exploded")


# ---------------------------------------------------------------- cut list and sheets
def cut_list(made: list[Board]) -> list[dict]:
    """The boards grouped into rows of the same blank, lettered A, B, C as a plan letters its parts."""
    rows: dict[tuple, dict] = {}
    for b in made:
        key = (b.thickness, b.length, b.width)
        row = rows.setdefault(key, {"parts": [], "qty": 0, "length": b.length, "width": b.width,
                                    "thickness": b.thickness, "banding_mm": 0.0, "banded": ""})
        row["parts"].append(b.name)
        row["qty"] += 1
        row["banding_mm"] += b.banded
        row["banded"] = "1 long edge" if b.banded else row["banded"]
    ordered = sorted(rows.values(), key=lambda r: (-r["thickness"], -r["length"], -r["width"]))
    for i, row in enumerate(ordered):
        row["letter"] = chr(65 + i)
    return ordered


def letters(made: list[Board]) -> dict[str, str]:
    return {name: row["letter"] for row in cut_list(made) for name in row["parts"]}


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


def cuts(sheet: list[tuple]) -> tuple[int, float]:
    """How many saw cuts a sheet's layout takes and their length in mm: each row ripped off the sheet,
    each board cross-cut off its row, and a board narrower than its row ripped to width."""
    usable = SHEET[0] - 2 * TRIM
    count, run = 0, 0.0
    for y in sorted({y for _, _, y in sheet}):
        row = [b for b, _, at in sheet if at == y]
        tall = max(b.width for b in row)
        count, run = count + 1 + len(row), run + usable + tall * len(row)
        for b in row:
            if b.width < tall:
                count, run = count + 1, run + b.length
    return count, run


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


# ---------------------------------------------------------------- the plan and the cutting diagrams
INK, RED, QUIET, WOOD, THIN, WASTE = "#111111", "#c0392b", "#6b6b6b", "#e7cfa4", "#d3b684", "#efefec"


def _page(title: str, note: str):
    fig = plt.figure(figsize=(297 / 25.4, 210 / 25.4))
    page = fig.add_axes([0, 0, 1, 1])
    page.set_xlim(0, 297)
    page.set_ylim(0, 210)
    page.axis("off")
    page.text(12, 198, title, fontsize=16, fontweight="bold", va="center")
    page.text(12, 190, note, fontsize=8.5, va="center", color=QUIET)
    page.plot([12, 285], [184, 184], color=INK, lw=0.8)
    return fig, page


def _view(fig, page, title: str, left: float, bottom: float, w: float, h: float, x0: float, x1: float, y0: float, y1: float):
    """Axes on the page that show the box x0..x1, y0..y1 whole, at one scale both ways."""
    scale = max((x1 - x0) / w, (y1 - y0) / h)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    ax = fig.add_axes([left / 297, bottom / 210, w / 297, h / 210])
    ax.set_xlim(cx - w * scale / 2, cx + w * scale / 2)
    ax.set_ylim(cy - h * scale / 2, cy + h * scale / 2)
    ax.axis("off")
    page.text(left, bottom + h + 3, title, fontsize=8, fontweight="bold", color=QUIET, va="center")
    return ax, scale


def _dim(ax, a, b, word: str, scale: float) -> None:
    ax.annotate("", xy=a, xytext=b, arrowprops=dict(arrowstyle="<|-|>", color=RED, lw=0.7, shrinkA=0, shrinkB=0, mutation_scale=7))
    upright = abs(b[0] - a[0]) < abs(b[1] - a[1])
    ax.text((a[0] + b[0]) / 2 + (1.5 * scale if upright else 0), (a[1] + b[1]) / 2 + (0 if upright else 1.5 * scale), word,
            color=RED, fontsize=7, ha="left" if upright else "center", va="center" if upright else "bottom")


def _balloon(ax, x: float, y: float, letter: str) -> None:
    ax.text(x, y, letter, fontsize=7, fontweight="bold", color=INK, ha="center", va="center",
            bbox=dict(boxstyle="circle,pad=0.25", fc="white", ec=INK, lw=0.7))


def write_plan(stem: str, made: list[Board]) -> None:
    """The plan, A4 landscape: front and side views with the overall sizes and every board lettered,
    the cut list those letters key to, and the joints. STEM.pdf and STEM.png."""
    rows, letter = cut_list(made), letters(made)
    fig, page = _page(NAME, f"plan  ·  {WIDTH:g} wide x {HEIGHT:g} high x {DEPTH:g} deep  ·  millimetres")

    def boxes(h: str, v: str):
        for b in sorted(made, key=lambda b: b.thickness):            # the thin back first, behind the rest
            size = dict(zip(b.axes, (b.length, b.width, b.thickness)))
            at = dict(zip("xyz", b.at))
            yield b, at[h], at[v], size[h], size[v]

    for title, h, v, left, w, span in (("FRONT", "x", "z", 12, 78, WIDTH), ("SIDE", "y", "z", 96, 50, DEPTH)):
        pad = 0.18 * HEIGHT
        ax, scale = _view(fig, page, title, left, 16, w, 158, -pad, span + pad, -pad * 0.6, HEIGHT + pad * 0.4)
        for b, x, y, dx, dy in boxes(h, v):
            hidden = title == "SIDE" and not b.name.startswith("side")       # behind the side panel
            ax.fill([x, x + dx, x + dx, x], [y, y, y + dy, y + dy], color=THIN if b.thickness != T else WOOD,
                    ec=INK, lw=0.5 if hidden else 0.9, ls=(0, (3, 2)) if hidden else "-", alpha=0.55 if hidden else 1)
        seen = set()
        for b, x, y, dx, dy in boxes(h, v):
            if title == "FRONT" or letter[b.name] not in seen:
                along = 0.25 if b.axes == "xzy" and title == "FRONT" else 0.5        # the kick's, clear of the bottom's
                _balloon(ax, x + dx * along, y + dy / 2 if dy < 3 * T or dx < 3 * T else y + dy * 0.62, letter[b.name])
                seen.add(letter[b.name])
        _dim(ax, (0, -pad * 0.35), (span, -pad * 0.35), f"{span:g}", scale)
        _dim(ax, (span + pad * 0.45, 0), (span + pad * 0.45, HEIGHT), f"{HEIGHT:g}", scale)
        if title == "FRONT":
            levels = sorted(b.at[2] for b in made if b.axes == "xyz")
            _dim(ax, (-pad * 0.4, levels[0] + T), (-pad * 0.4, levels[1]), f"{levels[1] - levels[0] - T:g} clear", scale)
            _dim(ax, (-pad * 0.4, 0), (-pad * 0.4, KICK), f"{KICK:g}", scale)

    x0, y, cols = 160.0, 174.0, (160, 168, 207, 217, 233, 248, 261)       # the cut list
    for x, word in zip(cols, ("", "Part", "Qty", "Length", "Width", "Thick", "Edge banding")):
        page.text(x, y, word, fontsize=7.5, fontweight="bold", va="center")
    page.plot([x0, 285], [y - 4] * 2, color=INK, lw=0.8)
    for r in rows:
        y -= 8
        page.text(x0 + 3, y, r["letter"], fontsize=7, fontweight="bold", ha="center", va="center",
                  bbox=dict(boxstyle="circle,pad=0.25", fc="white", ec=INK, lw=0.7))
        names = sorted({n.rstrip("0123456789_").replace("_", " ") for n in r["parts"]})
        cells = (", ".join(names), f"{r['qty']}", f"{r['length']:g}", f"{r['width']:g}", f"{r['thickness']:g}", r["banded"] or "-")
        for x, word in zip(cols[1:], cells):
            page.text(x, y, word[:26], fontsize=7.5, va="center")
        page.plot([x0, 285], [y - 4] * 2, color="#d9d4c8", lw=0.4)
    notes = [
        "Sizes are blanks, before joints are cut. Length runs with the grain.",
        f"Shelves, top and bottom are housed {JOINT:g} deep in dados across the sides.",
        f"The back sits in a {JOINT:g} deep rabbet in each side. The kick is butted.",
        "Edge banding goes on the front edge. " + f"Total {sum(b.banded for b in made) / 1000:.2f} m.",
        "Stock: " + "; ".join(f"{t:g} mm {MATERIAL[t]}" for t in sorted(MATERIAL, reverse=True))
        + f", sheets {SHEET[0]:g} x {SHEET[1]:g}. Measure it before cutting joints.",
        "Not checked for load. Hardware is not listed.",
    ]
    for i, note in enumerate(notes):
        page.text(x0, y - 12 - 5.5 * i, note, fontsize=7, va="center", color=QUIET)
    for path in (f"{stem}.pdf", f"{stem}.png"):
        fig.savefig(path, dpi=200)
    plt.close(fig)


def write_cutting(stem: str, made: list[Board]) -> None:
    """The cutting diagrams, A4 landscape: every sheet with its boards lettered and sized, the offcut
    greyed, the grain's direction and what share of the sheet is used. STEM.pdf and STEM.png."""
    letter = letters(made)
    sheets = [(t, sheet) for t in sorted({b.thickness for b in made}, reverse=True) for sheet in nest(made, t)]
    fig, page = _page(NAME, f"cutting diagrams  ·  {len(sheets)} sheet(s) of {SHEET[0]:g} x {SHEET[1]:g}  ·  kerf {KERF:g}  ·  "
                      f"{TRIM:g} trimmed off each factory edge  ·  boards are not turned: grain runs along the sheet")
    across = 2 if len(sheets) > 2 else 1
    down = -(-len(sheets) // across)
    w, h = (273 - 8 * (across - 1)) / across, (160 - 12 * (down - 1)) / down
    for i, (t, sheet) in enumerate(sheets):
        left, bottom = 12 + (i % across) * (w + 8), 16 + (down - 1 - i // across) * (h + 12)
        used = sum(b.length * b.width for b, _, _ in sheet) / (SHEET[0] * SHEET[1])
        count, run = cuts(sheet)
        ax, scale = _view(fig, page, f"SHEET {i + 1} of {len(sheets)}  ·  {t:g} mm {MATERIAL[t]}  ·  {used:.0%} used  ·  "
                          f"{count} cuts, {run / 1000:.1f} m of sawing", left, bottom,
                          w, h, 0, SHEET[0], 0, SHEET[1] * 1.14)
        ax.fill([0, SHEET[0], SHEET[0], 0], [0, 0, SHEET[1], SHEET[1]], fc=WASTE, ec="#c4c4bd", lw=0, hatch="////")
        ax.plot([0, SHEET[0], SHEET[0], 0, 0], [0, 0, SHEET[1], SHEET[1], 0], color=INK, lw=1.0)
        for b, x, y in sheet:
            ax.fill([x, x + b.length, x + b.length, x], [y, y, y + b.width, y + b.width], color=WOOD if t == T else THIN, ec=INK, lw=0.8)
            _balloon(ax, x + 6 * scale, y + b.width / 2, letter[b.name])
            words = (b.name.replace("_", " "), f"{b.length:g} x {b.width:g}")
            ax.text(x + b.length / 2 + 3 * scale, y + b.width / 2, "\n".join(words) if b.width > 9 * scale else "  ".join(words),
                    fontsize=6.5, ha="center", va="center", linespacing=1.3)
        gy = SHEET[1] * 1.07
        ax.annotate("", xy=(SHEET[0] * 0.58, gy), xytext=(SHEET[0] * 0.42, gy),
                    arrowprops=dict(arrowstyle="<|-|>", color=QUIET, lw=0.7, shrinkA=0, shrinkB=0, mutation_scale=7))
        ax.text(SHEET[0] * 0.6, gy, "grain", fontsize=6.5, color=QUIET, ha="left", va="center")
    for path in (f"{stem}.pdf", f"{stem}.png"):
        fig.savefig(path, dpi=200)
    plt.close(fig)


if __name__ == "__main__":
    made = boards()
    built = bookcase()
    bookcase_exploded()
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
        writer.writerow(["part", "qty", "length_mm", "width_mm", "thickness_mm", "material", "grain", "edge_banding",
                         "edge_banding_mm", "boards"])
        for r in rows:
            writer.writerow([r["letter"], r["qty"], r["length"], r["width"], r["thickness"], MATERIAL[r["thickness"]], "along length",
                             r["banded"], r["banding_mm"], " ".join(r["parts"])])
            print(f"{r['letter']}  {r['qty']} x {r['length']:.0f} x {r['width']:.0f} x {r['thickness']:g}  {' '.join(r['parts'])}")
    write_plan(str(out / "bookcase_plan"), made)
    write_cutting(str(out / "bookcase_cutting"), made)
    for thickness in sorted({b.thickness for b in made}, reverse=True):
        sheets = nest(made, thickness)
        used = sum(b.length * b.width for b in made if b.thickness == thickness)
        print(f"{thickness:g} mm: {len(sheets)} sheet(s) of {SHEET[0]:.0f} x {SHEET[1]:.0f}, "
              f"{100 * used / (len(sheets) * SHEET[0] * SHEET[1]):.0f}% used")
    print(f"edge banding {sum(b.banded for b in made) / 1000:.2f} m")
    print("plan out/bookcase_plan.pdf · cutting diagrams out/bookcase_cutting.pdf")
```
