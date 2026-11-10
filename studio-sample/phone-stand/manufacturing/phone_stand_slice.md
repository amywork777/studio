# Phone stand: slicing for the Bambu Lab P1S

**Not sliced yet.** The presets are ready; the slice itself could not run on this machine.

## The presets

Written by the print3d skill's `scripts/orca_presets.py`, pointed at Bambu Studio's own profiles (OrcaSlicer is not installed here, and its presets are Bambu Studio's format):

```bash
python scripts/orca_presets.py --profiles /Applications/BambuStudio.app/Contents/Resources/profiles \
  --printer "Bambu Lab P1S 0.4 nozzle" --process "0.20mm Standard @BBL X1C" \
  --filament "Bambu PLA Basic @BBL P1S 0.4 nozzle" --out manufacturing/presets
```

- `presets/printer.json`: Bambu Lab P1S 0.4 nozzle, its plate 256 × 256 mm and 250 mm tall.
- `presets/process.json`: 0.20mm Standard @BBL X1C, the P1S's default process: 0.2 mm layers, 2 walls, 15% grid infill.
- `presets/filament-1.json`: Bambu PLA Basic @BBL P1S 0.4 nozzle: 220 °C nozzle, 55 °C plate, 1.26 g/cm³.

## Why it did not slice

Bambu Studio 02.05.00.66's command line crashes on this Mac before it slices anything: `BambuStudio --slice 0 ...` exits 139 (a segmentation fault), and so does `BambuStudio --info` on a plain 20 mm cube. Its crash report puts the fault in `Slic3r::GUI::PartPlateList::generate_print_polygon`, which calls `GUI_App::plater()` from the command line, where there is no plater. It is Bambu Studio's bug, not the model's or the presets'. Adding the `nozzle_volume_type` its log asks for did not help.

## To slice it

Either of these, then hand the `.gcode.3mf` to Bambu Connect with the print3d skill:

- Open `parts/phone_stand_print.3mf` in Bambu Studio (`open -a BambuStudio parts/phone_stand_print.3mf`), pick the P1S, 0.20mm Standard and Bambu PLA Basic, check it lies on its side with nothing to support, slice it and export the plate's sliced file to `manufacturing/phone_stand.gcode.3mf`.
- Or install OrcaSlicer (`brew install --cask orcaslicer`) and slice headless with these presets:

  ```bash
  /Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer parts/phone_stand_print.stl \
    --load-settings "manufacturing/presets/process.json;manufacturing/presets/printer.json" \
    --load-filaments manufacturing/presets/filament-1.json \
    --arrange 1 --slice 0 --outputdir "$PWD/manufacturing" --export-3mf phone_stand.gcode.3mf
  ```

Then read the slice's filament weight and time back into `docs/phone_stand_mass_and_tip.md`: its printed mass is a hand estimate until then.
