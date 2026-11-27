# Stress check: bracket (parts/bracket.py)

- Solver: linear static, second-order tetrahedra, 0.8 mm at the fillet
- Material: as set in the case
- Fixtures: both M5 holes fixed (bolted to the frame); the base's underside resting on the frame (no penetration)
- Load: 1000 N on the upright's top 10 mm, pulling away from the base (+X)

| Region                             | Max von Mises |
| ---------------------------------- | ------------- |
| Inside R6 fillet, upright root     | 188 MPa       |
| Upright, at half its height        | 85 MPa        |
| Upright, top quarter               | under 35 MPa  |
| Base, round the holes              | 60 MPa        |
| Base, beyond the holes (x > 35 mm) | under 10 MPa  |

Max displacement 0.53 mm at the upright's top edge.

Hand check: bending at the upright's root, 6 M / (b t^2) = 6 x 1000 N x 39 mm / (40 mm x (6 mm)^2) = 163 MPa
nominal; the R6 fillet's stress concentration (about 1.15) gives the 188 MPa.
