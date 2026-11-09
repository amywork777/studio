# Shelf bracket: SendCutSend preflight

The STEP is ready to upload for this order, in G90-074 galvanised steel with two bends: it is one solid at the stock thickness, bent at SendCutSend's radius, and every check passes. The cut file needs edits before upload: its bend lines are solid, and SendCutSend asks for dashed bend lines in a DXF, which text-to-cad's DXF export can't write. Order with the STEP. Nothing was uploaded, quoted or ordered.

## Context

- Files: `parts/shelf_bracket.step`, the bent bracket, the upload; `cut/shelf_bracket_cut.dxf`, its flat pattern with two bend lines, the fallback.
- Assumed service: laser sheet cutting with bending, from a 3D STEP (SendCutSend's preferred file for bent parts) or the DXF.
- Order:
  - Material: G90 Galvanized, SKU G90-074, 0.074 in (1.88 mm), cut by fiber laser.
  - Bending: two 90° bends, both the same way.
  - Quantity 2, one shelf's pair. No finish, no hardware, no tapping.
- Date checked: 2026-10-26

## Sources checked

All read 2026-10-26.

- [sendcutsend-ordering-guide.md](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md)
- [sendcutsend-catalog.json](https://cdn.sendcutsend.com/specs/sendcutsend-catalog.json): `_meta.schema_version` 1.0, `_meta.generated_at` 2026-04-29T20:52:33.873247+00:00, `_meta.source_data_generated_at` 2026-04-29T13:28:32.522103
- [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json): the same `_meta` values
- SendCutSend's pages, for the rules the three files don't give:
  - [CNC bending](https://sendcutsend.com/services/cnc-bending/)
  - [How to prevent bending deformation](https://sendcutsend.com/guidelines/bend-deformation/)
  - [Why aren't my bend lines showing up?](https://sendcutsend.com/faq/why-arent-my-bend-lines-showing-up/)
  - [G90 galvanized steel](https://sendcutsend.com/materials/g90-steel/)

## Geometry facts

STEP, read with text-to-cad's `step.read` (build123d):

- One solid, one shell, valid. Units millimetres (`SI_UNIT(.MILLI.,.METRE.)`). Bounding box 25 × 180 × 150 mm.
- Thickness 1.8796 mm (0.0740 in) between each pair of matched faces: the web, the shelf flange and the wall flange.
- Cylindrical faces by radius: the bends' 1.6002 mm inside and 3.4798 mm outside; the rest are holes (Ø4.5, Ø5.5), the R1 relief round, R3 flange corners and R6 web corners.

DXF, read with `ezdxf` and checked with text-to-cad's `validate_dxf_file`:

- DXF AC1027. `$INSUNITS` 4 (millimetres), 1:1, extents 201.735 × 171.735 mm (7.94 × 6.76 in).
- Layers:
  - CUT: 7 lines, 7 arcs and 4 circles, in closed contours: the outline, two Ø4.5 mm and two Ø5.5 mm holes.
  - BEND: two lines.
  - Both are colour 7 and linetype Continuous, on, not frozen and plotted. Every entity takes its layer's linetype (BYLAYER). Layers 0 and Defpoints hold nothing.
- The file defines three linetypes: ByBlock, ByLayer and Continuous. None is dashed.
- No splines, text, dimensions, blocks or images. `validate_dxf_file`: no findings.
- Bend lines:
  - the wall bend, at X = 1.633, from Y = -7 to -150: 143.0 mm;
  - the shelf bend, at Y = -1.633, from X = 7 to 180: 173.0 mm.
  - Each meets the outline only at its two ends: one at the corner relief, the other at the blank's far edge.
- Local flange depth, bend line to the nearest outline straight across, sampled every 0.1 mm along each bend:
  - flange side: 23.367 mm (0.920 in), falling to 21.964 mm (0.865 in) by the R3 corners;
  - web side: at least 27.861 mm (1.097 in), by the R6 web corner at the tip.
- Holes from their bend lines: Ø5.5 centres 12.367 mm away, edges 9.617 mm (0.379 in); Ø4.5 centres 12.367 mm, edges 10.117 mm (0.398 in).
- The corner relief: its nearest cut, the end of its R1 round, 4.367 mm (0.172 in) from each bend line, past the bend's end; its square sides 5.367 mm (0.211 in) from each.
- Smallest hole Ø4.5 mm (0.177 in). Holes to the outline 8.25 mm (0.325 in) at the least, holes to each other 94.5 mm.
- The flat was developed with SendCutSend's 0.063 in inside radius and K-factor 0.40: a bend deduction of 3.265 mm (0.1285 in) a bend.

## Findings

| Status | Check | Evidence | Rule source | Recommendation |
| --- | --- | --- | --- | --- |
| ❌ fail | DXF: bend line type | The BEND layer is Continuous, a solid line, and both its lines take it (BYLAYER). The file defines no dashed linetype. | [CNC bending](https://sendcutsend.com/services/cnc-bending/), Get instant pricing for bending: "Bends should be indicated with a dashed line for .dxf and .dwg files". [Ordering guide](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md), Bending, Bend lines in DXF: dashed (not hidden) in SolidWorks and AutoCAD, solid in Fusion 360. | Upload the STEP instead. To use the DXF, make the BEND layer dashed (DASHED, not HIDDEN) and run this preflight again: text-to-cad's DXF export writes every layer Continuous, so `parts/shelf_bracket_cut.py` can't. |
| ✅ pass | STEP: one solid at stock thickness | One valid solid, 1.8796 mm thick throughout, against 0.074 in stock | [CNC bending](https://sendcutsend.com/services/cnc-bending/), Pre-flight checklist: "single solid sheet metal body, uniform thickness with a face at every edge, modeled at stock thickness with matching bend specs"; [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=G90-074].general_specs.thickness` 0.074 | None |
| ✅ pass | STEP: bend radius | Both bends 1.6002 mm (0.0630 in) inside | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=G90-074].bending_specs.effective_bend_radius` 0.063 | None |
| ✅ pass | STEP: bend lines | A STEP carries none, and needs none | [CNC bending](https://sendcutsend.com/services/cnc-bending/): "3D files: No bend lines needed"; [ordering guide](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md), File Format Guidelines: STEP is best for parts with bends | Confirm the two 90° bends and their direction in the 3D preview. |
| ✅ pass | Units and scale | STEP in millimetres; DXF `$INSUNITS` 4, 1:1 | [ordering guide](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md), Ordering Flow and File Format Guidelines: DXF | Choose MM in the "Confirm drawing units" dialog. |
| ✅ pass | Material and bending offered | G90-074 `out_of_stock` false, `cutting_process` Fiber Laser, `available_services` includes `bending` | [sendcutsend-catalog.json](https://cdn.sendcutsend.com/specs/sendcutsend-catalog.json) `materials[sku=G90-074]` | None |
| ✅ pass | Part size | 7.94 × 6.76 in flat | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=G90-074].cutting_specs.min_part_size` 0.375x0.25; `bending_specs.min_flat_part_size` 0.375 x 1.5, `max_flat_part_size` 44 x 30 | None |
| ✅ pass | Cut contours | All closed, no duplicates, splines, text or stray points | [ordering guide](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md), File Format Guidelines: DXF; [CNC bending](https://sendcutsend.com/services/cnc-bending/), Pre-flight checklist; direct file inspection (`validate_dxf_file`) | None |
| ✅ pass | Hole size | Smallest Ø4.5 mm (0.177 in) | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=G90-074].cutting_specs.min_hole_size` 0.028; [CNC bending](https://sendcutsend.com/services/cnc-bending/), Pre-flight checklist: at least 50 % of thickness (0.037 in) | None |
| ✅ pass | Hole to edge, webs | 8.25 mm (0.325 in) hole to outline at the least; 94.5 mm hole to hole | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=G90-074].cutting_specs.min_hole_to_edge` 0.022, `min_bridge_size` 0.032 | None |
| ✅ pass | Bend line span | Each bend line runs from the corner relief to the blank's far edge, the whole length of its flange | [ordering guide](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md), Bending: bend lines "must extend completely across the area to be bent"; [CNC bending](https://sendcutsend.com/services/cnc-bending/), Common issues to avoid, Incomplete bends | None |
| ✅ pass | Bend segments | Two lines on two axes, square to each other, each with its own flange; neither crosses the other | [CNC bending](https://sendcutsend.com/services/cnc-bending/), Common issues to avoid: Combined lines; Intersecting bends need flanges of their own | None |
| ✅ pass | Flanges on adjacent edges | Two perpendicular bends the same way, flanges 0.98 in long | [CNC bending](https://sendcutsend.com/services/cnc-bending/), Flange requirements for boxes: two flanges on adjacent edges, max flange length 5 in | None |
| ✅ pass | Bend angle | Two 90° bends (from `parts/shelf_bracket.step`) | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=G90-074].bending_specs.max_bend_angle` 130 | Set 90° on both in the 3D preview. |
| ✅ pass | Bend length | 143.0 and 173.0 mm (5.63 and 6.81 in) | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=G90-074].bending_specs.max_bend_length` 44.0 | None |
| ✅ pass | Flange length | At least 21.964 mm (0.865 in) on the flange side and 27.861 mm (1.097 in) on the web side, all along both bends | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=G90-074].bending_specs.min_flange_length_before_bend` 0.255 and `min_flange_length_after_bend` 0.320 | None |
| ✅ pass | Bend contact | At least 0.320 in of flange on both sides along the whole of each bend; each flange's free edge straight and parallel to its bend | [CNC bending](https://sendcutsend.com/services/cnc-bending/), Common issues to avoid, Insufficient contact: the minimum flange on both sides along about 50 to 60 % of the bend | None |
| ✅ pass | Bend relief depth | The corner relief runs 5.367 mm (0.211 in) past each bend line, 4.367 mm (0.172 in) at the bend's own end | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=G90-074].bending_specs.bend_relief_depth` 0.157, measured from the bend line ([bending deformation guidelines](https://sendcutsend.com/guidelines/bend-deformation/)) | None. The first version's 5 mm relief reached 3.367 mm (0.133 in) and failed; it was opened to 7 mm. |
| ✅ pass | Corner relief to the bend line | 4.367 mm (0.172 in) | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=G90-074].bending_specs.min_corner_relief_distance_from_bend_line` 0.025 | None |
| ✅ pass | Cuts in the die area | No hole within half the die width, 0.236 in (5.99 mm), of a bend line: the nearest hole edge is 9.617 mm (0.379 in) away. The only cuts nearer are the corner relief past each bend's end. | [How to prevent bending deformation](https://sendcutsend.com/guidelines/bend-deformation/), Die line considerations; die width from [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=G90-074].bending_specs.die_width` 0.472 | Check the feature distortion caution area SendCutSend shows when the bends are configured. |
| ✅ pass | Cuts on the bend lines | Each bend line meets the outline only at its two ends; no hole touches or crosses one | Direct file inspection; [CNC bending](https://sendcutsend.com/services/cnc-bending/), Die lines and feature distortion | None |
| ✅ pass | Window or recessed bend | None: each bend runs to an edge or the relief | [CNC bending](https://sendcutsend.com/services/cnc-bending/), Window bend requirements; Recessed bend requirements | None |
| ✅ pass | Bend radius and K-factor in the flat | Developed with 0.063 in and K 0.40: bend deduction 0.1285 in | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=G90-074].bending_specs.k_factor` 0.4 and `bend_deduction` 0.129; [CNC bending](https://sendcutsend.com/services/cnc-bending/): bend-to-edge tolerance ±0.015 in | None |

No diagnostic image was made. The one failure is the bend lines' type, not where they are, and no tool here draws callouts on the flat pattern. A picture would show both bend lines drawn solid, like the cut lines, along the two flanges.

## Verdict

- `parts/shelf_bracket.step`: Ready to upload for this assumed context.
- `cut/shelf_bracket_cut.dxf`: Needs edits before upload. Its BEND layer is solid where SendCutSend asks for dashed; every other check passes.

## Other choices

- Powder coat: G90-074 offers `powder` (`powder_coating_specs.min_flat_part_size` 1.0x3.0 in, `max_flat_part_size` 31.0x37.0 in; the flat passes both), for a painted bracket. Not ordered: the galvanising is the finish.
- CRS-074, A36/1008 mild steel at the same 0.074 in, has the same bend radius, K-factor, flange and relief values, so the same STEP would bend the same. It rusts bare and would need powder coat or plating.
