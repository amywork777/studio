# Handing a pattern over

Read this when the pattern goes to a cutting room, a factory or a printer.

## Contents

- [The AAMA DXF](#the-aama-dxf)
- [The SVG](#the-svg)
- [The size spec and the tech pack](#the-size-spec-and-the-tech-pack)
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
| Text on layer `1`                | `Piece Name:`, `Size:`, `Quantity:`, `Style Name:` and `Annotation:` |

The file is DXF R12 in **millimetres**. R12 has no units field, so tell the receiver the units, or
they may read it as inches.

What the file leaves out, to say with it:

- **No grade rules.** Sizes are separate pieces, not one piece with a `.rul` table. A receiver who
  wants graded nests must be told each size is its own block.
- **A piece cut on the fold is half a piece** with its mirror line. Some systems want the whole piece.
- **Quantity is how many to cut of the piece as drawn.** A mirrored pair is `Quantity: 2` with the
  pairing in its annotation.

## The SVG

One file per size at 1:1 in millimetres, with a 100 mm square. Printed at 100% the square measures
100 mm; if it does not, the print was scaled. A garment is larger than a sheet of paper: the person
tiles it in their print dialog or sends it to a wide plotter. The SVG shows the cut line solid, the sew
line dashed, the fold line in blue, notches as ticks and the grainline as an arrow.

## The size spec and the tech pack

A tech pack is what a factory makes the garment from. The run writes its measured part,
`out/<name>_spec.csv`: each finished measurement of the garment laid flat, in centimetres, for every
size, with the tolerance the factory may be off by.

```text
"measurement (cm, garment flat)",tolerance +/-,XS,S,M,L,XL
chest width,1.0,47.0,50.0,53.0,57.0,61.0
body length,1.0,66.0,68.0,70.0,72.0,74.0
across shoulder,0.5,40.0,42.0,44.0,46.0,48.0
```

Every number in it is read off the drafted pieces, so it cannot disagree with the pattern. The
tolerances in the example are illustrative: they are the brand's to set.

The rest of a tech pack is not something a pattern script knows. Ask for each, and leave blank what
the person does not give:

- Fabric and its weight, stretch and shrinkage; trims, thread, labels (the bill of materials).
- Stitch types and seam finishes for each seam.
- Colourways, artwork and their placement.
- Wash care, packing and folding.

Never fill one of these in with a guess that reads like a decision.

## Before it leaves

- The run's checks pass for every size.
- `cad dxf snapshot` of the DXF shows every piece of every size, none overlapping.
- The receiver has been told: millimetres, R12, one block per piece per size, no grade rules.
- The file has been opened in the receiving CAD at least once. This skill's files have not been tested
  against any commercial pattern CAD: until one import has been seen to work, say "not checked in
  your CAD".
- A sample has been sewn, or the person has been told none has.
