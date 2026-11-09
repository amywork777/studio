# Models

| Script | Makes | Purpose |
| --- | --- | --- |
| parts/sizes.py | | The NEMA 17's mounting sizes, shared by the plate, its drawing and the mount |
| parts/motor_plate.py | the motor plate model | The motor plate, milled from 6061-T6, with its 3D PMI: datums, sizes, positions, flatness, profiles, a note and two views |
| parts/nema17.py | the NEMA 17 model | The NEMA 17 stepper, 40 mm body: step.parts' model, as a reference part |
| assemblies/motor_mount.py | the motor mount model | The plate, the motor under it and its four M3 x 6 screws |
| exports.py | parts/motor_plate.step, parts/nema17.step, assemblies/motor_mount.step | The delivered STEP files, the plate's as AP242 with its PMI |
| parts/motor_plate_drawing.py | drawings/motor_plate_drawing.pdf | The plate's engineering drawing, with its hole table |
| checks/motor_plate_geometry.py | checks/motor_plate_geometry.md | The plate measured against its named sizes, and its mass |
| checks/motor_plate_pmi.py | checks/motor_plate_pmi.md | The plate's PMI: every annotation attached, every face with a requirement, and the STEP's requirements read back |
| checks/motor_plate_dfm_measure.py | checks/motor_plate_dfm_measure.md | The plate's machining features measured for its DFM review |
| checks/motor_mount_fit.py | checks/motor_mount_fit.md | The mount's collisions and where each part sits |

Build: `cad run assemblies/motor_mount.py` from the project root builds the mount and the parts in it, each a model
with its own page. A run writes no file: `cad run exports.py` writes the STEP files, and the drawing and the checks
call the models themselves (`cad run parts/motor_plate_drawing.py`, `cad run checks/motor_plate_geometry.py`).
Rerun the checks after the plate changes, `checks/motor_plate_pmi.py` after `exports.py`.

Imported source, from step.parts (checksums verified): parts/imported/stepper_motor_nema17_l0040_single_shaft.step
and parts/imported/iso4762_socket_head_cap_screw_m3x6.step.

Making it, from the exported STEP (`cad run exports.py` first):

- CAM: `cad step plan parts/motor_plate.step --job cam/motor_plate.cam.json --out cam/motor_plate` writes
  cam/motor_plate/result.json, cam/motor_plate/result.glb (the toolpaths) and the LinuxCNC program
  cam/motor_plate/motor_plate.top.ngc.
- Strength: `cad step solve parts/motor_plate.step --study studies/motor_plate.study.json --out studies/motor_plate`
  writes studies/motor_plate/result.json, result.glb, result.vtu and its stress and displacement pictures.

Pictures: `cad step snapshot --job pictures/motor_mount_pictures.job.json` draws the mount from its STEP (the angle,
from below and the card), and `cad model snapshot <the plate's id> pictures/motor_plate_pmi.png --view Top --width 1200
--height 900` its PMI's Top view, the id being the one `cad run parts/motor_plate.py` prints. The toolpaths' picture
(pictures/motor_plate_cam.png) and the strength report's were drawn with text-to-cad 0.7 from earlier runs of the same
job and study; the study's own pictures are the solve's, in studies/motor_plate/.
