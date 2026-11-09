# Servo bracket: strength under 20 N at the horn

The servo bracket holds 20 N down at the servo horn with a safety factor of 3.73: its stress peaks at 48.1 MPa, against 179.3 MPa yield for 5052-H32, at a corner of the servo cutout. It passes, well over the safety factor of 2 it had to keep.

## What was asked

A strength check of the servo bracket (`parts/servo_bracket.step`) with a 20 N load at the servo horn: does the 2 mm 5052-H32 bracket hold it, where is it weakest, and what should change.

## What was done

- A linear static study of the bracket on its own (`studies/servo_bracket.study.json`), solved by CalculiX 2.23 on text-to-cad 0.11 (`cad step solve parts/servo_bracket.step --study studies/servo_bracket.study.json --out studies/servo_bracket`). The result is in `studies/servo_bracket/`: the numbers in `result.json`, the coloured part in `result.glb` and its picture in `stress.png`.
- Material: 5052-H32 at SendCutSend's figures: Young's modulus 68,258 MPa, Poisson's ratio 0.33, yield 179.3 MPa.
- Supports: the two M4 wall-screw holes are held fixed, and the flange's back rests on the wall, free to slide along it.
- Load: 20 N straight down, through the four holes the servo is screwed to. The horn's axis is 9.95 mm from the middle of those holes, toward the servo's output end, so the 20 N is shared by the lever rule to act on that axis: 14.194 N on the two holes at the output end and 5.806 N on the other two.
- Mesh: 51,621 quadratic tetrahedra at 2.05 mm, made finer, 0.17 mm, within 2 mm of the cutout's two corners nearest the wall, where the stress peaks.
- Mesh check: the same study solved at 2.05 mm throughout (10,366 elements) gave a 46.9 MPa peak. The finer corners moved it 2.5%, under the 10% at which the answer would be in doubt.
- Hand check: the strip of shelf beside the cutout at the output end carries 14.2 N about 10.3 mm from the cutout's edge nearest the wall, 146 N·mm on an 11.25 × 2 mm section, or about 19.5 MPa. A corner of R0.5 raises that about 2.5 to 3 times, to 50 to 58 MPa, a little over the solve's 48.1 MPa.

## Results

Positions are in the bracket's frame: from the outside corner of the bend, halfway along it, with Y out from the wall and Z up.

| Result | Value | Where |
| --- | --- | --- |
| Peak stress (von Mises) | 48.1 MPa (46.3 MPa at the elements' own points) | The top of the shelf at the cutout's corner nearest the wall, at the output end: (20.71, 12.31, 0) mm |
| Yield, 5052-H32 | 179.3 MPa | |
| Safety factor against yield | 3.73: the peak is 0.27 of yield | |
| Largest movement | 0.141 mm | The front edge of the shelf, by its corner at the output end: (29, 40, 0) mm |
| Load and reaction | 20 N down; 20.0 N up at the wall holes | They balance |
| Findings | None; one note about the run: 234,063 degrees of freedom make a slow solve | |

![The servo bracket's stress, seen from the wall side](servo_bracket_strength.png)

The bracket from the wall side. Colours run from blue at 0 MPa through cyan, green and yellow to red at the 48.1 MPa peak, and the shape is drawn bent 29 times its true movement. These two pictures were drawn with text-to-cad 0.7 from an earlier solve of the same study, which gave the same numbers; the 0.11 solve's own is `studies/servo_bracket/stress.png`.

![The servo bracket's stress, from above](servo_bracket_strength_top.png)

From above, the wall at the bottom: the stress gathers at the cutout's two corners nearest the wall. The brighter one is at the output end, on the right, where 14.2 N of the 20 N comes in.

## Verdict

It passes. The peak, 48.1 MPa, is 0.27 of the 179.3 MPa yield, a safety factor of 3.73 against the 2 the study asked for. For this load, held steady, the bracket is strong enough as drawn and nothing has to change.

## What it assumes

- The holes and the wall are rigid, and the load is steady and small enough to move the bracket only a little (linear static).
- The servo passes the 20 N to the bracket only through its four screws.
- The servo's tab holes (47.45 mm apart) and its output axis (10.5 mm from the end of the case) are not in its datasheet: the spacing is assumed, and the axis is scaled from the datasheet's drawing. They set where the load comes in.
- The bracket is 2.000 mm thick, and SendCutSend's sheet is 2.032 mm. Thicker sheet would lower the stress about 3%.
- Not studied: a sideways push on the horn, the moment of an arm on the adapter, the servo's own torque reacting through the bracket (up to 0.92 N·m when it stalls at 4.8 V), repeated loads, and heat.

## What to do next

1. Measure a real MG996R's tab holes and output axis. If they differ, rebuild the bracket and solve again.
2. Study the servo's stall torque, and the side loads of whatever the adapter carries once that is known.
3. If the bracket is remodelled at 2.032 mm for a STEP upload to SendCutSend, solve again.
4. Load the first bracket as the test plan says (`docs/servo_mount_test_plan.md`, test 6).
