# Custom features and implicits

Status: proposed (2026-11-17). The first step, custom features, is built on the `studio/custom-features`
branch of the text-to-cad fork (amywork777/text-to-cad-upstream). Everything after it is open for
discussion.

This page answers three recommendations Blake Courter (Omega, implicit modeling) made after
reviewing Studio and the GSL pull requests (amywork777/text-to-cad-upstream#6 and #7):

1. Keep feature-based modeling. It has real costs, but it is the model engineers already know, and
   Studio's bar is NX and SolidWorks (law 8).
2. Copy Onshape's FeatureScript, the main advantage Onshape has over other feature-based modelers.
3. An implicit version is reasonable, as an nTop-like DAG rather than a tree, and it can use the same
   features.

## Decision 1: the design tree stays the one history

A part is its script (law 3), and the design tree is that script read line by line
(`text-to-cad/packages/cad/src/cad/edit/tracer.py`: one row for each line of the function that designs
the part). Nothing changes here. Custom features and implicits are added to this model. They do
not replace it with a second history.

## Decision 2: custom features are FeatureScript for build123d

FeatureScript is useful because a feature is code that the user can write. It has a name and typed,
bounded parameters. The tree shows each call as one row with those parameters as its inputs. The
same feature can be used again in any part, and the built-in features are written the same way.
Studio already has three of these pieces: features are code, the CAD service reads the inputs of
any line, and Edit Parameters changes a number in the place where it is written. The missing piece
was a way to declare that a function is one feature.

| FeatureScript | Studio |
| --- | --- |
| `defineFeature` | `@feature("Bolt Circle", ...)` from `cad.build123d` |
| precondition: `isLength`, `isAngle`, `isInteger`, bounds | `Length`, `Angle`, `Count` and `Number` specs with `min=` and `max=`, checked before any geometry is made (`FeatureError` names the feature and the parameter) |
| feature dialog | Edit Parameters on the declared parameters, labelled by their specs |
| queries (`qCreatedBy`, ...) | build123d selectors, written by position as the ribbon commands already write them |
| Feature Studio, shared libraries | a project's `features.py` next to its parts, imported by name, and listed by `library(module)` |

How the tree reads a call: the decorator pushes the call onto a context variable while the
function runs, and the tracer stamps each recorded operation with the outermost active call. A row
that contains stamped operations reads as that feature, using its name and its declared parameters,
however many cuts, patterns or fillets it makes inside. Without the decorator, the same function
would read as whatever operation it happened to make last. A call is still a plain call, so a part
builds the same way whether or not the tracer is running.

```python
from cad.build123d import Count, Length, feature

@feature("Bolt Circle", diameter=Length(min=0), count=Count(min=1), hole=Length(label="Hole Diameter"))
def bolt_circle(body, diameter, count, hole, depth=20):
    for place in PolarLocations(diameter / 2, count):
        body = body - place * Cylinder(hole / 2, depth)
    return body

body = bolt_circle(body, diameter=BOLT_CIRCLE, count=6, hole=6.6)  # one row: Bolt Circle1
```

The first step leaves these out on purpose, each planned as a later change:

- A Toolbox or ribbon entry for each feature in a project's library, so a feature can be added from the
  toolbar with its own dialog and not only by the agent or by hand. `library()` already provides the
  data that entry needs.
- An icon for a custom feature. Today it uses the generic feature icon, and the tree numbers it by
  its name (`nx.js` keeps any kind it does not know).
- Libraries shared across projects, with versions, which FeatureScript gets from Onshape's document
  versions. In Studio this would be a package or a Version that a project pins, not a copied file.
- Faster rebuilds for each feature. The engine's `memo` already replays a function's result, so it
  could apply to a feature call whose inputs have not changed.

## Decision 3 (proposed): implicits are their own documents with a DAG, linked to the tree by features

Four places implicits could live, from the least invasive to the most:

| Option | What it means | Status |
| --- | --- | --- |
| A. GSL as its own document type | a `.gsl` opens in the CAD Viewer as its field | #6, decided "for now" |
| B. Concepts as parts of an assembly | `gsl.concept(...)` placed among exact parts, `gsl.baked(...)` marks the exact part made from a concept | #7 |
| C. Implicit features in the B-rep tree | a field operation as a row between B-rep rows | not recommended |
| D. An nTop-like DAG view of an implicit document | the field graph drawn as nodes and edges, with each node's parameters editable | proposed, Studio-side only |

Recommendation: A and B as Blake built them, then D, and not C.

- A B-rep part's history is linear. Each row changes the one body. A field model is a graph: a
  blend reads two fields, and an offset of a lattice can feed three later nodes. Showing a graph as
  a tree either hides the shared inputs or duplicates them. So the B-rep tree stays a tree, and an
  implicit document gets its own DAG view (D).
- The features can be the same. A custom feature is just a function with declared parameters, so
  the same `@feature` declaration can describe a field node, with the same specs, the same Edit
  Parameters panel and the same `library()` listing. The DAG view would then be the tree's
  counterpart for a `.gsl` document, built on one feature mechanism.
- The link between the two is the boundary that already exists in #7: a concept placed in an
  assembly, and Bake, which turns it into an exact part. Bake could also be a custom feature in a
  B-rep part's tree (`body = bake(body, "knob.gsl", wall=2.5)`), so editing the concept's
  parameters rebuilds the exact part the same way any other row does.
- Any DAG UI belongs in Studio's viewer and not in omega-core. Blake was explicit that omega-core
  should not carry such a UI.

## Simulation

Simulation already uses CalculiX: `cad.calculix` runs `ccx` from the `cad-ccx` package (`cad[calculix]`),
and the strength check reports only what a real run returned (law 4).

## Open questions for the call

1. Should a custom feature be allowed to return several bodies, or only change the one body it is
   given? FeatureScript allows several. Studio's ribbon assumes one body.
2. Where should a team's feature library live: in a project, in a shared Studio folder (as
   Templates are), or in a versioned package?
3. For D: is the DAG view authored (wire nodes by hand, as nTop does) or read-only from the
   GSL source (as the tree is read from the script)? Law 3 points to read-only, with edits
   changing the source.
4. Does #6's "for now" on `.gsl` as a document type become permanent once D exists?
