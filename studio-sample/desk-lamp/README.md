# Desk lamp (example)

## What it is

A small desk lamp printed in PETG, an example project to learn Studio with. A round base with a 499 g steel weight bonded underneath stands on the desk; one arm turns on a hinge at the base, and a head holding a Ø40 mm LED module turns on a hinge at the arm's end. Each hinge is an M5 × 30 socket head screw and a nylon insert locknut (both from step.parts) through two cheeks that clamp the arm, so it holds where it is set. The fit check finds nothing colliding at rest; the arm tilts clear from 10 to 191 degrees up from the desk and the head 46 degrees down to 175 up, and at the worst pose the lamp's balance point is 26.2 mm inside its base's edge.

## Decisions

- Build a small desk lamp of about 5 to 8 kinds of parts: a weighted base, an arm on a hinge that tilts and holds its position, a head with an LED module, and bought screws from step.parts to join them (2026-10-26, asked)
- Make the base, the arm and the head in PETG, printed on a Bambu Lab printer, and the weight a Ø90 × 10 mm mild steel disc bonded into a pocket under the base (2026-10-26, assumed)
- One arm, 200 mm between its hinges, at rest 55 degrees up from the desk with the head hanging level (2026-10-26, assumed)
- Make both hinges the same joint: an ISO 4762 M5 × 30 screw and an M5 nylon insert locknut through two 5 mm cheeks 10.2 mm apart, clamping the 10 mm arm, with no washers (2026-10-26, assumed)
- Hold each hinge by the screw's clamp alone, its tension set by hand on the first lamp: the check's 48 N and 0.05 N·m for the base's hinge rest on an assumed friction and nut factor (2026-10-26, assumed)
- Model the LED module as a generic Ø40 mm aluminium board with two M3 holes 32 mm apart and a COB emitter: step.parts has no LED module (searched "LED", "LED module", "star LED", "COB", "high power LED") (2026-10-26, assumed)
- Screw the LED module to two bosses in the head with ISO 4762 M3 × 8 screws from step.parts, cutting their own thread in Ø2.5 mm pilot holes (2026-10-26, assumed)
- Give the hinges the range the fit check finds clear, rounded in to whole 5 degrees: the arm -45 to +135 degrees about its rest, the head -45 to +175 (2026-10-26, assumed)
- Print the base standing on its underside with support in the weight's pocket only, and the head on its top with support under the yoke (2026-10-26, assumed)
- Draw the lamp as a prototype at nominal sizes, with a sheet for each part the project makes and none for bought ones (2026-10-26, assumed)
- Write the work instructions as a simple picture guide with a figure per step (2026-10-26, assumed; text-to-cad 0.11 calls the old prototype level simple)

## Open actions

- Choose the LED module and its driver, then check the board against the head's bosses (32 mm apart) and the Ø40 mm envelope, and how hot it runs against PETG.
- Choose the adhesive for the weight: the work instructions print it NOT STATED and the drawing's parts list carries it as not chosen.
- Set and record each hinge's locknut torque on the first lamp: the three fastening steps print NOT STATED. The check's estimate (0.05 N·m for the base's hinge) is only as good as its assumed friction of 0.3.
- Decide whether the arm should be stopped short of folding back behind the base (up to 191 degrees from the desk); nothing in the model stops it.
- Decide on washers under the hinge screws' heads and nuts, to spread their clamp on the PETG cheeks.
- Slice and print the three PETG parts: no slicer was run here, so print time, filament and the supports are untested. The masses in the check are for solid parts.
- Route the LED's lead: the arm's slot and the head's vents are meant for it, but nothing holds it and it is not modelled.
- Settle the drawing's part sheets past their first pass: the base's is dimensioned, the weight's, the arm's and the head's still list unstated rounds, chamfers and faces, and no sheet has a general tolerance (`drawings/desk_lamp_drawing.pdf`, from `python assemblies/desk_lamp_drawing.py`).

## In this project

- The models: [the base](parts/base.py), [the weight](parts/weight.py), [the arm](parts/arm.py), [the head](parts/head.py), [the LED module](parts/led_module.py) and [the desk lamp](assemblies/desk_lamp.py), its `tilt` and `head` hinges and its `range` motion, with [the models' catalog](parts/README.md) and [the shared sizes](parts/sizes.py).
- Their STEP files, from [`exports.py`](exports.py): [the base](parts/base.step), [the weight](parts/weight.step), [the arm](parts/arm.step), [the head](parts/head.step), [the LED module](parts/led_module.step) and [the desk lamp](assemblies/desk_lamp.step).
- The checks: [fit, clearance, range of motion, balance and holding](assemblies/desk_lamp_fit.md).
- Making it: the printed parts' meshes, [base](parts/base.stl), [arm](parts/arm.stl) and [head](parts/head.stl); [the assembly drawing](drawings/desk_lamp_drawing.pdf), with its balloons and parts list, and [the work instructions](docs/desk_lamp_work_instructions.pdf).
- The documents: [PRD](docs/prd.md) and [parts list](docs/desk_lamp_parts_list.md).
- Pictures: [from an angle](pictures/desk_lamp_angle.png), [front](pictures/desk_lamp_front.png), [back](pictures/desk_lamp_back.png), [left](pictures/desk_lamp_left.png), [right](pictures/desk_lamp_right.png), [top](pictures/desk_lamp_top.png), [bottom](pictures/desk_lamp_bottom.png), [exploded](pictures/desk_lamp_exploded.png) and [exploded from the side](pictures/desk_lamp_exploded_side.png), and [the motion video](pictures/desk_lamp_motion.mp4), recorded with text-to-cad 0.7: text-to-cad 0.8 and later record no video, and the viewer's Motion plays the lamp's `range` motion.
