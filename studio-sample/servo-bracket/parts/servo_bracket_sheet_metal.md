# Servo bracket: sheet metal check

As drawn, the bracket's bend, flanges and holes meet SendCutSend's rules for bending 0.080 in 5052-H32, so the part needs no change. Its cut file does: the bend line is solid, and SendCutSend asks for a dashed one. Two things are worth checking on the first part, and one is not known.

## Scope

- Part: `parts/servo_bracket.step` (sha256 `2eb09649f81d…`), one closed solid, millimetres. Its flat pattern `parts/servo_bracket_flat.step` (`75b73ace0a9d…`) and its cut file `cut/servo_bracket_cut.dxf`.
- Process: laser cut and press-brake bent by SendCutSend, the shop the bend was drawn for.
- Material: 5052-H32 aluminium, SendCutSend's ALU-080 (0.080 in, 2.03 mm). The part is drawn 2.00 mm thick.
- Tooling: SendCutSend's for ALU-080: inside bend radius 0.038 in, K-factor 0.48, die width 0.472 in.
- Measured with text-to-cad's `step.read` on the saved STEP files: exact faces, not a mesh.
- Rules, read 2026-10-23:
  - SendCutSend's engineering specs, [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) (`_meta.generated_at` 2026-04-29T20:52:33Z), `materials[sku=ALU-080]`. These are the shop's rules and they govern.
  - For what SendCutSend gives no rule on: Protolabs Network's [sheet metal fabrication guide](https://www.hubs.com/guides/sheet-metal-fabrication/), Part 3, Design for sheet metal fabrication, and Protolabs' [sheet metal design guidelines](https://www.protolabs.com/services/sheet-metal-fabrication/design-guidelines/), Holes and Slots.

## What was measured

- One bend of 90.000°, 64 mm long, along X.
  - Inside radius 0.965 mm and outside radius 2.965 mm, on one axis.
  - The shelf's top and underside, and the flange's back and front, are matched faces 2.000 mm apart. The sheet is 2.000 mm thick throughout, the bend included.
- The shelf is 40 mm and the flange 32 mm, outside. Beyond the bend they are 37.035 and 29.035 mm.
- Features:
  - the servo cutout, 41.5 × 20.6 mm with R0.5 corners;
  - four Ø2.5 mm holes, tapped M3 × 0.5 for the servo's screws;
  - two Ø4.5 mm wall holes in the flange;
  - R3 outside corners.
- The flat pattern is 64 × 69.094 mm, with the bend line across its middle. Distances from that line:
  - the nearest tapped hole's centre: 16.097 mm;
  - the cutout's back edge: 10.547 mm;
  - the wall holes' centres: 14.547 mm.

## Findings

| Part / feature | Evidence | Applicable rule | Result | Suggested action |
| --- | --- | --- | --- | --- |
| Bend radius | Inside 0.965 mm (0.0380 in), measured on the bend's inner cylinder | SendCutSend `bending_specs.effective_bend_radius` 0.038 in, set by its tooling | pass | None |
| Bend radius, general guide | The same 0.965 mm, under the 2.00 mm thickness | Protolabs Network: inside radius at least the sheet thickness (2.0 mm) | review | Conflicts with SendCutSend's tooling radius, which governs here. Only for another shop: redraw the bend and the flat pattern at that shop's radius and K-factor. |
| Bend angle | 90.000°, between the shelf's and the flange's faces | SendCutSend `bending_specs.max_bend_angle` 130° | pass | None |
| Flange lengths | Flat, from the bend line: shelf 38.547 mm, flange 30.547 mm. Formed, outside: 40 and 32 mm. | SendCutSend `min_flange_length_before_bend` 0.255 in (6.48 mm) and `min_flange_length_after_bend` 0.313 in (7.95 mm). Each length clears both limits, whichever convention applies. | pass | None |
| Bend length | 64 mm (2.52 in) | SendCutSend `bending_specs.max_bend_length` 44 in | pass | None |
| Flat part size | 64 × 69.094 mm (2.52 × 2.72 in) | SendCutSend `bending_specs.min_flat_part_size` 0.375 × 1.5 in, `max_flat_part_size` 44 × 30 in | pass | None |
| Sheet thickness | 2.000 mm (0.0787 in) | SendCutSend `general_specs.thickness` 0.080 in, tolerance ±0.005 in (1.905 to 2.159 mm) | pass | None. The part is cut from 0.080 in stock, 0.03 mm thicker than drawn. A STEP upload to SendCutSend must be modelled at that stock thickness, so the order goes as the cut file (`cut/servo_bracket_sendcutsend.md`). |
| Flat pattern | Developed with K 0.48: bend allowance π/2 × (0.965 + 0.48 × 2.000) = 3.024 mm. 37.035 + 29.035 + 3.024 = 69.094 mm, the flat's measured length. | SendCutSend `bending_specs.k_factor` 0.48 and `bend_deduction` 0.116 in. K 0.48 at 0.080 in gives that same 2.946 mm deduction; at the drawn 2.000 mm it is 2.906 mm. | pass | None. The 0.04 mm difference is inside the ±0.005 in (0.13 mm) cut tolerance. |
| Bend relief | The bend runs edge to edge across the full 64 mm width. No material stands beside it and no corner meets it. | Protolabs Network: relief where there is material on either side of a bend. SendCutSend `min_corner_relief_distance_from_bend_line` applies to corners at a bend. | pass | None needed |
| Tapped holes to the bend | Nearest M3 hole centre 16.097 mm (0.634 in) from the bend line, on the flat | SendCutSend `tapping_specs.min_hole_cl_to_bend_line` 0.435 in (11.05 mm), hole centre to bend line | pass | None |
| Holes and cutout to the bend | Edge to where the bend radius starts: tapped hole 13.335 mm, cutout 9.035 mm, wall holes 10.785 mm | Protolabs Network: holes at least 2 × thickness (4.0 mm) from the start of the bend radius. SendCutSend gives no rule for plain holes. | pass | None |
| Hole size | Smallest Ø2.5 mm | SendCutSend `cutting_specs.min_hole_size` 0.028 in (0.71 mm). Protolabs and Protolabs Network: at least the sheet thickness (2.0 mm). | pass | None |
| Hole to edge | Tapped hole to the cutout's edge 1.725 mm (0.068 in). Wall hole to the flange's side 3.75 mm. Every other hole is 7.0 mm or more from an edge. | SendCutSend `cutting_specs.min_hole_to_edge` and `tapping_specs.min_hole_to_edge`, both 0.024 in (0.61 mm) | pass | None |
| Hole to edge, general guides | The same 1.725 mm web between each tapped hole and the cutout | Protolabs Network: at least the sheet thickness (2.0 mm). Protolabs: 0.125 in (3.175 mm) for sheet over 0.036 in. | review | Under both general rules; SendCutSend's rule governs. The servo sets both the screw holes and the cutout, so the web cannot grow without a different servo pattern. Tap the holes after bending and look for a bulge in the web on the first part. |
| Hole spacing | 7.0 mm edge to edge across each tab, 44.95 mm along | Protolabs Network: holes at least 2 × thickness (4.0 mm) apart | pass | None |
| Tap size | M3 × 0.5, in 2.000 mm of sheet | SendCutSend `tapping_specs.smallest_tap` M2 × 0.4, `largest_tap` 1/4-28 | pass | None. The configurator lists the exact sizes. |
| Cut file | `cut/servo_bracket_cut.dxf`, in millimetres ($INSUNITS 4), 64 × 69.094 mm. Closed CUT contours: the outline, the cutout and six circles. One BEND line runs across the full 64 mm. No duplicates. The BEND layer's linetype is Continuous, a solid line. | text-to-cad's drawing checks (`validate_dxf_file`: no findings). SendCutSend's ordering guide, Bending: a bend line marks the centre of the bend and runs right across, and its line type depends on the CAD software. SendCutSend's CNC bending page (read 2026-10-24): a dashed bend line in a .dxf or .dwg file. | fail | Make the BEND layer dashed, then run the SendCutSend preflight again (`cut/servo_bracket_sendcutsend.md`). text-to-cad's DXF export writes every layer solid, so the cut file's script can't do it yet. |
| Bend angle tolerance | 90° bend, 40 mm shelf | SendCutSend `bend_angle_tolerance_up_to_24` ±1° | review | ±1° moves the shelf's front edge up to 0.70 mm (40 × tan 1°). If the servo must sit level, check the bend on the first part. |
| Grain direction | Not given by the model or the order | None of the sources gives one for this bend | unverified | A bend this tight (inside radius 0.48 × thickness) usually runs across the rolling direction. Ask SendCutSend if it matters. |

## What was not checked

- Forming on SendCutSend's press brake: their punch and die are not modelled. With one bend, there is no bend order to get wrong.
- Springback, and how far the holes stretch in the bend: no forming simulation was run.
- The threads: the model draws each tapped hole at its 2.5 mm tap drill.
- Deburring and finish: none is ordered.

Passing these checks does not approve the part for manufacture. It means the measured features meet the cited limits.
