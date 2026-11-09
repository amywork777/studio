# Shelf bracket

## What it is

A wall shelf bracket bent from 14 gauge G90 galvanised steel, SendCutSend's G90-074 (0.074 in, 1.88 mm): an example project to learn Studio with. A tapering web stands on edge as the bracket's gusset. A flange bent off its top carries the shelf, held down by two wood screws from below, and a flange bent off its back fixes it to the wall with two screws. A pair holds a 200 mm deep shelf with up to 15 kg on it; with all 15 kg on one bracket, its strength study leaves a safety factor of 2.43 in the bracket itself. It is laser cut and bent by SendCutSend from its STEP, which passes their preflight.

## Decisions

- Bend it from G90 galvanised steel at 0.074 in (G90-074), not mild steel or 3 mm 5052 aluminium: the zinc keeps a bracket in a kitchen, bathroom or garage from rusting with no finish to order, a 1.88 mm steel web is about 1.7 times as stiff in its own plane as a 3.18 mm 5052 one (E × t, from SendCutSend's figures for G90-074 and ALU-125), and SendCutSend bends it at the same radius and K-factor as their mild steel (2026-10-26, assumed)
- Make the gusset a tapering web standing on edge, 180 mm along the arm and 150 mm down the wall, with 25 mm flanges bent the same way off its top and back edges (2026-10-26, assumed)
- Draw the bends at SendCutSend's inside radius for this sheet, 1.600 mm, model the sheet at their stock 1.8796 mm so the STEP uploads as drawn, and develop the flat pattern with their K-factor of 0.40 (2026-10-26, assumed)
- Cut a 7 × 7 mm corner relief where the two bends meet, with an R1 inside corner: the first, 5 mm, reached 3.37 mm past the shelf bend line, short of SendCutSend's 3.99 mm, and was opened to 7 mm (2026-10-26, assumed)
- Fix it to the wall with two 5 mm wood screws into plugs, through Ø5.5 mm holes 100 mm apart, and hold the board with two 4 mm wood screws through Ø4.5 mm holes (2026-10-26, asked: two wall screws; assumed: the screw sizes and the board's)
- Check the strength with the whole 15 kg on one bracket, spread over its shelf flange, the wall holes held fixed: the bracket itself keeps a safety factor of 2.43; the study's own 1.47 sits at the rigid hole edge, which it flags as exaggerated (2026-10-26, asked: the load and the fixed holes; assumed: all of it on one bracket)
- Order the bracket from SendCutSend as its STEP, laser cut and bent, two for one shelf, with no finish: the cut file's bend lines are solid, which SendCutSend's DXF upload does not accept (2026-10-26, asked: SendCutSend; assumed: the STEP, the pair and no finish)

## Open actions

- Study the bracket with its screw heads and the wall in the model: the rigid-hole fixture puts the study's peak, 215.4 MPa, at the upper wall hole's edge, and just outside a screw head the flange is at 104 MPa.
- Choose the wall's screws and plugs, and check them for about 138 N of pull on the upper screw.
- Decide whether the whole 15 kg can sit on one bracket, as the study assumes, and whether heavy things at the shelf's front edge, past the arm's tip, need a study of their own.
- To order the cut file instead of the STEP, make its BEND layer dashed: text-to-cad's DXF export writes every layer solid.
- On the first pair, look at the outside of both bends for flaking zinc (no source here gives G90's coating a minimum radius), and check both bends (±1° at the wall bend swings the arm's tip 3.1 mm sideways).
- Not modelled: the shelf board, which stops the arm twisting under the load (0.84 mm of the tip's 0.91 mm is sideways); buckling of the web's free edge (it sees 17 MPa); repeated loads.

## In this project

- The models: [the shelf bracket](parts/shelf_bracket.py), its [flat pattern](parts/shelf_bracket_flat.py) and [cut file](parts/shelf_bracket_cut.py), with [the models' catalog](parts/README.md).
- Their files, from [`exports.py`](exports.py): [the bracket's STEP](parts/shelf_bracket.step), the one SendCutSend is sent, and [the flat pattern's](parts/shelf_bracket_flat.step).
- The checks: [strength](docs/shelf_bracket_strength_report.md) with its [result](studies/shelf_bracket/result.glb) and [sheet metal](parts/shelf_bracket_sheet_metal.md).
- Making it: [the cut file](cut/shelf_bracket_cut.dxf) and [its SendCutSend preflight](cut/shelf_bracket_sendcutsend.md), and [the bracket's drawing](drawings/shelf_bracket_drawing.pdf).
- The documents: [PRD](docs/prd.md).
