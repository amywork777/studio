# Lamp head: injection molding check

Not ready to mold as drawn. Most of the head's walls have no draft along the pull, and the hinge hole runs across it. The head is one closed body, its walls are an even 2.4 mm, and it is well inside a molder's size limits. No resin is chosen yet, so the limits here are general guidance.

## What was checked

- File: `parts/head.step`, the head's model as `cad run exports.py` built it, measured on 2026-11-09.
- Measured with `cad step dfm` (text-to-cad 0.11.4):
  - `cad step dfm parts/head.step --process molding --pull z --json`
  - `cad step dfm parts/head.step --process molding --pull z --candidates --json`
  - `cad step dfm parts/head.step --process printing --angle-limit 45 --json`, for wall thickness only. The molding check does not measure walls, so they come from the printing check's ray cast (2000 rays), and only its thin end is trusted.
- Molding intent:
  - A straight two-half mold pulled along Z, the shade's axis.
  - No resin, parting line, gate or texture was given. The head is designed to be FDM printed in PETG.
  - Limits are the cad skill's `references/manufacturing-injection-molding.md`, with Protolabs' design guidelines and the Protolabs Network injection molding guide, both read on 2026-11-09.
- Units: millimetres. The tool's `scale.units_suspect` is false, with a 123.01 mm bounding diagonal.

## Findings

| Status | Check | Measured | Limit | What to change |
| --- | --- | --- | --- | --- |
| ✅ pass | One closed body | `mesh.watertight` true, `mesh.body_count` 1, `mesh.volume_mm3` 33656.2, 3040 triangles. | A mold needs one closed solid. | None |
| ❌ fail | Draft | `draft.zero_draft_wall_area_mm2` 11384.59 of `draft.wall_area_mm2` 18572.17 has no draft along Z (under the tool's 0.05° `zero_tol_deg`), over 918 triangles. `draft.min_wall_draft.draft_deg` is 0.0. The largest faces without draft are the yoke's two cheek faces (758.45 mm² each, 18.0 mm along the pull) and the shade's wall facets (176.09 mm² each, 37.0 mm along the pull). The drafted walls average 2.743° (`drafted_wall_mean_draft_deg`). | Protolabs: 0.5° at the least on vertical faces, 2° in most situations. Protolabs Network: 2° at the least. | Taper the shade's wall 2° so it widens toward its open rim, inside and out, keeping the 2.4 mm wall (`WALL` in `head.py`). The cheeks are the hinge's mating faces: decide with the arm's tongue before drafting them. Then measure again. |
| ❌ fail | Undercuts | `undercuts.candidate_area_mm2` 172.37 (0.66 % of the surface) does not withdraw along a straight two-half pull, over 312 triangles. The largest candidate faces are on the hinge hole's wall (Ø5.5, `HINGE_HOLE` in `sizes.py`), which runs along Y, across the pull. `undercuts.trapped_zero_draft_area_mm2` is 0.0. The area is approximate: the tool's `probe_resolution_note` says faces were split to 3.28 mm, not the 0.82 mm it wanted. | A straight two-half mold has no undercuts. A candidate may be resolved by a side action, a lifter or another parting line. | Core the hinge hole with a side action, or mold the cheeks solid and drill the hole afterwards. |
| ✅ pass | Wall thickness | `wall_thickness.p05_mm` 2.361, `median_mm` 2.448, over 1969 valid rays. The model's wall is 2.4 mm (`WALL`). | Protolabs' recommended wall: ABS 1.143 to 3.556 mm, polycarbonate 1.016 to 3.81 mm, polypropylene 0.889 to 3.81 mm. | None |
| ❓ need more info | Thin place | `wall_thickness.min_mm` 1.0 at [32.95, 0.14, 10.0]: 1.0 mm is left over an M3 pilot hole (`PILOT_DEPTH` 8.0 in `head.py`). The next thinnest ray is 2.233 mm. | Depends on the resin, which is not chosen. 1.0 mm is under ABS's and polycarbonate's recommended least, and over polypropylene's. | Choose the resin. If it needs more, shorten `PILOT_DEPTH` from 8.0 to 7.0 to leave 2.0 mm, after checking the screw's length. |
| ❓ need more info | Thick sections | Not measured. By the model's sizes the yoke's cheeks are 5.0 mm (`CHEEK` in `sizes.py`), about twice the 2.4 mm wall, and the screw bosses are 7.0 mm across (`BOSS`). | Protolabs' recommended wall tops out at 3.556 mm for ABS and 3.81 mm for polycarbonate. Protolabs Network: a boss about twice its screw's diameter, 6.0 mm for M3. | Thick sections can sink or warp. Core the cheeks out, or ask the molder, once a resin is chosen. |
| ✅ pass | Size | `mesh.bbox_mm` 92.93 × 69.96 × 40.0, `mesh.volume_mm3` 33656.2, `projection.projected_area_mm2` 3925.5, `projection.depth_along_pull_mm` 40.0. | Protolabs: 480 × 751 mm, 966,837 mm³, 101 mm deep from the parting line, 112,903 mm² projected mold area. | None |
| ✅ pass | Pull direction | Of the five pulls the tool tried, Z has the least undercut candidate area: 172.37 mm², against 4127.12 to 12418.8 mm² for the others. | Least undercut area | Pull along Z, the shade's axis. |
| ❓ need more info | Resin, parting line, gate and texture | Not given | Texture adds 1 to 2° of draft (Protolabs Network). | Choose them with the molder before cutting a tool. |
| ❓ need more info | Ribs, corners and sink | Not measured by the tool | Protolabs Network: ribs half the wall thick, inside corners rounded to half the wall. | None needed for this check. |

The check is facts only: its `OK` says the measurement ran, not that the head can be molded.

With the cad skill, the draft goes into `parts/head.py`: build again with `cad run exports.py` and measure again here.
