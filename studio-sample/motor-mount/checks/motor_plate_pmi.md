# Motor plate: 3D PMI check

Measured on the plate's model (`parts/motor_plate.py`) and its AP242 STEP (`parts/motor_plate.step`, written by `cad run exports.py`) with `cad run checks/motor_plate_pmi.py`.

| Check | Measured | Expected | Result |
| --- | --- | --- | --- |
| Annotations on the plate | 46 | more than 0 | pass |
| Annotations linked to nothing (missing, ambiguous, invalid) | none | none | pass |
| Annotations on a shape the plate does not hold | none | none | pass |
| Faces with no requirement | none | none | pass |
| Conflicts | none | none | pass |
| Requirements read off the STEP | datums A, B, C; 29 dimensions; 13 tolerances | datums A, B, C; dimensions; tolerances | pass |
| Requirements in the STEP not ok | none | none | pass |
| Faces the general profile holds, in the STEP | 34 faces, profile 0.5 to A|B|C | every face nothing else controls | pass |
