# Motor plate: geometry check

Measured on the plate's model (`parts/motor_plate.py`) with `cad run checks/motor_plate_geometry.py`, against the named sizes in `parts/motor_plate.py` and `parts/sizes.py`. Millimetres.

| Check | Measured | Expected | Result |
| --- | --- | --- | --- |
| Size, mm | 110.000 x 56.000 x 6.000 | 110 x 56 x 6 | pass |
| Solids | 1 | 1 | pass |
| Topology errors | 0 | 0 | pass |
| Pilot bore | 1 at diameter 22.200, axis (0.000, 0.000) | 1 at diameter 22.2, on the origin | pass |
| M3 clearance holes | 4 at diameter 3.4, centres [(-15.5, -15.5), (-15.5, 15.5), (15.5, -15.5), (15.5, 15.5)] | 4 on a 31 mm square | pass |
| M5 slots' ends | 4 ends at X [-45.0, -35.0, 35.0, 45.0] | 4 at X [-45.0, -35.0, 35.0, 45.0] | pass |
| Pocket floor | 1 face at Z 3.000 | 1 at Z 3 (3 deep) | pass |
| Pocket corner radius | [5.0] | [5] | pass |
| Volume | 28252 mm3 |  |  |
| Mass, 6061-T6 at 2.70 g/cm3 | 76.3 g |  |  |
| Saved against a plain 110 x 56 x 6 block | 23.5 g (24 %) |  |  |
