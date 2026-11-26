---
name: iso-fits
description: "Apply an ISO fit, with the cad skill. Use whenever a hole and a shaft, pin or bearing must fit together, or the person names a fit (H7/g6, a press fit), and when the person asks for $iso-fits; it says how to do it in Studio."
---

# Apply an ISO fit

One job, the same one as the "Apply an ISO fit" tile in a part's Toolbox in Studio. Do it with
the `cad` skill: read that skill first and follow it, then do what the person asks:

> Apply an ISO fit to the part with $iso-fits: find the hole and shaft that go together, pick the fit for what they do (sliding, press, clearance) or ask me, read the limits off ISO 286 and write them into the part and its drawing.

The part is the one the person names, else the one open beside the chat.
Ask which when neither says.

What they get: Hole and shaft limits from ISO 286 for the fit you pick, written into the part and its drawing.

## Read the limits, never recall them

Every number comes from this skill's `fits.py`, run with the `cad` environment's Python (any
Python 3 runs it; it needs nothing installed). The script is in this skill's folder:

```sh
python <this skill's folder>/fits.py H7/g6 20       # a fit at Ø20 mm: hole, shaft, clearances
python <this skill's folder>/fits.py p6 12          # one tolerance class
python <this skill's folder>/fits.py presets        # the preferred fits, by what each is for
```

Add `--json` for the same as JSON. It holds ISO 286-1's tables for nominal sizes over 0 up to
500 mm: holes and shafts c, d, e, f, g, h, js, k, m, n, p, r, s, t and u, grades IT4 to IT13. A
class it does not hold (a J hole, an a shaft, IT14) it refuses: say so, never fill one in.

## Pick the fit

- What the person names wins ("H7/p6", "a press fit", "it should slide"). A word, not a class:
  take the preset `fits.py presets` lists for it, and say which in plain words first, the
  classes after ("a sliding fit (H7/g6)").
- Nothing said: read what the two faces do (a pin that turns, a bearing seat, a dowel) and pick,
  then ask, with the choice made: "I used a press fit (H7/p6) for the bearing seat: keep it, or
  make it a transition fit (H7/k6) so it comes out by hand?"
- ISO 286 is metric. On an inch part, ask whether to use it in millimetres or ANSI B4.1's classes,
  which this table does not hold: those are not checked.

## Write it into the part

- The nominal size stays a named size at the top of the script, and each fitted size is written
  beside it from the limits the script printed, as a comment that names the class and both limits:
  `BORE = 20.0  # Ø20 H7 (ISO 286): 20.000 to 20.021`. Model it at its nominal size unless the
  person asks for the middle of its limits, and say which.
- A fit between two parts goes in both: the hole's class in the part with the hole, the shaft's in
  the other, the same nominal size in each.
- A drawing of the part: put the class on the callout with the drawing's own `fit=`
  (`view.hole(..., fit="H7")`, `view.dim(..., fit="g6")`, `"H7/g6"` where both show), the
  engineering-drawing skill's way, never the limits typed as text. Where there is no drawing, say
  the fit is in the script and offer one.
- PMI on the model, where the part has it: `dimensional_size(..., tolerance=limits(low, high))`
  with the printed limits.

## Say what it means

Give the person the fit's kind (clearance, transition or interference), its tightest and loosest
in mm as `fits.py` printed them, and what that means for putting it together (slides by hand,
light press, heat the hub). Nothing here checks the parts' own geometry: to see they meet, run the
Fit and clearance check on the assembly.
