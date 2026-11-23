---
name: jewelry
description: Designs rings and stone settings for casting - a band at a ring size (US or ISO), a stone modelled from its diameter and proportions with a seat cut for it, the metal as one castable body, and a spec sheet with front, side and top views, the stone's carat estimate, the metal's weight in silver, 14k, 18k and platinum, and the checks a caster and a setter ask for. Use for rings, bands, solitaires, prong and bezel settings, ring sizing, metal weight, and patterns for casting.
---

# Jewelry: rings and settings

A ring is a script: a finger size, a stone and a handful of section sizes go in, and out come the
metal as one body that can be cast, the stone sitting in the seat cut for it, and the numbers the
bench asks for (inside diameter, metal weight, the thinnest wall).

The cad skill ($cad) is how models run, export and are shown; read it first. This skill adds what a
piece of jewelry needs.

## Start with the task

| Task                                               | Start with                                                     | Reference                                           |
| -------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| **A ring at a size, with a stone**                 | The size and the stone, in the worked ring                     | [A solitaire ring](references/ring.md)              |
| **A plain band**                                   | The same script with the head left out                         | [Another piece](references/ring.md#another-piece)   |
| **A spec sheet for approval or for the caster**    | `out/ring_spec.pdf`, which the run writes                      | [The spec sheet](references/ring.md#the-spec-sheet) |
| **What does it weigh?**                            | The run's `metal` line, from the model's volume                | [Run and check](#run-and-check)                     |
| **Does the stone sit, is it clear of the finger?** | `cad model interference <set id>`                              | [Run and check](#run-and-check)                     |
| **Can it be printed and cast?**                    | `cad model dfm <metal id> --process printing --technology sla` | [Casting](#casting)                                 |
| **A file for the caster or a wax printer**         | `out/ring_pattern.stl`, which the run writes                   | [Casting](#casting)                                 |
| **A picture for the client**                       | The render skill ($render)                                     | Its own references                                  |

## Setup

This skill runs the `cad` command. Run `cad --version` before first use in a chat; in Studio it is
already there. If it is missing, say so and stop: do not install it yourself.

## Run and check

Start from [the worked ring](references/ring.md): save it as `ring.py`, set the size, the stone and
the sections, and run it.

```bash
cad run ring.py
```

```text
built ring.py::ring cold in 2.03s: ...
  parts 1 · bounds 20.92 × 7 × 25.42 mm · joints 0 · sequences 0
  id: eabcc073-86f6-5e44-8ac0-70cecaa9338a
built ring.py::ring_set warm in 0.13s: ...
  parts 2 · bounds 20.92 × 7 × 25.42 mm · joints 0 · sequences 0
  id: a104a6ae-b26e-5005-848f-21340df8c479
US size 7: inside diameter 17.32 mm, circumference 54.4 mm (ISO 8653 size)
stone 6.5 mm, about 1.02 ct: depth 3.96 mm, girdle 5.11 mm above the finger
metal 258.9 mm3, about: 2.68 g in sterling silver 925, 3.38 g in 14k yellow gold, 4.03 g in 18k yellow gold, 5.36 g in platinum 950 (Pt/Ru)
against a caster's published minimums: band thickness at the base 1.8 mm (ok 1.7), culet above the finger 0.5 mm (ok 0.5), collet wall 0.8 mm (ok 0.8)
spec sheet out/ring_spec.pdf · casting pattern out/ring_pattern.stl (the metal alone)
```

The run writes, into `out/`: `ring_spec.pdf` and `.png`, the spec sheet a jeweller sends for approval
and a caster reads; `ring_spec.csv`, its table as data; and `ring_pattern.stl`, the metal alone.

Two models: `ring` is the metal alone, the body that is cast; `ring_set` is the metal with the stone.
The script raises when the metal is more than one body (`the metal is 2 bodies: a casting is one`).
Each `$..._ID` below is the `id:` line that model's run printed.

```bash
cad model interference "$SET_ID"                 # the stone sits in its seat, touching and not through the metal
cad model snapshot "$SET_ID" ring.png
```

```text
OK ring_set: no two parts share volume (2 parts at 1 pose, the boxes of 1 pair met: 1 measured, in 1.23 s)
```

Look at `out/ring_spec.png` yourself. Then show the person the ring and its spec sheet, as the cad
skill's Show the model section says: the sheet is the ring as jewellery CAD draws it for approval.

## The rules a piece keeps

- **Ring size is an inside diameter.** A US or Canadian size is 0.458 in at size 0 and 0.032 in
  more for each size. An ISO 8653 size is the inside circumference in millimetres. Give both, and
  ask which system the person's size is in: a UK letter or a Japanese number is another scale, to be
  looked up, never guessed.
- **A wide band wears tighter.** Sizes are measured with a narrow gauge; say so for a wide band and
  let the person or their jeweller choose the adjustment. Do not apply one silently.
- **The stone in the model is a stand-in until the real one is measured.** It is built from its
  girdle diameter and four proportions, with no facets. Every stone is cut differently, so the seat
  is right for the stone only once its own measurements are in the script.
- **The seat is the stone subtracted from the metal.** Prongs and the collet are modelled whole, then
  the stone is cut out of them, so the stone touches the metal without passing through it. Prongs
  are left standing above the girdle for the setter to push over.
- **A casting is one body.** Everything in metal is fused before the seat is cut.
- **Weight is volume times density, and "about".** The volume is the model's. The densities in the
  script are typical figures for common casting alloys: sterling silver 10.36 g/cm3, 14k yellow gold
  13.07, 18k yellow gold 15.58, platinum 950 with ruthenium 20.7. A karat gold's moves a few percent
  with its colour and its maker (14k runs 12.6 to 13.3): say "about", name the alloy, and use the
  supplier's figure when the person has it. Never quote a price.
- **The checked minimums are a casting house's published ones**, not this person's caster's. Say so,
  and say "UNDER" plainly when a section is below one.

## Casting

A ring is cast from a pattern printed in castable wax or resin, so the print check measures what
the caster needs to know:

```bash
cad model dfm "$METAL_ID" --process printing --technology sla
```

```text
OK eabcc073-...: 3 warning(s); printing sla: 258.85 mm3, 1 body(ies); overhangs under 19 deg 2.45 mm2; walls min 0.5373, p05 0.7194, median 1.8566 mm; support ~120.57 mm3
```

- **Read its measurements, not its verdict.** `walls min` is the thinnest wall in the metal. The
  check's own limits are general rules for functional prints (1 mm for an unsupported wall), and
  jewelry is routinely thinner: it may report `printing.wall_unsupported` on a prong or a collet
  that a caster is happy to pour. Compare `walls min` with the minimum the person's caster gives.
- **Ask the caster for three numbers**: the thinnest wall and prong they will cast in this metal, the
  shrinkage to scale the pattern up by, and where they want the sprue. None is in the script by
  default, and none is to be assumed. Apply shrinkage as a scale on the exported pattern only when
  the caster gives it.
- **The pattern file** is the metal alone, `out/ring_pattern.stl`, which the run writes, in
  millimetres, one closed body, with no sprue and no shrinkage added: the casting house adds both.
  Never send the set model for casting: it holds the stone.

Printing the pattern is the print3d skill's ($print3d); whether it will print in a given resin is
that skill's and the printer's.

## Check each change

| Change                               | Check                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| The size                             | The run's inside diameter and circumference against a size chart for the person's system            |
| The stone or the head                | `cad model interference` on the set is OK; the snapshot shows every prong reaching above the girdle |
| A section (band, prong, collet wall) | `walls min` from the print check against the caster's minimum; the run's weight                     |
| Anything in metal                    | The run does not raise: the metal is one body                                                       |
| Before a file leaves                 | The file is `ring_pattern.stl`, the metal alone; the spec sheet goes with it                        |

An OK here establishes that the stone's stand-in sits in its seat clear of the finger, that the
metal is one body, and what it weighs. It does not establish that the real stone fits, that the
prongs will hold it after setting, that the ring is comfortable, or that it will cast without
porosity: those are the setter's and the caster's to find. Say "not checked by a caster" until one
has seen it.
