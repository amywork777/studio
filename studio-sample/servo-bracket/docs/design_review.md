# Servo mount: design review

## Purpose of the review

To see where the servo mount stands against its requirements (`docs/prd.md`, `docs/engineering_requirements.md`) before anything is ordered or made, and to settle what has to be decided first. Everything here is modelled and checked; nothing has been made or tested yet.

## The design as it stands, with pictures of its parts

![The servo mount from an angle: the bracket, the MG996R horn up in its cutout, the horn adapter on top, the screws on the servo's tabs and the cable clip on the flange](../pictures/servo_mount_angle.png)

![The servo mount taken apart: the horn adapter, the four M3 screws, the servo, the bracket and the cable clip](../pictures/servo_mount_exploded.png)

More views: [front](../pictures/servo_mount_front.png), [side](../pictures/servo_mount_side.png), [top](../pictures/servo_mount_top.png), [taken apart, from the side](../pictures/servo_mount_exploded_side.png), and the bracket's drawing (`drawings/servo_bracket_drawing.pdf`).

- Servo bracket (`parts/servo_bracket.step`): 2 mm 5052-H32 sheet with one 90° bend, at SendCutSend's inside radius of 0.965 mm for this sheet. It is 64 mm wide, with a 40 mm shelf and a 32 mm flange, and R3 outside corners. The shelf has a 41.5 × 20.6 mm cutout with R0.5 corners and four M3 × 0.5 tapped holes, 47.45 mm apart along the servo and 9.5 mm across. The flange has two Ø4.5 mm wall holes, 52 mm apart. It is cut flat at 64 × 69.094 mm.
- MG996R servo (`parts/mg996r.step`): modelled as its datasheet's envelope, a 40.9 × 20.0 mm case, 54 mm over its tabs and 42.7 mm to the top of its spline. Its tab holes and output axis are not in the datasheet: they come from a seller's measurement, an assumption and the datasheet's drawing, to be checked on a real servo.
- Horn adapter (`parts/horn_adapter.step`): 6061-T6, Ø24 × 8 mm. Its bore takes the servo's 25-tooth spline 4 mm deep, modelled at the spline's 5.9 mm. A Ø3.4 mm hole takes the horn screw, its head in a Ø6.5 × 2.5 mm counterbore, and four M3 × 0.5 tapped holes on a Ø16 mm circle take the load.
- Screws: four ISO 4762 M3 × 8 socket head cap screws, from step.parts.
- Cable clip (`parts/cable_clip.step`): PETG, on an 8 mm square base bonded to the flange, with a Ø4 mm channel, 1.6 mm walls and a 2.6 mm opening.
- The whole mount (`assemblies/servo_mount.step`) weighs 86.7 g, 55 g of it the servo.

## Requirements met, and not met

- Met in the models and checks: the servo's case fits its cutout (ER-1), it holds 20 N at the horn with a safety factor of 3.73 (ER-3), the sheet and its bend are as required (ER-4, ER-5), the horn turns its whole 120° touching nothing (ER-6), and the wall holes (ER-8), the load's holes (ER-9) and the robot descriptions (ER-13) are as required.
- Not met: the cut file is not ready for SendCutSend, as its bend line is solid where SendCutSend asks for a dashed one (ER-7), the cable clip fails its FDM check (ER-10), and the bracket cannot go to SendCutSend as a STEP until it is modelled at the sheet's 2.032 mm (ER-11).
- Open: the servo's hole spacing is assumed until a servo is measured (ER-2), and SendCutSend's hole size for tapping M3 is not known (ER-12).
- Not yet tested: nothing has been made, so the test plan (`docs/servo_mount_test_plan.md`) has not been run.

## Check and simulation results

| Check | Result | Report |
| --- | --- | --- |
| Strength, 20 N down at the horn | Passes: 48.1 MPa at the peak, at a corner of the cutout, against 179.3 MPa yield, a safety factor of 3.73. 0.141 mm of movement at most. | `docs/servo_bracket_strength_report.md` |
| Fit and clearance | No part collides. The tightest gap is 0.217 mm, the servo's case at the cutout's corners. The horn clears everything by 1.699 mm through its travel. | `assemblies/servo_mount_fit.md` |
| Sheet metal | The part passes every SendCutSend rule. Its cut file fails one: the bend line is solid, where SendCutSend asks for a dashed one. For review: the inside radius is under the general guides' 1 × thickness, the 1.725 mm web beside each tapped hole is under their 2.0 mm, and ±1° of bend moves the shelf's edge up to 0.70 mm. The grain direction is unverified. | `parts/servo_bracket_sheet_metal.md` |
| SendCutSend preflight | Needs edits before upload: the cut file's bend line is solid, and SendCutSend asks for a dashed one in a DXF, which text-to-cad's DXF export can't yet write. Every other check passes, in ALU-080 with one bend. The STEP is not ready either: it is 2.000 mm against the sheet's 2.032 mm. Nothing was uploaded or ordered. | `cut/servo_bracket_sendcutsend.md` |
| FDM printing, the cable clip | Fails on one count: the channel's lips narrow to 0.36 mm, where a wall that stands free needs 1.6 mm. Its STL, exported again on text-to-cad 0.8 (2026-10-27), is watertight. No supports needed; it prints standing up. | `parts/cable_clip_fdm.md` |
| CAM job, the horn adapter | Planned again on text-to-cad 0.11 with FreeCAD 1.1.1 (2026-11-08): ready to cut, 6 operations in 2 setups on a 3-axis mill, about 5 min with its 5 tool changes. The bore is pocketed from the bottom with a 1 mm end mill and the counterbore from the top with a 1.5 mm one, the rings round the Ø3.4 hole being too narrow for larger; the outline is cut free into a sacrificial plate. Every tool is held to the machine's 10,000 rpm, so they cut slower than the table asks. The M3 holes are tapped and the edges broken by hand, and the spline is broached after. | `cam/horn_adapter/result.json` |
| Robot descriptions | The URDF, SRDF and SDF all validate, strict. | `robots/servo_mount.urdf` |

![The servo bracket's stress from above, with the wall at the bottom: the peak at the cutout's corner nearest the wall at the output end](servo_bracket_strength_top.png)

## Risks

From the FMEA (`docs/fmea.md`), highest first:

- The adapter's spline (160): no job plans its broaching and no drawing gives its fit, so the adapter could slip or come off.
- The tapped M3 threads (140): 2 mm of aluminium holds only 4 turns of thread, and no torque is set.
- The servo's own torque (140): up to 0.92 N·m reacts through the bracket, and it has not been studied.
- The wall fixing (not rated, severity 8): not chosen, and the only failure that drops the whole mount.
- The servo's hole spacing (60): assumed, and every hole in the bracket follows it.

## Decisions needed

1. Measure a real MG996R before the bracket is ordered, or accept the hole spacing and output axis the parts use.
2. Order the bracket as the cut file once its bend line is dashed, which text-to-cad can't yet write, or remodel it at 2.032 mm so it can go as a STEP, which needs no bend line.
3. Tap the four holes by hand, as planned, or have SendCutSend tap them once its hole size for M3 is known.
4. Fix the cable clip now, as its FDM check says, which means building the clip, the mount and its fit check again.
5. Decide who broaches the adapter's spline, and to what size and fit.
6. Choose the clip's adhesive, the wall's fixings and the screws' tightening torque.
7. Say what the adapter will carry, so its torque and side loads can be studied.

## Actions, with owners

No one is named for any action yet: each owner is an open question.

| Action | Owner | Status |
| --- | --- | --- |
| Measure an MG996R's tab holes, output axis, case and spline (test plan 1) | Not assigned | Open |
| Make the cut file's bend line dashed: its BEND layer is solid, SendCutSend asks for a dashed bend line in a DXF, and text-to-cad's DXF export can't write one; or send the bracket as a STEP at 2.032 mm (ER-7, ER-11) | Not assigned | Open |
| Round the clip's lips, thicken its wall to 2.0 mm, and check it again; then slice it in PETG at 0.2 mm | Not assigned | Open |
| Plan the spline's broaching and draw the adapter with its fits | Not assigned | Open |
| Play the adapter's CAM job in the Viewer and check the counterbore and the top are cut clean: the plan of 2026-11-08 finds every face it names cut; add a pass if metal stays | Not assigned | Open |
| Set the M3 screws' tightening torque | Not assigned | Open |
| Study the servo's stall torque reacting through the bracket | Not assigned | Open |
| Choose the wall fixings and the clip's adhesive | Not assigned | Open |
| Ask SendCutSend whether the bend's grain direction matters | Not assigned | Open |
| Order the bracket, machine the adapter, print the clip, assemble and run the test plan | Not assigned | Waiting on the actions above |
