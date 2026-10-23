# Sketching

`cadgen.sketch` draws a part's profiles the way a CAD tool's sketcher does: points, lines, arcs
and circles on a plane, held by relations and dimensions, solved when the script runs. Use it
for a profile an engineer will want to read and change as a sketch: a bracket's outline, a slot,
a plate with holes. The CAD viewer's edit mode shows it under its feature in the design tree
(Boss-Extrude1, then Sketch1) with its dimensions as the feature's inputs, marked (-) while it is
under defined, as SolidWorks marks it.

```python
from build123d import extrude
from cadgen import step
from cadgen.sketch import Sketch

LENGTH = 70
WIDTH = 25
HOLE = 8
THICKNESS = 5

@step(out="plate.step")
def plate():
    s = Sketch("Sketch1", plane="Top")
    bottom, right, top, left = s.rectangle((0, 0), (70, 25))
    s.coincident(bottom.start, s.origin)
    s.length(bottom, LENGTH)
    s.length(left, WIDTH)
    hole = s.circle((35, 12.5), 4)
    s.diameter(hole, HOLE)
    s.horizontal_distance(bottom.start, hole.center, LENGTH / 2)
    s.vertical_distance(bottom.start, hole.center, WIDTH / 2)
    return extrude(s.face(), amount=THICKNESS)
```

## Planes

- `plane="Top"` is XY, `"Front"` is XZ, `"Right"` is YZ: the origin's planes as a CAD tree names
  them. A build123d `Plane` sketches on that. A planar `Face` of a solid sketches on the face's
  plane as a CAD tool does: its origin where the part's origin falls on that plane, its x along the
  part's X (Y on a face square to X), facing out of the solid. `offset=` moves the sketch along
  the plane's normal.
- An extrude of `s.face()` goes the way the plane faces (Top: up, Front: toward -Y, Right: +X, a
  face: out of the solid); a negative amount goes the other way.
- `unit=` is how many millimetres one of the sketch's units is: `unit=INCH` in a part sized in
  inches, so its coordinates and dimensions read in inches (`s.length(line, LENGTH)` with
  `LENGTH = 2.80`). Angles are in degrees either way.

## Geometry

- `s.point(x, y)`, `s.line(a, b)`, `s.polyline(*points, closed=True)`, `s.circle(center, r)`,
  `s.arc(center, start, end, clockwise=False)`, `s.three_point_arc(start, through, end)`.
- `s.spline(*points, closed=False)` passes through its points in order (two at least, three
  closed); `closed=True` runs on round to the first, a loop of its own. Its points
  (`spline1.points[1]`, `spline1.start`, `spline1.end`) move it and take dimensions;
  `s.tangent(line1, spline1)` makes the end they share run on the way the line (or an arc) runs
  there; the tools
  that cut, run on or copy curves (trim, extend, offset, mirror, patterns, sketch fillets) take
  lines, arcs and circles.
- Helpers that add their own relations, as the sketcher's tools do: `s.rectangle(corner,
  opposite)` (bottom and top horizontal, sides vertical; returns bottom, right, top, left),
  `s.center_rectangle(center, corner)`, `s.slot(center1, center2, radius)`, `s.polygon(center,
  vertex, sides=6)` (its lines of one length, corners on a construction circle; returns the lines
  round it from `vertex`, then the circle).
- Points are shared: a line from a rectangle's corner is joined to it. An (x, y) pair makes a
  new point. `s.origin` is the sketch's fixed origin to dimension from.
- `construction=True` keeps a line out of the profile (a centerline, a diagonal).

## Relations and dimensions

- Relations: `coincident`, `horizontal`, `vertical`, `parallel`, `perpendicular`, `collinear`, `tangent`,
  `equal`, `midpoint`, `symmetric(a, b, about)`, `concentric`, `fix`.
- Dimensions: `distance(a, b, size)`, `length(line, size)`, `horizontal_distance(a, b, size)`,
  `vertical_distance(a, b, size)`, `radius(curve, size)`, `diameter(curve, size)`,
  `angle(line1, line2, degrees)`.
- Give dimensions the part's named sizes (`LENGTH`, `LENGTH / 2`), not bare numbers, so a change
  of a size moves the sketch, and so the engineer changes it by name in edit mode.
- `driven=True` makes any dimension a driven (reference) dimension, as SolidWorks shows one in
  parentheses: it measures what the sketch already sets and holds nothing, so it never over
  defines the sketch. Sketch mode writes one when the engineer dimensions something already set.

## Sketch tools

- `s.fillet(line1, line2, radius)` rounds the corner where two lines meet (Fillet1, its radius a
  dimension). The lines keep their ends at the corner, its virtual sharp, so dimensions to the
  corner still measure to it; the face is made with the corner rounded.
- `s.linear_pattern([circle1, ...], along, spacing, count)` copies curves and points in a row,
  `along` an angle in degrees from the sketch's x axis or a line of the sketch whose way they
  follow; `s.circular_pattern([...], center, count, angle=360)` turns copies about a point, spread
  over the angle. Each copy is held to its original moved (or turned) by its place; the spacing or
  the angle is a dimension. Both return the copies, instance by instance.
- `s.chamfer(line1, line2, distance)` cuts that corner with a line `distance` back along each
  (Chamfer1, its distance a dimension), the corner kept as a fillet keeps it.
- `s.offset_entities(made, source, distance)` holds offset curves (a curve, or lists in step)
  that far from their source: each line parallel to its own, to the side it is drawn on, each arc
  or circle around its own's center, an open chain's ends square across from the source's. One
  dimension for the chain. Draw each offset curve where it falls, sharing its corners.
- A mirror is plain relations: `s.symmetric(point, its_mirror, centerline)` for each new point,
  and `s.equal(mirrored_arc, arc)` for an arc or circle.
- `s.convert(edges)` is Convert Entities: the model's edges (or the faces and wires they bound)
  projected onto the sketch as lines, arcs and circles, each held On Edge where the model puts it
  (a relation, `OnEdge1`), so they follow the part when its sizes change. Write it after the body
  it takes them from: `outline = s.convert(part.faces().sort_by(Axis.Z)[-1])`. Its curves are
  `outline[0]`, `outline[1]`, ...; offset them, fillet their corners or dimension to them. A
  spline edge, an ellipse or a circle tilted to the sketch comes in as a spline through places
  along it, each fixed where the model puts it (closed for a closed edge). `construction=True` brings them
  in dashed, to hold an offset or a dimension without being part of the profile.
- `s.intersection(body)` is Intersection Curve: the edges where the body crosses the sketch's
  plane, for `s.convert` to bring in and hold there as the body changes:
  `section = s.convert(s.intersection(part), construction=True)`.
- Draw each point near where it ends up: the solver starts from the drawing and leaves what no
  dimension fixes where it was drawn.

## How defined it is

- `s.status` is Fully defined, Under defined or Over defined, and `s.dof` the ways it can still
  move. Tie the sketch to `s.origin` and dimension every size to fully define it.
- Relations that cannot all hold raise `SketchError` naming them. Over defined (a dimension that
  adds nothing) still solves, and `s.solve().redundant` names the extra one: remove it.
- `s.face()` is the one closed region, holes cut out. `s.faces()` lists several regions. An open
  profile raises `SketchError` naming the point where it is open.
- `s.axis(line)` is one of the sketch's lines as a build123d `Axis` in the part, for a revolve:
  `revolve(s.face(), axis=s.axis(centerline), revolution_arc=360)`. Draw the axis as construction
  geometry (`construction=True`) so it is not part of the profile.
- `s.depth_to(target)` is how far a flat face parallel to the sketch, or a vertex, is from the
  sketch's plane along its normal (negative behind it): an extrude's depth Up To Surface or Up To
  Vertex, `extrude(s.face(), amount=s.depth_to(part.faces().sort_by(Axis.Z)[-1]))`.
- `s.path()` is the sketch's curves joined end to end into one build123d `Wire`, open or closed:
  what a sweep runs its profile along, `sweep(profile.face(), path=s.path(),
  transition=Transition.RIGHT)` (mitred at a sharp corner). Curves that branch, or make more than
  one chain, raise `SketchError`.
- `s.thin(thickness, side="inside")` is the outline as a wall, as a Thin Feature makes one: faces to
  extrude, inside a closed outline, `"outside"` it, or `"mid"` astride it; beside an open one's
  curves, square at their ends. `extrude(s.thin(1.5), amount=20)`.
- `s.rib(thickness, body, flip=False)` is a rib grown parallel to the sketch: its straight lines
  thickened across its plane (half each side) and grown in the plane, square to each line, until
  they meet `body`. `part += s.rib(2, part)`; `flip=True` grows it the other way, and a rib that
  meets nothing raises `SketchError` saying to flip it.

## Editing

The engineer edits sketches in the CAD viewer's sketch mode, which writes these same lines: see
[edit-mode.md](edit-mode.md), "Sketches drawn by hand". When they change a sketch's dimension, it
rewrites that number (or the named size it is) in the script, and the next run solves the sketch
again. Read the script again before changing it, and keep their values.
