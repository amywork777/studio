---
name: drawing-check
description: "Check against the drawing, with the cad skill. Use whenever you model a part from a drawing, a sketch or a photo of one, or check one against it, and when the person asks for $drawing-check; it says how Studio reads the result."
---

# Check against the drawing

One job, the same one as the "Check against the drawing" tile in a part's Toolbox in Studio. Do it with
the `cad` skill: read that skill first and follow it, then do what the person asks:

> Check the part against the drawing or sketch it is made from with $drawing-check: read every dimension and callout, measure each on the model, and tell me every number that does not add up.

The part is the one the person names, else the one open beside the chat.
Ask which when neither says.

What they get: Each dimension on the drawing beside what the model measures, and every number that disagrees.

## Read the drawing

- **A PDF** in `brief/references/` has its sheets beside it in `<name>-pages/`: `page-01.png`
  and on, and `pages.json` with each sheet's size in inches and every callout's words and box. A
  sheet with `words: false` is a scan: read its picture. Take numbers from the words where there
  are any, never from the picture alone, and the views and leaders from the picture. A drawing's
  symbol font comes through as letters (SolidWorks' Ø as `n`, ⌴ and ↧ as others): check each
  symbol against the picture. Until `pages.json` is there, read the PDF itself.
- **A photo or a sketch:** read the picture. One attached in the chat has a copy in
  `brief/references/`, which the message links: name that copy as the check's source. Where
  callouts are small, crop and enlarge the part you need (Pillow is in the `cad` environment)
  into `tmp/` and read the crop.
- Find the title block first: units, scale, projection (first or third angle), general tolerances
  (".XX ±.010, .XXX ±.005, fractions ±1/32, angles ±1/2°"), material and notes.
- **Keep the drawing's units.** An inch drawing is checked and modelled in inches: set the
  project's `units` to "in", write every size with `INCH` (`.03*INCH`), and never round a
  number into millimetres. Dual dimensions (`0.750 [19.05]`): the first is the size, the bracket
  only confirms it.

## Write the check before you model

Write `checks/<part>.drawing-check.json` with every dimension and callout you read, one row each,
before the model exists (`measured` left out). Then look for what does not add up, and give each
its own row with a `flag`:

- a chain that does not close: the parts of a stack against its overall size, a pitch against the
  gaps it leaves;
- one feature dimensioned twice, in two views, with two values;
- a radius called out on a curve that is not one arc (several R callouts on one ellipse);
- a size the geometry needs and the drawing does not give (a cavity depth, a groove depth, a
  thread depth): `flag: "missing"`, with the value you chose and why in `note`;
- a callout that fights its own detail, a note or a standard (a 1/4 bolt in a Ø.250 hole);
- a number you could not read with confidence: `flag: "unclear"`, `confidence: "low"`.

Each flagged row is a question for the engineer: say what you modelled in `note`, and add the
question to the README's Open questions with what you assumed first.

## Build, then measure

Build the part from the drawing as the cad skill says, every drawing value a named size at the
top of its script (a toleranced one at the middle of its limits). Then write
`checks/<part>_drawing_check.py` and run it: it builds or reads the model and measures each row
on the B-rep itself (a cylinder face's radius, the distance between two faces, an edge's length,
a bounding box, a count of holes), never from the script's own numbers, and writes each row's
`measured` (in the row's units) and `measuredHow` into the check file. A row nothing measured
stays without `measured`: Studio shows it as not checked. Run it again after every change to the
part.

Never write whether a row passes: Studio holds each measured value to the row's limits, else the
title block's tolerance for how many decimals it prints, else to the digit it prints, and marks it
matched or out of tolerance itself.

## The file

```json
{
  "part": "parts/flange.py",
  "model": "parts/flange.step",
  "units": "in",
  "measuredBy": "checks/flange_drawing_check.py",
  "generalTolerance": { "decimals": { "2": 0.01, "3": 0.005 }, "fraction": 0.03125, "angle": 0.5 },
  "sources": [
    {
      "id": "FL-100",
      "file": "brief/references/FL-100.pdf",
      "pages": "brief/references/FL-100-pages",
      "title": "Flange FL-100"
    }
  ],
  "dimensions": [
    {
      "id": "front-bore",
      "text": "Ø1.000/1.002",
      "nominal": 1.001,
      "limits": [1, 1.002],
      "feature": "Front bore",
      "featureRef": "flange/face 12",
      "where": {
        "source": "FL-100",
        "page": 1,
        "view": "A-A",
        "box": [0.58, 0.497, 0.038, 0.031]
      },
      "confidence": "high",
      "measured": 1.001,
      "measuredHow": "bore cylinder radius x 2"
    },
    {
      "id": "lip",
      "text": "5",
      "nominal": 5,
      "units": "mm",
      "feature": "Lip height",
      "flag": "conflict",
      "related": ["stack", "band-1", "band-2"],
      "note": "20 - 8 - 8 = 4, not 5. Modelled 4 so the stack closes.",
      "measured": 4
    }
  ]
}
```

- `units`: the drawing's, "in" or "mm"; a row's own `units` ("in", "mm", "deg") where it differs.
- `text`: the callout as printed, with its count and symbols (`2X R.03`, `Ø.201 ↧.50`);
  leave it out for a size the drawing does not give.
- `nominal`, and `limits` (low, high) or `tolerance` (`[-0.005, 0.005]`) when the callout has its own.
- `where.box`: left, top, width and height as fractions of the sheet, from the callout's box in
  `pages.json`, or estimated on a picture; `page` counts from 1. Leave `where` out of a size the
  drawing does not show.
- `feature`: the feature in the engineer's words; `featureRef`: the element as
  `cad model inspect` names it, when there is one.
- `flag`: "conflict", "missing", "unclear", "reference" (a REF size: shown, never graded) or
  "note" (a thread, a finish or a process carried as text). `related`: the rows it is read
  against.

Once it is written, give its path in code formatting (`checks/flange.drawing-check.json`):
Studio opens it as the drawing check, each row with its place on the sheet.
