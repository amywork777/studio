# Horn adapter: metal printing check

The adapter's shape can be metal-printed: its thinnest wall is 1.5 mm and it needs almost no support. Its spline, threads and screw seats still have to be machined after printing. The adapter is designed to be machined from 6061-T6, so this asks whether the same model could also be printed by laser powder bed fusion (PBF-LB).

## What was checked

- File: `parts/horn_adapter.step`, the adapter's model as `cad run exports.py` built it, measured on 2026-11-09.
- Measured with `cad step dfm` (text-to-cad 0.11.4):
  - `cad step dfm parts/horn_adapter.step --process printing --angle-limit 45 --candidates --json`
- Print intent:
  - PBF-LB metal (SLM or DMLS). No alloy, machine or supplier was given, so the limits are the PBF-LB metal column of the cad skill's `references/manufacturing-printing.md`.
- Units: millimetres. The tool's `scale.units_suspect` is false, with a 34.85 mm bounding diagonal.

## Findings

| Status | Check | Measured | Limit | What to change |
| --- | --- | --- | --- | --- |
| ✅ pass | One closed body | `mesh.watertight` true, `mesh.body_count` 1, `mesh.volume_mm3` 3241.2, 1052 triangles. | A print needs one closed solid. | None |
| ✅ pass | Wall thickness | `wall_thickness.min_mm` 1.5, `p05_mm` 2.826, `median_mm` 8.0, over 1971 valid rays. The 1.5 mm place is the web between the spline bore's end (z 4.0, `SPLINE_DEPTH`) and the screw head's seat (z 5.5). | PBF-LB metal min supported wall 0.4 mm, min unsupported wall 0.5 mm | None |
| ✅ pass | Overhangs and supports | `overhangs.down_facing_area_below_limit_mm2` 18.08 (1 % of the surface) faces down at under 45°, off the plate: the spline bore's flat end at z 4.0 (`down_facing_angle_histogram_mm2` has only `0-10deg`). `support_volume.estimated_support_volume_mm3` 72.3, 2.2 % of the part (`support_to_part_ratio_pct`), by the tool's prism estimate, an upper bound. | PBF-LB metal self-supporting angle 45° from horizontal. A support ratio over about 30 % usually justifies turning the part. | None |
| ✅ pass | Build orientation | As drawn (`current_plus_z`): 18.08 mm² of support, 8 mm tall. Turned over (`flip_180_x`): 49.81 mm². On edge: 202.63 to 228.35 mm², about 24 mm tall. | Fewest supports at the least height | Print it flat, as drawn. |
| ❓ need more info | Bridge over the bore | Not measured by the tool. By the model's sizes the bore's flat end is a ring about 1.25 mm wide around the screw hole (`SERVO_SPLINE` 5.9, `HORN_SCREW` 3.4). | PBF-LB metal max unsupported bridge 2 mm | Confirm with the supplier. |
| ❓ need more info | Spline, threads and screw seats | Not measured by the tool. The model has a spline bore, M3 tap drills (`TAP_DRILL` 2.5) and a Ø3.4 screw hole. | PBF-LB metal min hole diameter 1.5 mm, min positive feature 0.4 mm | Machine the spline, tap the threads and ream the screw hole after printing, as for the machined part. |
| ❓ need more info | Alloy, machine and build volume | Not given. `mesh.bbox_mm` 23.98 × 23.99 × 8.0. | The supplier's machine | Choose the alloy with the supplier. Printed aluminium is usually a casting alloy such as AlSi10Mg, not 6061-T6, so take its strength from the supplier's datasheet. |

With the cad skill, any change goes into `parts/horn_adapter.py`: build again with `cad run exports.py` and measure again here.
