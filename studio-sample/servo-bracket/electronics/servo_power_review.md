# Servo power board: review before ordering

Not ready to order as it stands. The board's sizes meet JLCPCB's standard limits for a two-layer board, but three things are open: one of the project's rules is looser than the fab's, the fab's limit for the USB-C connector's plated slots was not read, and there is no parts list. Nothing was uploaded, quoted or ordered.

## Context

- File: `electronics/servo_power.kicad_pcb`, with its rules in `servo_power.kicad_pro` and `servo_power.kicad_dru`.
- Assumed service: JLCPCB's standard two-layer board, 1.6 mm, 1 oz copper. No fab was chosen for this project, so this is an assumption.
- Assembly: not ordered. The review covers the bare board.
- Date checked: 2026-11-09

## Sources checked

- JLCPCB's limits are the ones the pcb skill records in `references/manufacturing.md` (standard-tier limits, 1 to 2 layers), read there from [JLCPCB's capabilities page](https://jlcpcb.com/capabilities/pcb-capabilities) on 2026-11-04. The page itself was not read again for this review. Read it again before an order.
- The board's rules: `board.design_settings.rules` in `servo_power.kicad_pro`, and the six custom rules in `servo_power.kicad_dru`.
- KiCad's rule check is clean under those rules: see [the board checks](servo_power_check.md).

## Board facts

Read from the board's file and from its drill file, `fab/servo_power.drl`.

- 50 × 35 mm, two copper layers, 1.6 mm thick.
- Tracks: 47 segments, from 0.25 to 0.8 mm wide (0.25, 0.3, 0.4, 0.5, 0.6 and 0.8 mm).
- Net class Default: 0.2 mm clearance, vias of 0.6 mm on a 0.3 mm hole.
- Vias: 13, all 0.6 mm pads on 0.3 mm holes.
- Plated holes: 14 round holes of 1.0 mm in 1.7 mm pads (the pin headers), and four slots 0.6 mm wide in pads 1.0 mm wide (J1's shell tabs).
- Holes without plating: four of 3.2 mm (the M3 mounting holes) and two of 0.65 mm (J1's locating pegs).
- Silkscreen text on the board: 1.0 mm tall with a 0.15 mm stroke, and "SERVO PWR" 1.5 mm tall with a 0.2 mm stroke.

## Findings

| Status | Check | Measured | Limit | What to change |
| --- | --- | --- | --- | --- |
| ✅ pass | Track width | Narrowest track 0.25 mm. The project's rule, `min_track_width`, is 0.1 mm. | JLCPCB: 0.10 mm | None |
| ✅ pass | Spacing | Net class clearance 0.2 mm. The project's rule, `min_clearance`, is 0.1 mm. | JLCPCB: 0.10 mm | None |
| ✅ pass | Smallest hole | 0.3 mm, the vias. The project's rule, `min_through_hole_diameter`, is 0.3 mm. | JLCPCB: 0.15 mm | None |
| ✅ pass | Vias | A 0.3 mm hole in a 0.6 mm pad. | JLCPCB: hole and pad 0.15 and 0.25 mm at least. A 0.15 mm hole, or a 0.2 to 0.25 mm one in a pad under 0.45 mm, costs more. | None |
| ✅ pass | Ring around the plated holes | Pin headers: 0.35 mm. J1's slots: 0.2 mm. | JLCPCB: 0.18 mm at least, 0.25 mm advised | None needed. J1's slots are over the minimum and under the advised figure, and the pad is the connector maker's own. |
| ❓ need more info | The project's ring rule | `min_via_annular_width` is 0.13 mm. | JLCPCB: 0.18 mm for plated holes | The rule is looser than the fab's figure, so a clean rule check would not catch a thin ring in a later edit. Set it to the fab's figure in Board Setup once the fab is chosen, then run the check again. |
| ❓ need more info | Plated slots | Four slots 0.6 mm wide, 1.4 and 1.7 mm long. | Not read. The skill's table gives no slot limit. | Read the fab's smallest plated slot before ordering. |
| ✅ pass | Copper to the board's edge | No finding under the project's rule, `min_copper_edge_clearance` 0.2 mm. | JLCPCB: 0.2 mm to a routed edge | None |
| ✅ pass | Silkscreen text | 1.0 mm tall with a 0.15 mm stroke at the smallest. The project's rules, `min_text_height` and `min_text_thickness`, are the same figures, and the check is clean. | JLCPCB: 1.0 mm tall, 0.15 mm stroke | None. The text sits on the limit, so do not make it smaller. |
| ✅ pass | Track width for the current | VBUS and +5V at 0.78 mm or more: see [the board checks](servo_power_check.md). | 0.78 mm for 2 A (`servo_power.kicad_dru`: IPC-2221, 1 oz outer copper, 10 °C rise) | None on a 1 oz board. Order 1 oz copper or more. |
| ✅ pass | Decoupling | A capacitor within 3 mm of each of U1's power pins: see [the board checks](servo_power_check.md). | The check script's 3 mm | None |
| ❓ need more info | Parts list | None. The project has no schematic, and the parts list is made from it. On the board, J1 (USB4105-GF-A) and U1 (AMS1117-3.3) carry a part name. The other parts carry only a value. | A maker's part number for every part | Draw the schematic with a part number on each part, then make the parts list from it. |
| ❓ need more info | The files the fab receives | [The fabrication files](servo_power_fab.md) were made and listed. They were not opened in a Gerber viewer. | Every layer present and lined up with the drill file | Open the Gerbers and the drill file in a Gerber viewer before an order. The board's pictures are not a manufacturing plot. |

With the review before ordering skill, Studio reviews a board against the fab's limits, its decoupling, its track widths for the current and its parts list.
