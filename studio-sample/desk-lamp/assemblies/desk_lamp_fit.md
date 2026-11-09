# Fit, clearance and motion: desk lamp

Checked the lamp's model, `assemblies/desk_lamp.py`: its 11 parts at rest, all 55 pairs of them, then the fits a touching joint hides, then each hinge swung until a part collides or goes through the desk, then every pose of the two together in 15 degree steps.

## Verdict

**No part collides at rest.** 10 pairs touch where the design joins them, and 2 of 2 M3 screws overlap their pilot holes by just their thread. The arm tilts clear from -45 to +136 degrees about its rest (55 degrees up from the desk), and the head from -46 to +175 degrees about hanging level. 28 of the 238 poses of the two together are blocked. At the worst pose the lamp's balance point is 26.2 mm inside the base's edge, so it does not tip.

## The hinges' range

Positive lifts: the arm up and back, the head's front up. Each end is the last whole degree clear.

| Hinge | From (degrees) | Stopped by | To (degrees) | Stopped by |
|---|---|---|---|---|
| Arm on the base (`tilt`) | -45 | goes 2.0 mm through the desk | +136 | goes 2.6 mm through the desk |
| Head on the arm (`head`) | -46 | the head hits the arm | +175 | the head hits the arm |

In the model the arm is 55 degrees up from the desk at rest, so it reaches from 10 to 191 degrees up from the desk. The assembly's `tilt` and `head` joints take these ranges, rounded in to whole 5 degrees.

Together, in 15 degree steps within those ranges, 28 of 238 poses are blocked, each by a part going through the desk:

| Tilt (degrees) | Head angles blocked (degrees) |
|---|---|
| -45 | -46, -45, -30, -15 |
| 120 | 120, 135, 150, 165, 175 |
| 135 | 60, 75, 90, 105, 120, 135, 150, 165, 175 |
| 136 | 45, 60, 75, 90, 105, 120, 135, 150, 165, 175 |

## Holding its position

Each hinge holds by friction: its screw clamps the arm's two faces between the cheeks. The weight of what it carries turns it, most of all with the arm far out:

| Hinge | Most torque to hold (N·m) | At tilt, head (degrees) | Clamp needed (N) | Screw torque, estimate (N·m) |
|---|---|---|---|---|
| Arm on the base | 0.166 | 120, 60 | 48 | 0.05 |
| Head on the arm | 0.022 | -45, 45 | 6 | 0.01 |

The clamp and the screw torque are estimates on two assumptions, a friction of 0.3 between PETG faces and a nut factor of 0.2, with the arm's faces slipping on an annulus from its Ø5.5 hole to its R8 end: set each hinge's tension on the first lamp by test (the work instructions' last step, docs/desk_lamp_work_instructions.pdf) rather than to these numbers.

## Balance

The lamp's balance point, from the masses below with the printed base left out, is at worst 33.2 mm from the base's centre (tilt 120, head 60), inside the 59.4 mm the base stands on.

| Part | Mass (g) |
|---|---|
| base | 186.2 |
| weight | 498.8 |
| m5x30_screw:base_hinge | 6.4 |
| m5_locknut:base_hinge | 1.1 |
| arm | 31.4 |
| m5x30_screw:head_hinge | 6.4 |
| m5_locknut:head_hinge | 1.1 |
| head | 42.7 |
| led_module | 5.8 |
| m3x8_screw:left | 0.9 |
| m3x8_screw:right | 0.9 |
| All | 781.7 |

Printed parts are weighed solid, at PETG's 1.27 g/cm³; printed at a lower infill they are lighter, which leaves the head lighter and the lamp steadier. The steel is 7.85 g/cm³ and the LED module is taken as aluminium, 2.70 g/cm³.

## Where parts touch at rest

| Parts | Joint |
|---|---|
| base · weight | the weight is bonded into the base's pocket, its top on the pocket's ceiling |
| base · m5x30_screw:base_hinge | the hinge screw's head bears on the clevis's cheek |
| base · m5_locknut:base_hinge | the locknut bears on the clevis's other cheek |
| m5x30_screw:base_hinge · m5_locknut:base_hinge | the locknut runs on the screw |
| m5x30_screw:head_hinge · m5_locknut:head_hinge | the locknut runs on the screw |
| m5x30_screw:head_hinge · head | the hinge screw's head bears on the yoke's cheek |
| m5_locknut:head_hinge · head | the locknut bears on the yoke's other cheek |
| head · led_module | the LED board's back sits on the head's two bosses |
| led_module · m3x8_screw:left | the screw's head clamps the LED board |
| led_module · m3x8_screw:right | the screw's head clamps the LED board |

Each M3 screw is drawn at its 3.0 mm thread inside its boss's 2.5 mm pilot hole, so it overlaps the boss by its thread, all of it in the ring between the two diameters: m3x8_screw:left 13.005 mm³ (all in the ring), m3x8_screw:right 13.005 mm³ (all in the ring).

## Fits

Gaps a touching joint hides, measured between the features that make each fit.

| Fit | Gap (mm) |
|---|---|
| the arm between the clevis's cheeks, each side | 0.100 |
| the arm between the yoke's cheeks, each side | 0.100 |
| the base hinge's screw in the arm's hole | 0.250 |
| the base hinge's screw in its cheeks' holes | 0.250 |
| the head hinge's screw in the arm's hole | 0.250 |
| the head hinge's screw in its cheeks' holes | 0.250 |
| the left M3 screw in the LED board's hole | 0.100 |
| the right M3 screw in the LED board's hole | 0.100 |
| the weight in the base's pocket, round its side | 0.100 |

## How it was checked

- Every pair of parts at rest: the exact overlap of their solids (`cad.build123d.overlap_volume`, mm³) and the least distance between them (`closest_points`, mm), in the lamp model's own placements.
- An overlap above 0.01 mm³ is a collision unless it is an M3 screw's thread in its pilot hole; parts closer than 0.0001 mm touch; a gap under 0.5 mm is tight. These limits are this check's own, chosen for this design.
- Each hinge swung from rest in 5 degree steps, then a degree at a time, about the axis the assembly's joints declare: the arm with everything it carries, against the base, the weight and the base hinge's screw and nut; the head with the LED module and its screws, against the arm and everything else. A pose is blocked by an overlap, or by any part below the desk (z < 0).
- Not checked: the LED's lead, which is not modelled; the hinge screws' thread in the locknuts, drawn as touching; and the friction itself, which only a built lamp shows.
