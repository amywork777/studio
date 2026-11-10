# Servo power board: board checks

Clean. KiCad's rule check finds no errors and no warnings, and the board's own check script prints nothing. The project has no schematic, so the schematic's rule check was not run, and a clean board check does not show the circuit is right.

## What was checked

- File: `electronics/servo_power.kicad_pcb`, a 50 × 35 mm board with two copper layers, 1.6 mm thick. USB-C in, a 2 A polyfuse, three servo headers, a 3.3 V regulator and a logic header: 17 parts, 52 pads, 10 nets, 47 tracks, 13 vias, 2 copper pours.
- Where it comes from: text-to-cad's sample board `models/electronics/servo_power`, by Thompson Labs LLC under the MIT licence ([LICENSE](LICENSE)), copied unchanged with its rules and its check script.
- Measured with text-to-cad 0.11.4 and its board tools (KiCad 10.99), from this folder:
  - `cad kicad_pcb inspect servo_power.kicad_pcb`
  - `cad kicad_pcb drc servo_power.kicad_pcb --json`
  - `cad run check_servo_power.py servo_power.kicad_pcb`
- Rules: the project's own, in `servo_power.kicad_pro` (Board Setup) and `servo_power.kicad_dru` (custom rules). They are compared with a fab's limits in [the review before ordering](servo_power_review.md).
- Units: millimetres.
- Date checked: 2026-11-09

## Findings

| Status | Check | Measured | Limit | What to change |
| --- | --- | --- | --- | --- |
| ✅ pass | KiCad's rule check (DRC) | `"ok": true`, no findings: "DRC clean (0 warning(s))". | No errors | None |
| ✅ pass | Power tracks | No finding from the custom rule "power carries 2 A". | VBUS and +5V tracks at least 0.78 mm, and VBUS at least 0.6 mm inside J1's courtyard (`servo_power.kicad_dru`: IPC-2221, 1 oz outer copper, 10 °C rise) | None |
| ✅ pass | Holes to copper | No finding from the custom rules "hole clearance" and "J1 land pattern". | 0.25 mm, and 0.15 mm between J1's own pads and pegs | None |
| ✅ pass | Track bends | No finding from the custom rule "no acute bends". | No bend under 90° | None |
| ✅ pass | Detours | `check_servo_power.py` prints nothing and exits 0. | Each net routed under 1.3 times the shortest tree through its pads | None |
| ✅ pass | Decoupling at the regulator | The script prints nothing. | A capacitor pad within 3 mm of each of U1's power pins | None |
| ✅ pass | Ground vias | The script prints nothing. | Every surface-mount ground pad within 1.5 mm of a GND via | None |
| ✅ pass | Signal bus spacing | The script prints nothing. | S1, S2 and S3 run side by side at one spacing | None |
| ✅ pass | Ground under the signals | The script prints nothing. | The bottom GND pour under every top-layer signal track, sampled every 0.5 mm | None |
| ❓ need more info | Schematic's rule check (ERC) | Not run. The project has no `.kicad_sch`. | No errors | Draw the schematic, or write the circuit down as a list of nets, then check the board against it. |
| ❓ need more info | The circuit itself | Not checked. A clean rule check proves the board meets its own rules, not that the right pins are joined. | The circuit as specified | Compare each net's pads with the parts' datasheets: J1's CC resistors, U1's pinout, the servo headers' pin order. |
| ❓ need more info | The supply against this servo | Not checked. The board is fused at 2 A (`F1`, and "5V 2A" on its silkscreen). The MG996R's stall current is not in this project. | The servo's stall current, from its datasheet or measured | Read the stall current before this board powers the servo. See the open action in [the project's README](../README.md). |

With the board checks skill, Studio runs KiCad's rule checks on a board and says where each finding is and how to fix it.
