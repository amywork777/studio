# Motor plate: strength under 50 N of belt tension

The motor plate holds 50 N of belt tension on the motor with a safety factor of 521: its stress peaks at 0.53 MPa, against 276 MPa yield for 6061-T6, at the inner end of the +X slot where the M5 screw is held. It passes, far over the safety factor of 2 it had to keep. A 6 mm plate is chosen for stiffness and for the motor's screws, not for strength.

## What was asked

A short strength check of the motor plate (`parts/motor_plate.step`) under the belt's pull on the motor, 50 N: does the plate hold it, and where is it most stressed.

## What was done

- A linear static study of the plate on its own (`studies/motor_plate.study.json`), solved by CalculiX 2.23 on text-to-cad 0.11 (`cad step solve parts/motor_plate.step --study studies/motor_plate.study.json --out studies/motor_plate`). The result is in `studies/motor_plate/`: the numbers in `result.json`, the coloured part in `result.glb` and its picture in `stress.png`.
- Material: 6061-T6 from text-to-cad's table: yield 276 MPa.
- Supports: the walls of both M5 slots held fixed, standing in for the two screws clamping the plate to the frame.
- Load: 50 N along -X, the way the belt pulls, spread over the walls of the pilot bore and the four M3 holes: the motor pushes on the plate through its pilot and its screws.
- Mesh: 38,599 quadratic tetrahedra at 1.5 mm, two elements and more through the 3 mm floor.
- Mesh check: the same study solved at text-to-cad's own 3.09 mm (8,282 elements) gave 0.5241 MPa at an M3 hole. At 1.5 mm the peak is 0.5293 MPa, 1.0 % higher, now at the slot's end; the answer is settled.
- Hand check: the 50 N shared over the bore and the holes by their wall area (209.2 and 4 x 32.0 mm²) puts 4.7 N on each M3 hole, bearing on 3.4 x 3 mm: 0.47 MPa, and 31 N on the bore, bearing on 22.2 x 3 mm: 0.47 MPa. The solve's 0.53 MPa peak is in line.

## Results

Positions are in the plate's frame: from the centre of its underside, X along the belt, Z up through the plate.

| Result | Value | Where |
| --- | --- | --- |
| Peak stress (von Mises) | 0.5293 MPa (0.4855 MPa at the elements' own points) | The inner end of the +X slot, on the underside, at a fixed face: (33.06, -1.95, 0) mm |
| Yield, 6061-T6 | 276 MPa | |
| Safety factor against yield | 521 | |
| Largest movement | 0.000114 mm | The pocket's floor beside the bore: (0, -11.1, 3) mm |
| Load and reaction | 50 N along -X; 50.0 N back at the slots | They balance |
| Findings | None; one note about the run: 199,236 degrees of freedom make a slow solve | |

![The motor plate's stress](motor_plate_strength.png)

Colours run from blue at 0 MPa to red at the 0.53 MPa peak, and the shape is drawn bent 54,000 times its true movement: the floor round the bore takes the most. This picture was drawn with text-to-cad 0.7 from an earlier solve of the same study, which gave the same numbers; the 0.11 solve's own is `studies/motor_plate/stress.png`.

## Verdict

It passes with a safety factor of 521 against the 2 the study asked for. For this load, held steady, the plate is strong enough as drawn and nothing has to change.

## What it assumes

- Linear static: the slot walls held rigidly (the peak sits at the edge of one, where a rigid hold reads high), the load steady.
- The belt's pull acts in the plate's plane. The pulley sits above the plate, so the real pull also tips the motor, a moment the motor's face carries into the plate: not studied.
- The two M5 screws hold the plate by their shanks in the slots. In use the plate is held by the screws' clamp, by friction, and slides if they are loose.
- Not studied: the motor's own weight, its torque reacting through the screws, vibration, repeated loads.

## What to do next

1. Once the pulley and the belt are chosen, study the pull at the belt's height, with its moment.
2. Tighten the M5 screws enough that the plate does not slide under the belt's pull (a torque to set with the frame's fixings).
