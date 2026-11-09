# Motor mount plate: product requirements

## Summary

A plate milled from 6061-T6 aluminium that holds a NEMA 17 stepper motor to a frame and lets it slide to tension a belt. The motor sits under the plate, located by its pilot in the plate's bore and held by four M3 screws on its 31 mm square; two M5 screws through slots at the plate's ends fix it to the frame. A pocket in the top saves weight and sinks the screw heads flush. It is machined on a 3-axis mill in two setups. It is a sample project to learn Studio with.

## The problem and who has it

A stepper driving a belt (a 3D printer's or a small gantry's axis) must be held square to the belt and moved along it to tension it, then clamped. The plate does both. The brief names no machine or person beyond someone learning Studio: what the motor drives, and on what frame, is an open question.

## Users and use cases

- A person learning Studio opens the project to see a CNC part taken from its model to its G-code.
- A machinist mills the plate from the drawing and the CAM program.
- Whoever builds it screws the motor under the plate, puts the plate on the frame with two M5 screws, pulls it back along the slots until the belt is tight, and tightens the screws.

## Requirements, each measurable, as must, should and could

Must:

- M1. Hold one NEMA 17 stepper by its four M3 holes on a 31 mm square, its 22 mm pilot located in the plate's bore.
- M2. Hold 50 N of belt tension on the motor with a safety factor of at least 2 against yield.
- M3. Let the motor slide 10 mm along the belt on two M5 screws, and clamp there.
- M4. Be milled from 6061-T6 on a 3-axis mill, in no more than two setups.

Should:

- S1. Save weight with a pocket, and sink the M3 screw heads below the top face.
- S2. Have every inside corner at a radius a stock end mill cuts, and break every outside edge.
- S3. Come with a drawing a shop can quote from, and a program for a common controller.

Could:

- C1. Take a motor of any NEMA 17 body length.
- C2. Be cut on a hobby mill running GRBL (`cad step plan` with a job whose `machine.post` is `grbl`).

## Performance targets: loads, life, temperatures, cycles

- Load: 50 N along the belt, held steady. The strength study gives 0.53 MPa at the peak, a safety factor of 521 and 0.000114 mm of movement (`docs/motor_plate_strength_report.md`).
- Life, cycles, vibration and temperatures: not set (open questions).

## Size, weight and interfaces

- Size: 110 x 56 x 6 mm, outside corners R5, both outline edges chamfered 0.5 mm.
- Weight: 76.3 g in 6061-T6 (`checks/motor_plate_geometry.md`).
- Motor: a Ø22.2 mm pilot bore on the plate's centre, and four Ø3.4 mm holes on a 31 mm square for M3 screws, in the floor of a 46 mm square pocket 3 mm deep with R5 corners. M3 x 6 socket head screws sit flush with the top and take 3 mm of the motor's thread.
- Frame: two 5.5 mm slots for M5 screws, 80 mm apart along the belt, each giving 10 mm of travel. The frame must clear the motor's 42.3 mm square body under the plate's middle.
- Belt: the motor's shaft comes up through the bore, 8.8 mm above the plate's top on the step.parts model, for a pulley.

## Safety and regulations

No standard or regulation is named for it (open question).

## Cost target and volumes

Not set. One prototype is assumed; no quote has been asked for.

## How success is measured

- The strength study passes with a safety factor of at least 2: now 521.
- The CAM program is ready to cut with no errors: now it is, with three warnings, each a tool's speed held to the spindle's 10,000 rpm (`cam/motor_plate_cam.md`).
- The DFM review finds no failure: now none, two items to review (`docs/motor_plate_dfm.md`).
- The first plate takes a real motor and tensions a belt: not made yet.

## Out of scope

- The frame, the belt, the pulley and the motor's driver and wiring.

## Milestones

- Done (2026-10-26): the plate and the mount modelled, the motor from step.parts, the geometry and fit checks, the CAM program, the DFM review, the strength study and the drawing.
- Next, not dated: measure a bought motor's pilot, set the bore's tolerance, choose the frame and pulley, prove the program, mill the first plate.

## Open questions

- What does the motor drive, on what frame, and with which pulley and belt?
- Is the bought motor's pilot 22 mm, as datasheets give, and what tolerance should the bore carry?
- What belt tension does the axis really need, and does the pulley's height above the plate matter to the plate?
- How many are wanted, and at what cost?
- Which mill and tools will cut it, and does it need a finish (anodising)?
