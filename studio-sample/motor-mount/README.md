# Motor mount plate (example)

## What it is

A plate milled from 6061-T6 aluminium that mounts a NEMA 17 stepper motor to a frame: an example project to learn Studio with. The motor sits under the plate, its 22 mm pilot in the plate's bore and its shaft up through it to a belt pulley, held by four M3 screws on its 31 mm square whose heads sit flush in a pocket on top. Two M5 screws through slots at the plate's ends fix it to the frame, and the slots give 10 mm of travel to tension the belt. It is 110 x 56 x 6 mm and weighs 76.3 g. It holds 50 N of belt tension with a safety factor of 521, and it is machined on a 3-axis mill in one setup, in 5 minutes by its CAM program. Its requirements are on the model itself, as 3D PMI (a model-based definition): datums on its underside and two sides, the bore, the M3 holes and the slots sized and positioned, the underside's flatness, the thickness and the pocket's depth, and a general profile for every other face, exported in its AP242 STEP.

## Decisions

- Mill the plate from 6061-T6 on a 3-axis mill, in one or two setups from stock (2026-10-26, asked)
- Make it 110 x 56 x 6 mm, from a 116 x 62 x 10 mm blank of 10 mm plate (2026-10-26, assumed)
- Hang the motor under the plate and bring its shaft up through it, so the pulley sits above the plate and the frame meets the plate's underside at its ends (2026-10-26, assumed)
- Bore the pilot Ø22.2 mm, 0.2 mm over the 22 mm pilot NEMA 17 datasheets give; step.parts' simplified motor draws a smaller pilot, 17.8 mm, so check the bought motor (2026-10-26, assumed)
- Use step.parts' NEMA 17 with a 40 mm body as the reference motor, and its ISO 4762 M3 x 6 socket head screws: they sit flush with the top and take 3 mm of the motor's thread (2026-10-26, assumed)
- Clear the motor's M3 screws at Ø3.4 and the frame's M5 screws with 5.5 mm slots, ISO 273 medium; the slots 80 mm apart along the belt with 10 mm of travel (2026-10-26, assumed)
- Pocket the top 46 mm square and 3 mm deep round the screw heads, leaving a 3 mm floor, to save weight (2026-10-26, assumed)
- Round the pocket's corners R5, over the 6 mm cutter's R3, and the outline's corners R5; leave the pocket's floor sharp to its walls; chamfer the outline's top and bottom edges 0.5 mm (2026-10-26, assumed)
- Plan the CAM for a Tormach 1100MX on LinuxCNC, with three proposed tools and flood coolant, in one setup on a sacrificial plate; cut the pilot bore and the slots by hand, since text-to-cad's 3-axis CAM then cut no through bore or slot (2026-10-28, assumed)
- Check the machining on the pocket wall's finishing pass, the plate held by its two long sides: it passes (2026-10-26, assumed)
- Check the strength with 50 N along the belt on the pilot bore and the M3 holes, the slots held fixed: it passes with a safety factor of 521 (2026-10-26, asked)
- Draw it on one A3 sheet at 1:1, its holes and slots in a hole table, under ISO 2768-m, as a prototype (2026-10-26, assumed)
- Give the plate 3D PMI and export it as AP242 with it, the CNC part being where tolerances matter (2026-10-27, asked)
- Make the underside datum A, the face the motor and the frame both seat on; the front long side datum B and the left end datum C, the edges a machinist squares the blank to (2026-10-27, assumed)
- Hold the underside flat within 0.05 mm: a faced 110 x 56 mm surface on a 3-axis mill holds it, and the motor's face seats on it (2026-10-27, assumed)
- Size the pilot bore Ø22.2 +0.1/0, so the 22 mm pilot always drops in and never more than 0.3 mm loose, and position it within Ø0.1 to A|B|C (2026-10-27, assumed)
- Size the M3 holes Ø3.4 +0.1/0, as drilled, and position them within Ø0.2 to A|B|C: half the 0.4 mm between the hole and the 3 mm screw, the motor's holes being tapped (2026-10-27, assumed)
- Size the slots' ends Ø5.5 +0.1/0 and position them within Ø0.5 to A|B|C: the 0.5 mm between the slot and the 5 mm screw, the frame's holes clearing it (2026-10-27, assumed)
- Locate the bore, the holes and the slots' ends by basic dimensions from B and C, the true positions the model draws (2026-10-27, assumed)
- Profile datum B within 0.1 to A and datum C within 0.1 to A|B, so the frame the others are measured in is square (2026-10-27, assumed)
- Hold every other face in a general profile of 0.5 to A|B|C (Note 1): ±0.25, a little inside the drawing's ISO 2768-m at the plate's 30 to 120 mm sizes (±0.3), which the mill holds (2026-10-27, assumed)
- Tolerance the 6 mm thickness and the pocket's 3 mm depth ±0.1, ISO 2768-m's at those sizes, where the general profile alone would allow ±0.25: the model then agrees with the drawing's general tolerance (2026-10-27, assumed)
- Hold every position regardless of feature size: the PMI calls take no material condition modifier (MMC), and a position held at every size is the stricter, safe reading (2026-10-27, assumed)
- Size the slots by their ends, Ø5.5 +0.1/0; the slots' straight walls fall under the general profile (2026-10-27, assumed)
- Note "Deburr the holes and slots.", the drawing's own words, as Note 2 (2026-10-27, assumed)
- Name two views: Section A-A through the bore, with the thickness, the pocket's depth, the bore and datum A's flatness, and Top, with every hole's and slot's size and position; the basic dimensions that locate the M3 holes and the slots' ends are in neither, so Top stays legible (the viewer lists them in its PMI section, and the STEP carries them) (2026-10-27, assumed)
- Cut the pilot bore and the belt slots in the CAM program, with a 4 mm end mill added for the slots, no longer by hand (2026-10-28, assumed)
- Give the CAM job's tools the T numbers, shank sizes and drill point angle text-to-cad 0.11 asks for: T1 to T4 as their ids, each end mill's shank its own diameter, the drill's point 118°, all proposed like the tools (2026-11-09, asked)

## Open actions

- Measure the bought motor's pilot before the plate is cut: the bore is sized for 22 mm, and step.parts' model has a 17.8 mm one. The PMI gives the bore Ø22.2 +0.1/0 (assumed); the drawing still states it under ISO 2768-m alone, where it may come out 22.0 mm, line to line with the pilot.
- Check every PMI value with the shop that will cut it and the inspector who will measure it: each one is assumed for a NEMA 17 plate, none was given.
- Prove the CAM program on the machine before cutting: single block, feed override low, in air first. It has not been run, and its tools, stickouts and the tape's hold are proposed or assumed.
- Chamfer or deburr every edge by hand: the CAM program cuts no chamfer (`cam/motor_plate_cam.md`).
- The drawing's report lists four chamfers "3.54 x 45°" as not stated: they are the 0.5 mm outline chamfer running round the R5 corners, which note 3 states and the report misreads.
- Study the belt's pull at the pulley's height once the pulley is chosen: the moment it puts on the motor's face is not in the strength study.
- Choose the frame and the M5 screws' tightening torque, so the plate does not slide under the belt.

## In this project

- The models: [the motor plate](parts/motor_plate.py), [the NEMA 17 motor](parts/nema17.py) and [the motor mount](assemblies/motor_mount.py), with [the models' catalog](parts/README.md).
- Their STEP files, from [`exports.py`](exports.py): [the motor plate](parts/motor_plate.step), AP242 with its PMI, [the motor](parts/nema17.step) and [the mount](assemblies/motor_mount.step).
- The checks: [geometry](checks/motor_plate_geometry.md), [3D PMI](checks/motor_plate_pmi.md), [fit](checks/motor_mount_fit.md), [strength](docs/motor_plate_strength_report.md) and [the CNC machining review](docs/motor_plate_dfm.md) with [its measurements](checks/motor_plate_dfm_measure.md).
- Making it: [the CAM job](cam/motor_plate/result.glb) and [its program](cam/motor_plate_cam.md), with [its LinuxCNC G-code](cam/motor_plate/motor_plate.top.ngc), and [the plate's drawing](drawings/motor_plate_drawing.pdf).
- The documents: [PRD](docs/prd.md).
- Pictures: [the mount](pictures/motor_mount_angle.png), [from below](pictures/motor_mount_below.png), [the plate's PMI, its Top view](pictures/motor_plate_pmi.png) and [the toolpaths](pictures/motor_plate_cam.png).
