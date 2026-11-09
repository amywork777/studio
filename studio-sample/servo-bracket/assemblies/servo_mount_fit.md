# Fit and clearance: servo mount

Checked the mount's model, `assemblies/servo_mount.py`: its 8 parts, all 28 pairs of them, each part's solid against each other's, then the fits a touching joint hides, then the horn adapter turned through its travel.

## Verdict

**No part collides.** 7 pairs touch where the design joins them, 4 of 4 screws overlap their tapped holes by just their thread, and the horn turns -60 to 60 degrees without touching anything. The tightest gap is 0.217 mm: the servo's case in the bracket's cutout.

## Where parts touch

| Parts | Joint | Overlap (mm³) |
|---|---|---|
| servo_bracket · mg996r | the servo's tabs sit on the shelf | 0.000 |
| servo_bracket · cable_clip | the clip is bonded to the flange | 0.000 |
| mg996r · horn_adapter | the adapter sits on the output spline | 0.000 |
| mg996r · m3x8_screw:output_end_back | the screw's head clamps the servo's tab | 0.000 |
| mg996r · m3x8_screw:output_end_front | the screw's head clamps the servo's tab | 0.000 |
| mg996r · m3x8_screw:other_end_back | the screw's head clamps the servo's tab | 0.000 |
| mg996r · m3x8_screw:other_end_front | the screw's head clamps the servo's tab | 0.000 |

## Screws in their tapped holes

Each screw is drawn at its 3.0 mm thread diameter inside the bracket's 2.5 mm tap-drill hole, so it overlaps the sheet by its thread: 4.320 mm³ through the 2 mm sheet when it is square in its hole.

| Screw | Overlap (mm³) | As drawn |
|---|---|---|
| m3x8_screw:output_end_back | 4.320 | yes |
| m3x8_screw:output_end_front | 4.320 | yes |
| m3x8_screw:other_end_back | 4.320 | yes |
| m3x8_screw:other_end_front | 4.320 | yes |

## Fits

Gaps a touching joint would hide, measured between the features that make each fit.

| Fit | Gap (mm) | Closest at (mm) |
|---|---|---|
| the servo's case in the bracket's cutout | 0.217 | (20.45, 12.30, -0.00) |
| m3x8_screw:output_end_back's shank in the servo's tab hole | 0.550 | (24.34, 16.18, 2.30) |
| m3x8_screw:output_end_back's tip, below the shelf, to the servo's case | 1.775 | (22.23, 17.55, -2.00) |
| m3x8_screw:output_end_front's shank in the servo's tab hole | 0.550 | (23.32, 28.49, 2.30) |
| m3x8_screw:output_end_front's tip, below the shelf, to the servo's case | 1.775 | (22.22, 27.05, -2.00) |
| m3x8_screw:other_end_back's shank in the servo's tab hole | 0.550 | (-23.56, 19.04, 2.30) |
| m3x8_screw:other_end_back's tip, below the shelf, to the servo's case | 1.775 | (-22.23, 17.55, -2.00) |
| m3x8_screw:other_end_front's shank in the servo's tab hole | 0.550 | (-22.57, 26.09, 2.30) |
| m3x8_screw:other_end_front's tip, below the shelf, to the servo's case | 1.775 | (-22.23, 27.05, -2.00) |
| the horn adapter over the servo's case top | 1.699 | (12.90, 22.30, 11.90) |

## Tight gaps (under 0.5 mm)

| Between | Gap (mm) | Closest at (mm) |
|---|---|---|
| the servo's case in the bracket's cutout | 0.217 | (20.45, 12.30, -0.00) |

## Other gaps

| Parts | Gap (mm) | Closest at (mm) |
|---|---|---|
| m3x8_screw:output_end_back · m3x8_screw:output_end_front | 4.000 | (23.73, 20.30, 2.50) |
| m3x8_screw:other_end_back · m3x8_screw:other_end_front | 4.000 | (-23.73, 20.30, 2.50) |
| mg996r · cable_clip | 5.215 | (20.45, 12.30, -26.80) |
| horn_adapter · m3x8_screw:output_end_back | 6.400 | (21.00, 17.63, 11.90) |
| horn_adapter · m3x8_screw:output_end_front | 6.400 | (21.53, 25.44, 11.90) |
| servo_bracket · horn_adapter | 11.900 | (21.95, 22.30, 0.00) |
| m3x8_screw:output_end_back · cable_clip | 17.939 | (23.97, 16.58, -5.50) |
| horn_adapter · m3x8_screw:other_end_back | 20.301 | (-1.93, 20.62, 11.90) |
| horn_adapter · m3x8_screw:other_end_front | 20.301 | (-1.93, 23.98, 11.90) |
| m3x8_screw:output_end_front · cable_clip | 23.268 | (23.84, 26.06, -5.50) |
| horn_adapter · cable_clip | 34.766 | (18.73, 14.12, 11.90) |
| m3x8_screw:output_end_back · m3x8_screw:other_end_back | 41.950 | (20.98, 17.55, 2.50) |
| m3x8_screw:output_end_front · m3x8_screw:other_end_front | 41.950 | (20.97, 27.05, 2.50) |
| m3x8_screw:output_end_back · m3x8_screw:other_end_front | 42.892 | (21.03, 18.09, 2.50) |
| m3x8_screw:output_end_front · m3x8_screw:other_end_back | 42.892 | (21.03, 26.51, 2.50) |
| m3x8_screw:other_end_back · cable_clip | 49.826 | (-22.26, 17.23, -5.00) |
| m3x8_screw:other_end_front · cable_clip | 52.496 | (-22.34, 26.48, -5.00) |

## The horn through its travel

The horn adapter turned about the servo's output axis in 15 degree steps, against the bracket, the screws, the clip and the servo's case (not the spline it turns on).

| Angle (degrees) | Closest gap (mm) | Closest at (mm) | Overlap (mm³) |
|---|---|---|---|
| -60 | 1.699 | (11.43, 19.75, 11.90) | 0.000 |
| -45 | 1.699 | (12.04, 20.21, 11.90) | 0.000 |
| -30 | 1.699 | (12.50, 20.83, 11.90) | 0.000 |
| -15 | 1.699 | (12.80, 21.54, 11.90) | 0.000 |
| 0 | 1.699 | (12.90, 22.30, 11.90) | 0.000 |
| 15 | 1.699 | (12.80, 23.06, 11.90) | 0.000 |
| 30 | 1.699 | (12.50, 23.78, 11.90) | 0.000 |
| 45 | 1.699 | (12.04, 24.39, 11.90) | 0.000 |
| 60 | 1.699 | (11.42, 24.85, 11.90) | 0.000 |

Its closest approach is 1.699 mm. The adapter is round, so that gap is the same at every angle.

## How it was checked

- Every pair of parts: the exact overlap of their solids (`cad.build123d.overlap_volume`, mm³) and the least distance between them (`closest_points`, mm), in the mount model's own placements. Where a gap is the same at several places (the cutout's corners), "closest at" names one of them, on the first part named.
- An overlap above 0.01 mm³ is a collision unless it is a screw's thread in its tapped hole; parts closer than 0.0001 mm touch; a gap under 0.5 mm is tight. These limits are this check's own, chosen for this design.
- A fit behind a contact is measured on its own: the servo's case below the shelf's top face against the bracket, each screw's shank against the tab hole around it, each screw below the shelf against the servo's case, and the adapter against the servo below its case top.
- Not checked: the wall screws and the wall, which are not in the assembly; the servo's lead in the clip; and the servo's real case, which is modeled as the datasheet's envelope, so a real case has more room than this.
