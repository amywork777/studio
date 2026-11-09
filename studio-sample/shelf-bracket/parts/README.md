# Models

| Script | Makes | Purpose |
| --- | --- | --- |
| parts/shelf_bracket.py | the shelf bracket model | The shelf bracket, bent from G90-074 galvanised steel, with its named sizes |
| parts/shelf_bracket_flat.py | the flat pattern model | The bracket's flat pattern, developed with SendCutSend's radius and K-factor |
| parts/shelf_bracket_cut.py | the cut file model | The bracket's cut file: the flat pattern on a CUT layer, its two bend lines on a BEND layer |
| exports.py | parts/shelf_bracket.step, parts/shelf_bracket_flat.step, cut/shelf_bracket_cut.dxf | The delivered files |
| parts/shelf_bracket_drawing.py | drawings/shelf_bracket_drawing.pdf | The bracket's engineering drawing |

Build: `cad run parts/shelf_bracket.py` from the project root builds the bracket, and `cad run
parts/shelf_bracket_cut.py` the cut file and the flat pattern in it, each a model with its own page. A run writes no
file: `cad run exports.py` writes the STEP files and the DXF. `cad run parts/shelf_bracket_drawing.py` draws the
bracket from its model.

The strength study, from the exported STEP: studies/shelf_bracket.study.json, solved with `cad step solve
parts/shelf_bracket.step --study studies/shelf_bracket.study.json --out studies/shelf_bracket`, which writes its
result into studies/shelf_bracket/.

Checks, run from the project root after `cad run exports.py`: `cad run checks/shelf_bracket_step_facts.py` (the
STEP's solid, volume and cylinders), `cad run checks/shelf_bracket_cut_facts.py` (the cut file's units, layers,
bend lines, flange depths and hole distances, for the SendCutSend preflight) and `cad run
checks/shelf_bracket_fea_probe.py studies/shelf_bracket/result.glb studies/shelf_bracket/result.json "[[14,-25],[14,-125]]"`
(the strength result's stress away from the wall holes).

Pictures: `cad step snapshot --job pictures/shelf_bracket_pictures.job.json` draws the card from the exported STEP.
The strength report's pictures were drawn with text-to-cad 0.7 from an earlier solve of the same study, which gave the
same numbers; the study's own pictures are the solve's, in studies/shelf_bracket/.
