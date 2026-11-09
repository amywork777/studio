# Phone stand: FDM check

Nothing to change before printing. Printed on its side, the stand needs no supports: the only faces that point down off the plate are the flat roofs of the cable slot and the cable pass, and each bridges 8 mm, inside FDM's 10 mm. The mesh is closed and every wall is at least 5 mm thick at the 5th percentile.

The first version did not pass this way: the cable slot was a plain rectangle, and its flat roof ran the slot's whole 14 mm from the rest to the lip, past the 10 mm bridge (the tool measured 119.39 mm² of flat roof then). Its two corners that print uppermost are now cut back 3 mm across and 4 mm up (`BRIDGE_CHAMFER`, `BRIDGE_CHAMFER_RISE` in `phone_stand.py`), at 53°, so the flat roof between them is 8 mm. A first cut at 45° sat exactly on the 45° limit, and the tool counted 24.1 mm² of it below the limit, so it was steepened to 53°.

## What was checked

- File: `parts/phone_stand_print.stl`, the stand turned onto its side as it prints, written by `cad run exports.py` from the model `parts/phone_stand_print.py`, at text-to-cad 0.8's one mesh tolerance (0.25 % of the part's size and 28.5°), and measured again on 2026-10-27.
- Measured with the dfam-check tool (its JSON in `checks/`):
  - `python scripts/dfam_tool.py measure parts/phone_stand_print.stl --angle-limit 45`
  - `python scripts/dfam_tool.py orientations parts/phone_stand_print.stl --angle-limit 45`
- The tool does not measure bridges or plate contact, so `cad run checks/phone_stand_print_facts.py` measures both on `parts/phone_stand.step` as it prints.
- Print intent:
  - FDM in PLA (Bambu PLA Basic) at 0.2 mm layers, on a Bambu Lab P1S with a 0.4 mm nozzle.
  - No PLA or printer datasheet was given, so the limits are the FDM column of the skill's `references/process-limits.md`.
  - The P1S's plate comes from Bambu Studio 02.05.00.66's "Bambu Lab P1S 0.4 nozzle" preset: `printable_area` 256 × 256 mm, `printable_height` 250 mm.
- Units: millimetres. The tool's `scale.units_suspect` is false, with a 192.44 mm bounding diagonal.

## Findings

| Status | Check | Measured | Limit | What to change |
| --- | --- | --- | --- | --- |
| ✅ pass | Watertight | `mesh.watertight` true, one body (`body_count` 1), `mesh.volume_mm3` 119900.9, 640 triangles | Watertightness blocks slicing for every process (process-limits.md, Interpretation notes) | None |
| ✅ pass | Wall thickness | `wall_thickness.p05_mm` 5.0, `p25_mm` 5.0, `median_mm` 6.0, over 640 samples. `min_mm` 4.998 at [0.9, 60.8, 53.33], on the plate side of the rest | FDM min supported wall 1.2 mm; min unsupported wall 1.6 mm | None |
| ✅ pass | Overhangs and supports | `overhangs.down_facing_area_below_limit_mm2` 86.7 at 45°, all of it flat (`0-10deg` bin): the cable slot's roof, 40.0 mm² at 47 mm up, and the cable pass's, 46.7 mm² at 45 mm up. Each bridges, below. The slot's corner cuts measure 54.4 mm² at 50-60°, self-supporting. `support_volume.estimated_support_volume_mm3` 3982.9, 3.3% of the part, is the tool's upper bound for those two roofs, which a slicer bridges | FDM self-supporting angle 45° from horizontal | None |
| ✅ pass | Bridges | Measured on the STEP (`checks/phone_stand_print_facts.py`): the cable slot's roof spans 8.0 mm between the two corner cuts that hold it, the cable pass's 8.0 mm between the base and the rest | FDM max unsupported bridge 10 mm | None |
| ✅ pass | Build orientation | On its side as modelled (`current_plus_z`): 86.7 mm² of roof, 80 mm tall. Turned over (`flip_180_x`): 119.39 mm², as the corner cuts then face down. Standing as it is used (`rot_plus_90_y`): 1399.23 mm², under the ledge, 105.04 mm tall. On its end: 9297.02 to 12134.16 mm² | Fewest supports at the least height | Print it on its side, the stand's -X face on the plate, as `phone_stand_print.py` turns it |
| ✅ pass | Bed contact and fit | The whole side profile sits on the plate: 1516.6 mm² (`checks/phone_stand_print_facts.py`). `mesh.bbox_mm` 105.04 × 140.0 × 80.0 | Bambu Lab P1S: 256 × 256 mm plate, 250 mm tall | None |
| ❓ need more info | Small holes | The tool does not measure holes. The cable slot is 14 × 14 mm and the pass 10 × 8 mm, far over the limit, but their printed sizes are not measured | FDM min hole diameter 2.0 mm | None needed to print. Check that the charging cable's plug passes the printed slot |
| ❓ need more info | Small features | Not measured by the tool. The smallest feature drawn is the R2 fillet on the profile's edges | FDM min positive feature 0.8 mm | None |

Printed on its side, each layer is the profile, so the rest and the lip bend along their layers when the phone and a tap push on them, not across them.

With the cad skill, any change goes into `parts/phone_stand.py`: build again with `cad run exports.py` and measure again here.
