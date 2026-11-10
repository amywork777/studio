# Phone stand: powder printing check

The stand can be powder-printed (SLS or MJF) as drawn. Its thinnest wall is 5.0 mm, and powder holds every face up, so the supports the tool counts do not apply. The stand is designed to be FDM printed, so this asks whether the same model also suits a powder process.

## What was checked

- File: `parts/phone_stand.step`, the stand's model as `cad run exports.py` built it, standing as it is used, measured on 2026-11-09.
- Measured with `cad step dfm` (text-to-cad 0.11.4):
  - `cad step dfm parts/phone_stand.step --process printing --angle-limit 45 --candidates --json`
- Print intent:
  - SLS in PA12, or MJF. No supplier or machine was given, so the limits are the SLS (PA12) and MJF columns of the cad skill's `references/manufacturing-printing.md`.
- Units: millimetres. The tool's `scale.units_suspect` is false, with a 192.44 mm bounding diagonal.

## Findings

| Status | Check | Measured | Limit | What to change |
| --- | --- | --- | --- | --- |
| ✅ pass | One closed body | `mesh.watertight` true, `mesh.body_count` 1, `mesh.volume_mm3` 119900.9, 640 triangles. | A print needs one closed solid. | None |
| ✅ pass | Wall thickness | `wall_thickness.min_mm` 5.0, `p05_mm` 5.0, `median_mm` 6.0, over 1948 valid rays. The model's walls are 5.0 mm (`WALL`, `LEDGE_THICKNESS`) and its base 6.0 mm (`BASE_THICKNESS`). | SLS min wall 0.7 mm, MJF 0.5 mm | None |
| ✅ pass | Overhangs and supports | The tool reports 1327.57 mm² facing down at under 45° and about 44387.9 mm³ of support. Neither applies: the surrounding powder supports all geometry. | SLS and MJF need no supports (n/a in the limits table). | None |
| ✅ pass | Trapped powder | The tool gives no `sealed_voids` finding. Escape holes are not measured. | A closed cavity needs a hole to let its powder out. | None |
| ❓ need more info | Build volume | `mesh.bbox_mm` 80.0 × 140.0 × 105.04 | The supplier's machine, which was not given | Check it against the supplier's build volume when ordering. |
| ❓ need more info | Small holes and features | Not measured by the tool | SLS min hole 1.5 mm, min positive feature 0.8 mm. MJF min hole 1.0 mm, min positive feature 0.5 mm. | None |
| ❓ need more info | Flatness | Not measured | Long flat walls can warp as a powder print cools. The stand's base is 140 mm front to back (`BASE_DEPTH`). | Ask the supplier how to lay it in the build. |

With the cad skill, any change goes into `parts/phone_stand.py`: build again with `cad run exports.py` and measure again here.
