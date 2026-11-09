# Models

| Script | Makes | Purpose |
| --- | --- | --- |
| parts/sizes.py | | The MG996R's sizes, from its datasheet, shared by the parts |
| parts/mg996r.py | the MG996R model | MG996R servo, modeled from its datasheet's dimensions |
| parts/servo_bracket.py | the servo bracket model | The servo bracket, bent from 2 mm 5052-H32 |
| parts/servo_bracket_flat.py | the flat pattern model | The bracket's flat pattern |
| parts/servo_bracket_cut.py | the cut file model | The bracket's cut file: the flat pattern on a CUT layer, its bend line on a BEND layer |
| parts/horn_adapter.py | the horn adapter model | Horn adapter, machined from 6061-T6 |
| parts/cable_clip.py | the cable clip model | Cable clip, printed in PETG |
| assemblies/servo_mount.py | the servo mount model | The mount: its parts placed by mates, the horn's travel as a revolute joint, and its `range` motion |
| robots/base_link.py | the base link model | The robot descriptions' base link: every part the horn does not turn |
| robots/horn_link.py | the horn link model | Their horn link: the horn adapter, in its joint's frame |
| exports.py | every STEP, the STL and 3MF files, cut/servo_bracket_cut.dxf and robots/meshes/ | The delivered files |
| parts/servo_bracket_drawing.py | drawings/servo_bracket_drawing.pdf | The bracket's engineering drawing |
| checks/servo_mount_fit.py | assemblies/servo_mount_fit.md | The mount's fit and clearance |

Build: `cad run assemblies/servo_mount.py` from the project root builds the mount and the parts in it, and `cad
run parts/servo_bracket_cut.py` the cut file and the flat pattern in it, each a model with its own page. A run writes
no file: `cad run exports.py` writes every STEP, the printed and cut parts' files (parts/servo_bracket.stl,
parts/servo_bracket.3mf, parts/cable_clip.stl, cut/servo_bracket_cut.dxf) and the robot links' meshes. Rerun
`cad run checks/servo_mount_fit.py` after the mount changes. `cad run parts/servo_bracket_drawing.py` draws the
bracket from its model.

Pictures, drawn from the exported mount: `cad step snapshot --job pictures/servo_mount_pictures.job.json` (front,
side, top, an angle, and two exploded views). The motion video was recorded with text-to-cad 0.7, which drew video; the
horn's `range` motion is the mount's sequence now, played by the viewer's Motion and carried by a GLB exported from it
(`cad model export <the mount's id> servo_mount.glb`). The strength report's pictures were drawn with text-to-cad 0.7
from an earlier solve of the same study, which gave the same numbers; the study's own pictures are the solve's, in
studies/servo_bracket/.

Robot descriptions, authored XML beside their meshes: robots/servo_mount.urdf, robots/servo_mount.srdf and
robots/servo_mount.sdf. Check them with `cad urdf validate`, `cad srdf validate` and `cad sdf validate`.

Imported source: parts/imported/iso4762_socket_head_cap_screw_m3x8.step, from step.parts.

From the exported STEP files (`cad run exports.py` first):

- The strength study: studies/servo_bracket.study.json, solved with `cad step solve parts/servo_bracket.step
  --study studies/servo_bracket.study.json --out studies/servo_bracket`, which writes its result into
  studies/servo_bracket/.
- The adapter's CAM job: `cad step plan parts/horn_adapter.step --job cam/horn_adapter.cam.json --out cam/horn_adapter`
  writes cam/horn_adapter/result.json, cam/horn_adapter/result.glb (the toolpaths) and the LinuxCNC programs
  cam/horn_adapter/horn_adapter.top.ngc and cam/horn_adapter/horn_adapter.bottom.ngc.
