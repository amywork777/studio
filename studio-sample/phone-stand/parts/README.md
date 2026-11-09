# Models

| Script | Makes | Purpose |
| --- | --- | --- |
| parts/sizes.py | | The largest phone the stand is for, shared by the placeholder, the assembly and the tip-over check |
| parts/phone_stand.py | the phone stand model | The phone stand: its side profile sketched and extruded, its edges filleted, the cable slot and the cable pass cut |
| parts/phone_stand_print.py | the stand as it prints | The stand turned onto its side as it prints, for the slicer and the FDM check |
| parts/phone_placeholder.py | the placeholder phone model | A placeholder for the largest phone, not a real phone's model |
| assemblies/phone_stand_portrait.py | the stand with the phone model | The stand with the placeholder phone in it in portrait |
| exports.py | parts/phone_stand.step, parts/phone_placeholder.step, assemblies/phone_stand_portrait.step, parts/phone_stand_print.stl, parts/phone_stand_print.3mf | The delivered files |
| parts/phone_stand_drawing.py | drawings/phone_stand_drawing.pdf | The stand's engineering drawing |
| checks/phone_stand_tip.py | docs/phone_stand_mass_and_tip.md | Mass, fit and tip-over |
| checks/phone_stand_print_facts.py | (prints JSON) | The bridges and plate contact the FDM check's tool does not measure |

Build: `cad run assemblies/phone_stand_portrait.py` from the project root builds the stand with the phone in it and
both parts, and `cad run parts/phone_stand_print.py` the stand as it prints, each a model with its own page. A run
writes no file: `cad run exports.py` writes the STEP files and the print files. The drawing and the checks call the
models themselves: `cad run parts/phone_stand_drawing.py` draws the stand, and `cad run checks/phone_stand_tip.py`
checks it again.

Pictures: `cad step snapshot --job pictures/phone_stand_pictures.job.json` draws them from the exported STEP files and
STL.
