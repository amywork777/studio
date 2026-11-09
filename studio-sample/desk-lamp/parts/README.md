# Models

| Script | Makes | Purpose |
| --- | --- | --- |
| parts/sizes.py | | The sizes the parts share: the two hinges, the arm, the LED module and the weight |
| parts/base.py | the base model | The base, printed in PETG: the weight's pocket underneath and the clevis on top |
| parts/weight.py | the weight model | The weight, a mild steel disc bonded into the base |
| parts/arm.py | the arm model | The arm, printed flat in PETG: one link between the two hinges, with a slot for the LED's lead |
| parts/head.py | the head model | The head, printed in PETG: the shade, its yoke, the LED bosses and the vents |
| parts/led_module.py | the LED module model | The LED module, a generic Ø40 mm aluminium LED board (step.parts has none) |
| assemblies/desk_lamp.py | the desk lamp model | The lamp: its parts placed by mates, its `tilt` and `head` hinges as revolute joints, and its `range` motion |
| exports.py | assemblies/desk_lamp.step, parts/*.step, parts/base.stl, parts/arm.stl, parts/head.stl | The delivered files: every STEP, and the printed parts' meshes |
| checks/desk_lamp_fit.py | assemblies/desk_lamp_fit.md | The lamp's fit, clearance, range of motion, balance and holding torque |
| assemblies/desk_lamp_drawing.py | drawings/desk_lamp_drawing.pdf | The assembly drawing: the general arrangement with balloons and the parts list, and a sheet per part the project makes |
| assemblies/desk_lamp_wi.py | docs/desk_lamp_work_instructions.pdf, with its .glb and .html beside it | The work instructions for putting it together |

Build: `cad run assemblies/desk_lamp.py` from the project root builds the lamp and the parts in it, each a model with
its own page. A run writes no file: `cad run exports.py` writes the STEP files and the meshes. Rerun
`cad run checks/desk_lamp_fit.py` after the lamp changes (it swings both hinges, so it takes a while), and copy the
hinges' clear range it reports into `TILT_LIMITS` and `HEAD_LIMITS` in the assembly. `cad run
assemblies/desk_lamp_drawing.py` draws the lamp from its model, and `cad run assemblies/desk_lamp_wi.py` writes its
work instructions from its exported STEP, so run `exports.py` first.

Pictures, drawn from the exported STEP: `cad step snapshot --job pictures/desk_lamp_pictures.job.json` (front, back, both
sides, top, bottom, an angle, the card, and two exploded views). The motion video was recorded with text-to-cad 0.7, which
drew video; the lamp's `range` motion is its sequence now, played by the viewer's Motion and carried by a GLB exported
from it (`cad model export <the lamp's id> desk_lamp.glb`).

Imported source, from step.parts, each checked against its catalog checksum:
parts/imported/iso4762_socket_head_cap_screw_m5x30.step (the two hinge screws),
parts/imported/nylon_locknut_m5_simple.step (their locknuts) and
parts/imported/iso4762_socket_head_cap_screw_m3x8.step (the LED module's screws).
