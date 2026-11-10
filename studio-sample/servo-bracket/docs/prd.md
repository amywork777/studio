# Servo bracket: product requirements

## Summary

A mounting bracket for an MG996R servo, bent from 2 mm 5052-H32 aluminium sheet. The servo sits in the bracket horn up, held by four M3 screws, and the bracket fixes to a wall with two M4 screws. A machined 6061-T6 adapter on the servo's output takes the load, and a printed PETG clip holds the servo's lead. It must hold 20 N at the servo horn. It is an example project to learn Studio with.

## The problem and who has it

An MG996R has to be held still, horn up, so it can turn a load. The bracket holds the servo, and the adapter goes on its output in place of the plastic horn, with four M3 holes to bolt an arm or a load to. The brief names no one beyond a person learning Studio: who will use the mount, and for what, is an open question.

## Users and use cases

- A person learning Studio opens the project to see each kind of work it makes.
- Whoever builds one orders the bracket from SendCutSend, machines the adapter, prints the clip and puts it together.
- In use, the bracket is screwed to a wall and the servo turns an arm or a load on the adapter through its 120°.
- The mount can also be simulated as a one-joint robot (`robots/servo_mount.urdf`).

## Requirements, each measurable, as must, should and could

Must:

- M1. Hold one MG996R servo horn up by its four tab holes, with M3 screws.
- M2. Hold 20 N down at the servo horn with a safety factor of at least 2 against yield.
- M3. Be bent from 2 mm 5052-H32 aluminium sheet, in one 90° bend.
- M4. Let the horn turn its whole 120°, 60° each way, without touching anything.

Should:

- S1. Be made by SendCutSend from a cut file, as drawn, with no changes.
- S2. Fix to a wall with two M4 screws.
- S3. Give the load four M3 holes on a Ø16 mm circle, on the horn's axis.
- S4. Hold the servo's lead in a clip on the bracket.

Could:

- C1. Be ordered from SendCutSend as a STEP file as well as a cut file.
- C2. Have its four holes tapped by SendCutSend.
- C3. Be described as a robot for ROS, MoveIt and Gazebo.

## Performance targets: loads, life, temperatures, cycles

- Load: 20 N down at the horn, held steady. The strength study gives 48.1 MPa at the peak, a safety factor of 3.73 and 0.141 mm of movement (`docs/servo_bracket_strength_report.md`).
- The servo's own: up to 0.92 N·m when it stalls, and 60° in 0.19 s, both at 4.8 V (Tower Pro). Not yet studied against the bracket.
- Life, cycles and temperatures: not set (open questions).

## Size, weight and interfaces

- Size: the bracket is 64 mm wide, its shelf 40 mm deep and its flange 32 mm high. The mount stands 51.9 mm from the flange's bottom edge to the adapter's top.
- Weight: 86.7 g with the servo's 55 g; the bracket alone 19.1 g.
- Wall: two Ø4.5 mm holes for M4 screws, 52 mm apart and 16 mm below the top of the shelf.
- Servo: a 41.5 × 20.6 mm cutout, and four M3 × 0.5 tapped holes 47.45 mm apart along the servo and 9.5 mm across.
- Load: the adapter's Ø24 mm top, 19.9 mm above the shelf, with four M3 tapped holes on a Ø16 mm circle. The horn's axis is 22.3 mm out from the wall, 9.95 mm from the middle of the bracket toward the servo's output.
- Lead: the clip's Ø4 mm channel, with a 2.6 mm opening.

## Safety and regulations

No standard or regulation is named for it (open question). The servo turns the adapter with up to 0.92 N·m when it stalls at 4.8 V.

## Cost target and volumes

Not set. The quantity is not decided, and no quote has been asked for; the SendCutSend check assumed one bracket.

## How success is measured

- The strength study passes with a safety factor of at least 2: now 3.73.
- The fit check finds no collision and the horn clears through 60° each way: now none, 1.7 mm at the closest.
- The bracket passes its sheet metal check and SendCutSend's preflight: both fail now on one count, the cut file's bend line, which is solid where SendCutSend asks for a dashed one.
- The clip passes its FDM check: it fails now, on thin lips and an open mesh.
- The first mount passes its test plan (`docs/servo_mount_test_plan.md`): not built yet.

## Out of scope

- Powering and driving the servo: its supply, controller and wiring. The project holds no electronics.
- The arm or load on the adapter, and the wall the bracket is fixed to.

## Milestones

- Done (2026-10-23): the parts and the mount modelled, the strength study, the fit check, the sheet metal and FDM checks, the cut file and its SendCutSend preflight, the adapter's CAM job, the bracket's drawing, pictures and a motion video, and the robot descriptions.
- Next, not dated: measure a servo, fix the clip, order the bracket, machine and broach the adapter, print the clip, then assemble and test.

## Open questions

- Who will use the mount, and what will the adapter carry: how heavy, how far from the axis, and how it moves?
- How many cycles must it last, and at what temperatures?
- Does a real MG996R match the tab holes (47.45 mm apart, 9.5 mm across) and output axis (10.5 mm from the end) the parts use, which its datasheet does not give?
- How many are wanted, and at what cost?
- Which wall, and which fixings?
- Does any standard apply?
