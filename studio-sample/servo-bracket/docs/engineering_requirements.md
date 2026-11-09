# Servo bracket: engineering requirements

Thirteen requirements, each traced to a line of the PRD (`docs/prd.md`) and verified by analysis, test or inspection. Eight are met in the models and checks, one waits on a real servo, one on SendCutSend, and three are not met: the cut file's bend line, the cable clip and a STEP upload. None has been tested on a real part yet.

## A table of requirements: ID, requirement, target and tolerance, where it comes from (the PRD's line), how it is verified (analysis, test or inspection), and its status

| ID | Requirement | Target and tolerance | Where it comes from | How it is verified | Status |
| --- | --- | --- | --- | --- | --- |
| ER-1 | The servo's case fits the cutout | A 40.9 × 20.0 mm case in a 41.5 × 20.6 mm cutout: 0.3 mm a side. Cuts ±0.127 mm. | PRD M1 | Analysis: the fit check. Test: test plan 1 and 4. | Met in the model: no collision, 0.217 mm at the tightest, at the cutout's corners. |
| ER-2 | The servo's screw holes | Four M3 × 0.5 tapped holes, 47.45 mm apart along the servo and 9.5 mm across. Cuts ±0.127 mm. | PRD M1 | Inspection: the drawing. Test: test plan 1, 2 and 3. | Open: the spacing is assumed, not from the datasheet. |
| ER-3 | Strength | 20 N down at the horn, held steady, with a safety factor of at least 2 against 179.3 MPa yield. | PRD M2 | Analysis: the strength study. Test: test plan 6. | Met by analysis: 48.1 MPa, a safety factor of 3.73. |
| ER-4 | The sheet | 5052-H32 aluminium, 0.080 in ±0.005 in (1.905 to 2.159 mm). The model is 2.000 mm. | PRD M3 | Inspection. | Met: 2.000 mm is inside the sheet's tolerance. |
| ER-5 | The bend | One 90° bend ±1°, inside radius 0.965 mm, SendCutSend's for this sheet. | PRD M3 | Analysis: the sheet metal check. Test: test plan 2. | Met in the model. |
| ER-6 | The horn's travel | 120°, 60° each way, touching nothing. | PRD M4 | Analysis: the fit check's sweep of the travel. Test: test plan 5. | Met in the model: 1.699 mm at the closest, at every angle. |
| ER-7 | Made by SendCutSend as drawn | Every rule of SendCutSend's ALU-080 for cutting and bending. | PRD S1 | Analysis: the sheet metal check and the SendCutSend preflight. | Not met: the cut file's bend line is solid, and SendCutSend asks for a dashed one in a DXF, which text-to-cad's DXF export can't yet write. Every other rule passes. |
| ER-8 | The wall holes | Two Ø4.5 mm holes for M4, 52 mm apart, 16 mm below the top of the shelf. Cuts ±0.127 mm, bend to edge ±0.381 mm. | PRD S2 | Inspection: the drawing. Test: test plan 2. | Met in the model. |
| ER-9 | The load's holes | Four M3 × 0.5 tapped holes on a Ø16 mm circle, in a Ø24 × 8 mm 6061-T6 adapter on the horn's axis. Tolerance not set. | PRD S3 | Inspection. | Met in the model, and its CAM job is planned. The spline in its bore is to be broached, which no job plans yet. |
| ER-10 | The lead clip | A Ø4 mm channel with a 2.6 mm opening. Walls at least 1.2 mm, and 1.6 mm where they stand free. | PRD S4 | Analysis: the FDM check. Test: test plan 7. | Not met: the channel's lips narrow to 0.36 mm at the thinnest. |
| ER-11 | A STEP upload to SendCutSend | The model at the sheet's own 2.032 mm, with SendCutSend's bend. | PRD C1 | Analysis: the SendCutSend preflight. | Not met: the model is 2.000 mm. |
| ER-12 | Tapping by SendCutSend | M3 × 0.5 in its tapping range, the holes at its size for that tap. | PRD C2 | Analysis: the SendCutSend preflight. | Open: its hole size for an M3 tap is not in its specs. |
| ER-13 | Robot descriptions | A URDF, SRDF and SDF that validate. | PRD C3 | Analysis: text-to-cad's validators (`cad urdf validate`, `cad srdf validate`, `cad sdf validate`). | Met: all three validate, strict. |

The tolerances are SendCutSend's for ALU-080, as the drawing's general tolerance gives them (`drawings/servo_bracket_drawing.pdf`).

## Interfaces

- Wall: the flange's back flat on the wall, held by two M4 screws through Ø4.5 mm holes, 52 mm apart, 16 mm below the top of the shelf and 6 mm in from the flange's sides.
- Servo: its tabs on the top of the shelf, held by four ISO 4762 M3 × 8 socket head screws in tapped holes; its case through the cutout, whose back edge is 12 mm from the wall face. Its output axis is 22.3 mm out from the wall, 9.95 mm from the middle of the bracket toward the output end.
- Load: the adapter on the servo's 25-tooth spline, held by the servo's M3 horn screw. Its top face, 19.9 mm above the shelf, has four M3 × 0.5 holes on a Ø16 mm circle.
- Lead: the clip on the flange's front face, 1 mm in from its side at the output end and 2 mm up from its bottom edge.
- Robot: one revolute joint about the horn's axis, ±60° (±1.047 rad), 0.92 N·m and 5.51 rad/s at 4.8 V, with a tool frame on the adapter's top face (`robots/servo_mount.urdf`).

## Environment

Not set: where the mount is used, its temperatures, humidity and vibration, and how many cycles it must last. The strength study assumes a steady load and takes no account of temperature.

## Standards

- ISO 4762 for the M3 × 8 socket head cap screws.
- Metric M3 × 0.5 and M4 threads.
- The drawing: third-angle projection, millimetres, A3.
- The sheet, its bend and its tolerances follow SendCutSend's specs for ALU-080, the shop's rules.
- The materials by alloy and temper: 5052-H32 for the bracket, 6061-T6 for the adapter.
- The robot descriptions: URDF, SRDF and SDFormat 1.12, with the frames of REP-103 except its +X forward, an exception the URDF records.
- No product standard is named (open question).

## Open questions

- What tolerances does the horn adapter need, which has no drawing yet: the spline's fit, and the holes' positions?
- What torques for the M3 screws and the horn screw?
- Where is the mount used, at what temperatures, and for how many cycles?
- Does any product standard apply?
- Does a real MG996R match the tab holes and output axis the parts use, which its datasheet does not give?
