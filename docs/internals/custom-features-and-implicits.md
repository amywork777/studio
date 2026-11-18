# Custom features and implicits

Status: proposed (2026-11-17).

- **Custom features:** built on the `studio/custom-features` branch of the text-to-cad fork
  (amywork777/text-to-cad-upstream#8).
- **Graph view of a GSL model:** prototyped on `studio/gsl-graph`, stacked on Blake's #7.
- **Still open:** everything listed as "not yet" below.

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
the part). Custom features and implicits are added to this model. They do not replace it with a
second history.

## Decision 2: custom features are FeatureScript for build123d

FeatureScript is useful because a feature is code that the user can write. It has a name and typed,
bounded parameters. Onshape builds the feature's dialog from those parameters, and the tree shows
each call as one row. Studio already had three of these pieces: features are code, the CAD service
reads the inputs of any line, and Edit Feature rewrites a line in place. The missing pieces were the
declaration, the dialog built from it, and the toolbar.

```python
from cad.build123d import Angle, Bool, Count, Edges, Enum, Length, feature

@feature("Bolt Circle", collapsed=("Options",), diameter=Length(min=0), count=Count(min=1, max=24),
         hole=Length(label="Hole Diameter", min=0),
         spread=Enum({"full": "Full circle", "half": "Half circle"}, group="Options"),
         start=Angle(label="Start Angle", group="Options"), staggered=Bool(group="Options"))
def bolt_circle(body, diameter, count, hole, spread="full", start=0, staggered=False, depth=20):
    ...

@feature("Edge Break", edges=Edges(), size=Length(min=0), style=Enum({"round": "Round", "chamfer": "Chamfer"}))
def edge_break(body, edges, size=1, style="round"):
    ...

body = bolt_circle(body, diameter=BOLT_CIRCLE, count=6, hole=6.6)  # one row: Bolt Circle1
```

### How it maps to FeatureScript

Sources: the FeatureScript UI spec (https://cad.onshape.com/FsDoc/uispec.html), its standard library
(https://cad.onshape.com/FsDoc/library.html), its output functions
(https://cad.onshape.com/FsDoc/output.html) and Onshape's custom feature help
(https://cad.onshape.com/help/Content/customfeature.htm).

| FeatureScript                                                                                                                | Studio                                                                                                                                                         | Built                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `defineFeature(function(context, id, definition) precondition {...} {...})`                                                  | `@feature("Name", **specs)` on a function whose first parameter is the body it changes                                                                         | yes                                                                                  |
| `"Feature Type Name"`, `"Feature Type Description"`                                                                          | the name given to `@feature`, and the function's docstring (shown in the dialog and on the toolbar button)                                                     | yes                                                                                  |
| `isLength`, `isAngle`, `isInteger`, `isReal` with bounds specs                                                               | `Length`, `Angle`, `Count`, `Number` with `min=` and `max=`                                                                                                    | yes                                                                                  |
| A bounds spec's default                                                                                                      | the signature's own default, so the code holds one default, not two                                                                                            | yes                                                                                  |
| `is boolean` (check box)                                                                                                     | `Bool()`                                                                                                                                                       | yes                                                                                  |
| `enum` with `annotation {"Name": ...}` per value (dropdown)                                                                  | `Enum({"value": "Label", ...})`                                                                                                                                | yes                                                                                  |
| `Query` with `"Filter": EntityType.FACE/EDGE` and `"MaxNumberOfPicks"`                                                       | `Faces(max=)` and `Edges(max=)`, picked on the model and written as build123d selectors by position, as the ribbon's commands write them                       | yes                                                                                  |
| `"Group Name"`, `"Collapsed By Default"`                                                                                     | `group=` on a spec, `collapsed=(...)` on the feature                                                                                                           | yes, but FeatureScript folds groups by default and Studio folds only the ones listed |
| The dialog built from the precondition                                                                                       | `EditCustomFeature.jsx`: one control for each parameter (number with unit, check box, dropdown, pick field), ungrouped ones first, with preview, OK and Cancel | yes                                                                                  |
| A query box takes the selection while it has focus                                                                           | a pick field takes the viewer's selection while it is active                                                                                                   | yes                                                                                  |
| `regenError(message, faultyParameters)`: the feature becomes a no-op and the faulty parameters are highlighted red           | `FeatureError` carries `feature` and `param`. The build stops and nothing is written. The dialog leads with the feature's words and marks that parameter.      | yes                                                                                  |
| Custom features on the toolbar ("Add custom features")                                                                       | a **Custom** group on the Features tab listing every feature the project's files declare. Command search (S) finds them.                                       | yes                                                                                  |
| The toolbar links a specific document version, and the feature list says when a newer one exists                             | features come from the project's current files and are not versioned                                                                                           | not yet                                                                              |
| `reportFeatureInfo` / `reportFeatureWarning`                                                                                 | none                                                                                                                                                           | not yet                                                                              |
| Conditional parameters (`if` in the precondition)                                                                            | every declared parameter is always shown                                                                                                                       | not yet                                                                              |
| Array parameters                                                                                                             | none                                                                                                                                                           | not yet                                                                              |
| `UIHint`s (`REMEMBER_PREVIOUS_VALUE`, `HORIZONTAL_ENUM`, `OPPOSITE_DIRECTION`, ...)                                          | none                                                                                                                                                           | not yet                                                                              |
| Manipulators (`addManipulators`, `onManipulatorChange`: linear, angular, flip, points) and editing logic (`onFeatureChange`) | none. A number is typed, or changed by double-clicking a dimension the model already draws.                                                                    | not yet                                                                              |
| Feature Studio tab, the feature's icon                                                                                       | a Python file in the project, and the generic feature icon                                                                                                     | partly                                                                               |

How the tree reads a call:

- The decorator holds the call in a context variable while the function runs, and the tracer stamps
  each recorded operation with the outermost active call.
- A row that contains stamped operations reads as that feature, whatever it makes inside.
- Its parameters come back from the call as written (`custom.params`: value, code and group), so the
  dialog opens on what is in the script.
- A parameter the call leaves to its default is not a sized input. Editing that default would change
  the feature's file, and with it every part that calls the feature.
- OK goes through the same `plan()` as the ribbon's commands. It writes the call again in place (Edit
  Feature), or writes a new call after the body and imports the function. Only the values that changed
  are rewritten, so a size written by name (`diameter=BOLT_CIRCLE`) stays that name.

## Decision 3 (proposed): implicits are their own documents, read as a graph

### What nTop actually is

Sources: nTop's notebook and custom block documentation
(https://docs.ntop.com/Product-Documentation/ntop/_using-blocks/_notebook_anatomy.md,
https://docs.ntop.com/Product-Documentation/ntop/_using-blocks/custom_blocks) and support articles
on field-driven design (https://support.ntop.com/hc/en-us/articles/360041676813) and implicit bodies
(https://support.ntop.com/hc/en-us/articles/360060240753).

- **The model is a notebook, not a node canvas.** Blocks sit in sections, with Inputs and an Output
  section. Each block has typed inputs and one typed output, colour shows the type, and only matching
  types connect. The dependencies between blocks form a DAG, but I found no official source for a
  separate node-graph view. Earlier drafts of this page said nTop has one, which is unverified.
- **Custom blocks** are made by turning variables into inputs and one block into the output. They are
  saved, imported, and re-imported to update.
- **Field-driven design:** a scalar field, often remapped with Ramp, drives a lattice's or a shell's
  thickness.
- **Implicit bodies are signed distance fields.** Mesh or B-rep is made only at an explicit
  conversion step.

### How it maps to GSL and Studio

| nTop                                                     | GSL / Studio                                                                                                                       | Built                                 |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Implicit Body, booleans, Offset Body                     | a GSL field, with `min`, `max`, `unionRound` and the rest                                                                          | Blake's #6                            |
| Inputs section, a variable as a model input              | `@range(lo, hi) name = value;` or `name.min`/`name.max`: the field view's sliders                                                  | Blake's #6                            |
| A block wired from earlier blocks' outputs               | each GSL assignment is a node, and every earlier name its expression uses is an edge (GSL assigns each name once)                  | prototype                             |
| Seeing how blocks depend on each other                   | the field view's **Graph** tab: inputs at the left, the output at the right, each block naming what makes it and its line          | prototype                             |
| Typed ports (Scalar, Vector, Implicit Body, Lattice...)  | not inferred. The graph shows what each name is made by (`unionRound`, `boxCentered`), not its type. Types need `gsl`'s own parse. | not yet                               |
| Custom blocks                                            | a GSL function in a package (`lattice.solidify`, `drill.hole`), or a `@feature` that bakes a concept into a B-rep part             | design only                           |
| Field-driven thickness (Ramp into a lattice's thickness) | a field passed as `wall` (`lattice.solidify`'s graded wall)                                                                        | GSL already has it, nothing in the UI |
| Mesh from Implicit Body, CAD Body from Implicit Body     | `cad gsl mesh` and Blake's `cad gsl bake`                                                                                          | Blake's #5 and #7                     |

### Recommendation

Adopt A and B as Blake built them, prototype D, and do not do C:

| Option                                  | What it means                                                                                      | Status                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------- |
| A. GSL as its own document type         | a `.gsl` opens in the CAD Viewer as its field                                                      | #6, decided "for now"           |
| B. Concepts as parts of an assembly     | `gsl.concept(...)` placed among exact parts, `gsl.baked(...)` marking the exact part made from one | #7                              |
| C. Implicit features in the B-rep tree  | a field operation as a row between B-rep rows                                                      | not recommended                 |
| D. A graph view of an implicit document | the model's names as their dependency graph, read from the source                                  | prototyped (`studio/gsl-graph`) |

- **The B-rep tree stays a tree.** A B-rep part's history is linear: each row changes the one body. A
  field model is a DAG: a blend reads two fields, and one lattice can feed three later nodes. Showing
  a graph as a tree either hides the shared inputs or duplicates them.
- **The graph is read-only, derived from the program as written.** Law 3 says the code is the model.
  An authored node canvas, wired by hand as nTop users wire blocks, would be a second source.
  Editing stays in the source and the sliders.
- **The parser only reads statements.** It never guesses what an unrecognised statement means, and
  `gsl`'s parse stays the authority.
- **The graph view lives in Studio's viewer, not in omega-core.** Blake was explicit that omega-core
  should not carry such a UI.
- **The features can be the same.** Bake can be a custom feature in a B-rep part's tree
  (`body = bake(body, "knob.gsl", wall=2.5)`), so editing the concept's parameters rebuilds the exact
  part the way any other row does.

## Simulation

Simulation already uses CalculiX: `cad.calculix` runs `ccx` from the `cad-ccx` package
(`cad[calculix]`), and the strength check reports only what a real run returned (law 4).

## Open questions for the call

1. Should a custom feature be allowed to return several bodies, or only change the one body it is
   given? FeatureScript allows several. Studio's ribbon assumes one body.
2. Where should a team's feature library live: in a project, in a shared Studio folder (as
   Templates are), or in a versioned package? The answer decides how FeatureScript's version links and
   update notices map.
3. Which comes first after this: conditional parameters, manipulators, or versioned libraries?
4. For the graph: should GSL expose typed ports (through `gsl`'s parse, not ours), so the graph can
   colour by type as nTop's blocks do?
5. Does #6's "for now" on `.gsl` as a document type become permanent once the graph view exists?
