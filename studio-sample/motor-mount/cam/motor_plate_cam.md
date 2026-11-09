# Motor plate: the CAM program

Ready to cut · 5 min · 4 tools. Planned with `cad step plan parts/motor_plate.step --job cam/motor_plate.cam.json --out cam/motor_plate` on text-to-cad 0.11, by FreeCAD 1.1.1: the job is `cam/motor_plate.cam.json`, the plan's numbers are in `cam/motor_plate/result.json`, the toolpaths are in `cam/motor_plate/result.glb` (open it in the Viewer), and the program is `cam/motor_plate/motor_plate.top.ngc`.

## The machine and the stock

- A Tormach 1100MX (10,000 rpm spindle), posted for **LinuxCNC** (`.ngc`), as the Tormach runs it. The machine was chosen for this sample, not given.
- 6061-T6, a 116 x 62 x 7 mm blank: 3 mm over the plate on every side and 1 mm over its top. Its bottom is the plate's bottom. Flood coolant throughout.
- The blank stands on a sacrificial plate, held down with double-sided tape: the outline is cut 0.5 mm into that plate to cut the part free, and nothing else holds it then.

## The tools

All proposed for this sample, not a shop's list, and so are their T numbers (T1 to T4, as their ids), their shanks (each end mill's its own diameter) and the drill's 118° point. Speeds and feeds are starting points from text-to-cad's table for 6061, not tuned for any machine.

| Tool | What | Speed | Feed | Stickout |
| --- | --- | --- | --- | --- |
| T1 | 10 mm 3-flute carbide end mill, 22 mm flutes | 7,960 rpm | 1,462 mm/min facing, 1,433 profiling | 30 mm |
| T2 | 6 mm 3-flute carbide end mill, 13 mm flutes | 10,000 rpm | 1,225 mm/min pocketing, 1,200 profiling | 20 mm |
| T3 | 4 mm 3-flute carbide end mill, 11 mm flutes | 10,000 rpm | 800 mm/min | 18 mm |
| T4 | 3.4 mm jobber drill, 39 mm flutes | 10,000 rpm | 680 mm/min, pecked 2 mm | 45 mm |

## Setup 1, top: `motor_plate.top.ngc`, G54

Work zero X0 Y0 at the blank's centre, Z0 on its top face: touch off there.

1. Face the top 1 mm, T1 (1 min 4 s).
2. The weight-saving pocket, 3 mm deep, T2 (1 min 53 s).
3. The Ø22.2 pilot bore, round its wall and 0.5 mm into the sacrificial plate, T2 (15 s).
4. Drill the four M3 clearance holes Ø3.4, through, T4 (6 s).
5. The two belt slots, round their walls and 0.5 mm into the sacrificial plate, T3 (54 s).
6. Cut the outline free, 0.5 mm into the sacrificial plate, T1 (1 min 1 s).

Deburr every edge by hand: the model's 0.5 mm chamfers on the outline are not cut.

## Warnings, notes and assumptions

- Spindle held to the 1100MX's 10,000 rpm for T2 (13,260 rpm by the table), T3 (19,890) and T4 (14,040). Their feeds follow the slower spindle.
- The drill turns at the table's carbide speed, held to 10,000 rpm: slow it for a high-speed steel drill.
- The 5 min is a lower bound: moves at their feeds, rapids at an assumed 5,000 mm/min and tool changes, with no spindle spin-up or setting up.

Prove this program on the machine: single block, feed override low, in air first. Check the post is LinuxCNC's, set G54 and every tool length, look over the toolpaths in the Viewer, dry-run it above the part, then cut single-block with the overrides down. The G-code has not been run on a machine.
