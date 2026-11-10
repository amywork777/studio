# Servo power board: fabrication files

The Gerbers, the drill file and the placement file are in [`fab/`](fab/), made from the board on 2026-11-09. There is no parts list, because the project has no schematic. Nothing was uploaded, quoted or ordered.

## What was made

Made with text-to-cad 0.11.4 and its board tools (KiCad 10.99), from this folder. Each kind was written to a folder of its own and then gathered into `fab/`.

- `cad kicad_pcb export servo_power.kicad_pcb --to gerbers -o out/gerbers`
- `cad kicad_pcb export servo_power.kicad_pcb --to drill -o out/drill`
- `cad kicad_pcb export servo_power.kicad_pcb --to pos -o out/pos`

| File | What it is |
| --- | --- |
| `fab/servo_power-F_Cu.gbr`, `fab/servo_power-B_Cu.gbr` | Top and bottom copper |
| `fab/servo_power-F_Mask.gbr`, `fab/servo_power-B_Mask.gbr` | Top and bottom solder mask |
| `fab/servo_power-F_Silkscreen.gbr`, `fab/servo_power-B_Silkscreen.gbr` | Top and bottom silkscreen |
| `fab/servo_power-F_Paste.gbr`, `fab/servo_power-B_Paste.gbr` | Top and bottom solder paste, for a stencil |
| `fab/servo_power-Edge_Cuts.gbr` | The board's outline |
| `fab/servo_power-job.gbrjob` | The Gerber job file: two layers, 1.6 mm thick |
| `fab/servo_power.drl` | The drill file (Excellon, millimetres): 0.3 mm vias, 1.0 mm round holes and 0.6 mm slots plated, 0.65 mm and 3.2 mm holes without plating |
| `fab/servo_power-pos.csv` | The placement file: 13 parts, all on the top side |

## Findings

| Status | Check | Measured | Limit | What to change |
| --- | --- | --- | --- | --- |
| ✅ pass | Layers | Both copper layers, both masks, both silkscreens, the outline and the drill file are present. | The layers a two-layer order needs | None |
| ✅ pass | Board checks first | KiCad's rule check was clean on the board these files were made from: see [the board checks](servo_power_check.md). | No errors | None |
| ❓ need more info | The files as the fab sees them | Not opened in a Gerber viewer. | Layers lined up with each other and with the drill file | Open them in a Gerber viewer before an order. |
| ❓ need more info | Placement file for assembly | KiCad's own columns: `Ref`, `Val`, `Package`, `PosX`, `PosY`, `Rot`, `Side`. | JLCPCB's assembly reads `Designator`, `Mid X`, `Mid Y`, `Layer`, `Rotation` | Rename the columns with a script if the board is assembled by JLCPCB. Each part's rotation then needs checking against the fab's preview. |
| ❓ need more info | Parts list | Not made. `--to bom` reads the schematic, and the project has none. | A parts list with a maker's part number for every part | Draw the schematic, then make the parts list. |
| ❓ need more info | The fab's limits | See [the review before ordering](servo_power_review.md): it is not ready to order as it stands. | | Settle the review's open findings first. |

## The board as STEP

`cad kicad_pcb export servo_power.kicad_pcb --to step -o out/step` writes the board with its parts as one STEP file (1.7 MB when run on 2026-11-09), to design an enclosure around. It is not kept in this example: the example's STEP files are the ones `exports.py` rebuilds from the models, and the board's comes from KiCad. Run the command, or the Board STEP skill, to make it. The drill file puts the four M3 mounting holes at (3.5, 3.5), (46.5, 3.5), (3.5, 31.5) and (46.5, 31.5) mm from the board's top left corner.

With the fabrication files skill, Studio makes a board's Gerbers, drill files, parts list and placement files, ready to upload to a fab.
