# Handing a pattern over

Read this when the pattern goes to a cutting room, a factory or a printer.

## Contents

- [The AAMA DXF](#the-aama-dxf)
- [The sheets](#the-sheets)
- [Printing at home](#printing-at-home)
- [The lay plan](#the-lay-plan)
- [The tech pack page](#the-tech-pack-page)
- [Before it leaves](#before-it-leaves)

## The AAMA DXF

`write_aama` writes the interchange format pattern CAD systems read, known as AAMA DXF or ASTM D6673
(ASTM withdrew the standard in 2019; the format is still what cutting rooms exchange). One file holds
every size:

| In the file                      | What it is                                                           |
| -------------------------------- | -------------------------------------------------------------------- |
| A `BLOCK` named `<PIECE>_<SIZE>` | One piece in one size                                                |
| Layer `1`                        | The cut line, a closed polyline, and the piece's text                |
| Layer `14`                       | The sew line, a closed polyline                                      |
| Layer `4`                        | Notches: a point on the cut line whose thickness is the slit's depth |
| Layer `6`                        | The mirror line of a piece cut on the fold                           |
| Layer `7`                        | The grainline                                                        |
| Text on layer `1`, in a block    | `Piece Name:`, `Size:`, `Quantity:`, `Material:`, `Style Name:`      |
| Text on layer `1`, beside them   | `Style Name:`, `Sample Size:` (the base size) and `Units: METRIC`    |

The file is DXF R12 in **millimetres**. R12 has no units field: the `Units: METRIC` line says so in
the format's own way, and tell the receiver too, or they may read it as inches.

What the file leaves out, to say with it:

- **No grade rules.** Sizes are separate pieces, not one piece with a `.rul` table. A receiver who
  wants graded nests must be told each size is its own block.
- **A piece cut on the fold is half a piece** with its mirror line. Some systems want the whole piece.
- **Quantity is how many to cut of the piece as drawn.** A mirrored pair is `Quantity: 2` with the
  pairing in its annotation.

## The sheets

- **The graded nest** (`<name>_nest.svg`, and a `.png` to look at) is every size stacked on its
  drafting origin, as pattern software shows grading: each size a line and colour of its own, named in
  the key, and the base size drawn whole with its sew line, notches, grainline and label. Show this
  first: it is the pattern at a glance.
- **A sheet per size** (`<name>_<size>.svg`) is that size alone at 1:1 in millimetres, for a plotter
  or a copy shop's wide printer. `write_pattern` writes a PDF instead when the path ends `.pdf`.

Both carry a 10 cm test square with a 2 in square inside it.

## Printing at home

`<name>_print_A4.pdf` and `<name>_print_Letter.pdf` are the nest cut into pages; `<name>_print_A0.pdf`
is the same for a copy shop. Tell the person:

- Print at 100% (actual size), never "fit to page", and measure the cover's square before the rest.
- Trim each page on its border, match the triangles and tape. The cover's map shows where each page
  goes: `B3` is row B, column 3.
- Cut on their size's line: the cover's key says which line is which size.

Every size is on the pages as its own line. They are not layers a PDF reader can switch off: for one
size alone, print that size's sheet at a copy shop, or run the design with one row.

## The lay plan

`<name>_lay.png` lays one garment's pieces on open fabric of `FABRIC_WIDTH`, each whole and with its
grainline along the fabric, and the run prints the length it takes and the share of fabric used. It is
a first figure for how much fabric to buy or cost. The pieces are side by side, not nested into one
another, and one garment in one size: a cutting room's marker mixes sizes and nests them, and uses
less. Say "about" with it, and ask for the fabric's own cuttable width.

## The tech pack page

A tech pack is what a factory makes the garment from. The run writes its measurement page,
`<name>_techpack.pdf` (and a `.png`): the garment as flat sketches, front and back, with every point
of measure lettered on them, and beside them the table of those points in every size, the base size
marked, with the tolerance the factory may be off by. `<name>_spec.csv` is the same table as data.

```text
POM,"measurement (cm, garment flat)",tolerance +/-,XS,S,M,L,XL
A,chest width,1.0,47.0,50.0,53.0,57.0,61.0
B,body length,1.0,66.0,68.0,70.0,72.0,74.0
C,across shoulder,0.5,40.0,42.0,44.0,46.0,48.0
```

Every number and every line of the flats is read off the drafted pieces, so the page cannot disagree
with the pattern. The tolerances in the example are illustrative: they are the brand's to set.

The rest of a tech pack is not something a pattern script knows. Ask for each, and leave blank what
the person does not give:

- Fabric and its weight, stretch and shrinkage; trims, thread, labels (the bill of materials).
- Stitch types and seam finishes for each seam.
- Colourways, artwork and their placement.
- Wash care, packing and folding.

Never fill one of these in with a guess that reads like a decision.

## Before it leaves

- The run's checks pass for every size.
- The nest shows every size stepping evenly from its neighbours, none crossing another.
- The receiver has been told: millimetres, R12, one block per piece per size, no grade rules.
- The file has been opened in the receiving CAD at least once. This skill's files have not been tested
  against any commercial pattern CAD: until one import has been seen to work, say "not checked in
  your CAD".
- A sample has been sewn, or the person has been told none has.
