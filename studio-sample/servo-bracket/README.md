# Servo bracket (sample)

## What it is

A mounting bracket for an MG996R servo, bent from 2 mm 5052-H32 aluminium sheet: a sample project to learn Studio with. The servo drops into the bracket's shelf horn up and is held by four M3 screws, and the bracket's flange fixes it to a wall with two M4 screws. A machined 6061-T6 adapter on the servo's output takes the load, and a printed PETG clip holds the servo's lead. It must hold 20 N at the servo horn, and its strength study passes with a safety factor of 3.73. The bracket is laser cut and bent by SendCutSend from its cut file.

## Decisions

- Bend the bracket from 2 mm 5052-H32 sheet as an L: the servo drops into a cutout in its shelf, horn up, and its flange fixes to a wall with two M4 screws (2026-10-23, asked)
- Draw the bend at SendCutSend's inside radius for this sheet, 0.965 mm, and develop the flat pattern with their K-factor of 0.48 (2026-10-23, asked)
- Model the MG996R from its datasheet, with tab holes 47.45 mm apart and 9.5 mm across and its output axis 10.5 mm from the end of the case, which the datasheet does not give, to be checked on a real servo (2026-10-23, asked)
- Hold the servo with four ISO 4762 M3 × 8 socket head screws from step.parts, in holes tapped M3 × 0.5 in the shelf (2026-10-23, asked)
- Put a 6061-T6 adapter on the servo's output in place of its plastic horn, with four M3 holes on a Ø16 mm circle for the load (2026-10-23, asked)
- Print a PETG clip, bonded to the flange, to hold the servo's lead (2026-10-23, asked)
- Check the strength with 20 N down at the horn, through the servo's four screws, with the wall holes fixed: it passes with a safety factor of 3.73 (2026-10-23, asked)
- Order the bracket from SendCutSend as its cut file, in 0.080 in 5052-H32 (ALU-080), laser cut and bent, and tap its four holes by hand after bending (2026-10-23, asked)
- Machine the adapter on a 3-axis mill in two setups from a 28 × 28 × 9 mm block, and broach its spline afterwards (2026-10-23, asked)
- Keep the clip as drawn for now: its FDM check's two failures stay open actions (2026-10-23, asked)
- Plan the adapter's CAM job again with FreeCAD, which text-to-cad's CAM plans with: the bore from the bottom first, then the top faced, its counterbore and holes cut, and the outline cut free into a sacrificial plate; tap the M3 holes and break the edges by hand, since it plans no tapping or chamfer (2026-10-28, assumed)
- Give the CAM job's tools the T numbers, shank sizes and drill point angles text-to-cad 0.11 asks for: T1 to T6 as their ids, the 6 mm end mill's shank 6 mm and the 1.5 and 1 mm end mills' 3 mm, both drills' points 118°, all proposed like the tools (2026-11-09, asked)
- Describe the mount as a robot with one joint, the horn turning 60° each way, for ROS, MoveIt and Gazebo (2026-10-23, asked)

## Open actions

- Measure a real MG996R before the bracket is ordered: its tab holes, output axis, case and spline. The bracket's holes and cutout follow them.
- Make the cut file's bend line dashed before it is uploaded: its BEND layer is solid, SendCutSend asks for a dashed bend line in a DXF, and text-to-cad's DXF export can't write one. Or send the bracket as a STEP at the sheet's 2.032 mm, which needs no bend line.
- Fix the cable clip before it is printed: round its lips, thicken its wall from 1.6 to 2.0 mm and check it again (its STL, exported again on text-to-cad 0.8, is now watertight), then slice it in PETG at 0.2 mm.
- Have the horn adapter's 25-tooth spline broached after milling: its CAM job cuts the bore round, at the spline's 5.9 mm.
- To send SendCutSend the STEP as well as the cut file, remodel the bracket at the sheet's 2.032 mm and run its flat pattern, cut file and strength study again.
- Study the servo's own torque, up to 0.92 N·m when it stalls at 4.8 V, reacting through the bracket.
- Choose the clip's adhesive, the wall's fixings and the M3 screws' tightening torque.
- On the first bracket, check the bend (±1° moves the shelf's front edge up to 0.70 mm) and the 1.725 mm web beside each tapped hole after tapping.

## In this project

- The models: [the servo bracket](parts/servo_bracket.py), [the horn adapter](parts/horn_adapter.py), [the cable clip](parts/cable_clip.py) and [the servo mount](assemblies/servo_mount.py), its `horn` joint and its `range` motion, with [the models' catalog](parts/README.md).
- Their files, from [`exports.py`](exports.py): [the servo bracket's STEP](parts/servo_bracket.step), [the horn adapter's](parts/horn_adapter.step), [the cable clip's](parts/cable_clip.step) and [the servo mount's](assemblies/servo_mount.step).
- The checks: [strength](docs/servo_bracket_strength_report.md), [fit and clearance](assemblies/servo_mount_fit.md), [sheet metal](parts/servo_bracket_sheet_metal.md) and [the clip's FDM check](parts/cable_clip_fdm.md).
- Making it: [the cut file](cut/servo_bracket_cut.dxf) and [its SendCutSend preflight](cut/servo_bracket_sendcutsend.md), [the adapter's CAM job](cam/horn_adapter/result.glb) and [the bracket's drawing](drawings/servo_bracket_drawing.pdf).
- The documents: [PRD](docs/prd.md), [engineering requirements](docs/engineering_requirements.md), [FMEA](docs/fmea.md), [design review](docs/design_review.md), [parts list](docs/servo_mount_parts_list.md), [assembly instructions](docs/servo_mount_assembly_instructions.md) and [test plan](docs/servo_mount_test_plan.md).
- Pictures and the robot: [pictures from every side](pictures/servo_mount_angle.png), [the motion video](pictures/servo_mount_motion.mp4) (recorded with text-to-cad 0.7: 0.8 and later record no video, and the viewer's Motion plays the mount's `range` motion), and [the robot description](robots/servo_mount.urdf) with its [SRDF](robots/servo_mount.srdf) and [SDF](robots/servo_mount.sdf).
