# Phone stand: mass, fit and tip-over

Checked `parts/phone_stand.py` and `assemblies/phone_stand_portrait.py` with `cad run checks/phone_stand_tip.py`. Every number below comes from that run.

## Verdict

**It stands.** The weakest case is a 150 g phone in portrait: a tap of 1.05 N square into the top of its screen tips it back, against the 1 N it must stand (assumed). The phone fits: it sits in the slot without touching anything but the rest and the ledge, 2 mm behind the lip.

## Mass

The stand is 119.9 cm³ of solid, its centre of mass at (0, 55.48, 25.46) mm.

| Material | Solid (g) | Printed, estimated (g) |
|---|---|---|
| PLA (Bambu PLA Basic) | 151.1 | 66.5 |
| PETG (Bambu PETG HF) | 153.5 | 67.5 |

Densities are Bambu Studio's presets. The printed mass is a hand estimate for Bambu Studio's default P1S process (0.20mm Standard): a skin 0.87 mm thick (its two walls) over the part's whole surface, solid, and the rest at 15% infill. The slicer was not run here (see the README's Open actions), so it is not the slicer's figure; the tip-over uses it, and the solid mass for comparison.

## Tip-over

The base's flat bottom runs from 2 to 138 mm back from its front edge (its edges are rounded R2). Empty, the stand's centre of mass is 82.52 mm ahead of the rear edge. With a phone in it, it tips back about that edge when a tap's moment passes the weight's. The tap pushes square into the screen at the top in the middle, the worst place; the phone stands on the ledge with its back on the rest, its weight at its middle.

| Phone | Mass (g) | Centre of mass ahead of the rear edge (mm) | Tap that tips it (N) | With a solid stand (N) | Stands 1 N |
|---|---|---|---|---|---|
| portrait | 150 | 78.47 | 1.05 | 1.48 | yes |
| portrait | 240 | 77.94 | 1.48 | 1.91 | yes |
| landscape | 150 | 90.91 | 2.63 | 3.56 | yes |
| landscape | 240 | 92.0 | 3.77 | 4.7 | yes |

The phone is the largest the stand is for, 80 × 165 × 12 mm (parts/sizes.py; the length is assumed), at the lightest and heaviest a large phone in a case is likely to weigh (assumed). A lighter phone tips more easily, as its weight holds the stand down behind the tap. Sliding is not checked: a tap's push back can slide the stand before it tips on a slippery desk.

## Fit

- The phone placeholder overlaps the stand by 0.0 mm³ and touches it (0.0 mm): on the rest and the ledge, as it stands.
- The slot is 14 mm wide for a 12 mm phone: 2 mm to the lip.
- The lip stands 8 mm above the ledge, over the bottom of the screen.
