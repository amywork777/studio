# Servo bracket: SendCutSend preflight

Needs edits before upload. The cut file's bend line is solid, and SendCutSend asks for a dashed bend line in a DXF. Every other check passes for this order, in 0.080 in 5052-H32 with one bend. The cut file's script can't draw the line dashed: text-to-cad's DXF export writes every layer solid. Nothing was uploaded, quoted or ordered.

## Context

- File: `cut/servo_bracket_cut.dxf`, the bracket's flat pattern with its bend line.
- Assumed service: DXF laser sheet cutting, with bending.
- Order:
  - Material: 5052 H32 Aluminum, SKU ALU-080, 0.080 in (2.03 mm), cut by fiber laser.
  - Bending: one 90° bend, on the BEND line.
  - Quantity 1. No finish, no hardware.
  - Tapping is not ordered. The four 2.5 mm holes are cut at the M3 × 0.5 tap drill size, to be tapped by hand after delivery.
- Date checked: 2026-10-24

## Sources checked

All read 2026-10-24.

- [sendcutsend-ordering-guide.md](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md)
- [sendcutsend-catalog.json](https://cdn.sendcutsend.com/specs/sendcutsend-catalog.json): `_meta.schema_version` 1.0, `_meta.generated_at` 2026-04-29T20:52:33.873247+00:00, `_meta.source_data_generated_at` 2026-04-29T13:28:32.522103
- [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json): the same `_meta` values
- SendCutSend's pages, for the rules the three files don't give:
  - [CNC bending](https://sendcutsend.com/services/cnc-bending/), reached from sendcutsend.com/guidelines/bending/
  - [How to prevent bending deformation](https://sendcutsend.com/guidelines/bend-deformation/)
  - [Why aren't my bend lines showing up?](https://sendcutsend.com/faq/why-arent-my-bend-lines-showing-up/)

## Geometry facts

Read from the upload file with `ezdxf`, and checked with text-to-cad's `validate_dxf_file`.

- DXF AC1027. `$INSUNITS` 4 (millimetres), 1:1, extents 64.000 × 69.094 mm (2.52 × 2.72 in).
- Layers:
  - CUT: 8 lines, 8 arcs and 6 circles, all closed contours. The outline has R3 corners, the servo cutout is 41.5 × 20.6 mm with R0.5 corners, and there are four Ø2.5 mm and two Ø4.5 mm holes.
  - BEND: one line.
  - Both layers are colour 7 and linetype Continuous. Both are on, not frozen, and plotted. Every entity takes its layer's linetype and colour (BYLAYER).
  - Layers 0 and Defpoints hold nothing.
- The file defines three linetypes: ByBlock, ByLayer and Continuous. None is dashed.
- No splines, text, dimensions, blocks, points, images or paper-space entities. `validate_dxf_file`: no findings, so no open cut contours, duplicates or zero-length entities.
- Bend line: from (−32, 0) to (32, 0), 64.0 mm, edge to edge across the blank. One segment, the only bend.
  - It meets the outline only at its two ends, on the side edges. No hole or cutout touches or crosses it.
- Local flange depth, from the bend line to the outline, sampled every 0.1 mm along it:
  - 38.547 mm (1.52 in) on the shelf side and 30.547 mm (1.20 in) on the flange side;
  - within 3 mm of each end, where the far corners are R3, it falls to no less than 35.547 mm (1.40 in) and 27.547 mm (1.08 in);
  - each flange's free edge is straight and parallel to the bend between its corners.
- Interior cuts nearest the bend line, reported apart from the flanges:
  - the servo cutout's edge, 10.547 mm (0.415 in) away on the shelf side;
  - the wall holes' edges, 12.297 mm (0.484 in) away on the flange side.
  - No hole or cutout lies within 6.0 mm of the bend line. The only cuts in that band are the outline's two side edges, which the bend runs out to.
- No window or recessed bend: no flange is cut inside the part.
- Smallest hole Ø2.5 mm (0.098 in).
- Narrowest web: 1.725 mm (0.068 in), between each tapped hole and the cutout. The wall holes are 3.75 mm from the side edges.
- Tapped hole centres are 16.097 and 25.597 mm (0.634 and 1.008 in) from the bend line.
- The flat was developed for a 2.000 mm sheet with SendCutSend's 0.038 in inside radius and K-factor 0.48. That is a bend allowance of 3.024 mm.
  - Bent from 0.080 in stock, the shelf comes out 40.02 mm and the flange 32.02 mm outside, against the 40 and 32 mm drawn.

## Findings

| Status | Check | Evidence | Rule source | Recommendation |
| --- | --- | --- | --- | --- |
| ❌ fail | Bend line type | The BEND layer's linetype is Continuous, a solid line, and its one line takes it (BYLAYER). The file defines no dashed linetype. | [CNC bending](https://sendcutsend.com/services/cnc-bending/), Get instant pricing for bending: "Bends should be indicated with a dashed line for .dxf and .dwg files". [Ordering guide](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md), Bending, Bend lines in DXF: the line type depends on the CAD software, dashed (not hidden) in SolidWorks and AutoCAD, solid in Fusion 360 and Adobe Illustrator. [Why aren't my bend lines showing up?](https://sendcutsend.com/faq/why-arent-my-bend-lines-showing-up/): the first cause it gives is a line type not set for the design program. Its table gives a dashed line for AutoCAD, SolidWorks and QCAD DXFs, and a solid one only for Fusion. Bends can't be added until the quoting system recognizes the bend lines. The ordering guide gives no line type for a DXF from other software. The two pages fill that in, and both ask for a dashed bend line in any DXF but Fusion's. | Make the BEND layer dashed, with a dashed linetype such as DASHED, not HIDDEN, then run this preflight again. text-to-cad's DXF export writes every layer Continuous and takes no linetype, so `parts/servo_bracket_cut.py` can't draw it dashed yet. A STEP needs no bend line (Other choices). |
| ✅ pass | Bend line layer | One line on its own layer, BEND, at the centre of the bend. The layer is on, not frozen, and plotted. Colour 7, like the cut lines. | [Ordering guide](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md), Bending, Bend lines in DXF: bend lines on a dedicated layer of any name, marking the centre of each bend; their colour is ignored. [Why aren't my bend lines showing up?](https://sendcutsend.com/faq/why-arent-my-bend-lines-showing-up/): bend lines on a hidden layer are not found. The [CNC bending](https://sendcutsend.com/services/cnc-bending/) pre-flight list asks a 2D file for "all objects on the same layer" and "no open contours". The ordering guide speaks to bend lines and ranks above that page, so it settles this. | After upload, check that SendCutSend's 3D preview finds the bend. |
| ✅ pass | Cut line type | The CUT layer is Continuous. | [Why aren't my bend lines showing up?](https://sendcutsend.com/faq/why-arent-my-bend-lines-showing-up/): cut geometry is always a solid, continuous line type | None |
| ✅ pass | Units and scale | `$INSUNITS` 4, 1:1, 64.000 × 69.094 mm | [ordering guide](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md), File Format Guidelines: DXF, "Set $INSUNITS correctly (1 = inches, 4 = mm)" | Choose MM in the "Confirm drawing units" dialog. |
| ✅ pass | Material and bending offered | ALU-080 `out_of_stock` false, `cutting_process` Fiber Laser, `available_services` includes `bending` | [sendcutsend-catalog.json](https://cdn.sendcutsend.com/specs/sendcutsend-catalog.json) `materials[sku=ALU-080]` | None |
| ✅ pass | Part size | 2.52 × 2.72 in flat | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].cutting_specs.min_part_size` 0.375x0.25, `max_part_size` 44 x 30; `bending_specs.min_flat_part_size` 0.375 x 1.5, `max_flat_part_size` 44 x 30 | None |
| ✅ pass | Cut contours | All closed. No duplicates, splines, text, dimensions or stray points. | [ordering guide](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md), File Format Guidelines: DXF, "Use polylines and arcs, not splines"; [CNC bending](https://sendcutsend.com/services/cnc-bending/), Pre-flight checklist; direct file inspection (`validate_dxf_file`) | None |
| ✅ pass | Hole size | Smallest Ø2.5 mm (0.098 in) | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].cutting_specs.min_hole_size` 0.028; [CNC bending](https://sendcutsend.com/services/cnc-bending/), Pre-flight checklist: holes at least 50% of thickness (0.040 in) | None |
| ✅ pass | Webs between cuts | 1.725 mm (0.068 in), each tapped hole to the cutout | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].cutting_specs.min_bridge_size` 0.03 | None |
| ✅ pass | Hole to edge | 1.725 mm (0.068 in) at the least | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].cutting_specs.min_hole_to_edge` 0.024 | None |
| ✅ pass | Bend line span | 64.0 mm, edge to edge of the blank. The outline crosses the bend line only at its two ends. | [ordering guide](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md), Bending: bend lines "must extend completely across the area to be bent"; [CNC bending](https://sendcutsend.com/services/cnc-bending/), Common issues to avoid, Incomplete bends | None |
| ✅ pass | Bend segments | One line, one segment on one axis. No other bend. | [CNC bending](https://sendcutsend.com/services/cnc-bending/), Common issues to avoid: bends on a common axis are joined (Combined lines), and intersecting bends need flanges of their own | None |
| ✅ pass | Bend angle | One 90° bend, one segment (the angle from `parts/servo_bracket.step`) | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].bending_specs.max_bend_angle` 130 | Set 90° in the 3D preview. |
| ✅ pass | Bend length | 64.0 mm (2.52 in) | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].bending_specs.max_bend_length` 44.0 | None |
| ✅ pass | Flange length | At least 35.547 mm (1.40 in) on the shelf side and 27.547 mm (1.08 in) on the flange side, bend line to outline, all along the bend | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].bending_specs.min_flange_length_before_bend` 0.255 and `min_flange_length_after_bend` 0.313 | None |
| ✅ pass | Bend contact | At least 0.313 in (7.95 mm) of flange on both sides along all of the bend: every sample, every 0.1 mm. Each flange's free edge is straight and parallel to the bend. | [CNC bending](https://sendcutsend.com/services/cnc-bending/), Common issues to avoid, Insufficient contact: the minimum flange on both sides along at least about 50 to 60% of the bend; Odd flange shapes: a flat surface parallel to the bend. [How to prevent bending deformation](https://sendcutsend.com/guidelines/bend-deformation/), Tapered flanges and Unsupported bend | None |
| ✅ pass | Bend relief | None needed. The bend runs edge to edge, so no material stands beside it, and no corner meets it: the nearest begins 27.547 mm (1.08 in) from the bend line. | [Ordering guide](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md), Bending, Corner relief; [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].bending_specs.min_corner_relief_distance_from_bend_line` 0.037; [CNC bending](https://sendcutsend.com/services/cnc-bending/), Common issues to avoid, Insufficient or missing bend relief | None |
| ✅ pass | Cuts in the die area | No hole or cutout lies within half the die width, 6.0 mm (0.236 in), of the bend line. The nearest is the servo cutout's edge, 10.547 mm (0.415 in) away. The only cuts in that band are the outline's two side edges, which the bend runs out to. | [How to prevent bending deformation](https://sendcutsend.com/guidelines/bend-deformation/), Die line considerations: cut features at least half the die's width from the bend line, and every hole and cutout outside the die width; the same rule on the [CNC bending](https://sendcutsend.com/services/cnc-bending/) page. Die width from [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].bending_specs.die_width` 0.472. | None |
| ✅ pass | Cuts on the bend line | The bend line meets the outline only at its two ends, on the side edges, as a bend that runs edge to edge must. No hole or cutout touches or crosses it. | Direct file inspection. [CNC bending](https://sendcutsend.com/services/cnc-bending/), Die lines and feature distortion: cut features in the die lines or the bend area distort. | None |
| ✅ pass | Window or recessed bend | None in this part: the bend runs edge to edge, and no flange is cut inside the part. The window-bend minimums don't apply, among them 0.55 in from the bend line to a cutout's edge for this die. | [CNC bending](https://sendcutsend.com/services/cnc-bending/), Window bend requirements, for a flange cut on three sides inside a part; Recessed bend requirements | None |
| ✅ pass | Bend radius and K-factor | Flat developed with an inside radius of 0.038 in and K 0.48. Outside sizes from 0.080 in stock: 40.02 and 32.02 mm, 0.02 mm over the 40 and 32 mm drawn. | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].bending_specs.effective_bend_radius` 0.038 and `k_factor` 0.48; [CNC bending](https://sendcutsend.com/services/cnc-bending/): "Design your parts using our specs", bend-to-edge tolerance ±0.015 in (0.38 mm) | None |
| ✅ pass | Thickness | The DXF carries none: 0.080 in is chosen in the configurator. The bracket is drawn 2.000 mm (0.0787 in) thick. | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].general_specs.thickness` 0.080, `thickness_tolerance_positive` and `_negative` 0.005 | None |

No diagnostic image was made. The failure is the bend line's type, not where it is, and no tool here draws callouts on the flat pattern. A picture would show the bend line drawn solid like the cut lines, across the middle of the blank.

## Verdict

Needs edits before upload.

The open action: the BEND layer is solid; SendCutSend asks for dashed. Every other check passes.

## Other choices

The STEP, `parts/servo_bracket.step`, is not ready. It is ❌ for a STEP upload.

- It is one solid, 2.000 mm thick, with a 0.965 mm inside bend radius.
- SendCutSend's [CNC bending](https://sendcutsend.com/services/cnc-bending/) pre-flight list asks 3D files to be "modeled at stock thickness with matching bend specs", and ALU-080 stock is 0.080 in (2.032 mm).
- A STEP carries no bend line, so the cut file's failure would not apply to it. The [CNC bending](https://sendcutsend.com/services/cnc-bending/) page says so for 3D files, as does [Why aren't my bend lines showing up?](https://sendcutsend.com/faq/why-arent-my-bend-lines-showing-up/), and the [ordering guide](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md) prefers STEP for bent parts.
- To upload the STEP instead, set `THICKNESS = 2.032` in `parts/servo_bracket.py`. Then rebuild the bracket, its flat pattern, the cut file and the strength study.

SendCutSend could tap the four M3 holes instead, which is ❓.

- These pass: M3 × 0.5 is inside its tapping range (`tapping_specs.smallest_tap` M2 X 0.4, `largest_tap` 1/4-28).
- The holes meet its tapping distances:
  - `min_hole_cl_to_bend_line` 0.435 in: the holes are 0.634 in from the bend line;
  - `min_hole_to_edge` 0.024 in: the least is 0.068 in;
  - `min_flat_part_size` 0.949 x 1.5 in.
- Not known: none of the sources gives the hole size SendCutSend wants for an M3 tap. Confirm it in the configurator before adding tapping.
