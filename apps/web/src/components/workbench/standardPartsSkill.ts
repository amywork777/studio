/**
 * How the agent puts bought parts into a project: the `standard-parts` job skill's own instructions,
 * after its hand-off (`jobSkillFiles`). Standard hardware comes from bd_warehouse (Apache-2.0), built
 * from its standards' tables; anything else from step.parts, checked by its sha256; never a file a
 * vendor's terms keep (McMaster-Carr's and MISUMI's forbid fetching or passing on their models).
 */
export const STANDARD_PARTS_GUIDE = `## Where each bought part comes from

Take the first of these that has it, and never draw a bought part from memory:

1. **Standard hardware, by its standard** (ISO 4762 M3 x 8, ISO 4032 M5, a 608 bearing): build it
   with bd_warehouse, whose sizes are its standards' tables (Apache-2.0).
2. **A named product** (a NEMA 17 motor, a servo, a shielded bearing, a connector): the maker's
   STEP from step.parts, text-to-cad's open catalog of about 17,000 parts.
3. **Anything else** (a McMaster-Carr or MISUMI part): their terms forbid fetching or passing on
   their models, so never download one. Give the person the part's page and ask them to download
   its STEP and attach it; it lands in \`brief/references/\`, and you read it from there.

A part number, price or supplier is only one you read on the supplier's page this turn; else say
"look up" beside it.

## Standard hardware: one script per size

Each distinct size is a part of its own, \`parts/hardware/<name>.py\`, writing its STEP beside it,
so the Overview and the parts list count it. \`<name>\` is the standard and size as a Python name
(\`iso4762_m3x8\`):

\`\`\`python
# /// script
# dependencies = ["bd_warehouse>=0.4,<0.5"]
# ///
"""ISO 4762 M3 x 8 socket head cap screw, from bd_warehouse's ISO 4762 table (the largest sizes the
standard allows), its thread drawn as a plain cylinder at the major diameter. Buy as: ISO 4762 M3 x 8,
steel 12.9. Origin: the centre of the head's underside, the shank along -Z."""

from cad import step


@step("iso4762_m3x8.step")
def iso4762_m3x8():
    from bd_warehouse.fastener import SocketHeadCapScrew

    screw = SocketHeadCapScrew("M3-0.5", 8, "iso4762", simple=True)
    screw.label = "iso4762_m3x8"
    return screw


if __name__ == "__main__":
    iso4762_m3x8()
\`\`\`

- \`cad run\` makes the header's environment once (a small download, so the first run needs the
  network) and pins build123d to cad's own.
- Import bd_warehouse inside the body, never at the top: that would load the CAD kernel on every run.
- Keep \`simple=True\` (no modelled thread) unless the person asks for threads: real threads make
  a heavy model and change no fit. Say in the docstring that the thread is simplified.
- The docstring says what to buy (standard, size, grade or material) and where the sizes came from.

What bd_warehouse has, by class and its standards (\`<Class>.types()\` lists them,
\`<Class>.sizes(type)\` the sizes, a screw's \`.nominal_lengths\` its lengths):

- \`SocketHeadCapScrew\` (fastener): iso4762, asme_b18.3
- \`HexHeadScrew\`: iso4014, iso4017, din931
- \`CounterSunkScrew\`: iso10642, iso2009, iso7046, iso14581, iso14582
- \`ButtonHeadScrew\`: iso7380_1
- \`PanHeadScrew\`, \`CheeseHeadScrew\`: iso1580, iso14583; iso1207, iso7048, iso14580
- \`SetScrew\`, \`ShoulderScrew\`: iso4026; iso7379
- \`HexNut\`, \`SquareNut\`, \`DomedCapNut\`: iso4032, iso4033, iso4035; din557; din1587
- \`HeatSetNut\`: McMaster-Carr, ruthex, CNCKitchen, Hilitchi (their inserts' sizes)
- \`PlainWasher\`, \`ChamferedWasher\`: iso7089, iso7091, iso7093, iso7094; iso7090
- \`SingleRowDeepGrooveBallBearing\` (bearing): sizes as bore-OD-width: \`"M8-22-7"\` is a 608
- \`ExternalSnapRing\`, \`InternalSnapRing\` (retaining_ring): DIN 471, DIN 472
- \`ORing\` (o_rings): iso3601

A size it does not list is not made up: say so and go to step.parts.

## Holes for them

In the part the hardware goes through, the hole is sized from the same table where it can be:
bd_warehouse's \`ClearanceHole(screw, fit="Normal")\`, \`TapHole(screw, material="Soft")\` and
\`InsertHole(heat_set_nut)\` cut a part in a \`BuildPart\` (the part's script then takes the same
header). Else write the size as a named size with where it comes from (\`SCREW_CLEARANCE = 3.4  # M3,
ISO 273 medium\`).

## A named product from step.parts

\`\`\`bash
curl -s "https://api.step.parts/v1/parts?q=608ZZ"          # search; also category=, family=, standard=
curl -s "https://api.step.parts/v1/parts/bearing_608zz"     # one part
\`\`\`

Each item has \`stepUrl\`, \`sha256\`, \`pageUrl\` and, where known, \`stepSource\` and \`productPage\`.
Download the STEP to \`parts/imported/<id>.step\`, check its sha256 against the item's (stop and say
so if it differs), and write a reference part that reads it, as the cad skill's vendor STEP does
(\`step.read\`), its docstring naming step.parts' id, the source and its license where the item gives
one, and what to check on the bought part.

## In the assembly

Place each bought part from its STEP (\`step.read\`), mated to its hole (\`Concentric\` with the hole,
\`Coincident\` under the head), one copy per hole, each labelled where it is
(\`m3x8_screw:front_left\`). Reading the STEP keeps the assembly's own environment: it needs no
bd_warehouse header.

## What to say

A table, one row per distinct part: how many, what it is to buy (standard and size, or the
maker's name and part number from its page), where its model came from (bd_warehouse, step.parts,
or attached by you), and its file. Then ask what is open, its answer first: the grade or material,
a length one size off, a part to swap for one they stock.
`;
