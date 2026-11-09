# Shelf bracket: sheet metal check

As drawn now, the bracket's two bends, its flanges, its holes and its corner relief meet SendCutSend's rules for bending G90-074, so the part needs no change. The first version did not: its corner relief stopped 3.37 mm past the shelf bend line, short of SendCutSend's 3.99 mm, and it was opened from 5 to 7 mm. The bend radius is under one thickness, which the general guide asks for, but that radius is SendCutSend's own tooling's. Two things are worth checking on the first part.

## Scope

- Part: `parts/shelf_bracket.step` (sha256 `f4eb6505799a…`), one closed solid, millimetres. Its flat pattern `parts/shelf_bracket_flat.step` (`cd6ce44cf0d5…`) and its cut file `cut/shelf_bracket_cut.dxf` (`d50a8a98b46c…`).
- Process: laser cut and press-brake bent by SendCutSend, the shop the bends are drawn for.
- Material: G90 galvanised steel (ASTM A653 G90), SendCutSend's G90-074: 0.074 in (1.880 mm), +0.006/-0.004 in. The part is drawn at that stock thickness, 1.8796 mm.
- Tooling: SendCutSend's for G90-074: inside bend radius 0.063 in (1.600 mm), K-factor 0.40, die width 0.472 in.
- Measured with text-to-cad's `step.read` on the saved STEP files (exact faces, not a mesh) and with `ezdxf` on the cut file.
- Rules, read 2026-10-26:
  - SendCutSend's engineering specs, [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) (`_meta.generated_at` 2026-04-29T20:52:33Z), `materials[sku=G90-074]`, and their [CNC bending page](https://sendcutsend.com/services/cnc-bending/) and [bending deformation guidelines](https://sendcutsend.com/guidelines/bend-deformation/). These are the shop's rules and they govern.
  - For what SendCutSend gives no number for: Protolabs Network's [sheet metal fabrication guide](https://www.hubs.com/guides/sheet-metal-fabrication/), Part 3, Design for sheet metal fabrication.

## What was measured

- Two bends of 90°, both turning the same way off the web:
  - the wall bend, 143 mm long, along Z, joining the web and the wall flange;
  - the shelf bend, 173 mm long, along Y, joining the web and the shelf flange.
  - Each has an inside radius of 1.6002 mm and an outside radius of 3.4798 mm on one axis. The web's two faces, each flange's two faces, are matched planes 1.8796 mm apart: the sheet is one thickness throughout.
- Both flanges are 25 mm, outside. Each is 23.367 mm from its bend line on the flat, and no less than 21.964 mm where its far corners are rounded R3.
- The corner relief: a 7 × 7 mm square, from the outside faces, cut where the two bends meet, with an R1 inside corner. On the flat, it reaches 5.367 mm past each bend line, and 4.367 mm at the bend's own end, where the R1 round begins.
- Holes: two Ø4.5 mm in the shelf flange and two Ø5.5 mm in the wall flange, all 14 mm from the web's outside face.
- The flat pattern is 201.735 × 171.735 mm. Its volume is 175.36 mm³ less than the bent part's, exactly what the K-factor 0.40 takes from the two bends' 316 mm at the mid-thickness radius: the flat is developed as the bends are drawn.

## Findings

| Part / feature | Evidence | Applicable rule | Result | Suggested action |
| --- | --- | --- | --- | --- |
| Bend radius | Inside 1.6002 mm (0.0630 in) on both bends, measured on their inner cylinders | SendCutSend `bending_specs.effective_bend_radius` 0.063 in, set by its tooling | pass | None |
| Bend radius, general guide | The same 1.600 mm, under the 1.880 mm thickness (R/t 0.85) | Protolabs Network: inside radius at least the thickness | review | Conflicts with SendCutSend's tooling radius, which governs here; the bending check finds no cracking risk in this steel. Only for another shop: redraw at its radius and K-factor. |
| Bend angle | 90°, both bends | SendCutSend `bending_specs.max_bend_angle` 130° | pass | None |
| Flange lengths | 23.367 mm from each bend line on the flat, 21.964 mm at the least by the R3 corners; 25 mm formed | SendCutSend `min_flange_length_before_bend` 0.255 in (6.48 mm) and `min_flange_length_after_bend` 0.320 in (8.13 mm) | pass | None |
| Flanges on adjacent edges | Two perpendicular bends the same way, flanges 25 mm (0.98 in) | SendCutSend CNC bending, Flange requirements for boxes: two flanges on adjacent edges at most 5 in long | pass | None |
| Bend length | 143 and 173 mm (5.63 and 6.81 in) | SendCutSend `bending_specs.max_bend_length` 44 in | pass | None |
| Flat part size | 201.7 × 171.7 mm (7.94 × 6.76 in) | SendCutSend `bending_specs.min_flat_part_size` 0.375 × 1.5 in, `max_flat_part_size` 44 × 30 in | pass | None |
| Sheet thickness | 1.8796 mm (0.0740 in), the model's matched faces | SendCutSend `general_specs.thickness` 0.074 in | pass | None: drawn at the stock thickness, so the STEP can be uploaded as it is. |
| Flat pattern | K 0.40: bend allowance π/2 × (1.6002 + 0.40 × 1.8796) = 3.694 mm; bend deduction 2 × 3.480 - 3.694 = 3.265 mm (0.1285 in) | SendCutSend `bending_specs.k_factor` 0.4 and `bend_deduction` 0.129 in | pass | None. The 0.01 mm difference is far inside the ±0.005 in cut tolerance. |
| Corner relief depth, first version | Relief 5 mm from the outside faces: 3.367 mm past the shelf bend line on the flat | SendCutSend `bending_specs.bend_relief_depth` 0.157 in (3.99 mm), measured from the bend line ([bending deformation guidelines](https://sendcutsend.com/guidelines/bend-deformation/)) | fail | Fixed: `CORNER_RELIEF` 5 to 7 mm in `parts/shelf_bracket.py`, every output rebuilt. |
| Corner relief depth | 5.367 mm past each bend line, 4.367 mm at the bend's end where the R1 round starts | The same 3.99 mm | pass | None |
| Corner relief to the bend line | The relief's nearest cut is 4.367 mm from each bend line, past the bend's end | SendCutSend `bending_specs.min_corner_relief_distance_from_bend_line` 0.025 in (0.64 mm) | pass | None |
| Corner relief width | The relief opens each bend's end onto the other flange's free end: the cut beside each bend's end is 7 mm and more wide | Protolabs Network: a relief at least the thickness wide (1.88 mm) | pass | None |
| Holes in the die area | Hole edges 9.617 mm (Ø5.5) and 10.117 mm (Ø4.5) from their bend lines | SendCutSend: cut features at least half the die width, 0.236 in (5.99 mm), from the bend line ([CNC bending](https://sendcutsend.com/services/cnc-bending/), [bending deformation guidelines](https://sendcutsend.com/guidelines/bend-deformation/)) | pass | None |
| Holes to the bend | Edge to where the bend radius starts: 7.77 mm (Ø5.5) and 8.27 mm (Ø4.5) | Protolabs Network: at least 2 × thickness (3.76 mm) from the start of the bend radius | pass | None |
| Hole size | Smallest Ø4.5 mm | SendCutSend `cutting_specs.min_hole_size` 0.028 in, and their pre-flight list's 50 % of thickness (0.94 mm); Protolabs Network: at least the thickness | pass | None |
| Hole to edge | 8.25 mm (Ø5.5) and 8.75 mm (Ø4.5) at the least | SendCutSend `cutting_specs.min_hole_to_edge` 0.022 in (0.56 mm); Protolabs Network: at least the thickness | pass | None |
| Hole spacing | 94.5 mm edge to edge at the least | Protolabs Network: at least 2 × thickness (3.76 mm) | pass | None |
| Bend angle tolerance | Two 90° bends; shelf arm 180 mm | SendCutSend `bend_angle_tolerance_up_to_24` ±1° | review | ±1° at the shelf bend tips the shelf flange 0.44 mm across its 25 mm; ±1° at the wall bend swings the arm's tip 3.1 mm sideways (180 × tan 1°). Check both on the first part. |
| Grain direction | Not given by the model or the order | None of the sources gives one for this sheet | unverified | The two bends are square to each other, so one runs along the rolling direction whichever way the blank is nested. Low-carbon steel bends flat on itself (AISI, as the bending check's sheet table cites); ask SendCutSend only if the zinc coating cracks at the bends. |

## What was not checked

- Forming on SendCutSend's press brake: their punch and die are not modelled. Bend order: either bend can go first. When the second is made, the first flange stands 3.5 mm clear of the end of the punch's line (the 7 mm relief past the 3.48 mm setback), which the tooling can't be checked against here.
- The zinc coating at the bends: G90's coating can flake at a tight bend, and no source here gives a minimum radius for it.
- Deburring and finish: none is ordered; the galvanised sheet is the finish, and its cut edges are bare steel.

Passing these checks does not approve the part for manufacture. It means the measured features meet the cited limits.
