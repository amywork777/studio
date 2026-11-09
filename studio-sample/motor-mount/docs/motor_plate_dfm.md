# Motor plate: CNC machining review

The plate can be milled as drawn on a 3-axis mill in one setup. Every measured feature passes the cited rules; three items are left for review: the pilot bore's tolerance, the outline's chamfers and deburring the holes and slots, which no operation cuts.

## Scope

- Artifact: the plate's model, `parts/motor_plate.py`, reviewed on 2026-10-26, and its STEP (`parts/motor_plate.step`, from `exports.py`); one part, one solid; millimetres. The measurements were run again on text-to-cad 0.8 on 2026-10-27 and read the same; the CAM plan was made again with FreeCAD on 2026-10-28, and again on text-to-cad 0.11 with FreeCAD 1.1.1 on 2026-11-08: ready to cut.
- Process: CNC milling, 3-axis, one setup on a sacrificial plate, from a 116 x 62 x 7 mm 6061-T6 blank, as the CAM job plans it (`cam/motor_plate.cam.json`), the pilot bore and the slots included.
- Tooling assumed: the CAM job's proposed tools, 10 and 6 mm flat carbide end mills and a 3.4 mm drill, and a 4 mm end mill for the slots. No shop's specification was given.
- Evidence: exact B-rep measurements of the model (`checks/motor_plate_dfm_measure.md`, from `cad run checks/motor_plate_dfm_measure.py`) and the CAM plan's checks (`cam/motor_plate/result.json`).
- Rules: Protolabs Network (Hubs), "How to design parts for CNC machining", https://www.hubs.com/knowledge-base/how-design-parts-cnc-machining/, read 2026-10-26, its table of recommended and feasible values and its best practices. ISO 2768-1 for the general tolerance, from its table of linear tolerances, not re-read this session.

## Findings

| Part / feature | Evidence | Applicable rule | Result | Suggested action |
| --- | --- | --- | --- | --- |
| Pocket's inside corners | R5.000, 4 corners, measured; cut by the 6 mm end mill (R3) | Hubs, internal edges: vertical corner radius at least 1/3 of the cavity depth (3 mm: R1), and a little over the tool's radius (e.g. 1 mm) so it cuts round the corner | pass (R5 against R1, and 2 mm over the cutter's R3) | None |
| Pocket depth | 3.000 deep, 46 x 46 opening | Hubs, cavities: depth up to 4 times the width | pass (0.07 times) | None |
| Pocket floor to wall | Sharp, as a flat end mill leaves it | Hubs, floor radius: 0.5 mm, 1 mm or no radius | pass | None |
| Belt slots | 5.5 wide, R2.750 ends, 6 deep through; cut by the 4 mm end mill (R2) | Hubs, cavities: depth up to 4 times the width; internal edges as above | pass (1.1 times; ends R2.75 over the cutter's R2) | None |
| M3 clearance holes | Ø3.400, 3 deep through the floor, 4 | Hubs, holes: a standard drill diameter; depth up to 4 times the diameter | pass (3.4 mm is a standard drill; 0.9 times) | None |
| Pilot bore | Ø22.200, 3 deep through the floor; milled round its wall with the 6 mm end mill | Hubs, holes: a non-standard diameter is milled, under the cavity rules (pass); ISO 2768-m: ±0.2 mm from 6 to 30 mm | review | Under ISO 2768-m the bore may come out 22.0 to 22.4 mm, and the motor's 22 mm pilot can be a line-to-line fit at the low end. State a tolerance on the bore, such as Ø22.2 +0.1/0, once the bought motor's pilot is measured |
| Thinnest walls | 5.000 between the pocket and the plate's side (3 mm tall); 5.800 from an M3 hole to the pocket wall; 7.250 from a slot to the plate's end | Hubs, thin walls: at least 0.8 mm in metals | pass | None |
| Setups | 1: top, every feature, the outline cut free into a sacrificial plate | Hubs, setups: up to three or four re-holds is acceptable; features that must be accurate to each other in one setup | pass: the bore, the M3 holes and the slots are all cut without re-holding | None |
| Tool access | Every hole, slot and the pocket open along +Z | Hubs: features along one of the six principal directions | pass | None |
| Outline edges | 0.5 x 45° chamfers top and bottom; outside corners R5 | Hubs gives no rule for outside edges | review | The CAM job cuts no chamfer: break them by hand to the drawing's note 3 |
| Hole and slot edges | Left sharp in the model; no operation breaks them | No cited rule | review | Deburr them by hand, as the drawing's note 3 says |

## Coverage

- Measured: every inside vertical corner, the pocket's depth and opening, every hole's and slot's diameter and depth, the thinnest walls between features, the setups and the approach directions.
- Checked by the CAM plan rather than by rule: the tools' reach and holder clearance, gouges (`cam/motor_plate/result.json`, "Ready to cut").
- Not checked: the shop's own machine, tools and vise; the surface finish (none is specified); a quote or a cycle time beyond the CAM plan's estimate.
- No finding is a blanket approval: a shop's specification, when there is one, replaces the rules above.
