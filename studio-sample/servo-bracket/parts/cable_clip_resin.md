# Cable clip: resin printing check

One thing to change before printing in resin: the channel's lips narrow to a sharp edge, under SLA's 0.5 mm wall. The clip is one closed body, nothing overhangs, and it prints standing up as drawn.

## What was checked

- File: `parts/cable_clip.step`, the clip's model as `cad run exports.py` built it, measured on 2026-11-09.
- Measured with `cad step dfm` (text-to-cad 0.11.4):
  - `cad step dfm parts/cable_clip.step --process printing --angle-limit 30 --candidates --json`
- Print intent:
  - Resin printing (SLA or DLP). The clip is designed to be FDM printed in PETG, so this asks whether the same model also prints in resin.
  - No resin or printer was given, so the limits are the SLA/DLP column of the cad skill's `references/manufacturing-printing.md`.
- Units: millimetres. The tool's `scale.units_suspect` is false, with a 13.72 mm bounding diagonal.

## Findings

| Status | Check | Measured | Limit | What to change |
| --- | --- | --- | --- | --- |
| ✅ pass | One closed body | `mesh.watertight` true, `mesh.body_count` 1, `mesh.volume_mm3` 272.8, 244 triangles. | A print needs one closed solid. | None |
| ❌ fail | Wall thickness | `wall_thickness.min_mm` 0.466 at [-1.3, 7.54, 1.86], over 1928 valid rays. The six thinnest rays (0.466 to 0.551 mm) are all on the channel's two lips, above y 7.4, where each lip narrows to a sharp edge. Elsewhere the wall measures 1.6 mm (`p05_mm` 1.423, `p25_mm` 1.6, `median_mm` 1.606; `WALL` in `cable_clip.py` is 1.6). | SLA/DLP min supported wall 0.5 mm. The lips stand free, so its min unsupported wall, 1.0 mm, applies to them. | Round each lip's end so it keeps its wall to the tip, or cut the opening's sides radially. Then measure again: the lips at least 1.0 mm. |
| ✅ pass | Overhangs and supports | `overhangs.down_facing_area_below_limit_mm2` 0 at 30°. `support_volume.estimated_support_volume_mm3` 0. | SLA/DLP self-supporting angle 30° from horizontal | None |
| ✅ pass | Build orientation | Upright as drawn (`current_plus_z`): 0 mm² of support, 8 mm tall. Turned over (`flip_180_x`) and on one side (`rot_plus_90_x`): 0 mm² too. The other three: 47.36 to 58.35 mm². | Fewest supports at the least height | Print it standing up, channel vertical, as drawn. |
| ❓ need more info | Bed fit | `mesh.bbox_mm` 8.0 × 7.76 × 8.0 | No printer was given. | None |
| ❓ need more info | Small holes, features and bridges | Not measured by the tool | SLA/DLP min hole 0.5 mm, min positive feature 0.2 mm, max unsupported bridge 5 mm | None needed to print. Check that the lead presses into the printed channel. |
| ❓ need more info | Resin | Not chosen | A snap clip flexes each time a lead goes in, and resins differ in how much they flex before they crack. | Choose a tough or flexible resin with its datasheet before printing. |

With the cad skill, the change goes into `parts/cable_clip.py`: the clip is then built again and measured until nothing fails.
