# Motor mount: fit check

Measured on the motor mount's model (`assemblies/motor_mount.py`) with `cad run checks/motor_mount_fit.py`. Millimetres; the plate's underside is Z 0.

## Overlaps between parts

| Parts | Overlap, mm3 | Result |
| --- | --- | --- |
| motor_plate / nema17_stepper | 0.0000 | pass |
| motor_plate / m3x6_screw:front_left | 0.0000 | pass |
| motor_plate / m3x6_screw:front_right | 0.0000 | pass |
| motor_plate / m3x6_screw:back_left | 0.0000 | pass |
| motor_plate / m3x6_screw:back_right | 0.0000 | pass |
| nema17_stepper / m3x6_screw:front_left | 0.0000 | pass |
| nema17_stepper / m3x6_screw:front_right | 0.0000 | pass |
| nema17_stepper / m3x6_screw:back_left | 0.0000 | pass |
| nema17_stepper / m3x6_screw:back_right | 0.0000 | pass |
| m3x6_screw:front_left / m3x6_screw:front_right | 0.0000 | pass |
| m3x6_screw:front_left / m3x6_screw:back_left | 0.0000 | pass |
| m3x6_screw:front_left / m3x6_screw:back_right | 0.0000 | pass |
| m3x6_screw:front_right / m3x6_screw:back_left | 0.0000 | pass |
| m3x6_screw:front_right / m3x6_screw:back_right | 0.0000 | pass |
| m3x6_screw:back_left / m3x6_screw:back_right | 0.0000 | pass |

## Where the parts sit

| Part | Z min | Z max |
| --- | --- | --- |
| motor_plate | -0.000 | 6.000 |
| nema17_stepper | -40.000 | 14.805 |
| m3x6_screw:front_left | -3.000 | 6.000 |
| m3x6_screw:front_right | -3.000 | 6.000 |
| m3x6_screw:back_left | -3.000 | 6.000 |
| m3x6_screw:back_right | -3.000 | 6.000 |

0 overlapping pairs of 15.
