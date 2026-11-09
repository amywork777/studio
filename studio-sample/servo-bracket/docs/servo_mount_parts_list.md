# Servo mount: parts list

The servo mount (`assemblies/servo_mount.step`) is eight parts of five kinds: three the project makes, the servo, and four screws. Three more things it needs are not in the model: the servo's own horn screw, the screws that fix it to a wall, and the adhesive for the clip.

## In the model

| Part | How many | Material | How it is made, or where to buy it | File |
| --- | --- | --- | --- | --- |
| Servo bracket | 1 | 5052-H32 aluminium sheet, 2 mm (SendCutSend's ALU-080, 0.080 in) | Laser cut and bent once, 90°, by SendCutSend from its cut file `cut/servo_bracket_cut.dxf` (checked in `cut/servo_bracket_sendcutsend.md`). Its four Ø2.5 mm holes are tapped M3 × 0.5 by hand after bending. | `parts/servo_bracket.step` |
| MG996R servo | 1 | As bought | Bought: a Tower Pro MG996R (towerpro.com.tw/product/mg996r). The supplier is not chosen. The model is its datasheet's envelope, and some of its sizes are not in the datasheet (see below). | `parts/mg996r.step` |
| Horn adapter | 1 | 6061-T6 aluminium | CNC milled from a 28 × 28 × 9 mm block in two setups (the CAM job, `cam/horn_adapter/result.glb`), its four M3 holes then tapped by hand. Then its Ø5.9 bore is broached to the servo's 25-tooth spline. | `parts/horn_adapter.step` |
| Socket head cap screw, ISO 4762, M3 × 8 | 4 | Steel, assumed: the step.parts file gives no material. Grade and finish not chosen. | Bought. Modelled from step.parts' `iso4762_socket_head_cap_screw_m3x8`. | `parts/imported/iso4762_socket_head_cap_screw_m3x8.step` |
| Cable clip | 1 | PETG | 3D printed (FDM), standing up as drawn, at 0.2 mm layers on a Bambu Lab P1S with a 0.4 mm nozzle, then bonded to the bracket's flange. Not ready to print yet: its FDM check fails on two counts (`parts/cable_clip_fdm.md`). | `parts/cable_clip.step` |

## Not in the model

| Part | How many | Material | How it is made, or where to buy it |
| --- | --- | --- | --- |
| The servo's horn screw, M3 | 1 | Not known | The servo's own. It holds the adapter on the spline through its Ø3.4 mm hole, its head in the Ø6.5 mm counterbore. Its length is not checked against the adapter. |
| Wall screws, M4 | 2 | Not chosen | Bought. Through the flange's two Ø4.5 mm holes, 52 mm apart. Their length and the wall's fixings depend on the wall, which is not known. |
| Adhesive for the clip | As needed | Not chosen | Bonds the PETG clip to the aluminium flange. |

## Before buying and making

- The MG996R's datasheet does not give its tab holes, its output axis or its spline, so the parts use values from elsewhere: the holes Ø4.1 mm and 9.5 mm apart across each tab, as a seller measured them; 47.45 mm apart along the servo, assumed from each hole sitting in the middle of its tab; the output axis 10.5 mm from the end of the case, scaled from the datasheet's drawing; and the spline 5.9 mm across its 25 teeth. The bracket's holes and the adapter's bore follow them. Measure a servo before the bracket is ordered (`parts/sizes.py` lists them).
- Masses, from the robot description's numbers: bracket 19.1 g, servo 55 g, horn adapter 8.8 g, each screw 0.9 g, clip 0.3 g; 86.7 g in all.

## Open questions

- Which supplier for the servo and the screws, and which grade and finish for the screws?
- Which wall screws and fixings, for which wall?
- Which adhesive for PETG on aluminium?
- Is the servo's horn screw the right length for the adapter?
- Who broaches the adapter's spline, and to what size?
