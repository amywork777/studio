# Cable clip: FDM check

One thing to change before printing: the channel's lips narrow to a sharp edge, under FDM's 1.2 mm wall. The exported STL is closed. Nothing needs supports, and the clip prints standing up as drawn.

## What was checked

- File: `parts/cable_clip.stl`, exported from the clip's model by `cad run exports.py` at text-to-cad 0.8's one mesh tolerance (0.25 % of the part's size, 28.5°), and measured again on 2026-10-27.
- Measured with the dfam-check tool:
  - `python scripts/dfam_tool.py measure parts/cable_clip.stl --angle-limit 45`
  - `python scripts/dfam_tool.py orientations parts/cable_clip.stl --angle-limit 45`
- Print intent:
  - FDM in PETG at 0.2 mm layers, on a Bambu Lab P1S with a 0.4 mm nozzle.
  - No PETG or printer datasheet was given, so the limits are the FDM column of the skill's `references/process-limits.md`.
  - The P1S's build volume comes from Bambu Studio 02.05.00.66's "Bambu Lab P1S 0.4 nozzle" preset.
- Units: millimetres. The tool's `scale.units_suspect` is false, with a 13.72 mm bounding diagonal.

## Findings

| Status | Check | Measured | Limit | What to change |
| --- | --- | --- | --- | --- |
| ✅ pass | Watertight | `mesh.watertight` true, one body (`body_count` 1), `mesh.volume_mm3` 272.8, 244 triangles. The STL text-to-cad 0.7.26 exported had three open edges on the top face; 0.8's has none. | Watertightness blocks slicing for every process (process-limits.md, Interpretation notes). | None |
| ❌ fail | Wall thickness | `wall_thickness.p05_mm` 1.017 mm, `min_mm` 0.356 mm, over 244 samples. The thinnest sample is 0.356 mm at [1.45, 7.69, 1.33]. The thinnest samples the tool lists are all on the channel's two lips, above y 7. There the opening's straight sides meet the round outside of the channel, and each lip narrows to a sharp edge. Elsewhere the base and the wall measure 1.6 mm (`p25_mm` 1.600, `median_mm` 1.603). | FDM min supported wall 1.2 mm. The lips stand free, so FDM's min unsupported wall, 1.6 mm, applies to them. | Round each lip's end so it keeps its wall to the tip: a full R0.8 round across the 1.6 mm wall, or cut the opening's sides radially. Thicken the channel wall from 1.6 to 2.0 mm (`WALL` in `cable_clip.py`) so the lips clear 1.6 mm with margin. Then export and measure again: p05 at least 1.2 mm, lips at least 1.6 mm. |
| ✅ pass | Overhangs and supports | `overhangs.down_facing_area_below_limit_mm2` 0.0 at 45°. No face points down anywhere off the plate (`down_facing_angle_histogram_mm2` is empty). `support_volume.estimated_support_volume_mm3` 0.0. | FDM self-supporting angle 45° from horizontal | None |
| ✅ pass | Bridges | Nothing faces down off the plate, so nothing bridges. | FDM max unsupported bridge 10 mm | None |
| ✅ pass | Build orientation | Upright as drawn (`current_plus_z`): 0 mm² of support and 8.0 mm tall. Turned over (`flip_180_x`): the same. On its side: 8.03 to 83.74 mm² of support. | Fewest supports at the least height | Print it standing up, channel vertical, as drawn. |
| ✅ pass | Bed fit | `mesh.bbox_mm` 8.0 × 7.76 × 8.0 | Bambu Lab P1S: 256 × 256 mm plate, 250 mm tall (Bambu Studio's P1S preset `printable_area`, `printable_height`) | None |
| ❓ need more info | Small holes | The tool does not measure holes (process-limits.md, What the tool measures today). The STEP's channel is a Ø4.0 mm cylinder, but its printed size is not measured. | FDM min hole diameter 2.0 mm | None needed to print. Check that the lead presses into the printed channel. |
| ❓ need more info | Small features | Not measured by the tool | FDM min positive feature 0.8 mm | None |

The mesh is closed, so the support ratio's base is its own volume, 272.8 mm³.

With the cad skill, both changes can go into `parts/cable_clip.py`: the clip is then built again, exported and measured until nothing fails.
