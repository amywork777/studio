# Phone stand

## What it is

A desk stand for a phone, printed in one piece in PLA on a Bambu Lab P1S: an example project to learn Studio with. It holds a phone up to 80 mm wide and 12 mm thick in its case, leaning back at 65° from the desk, in portrait or landscape. The phone's back lies on the rest and its bottom edge on a ledge square to it, with an 8 mm lip in front. A charging cable's plug goes down through a slot in the ledge, and the cable runs along the base and out the back under the rest. It prints on its side with nothing to support, and stands a 1.05 N tap at the top of the screen with a 150 g phone in portrait before it tips.

## Decisions

- Hold the phone leaning back at 65° from the desk, its bottom on a ledge square to the rest, in a 14 mm slot for a 12 mm phone in its case, with an 8 mm lip (2026-10-26, assumed)
- Make it one part whose side profile is one sketch extruded 80 mm across, with every edge along the width rounded R2, so it prints on its side with its layers along the rest and the lip (2026-10-26, assumed)
- Put the cable slot through the ledge in the middle, 14 × 14 mm from the rest to the lip, and a 10 × 8 mm pass under the foot of the rest, so the plug goes straight down and the cable leaves at the back (2026-10-26, assumed)
- Cut back the cable slot's two uppermost corners as it prints, 3 mm across and 4 mm up, at 53°, after the FDM check found its flat roof bridging 14 mm against FDM's 10 mm; it now bridges 8 mm (2026-10-26, assumed)
- Size the stand for the largest phone, 80 × 165 × 12 mm, weighing 150 to 240 g; the length and the weights are assumed, not from the brief (2026-10-26, assumed)
- Check the tip-over against a 1 N tap square into the top of the screen, an assumed tap, and deepen the base from 130 to 140 mm and move the rest 10 mm forward after a 150 g phone in portrait tipped at 0.77 N; it now stands 1.05 N (2026-10-26, assumed)
- Print it in PLA (Bambu PLA Basic) on a Bambu Lab P1S with a 0.4 mm nozzle, at Bambu Studio's default 0.20mm Standard, rather than PETG: it warps less and the brief allows either (2026-10-26, assumed)
- Keep the drawing a prototype's, every size nominal, until a general tolerance is asked for (2026-10-26, assumed)

## Open actions

- Slice it: Bambu Studio 02.05.00.66's command line crashes on this Mac before slicing anything (exit 139, even `--info` on a plain cube), and OrcaSlicer is not installed. The presets are ready in `manufacturing/presets`; slice `parts/phone_stand_print.3mf` in Bambu Studio's window, or install OrcaSlicer and run the command in [the slicing notes](manufacturing/phone_stand_slice.md). Then send it with Bambu Connect.
- Read the slice's filament weight back into the tip-over: the printed mass, 66.5 g, is a hand estimate. The tip margin is thin (1.05 N against 1 N with a 150 g phone): more infill raises it, up to 1.48 N printed solid.
- Tap a printed stand with a light phone in portrait to check the 1 N assumption, and on a smooth desk check it does not slide before it tips; sliding is not checked. Add rubber feet if it slides.
- Try the user's own charging cable: its plug must pass the 14 × 14 mm slot and fit, with its strain relief, in the 35 mm under the ledge, and the cable must bend round into the 10 × 8 mm pass. Raise `LEDGE_HEIGHT` for a longer plug.
- Check on a real phone that the 8 mm lip does not cover too much of the bottom of its screen.
- Give the drawing a general tolerance: its report still names that a prototype sheet needs one.

## In this project

- The models: [the phone stand](parts/phone_stand.py), [as it prints](parts/phone_stand_print.py) and [with a phone in it](assemblies/phone_stand_portrait.py), with [the models' catalog](parts/README.md).
- Their files, from [`exports.py`](exports.py): [the stand's STEP](parts/phone_stand.step), [as it prints, STL](parts/phone_stand_print.stl) and [3MF](parts/phone_stand_print.3mf), and [the stand with a phone in it](assemblies/phone_stand_portrait.step).
- The checks: [FDM printability](parts/phone_stand_fdm.md), [powder printing (SLS or MJF)](parts/phone_stand_powder.md) and [mass, fit and tip-over](docs/phone_stand_mass_and_tip.md).
- Making it: [the slicing notes and presets](manufacturing/phone_stand_slice.md) and [the drawing](drawings/phone_stand_drawing.pdf).
- The documents: [PRD](docs/prd.md).
- Pictures: [with a phone](pictures/phone_stand_portrait_angle.png), [from the side](pictures/phone_stand_portrait_side.png), [the stand](pictures/phone_stand_angle.png), [from the back](pictures/phone_stand_back.png) and [as it prints](pictures/phone_stand_as_printed.png).
