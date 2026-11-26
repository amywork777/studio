---
name: pmi
description: "3D PMI, with the cad skill. Use whenever a hole and shaft fit or an ISO 286 tolerance class (H7, H7/g6, a press fit) is asked for, as PMI or on a drawing's callout, and when the person asks for $pmi; it says how to do it in Studio."
---

# 3D PMI

One job, the same one as the "3D PMI" tile in a part's Toolbox in Studio. Do it with
the `cad` skill: read that skill first and follow it, then do what the person asks:

> Add 3D PMI to the part as the cad skill's references/pmi.md says: datums on the faces it is located by, the sizes and positions that matter as tolerances, and a general profile note. Then export it as AP242 STEP with its PMI.

The part is the one the person names, else the one open beside the chat.
Ask which when neither says.

What they get: Datums, tolerances and notes on the model itself (model-based definition), exported as AP242 STEP.

## Fits from ISO 286, on a drawing or as PMI

When the person asks for a fit or a tolerance class ("H7 on this bore", "H7/g6", "a press fit for the
pin"), on a drawing or as PMI, read its limits off ISO 286 with this skill's `fits.py`, never from
memory. It is in this skill's folder and runs with the `cad` environment's Python (any Python 3; it
needs nothing installed):

```sh
python <this skill's folder>/fits.py H7 22          # one class at Ø22 mm: its limits
python <this skill's folder>/fits.py H7/g6 22       # a fit: hole, shaft, tightest and loosest
python <this skill's folder>/fits.py presets        # the preferred fits, by what each is for
```

Add `--json` for JSON. It holds ISO 286-1's tables over 0 up to 500 mm: holes and shafts c, d, e, f,
g, h, js, k, m, n, p, r, s, t and u, grades IT4 to IT13. A class it does not hold (a J hole, an a shaft,
IT14) it refuses: say so, never fill one in.

- **The class.** What the person names wins. A word, not a class ("it should slide", "a press fit"):
  take the preset `fits.py presets` gives for it, and say it in plain words first, the classes after
  ("a sliding fit (H7/g6)"). Nothing said: pick from what the faces do, then ask with the choice made
  ("I used H7/p6 so the bearing presses in: keep it, or H7/k6 so it comes out by hand?").
- **A drawing.** Put the class on the callout with the drawing's own `fit=` (`view.hole(..., fit="H7")`,
  `view.dim(..., fit="g6")`, `"H7/g6"` where both parts show), as the engineering-drawing skill says,
  never the limits typed as text. Where the person wants limits printed instead, `limits=(low, high)`
  with the numbers `fits.py` printed.
- **PMI.** `dimensional_size(..., tolerance=limits(low, high))` with the printed limits, as
  references/pmi.md says.
- **The part.** The nominal size stays a named size in the script, with the class and both limits in its
  comment: `BORE = 22.0  # Ø22 H7 (ISO 286): 22.000 to 22.021`. A fit between two parts goes in both.
- **ISO 286 is metric.** On an inch part, ask whether to use it in millimetres or ANSI B4.1's classes,
  which this table does not hold: say those are not checked.
- **Say what it means:** the fit's kind (clearance, transition or interference) and its tightest and
  loosest in mm as `fits.py` printed them, and what that means for putting it together.
