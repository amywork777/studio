# Shelf bracket: strength under 15 kg on the shelf

The shelf bracket holds 15 kg on its shelf flange, the whole shelf's load on one bracket, with a safety factor of 2.43 in the bracket itself: its stress peaks at 130.8 MPa, against 317.2 MPa yield for G90-074, at the corner relief's R1 round. The study's own figure is lower, 1.47, because it reads its 215.4 MPa peak at the edge of a wall hole held perfectly rigid, where the model exaggerates; just outside a screw head's footprint the wall flange is at 104 MPa. The arm's tip moves 0.91 mm, 0.34 mm of it down.

## What was asked

A strength check of the shelf bracket (`parts/shelf_bracket.step`) holding a 200 mm deep shelf with up to 15 kg on it, with its wall holes fixed: its peak stress, the deflection at its tip and its safety factor, kept at 2 or more.

## What was done

- A linear static study of the bracket on its own (`studies/shelf_bracket.study.json`), solved by CalculiX 2.23 on text-to-cad 0.11 (`cad step solve parts/shelf_bracket.step --study studies/shelf_bracket.study.json --out studies/shelf_bracket`). The result is in `studies/shelf_bracket/`: the numbers in `result.json`, the coloured part in `result.glb` and its picture in `stress.png`.
- Material: G90-074 at SendCutSend's figures: Young's modulus 199,948 MPa (29,000 ksi), Poisson's ratio 0.30, yield 317.2 MPa (46 ksi), density 7.849 t/m³.
- Supports: the two Ø5.5 mm wall-screw holes are held fixed. The wall itself is not in the model: nothing holds the flange's back face against it.
- Load: 147.1 N (15 kg) straight down, spread evenly over the shelf flange's top face, whose middle is 93.5 mm from the wall. A uniform 15 kg on a 200 mm shelf puts its weight 100 mm out, but on two brackets; the study puts all of it on one, about twice what each carries.
- Mesh: 47,425 quadratic tetrahedra at 5.89 mm, made finer, 0.6 mm, within 8 mm of each wall hole, and 0.3 mm within 4 mm of the corner relief's round.
- Mesh check: at 5.89 mm the part already has 236,052 degrees of freedom, too close to text-to-cad's 250,000 limit for the finer solve that would check convergence, so this run leaves it unchecked. The same study solved separately at 4.94 mm (49,067 elements, 245,715 degrees of freedom) gave 218.7 MPa at the same hole's edge, 1.5% above. The relief round's 130.8 MPa sits in its 0.3 mm mesh, a third of its radius.
- Hand check:
  - The load's moment at the wall is 147.1 N × 93.5 mm = 13,760 N·mm. Taken by the two screws 100 mm apart, it pulls the upper one out of the wall and pushes the lower one in with about 138 N each.
  - That pull bends the wall flange between the screw and its bend, 10.5 mm: 1,450 N·mm. Over about 30 mm of flange, 1.88 mm thick, that is about 82 MPa, in line with the 70 to 104 MPa the study finds 1 to 3 mm outside the hole.
  - The web carries the moment on its full 150 mm depth at the wall, about 2 MPa: the body of the bracket is barely loaded, and the stress gathers where the load turns into the wall flange.

## Results

Positions are in the bracket's frame: from the outside corner where the shelf meets the wall, on the web's outside face, with Y out from the wall, Z up and X the way the flanges turn. The values away from the peak were read off `studies/shelf_bracket/result.glb` with `checks/shelf_bracket_fea_probe.py`.

| Result | Value | Where |
| --- | --- | --- |
| Peak stress (von Mises), as the study reports it | 215.4 MPa (223.5 MPa at the elements' own points) | The upper wall hole's edge nearest the bend, a fixed face: (11.26, 1.88, -24.78) mm |
| Wall flange, 0.75 to 1.75 mm out from a hole's edge | 148.1 MPa | Beside the upper hole |
| Wall flange, 1.75 to 3.25 mm out, under a screw head's rim | 103.6 MPa | Beside the upper hole |
| Wall flange, 3.25 to 5.25 mm out | 69.5 MPa | |
| Peak stress more than 12 mm from both wall holes | 130.8 MPa | The corner relief's R1 round, on the web's outside face: (0, 6.9, -6.43) mm |
| The shelf bend, past the relief | 46.8 MPa | |
| The web's sloping free edge | 17.1 MPa at the most | |
| Yield, G90-074 | 317.2 MPa | |
| Safety factor, the study's (at the fixed hole) | 1.47 | |
| Safety factor in the bracket itself (at the relief) | 2.43 | |
| Tip movement | 0.910 mm: 0.339 mm down and 0.843 mm sideways (X) | The arm's tip face; the 'Tip sag' check, against 1 mm, is close |
| Load and reaction | 147.1 N down; 147.1 N up at the wall holes | They balance |
| Findings | `low_margin` and `peak_at_fixture`, both warnings, both at the upper wall hole; two notes about the run: 236,052 degrees of freedom make a slow solve, and leave no room under the 250,000 limit for a finer one | |

![The shelf bracket's stress, seen from the flanges' side](shelf_bracket_strength.png)

The bracket from the flanges' side. Colours run from blue at 0 MPa through cyan, green and yellow to red at the 215.4 MPa peak, and the shape is drawn bent 13 times its true movement. The red is only at the two wall holes' edges. These two pictures were drawn with text-to-cad 0.7 from an earlier solve of the same study, which gave the same numbers; the 0.11 solve's own is `studies/shelf_bracket/stress.png`.

![The shelf bracket's stress, from the web's outside face](shelf_bracket_strength_web.png)

From the web's outside face, the wall flange on the right: the lighter patch at the top right is the corner relief, the bracket's most stressed place away from the holes.

## Verdict

It passes in the bracket itself: 130.8 MPa at the corner relief is 0.41 of yield, a safety factor of 2.43 against the 2 asked, with the whole 15 kg on one bracket. The study's own verdict is Ready with two warnings: its peak, 215.4 MPa and a safety factor of 1.47, sits on the edge of a wall hole held perfectly rigid, which the run itself flags as exaggerated (`peak_at_fixture`). A real screw clamps the flange under its head, about Ø10 mm, and just outside that rim the flange is at 104 MPa, a safety factor of 3.1. The bracket was not changed for these warnings; a study with the screw heads and the wall in it would settle them (Open actions).

The tip moves 0.91 mm, under the 1 mm asked but close. Most of it is sideways: the shelf flange sits 13 mm to one side of the web, so the load twists the arm. A shelf board screwed down onto both brackets holds that twist, and the model has no board.

## What it assumes

- Linear static: the holes are rigid, the load steady and small enough to move the bracket only a little.
- The wall is not modelled. The screws alone hold the bracket, so the flange's lower part is not pushed back by the wall, which reads the lower hole's stress high too.
- The load is spread evenly over the shelf flange. A heavy object at the shelf's front edge, 200 mm out, past the arm's 180 mm tip, would load it harder; on one bracket that is about twice this study's moment (147.1 N × 200 mm against × 93.5 mm).
- No shelf board: nothing holds the arm from twisting.
- The bracket is drawn at SendCutSend's 1.88 mm stock; their sheet can be up to 0.10 mm thinner (0.004 in), which takes about 10% off its bending strength.
- Not studied: the screws and plugs pulling out of the wall, repeated loads, buckling of the web's free edge (its stress, 17 MPa, is low), and someone leaning on the shelf.

## What to do next

1. Model the screw heads and the wall: a contact study with the wall as a part, or the flange's back face held where the wall presses. It would replace the rigid-hole peak with a real one.
2. Check the screws and plugs for about 138 N of pull on the upper one, with the chosen wall's fixings.
3. If loads at the shelf's front edge matter, solve that case too.
4. Load the first pair with a board and 15 kg, and look for a bend at the upper wall hole and the corner relief.
