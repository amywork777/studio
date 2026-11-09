"""Work instructions for putting the desk lamp together, as a PDF in ../docs. It documents the lamp's STEP, which
`cad run exports.py` writes from the lamp's model: run that first, then this. A simple picture guide with a figure
per step: no process spec governs this lamp yet, so the adhesive for the weight and the hinges' screw torques print NOT
STATED and stay open items until they are chosen."""

from pathlib import Path

import build123d as bd
from cad.work_instruction import Instruction, work_instruction

from desk_lamp import desk_lamp

ASSEMBLY = Path(__file__).parent / "desk_lamp.step"


def pocket_ceiling() -> str:
    """The base's pocket ceiling, the face the weight is bonded to: flat, facing down, 10 mm up. Its ref names it by its
    number in the base (`desk_lamp/base/face N`), as `cad step inspect assemblies/desk_lamp.step` reads the STEP."""
    (base,) = [part for part in desk_lamp().shape.leaves if part.label == "base"]
    for number, face in enumerate(base.faces(), 1):
        if face.geom_type == bd.GeomType.PLANE and face.normal_at().Z < -0.99 and abs(face.center().Z - 10.0) < 1e-3:
            return f"desk_lamp/base/face {number}"
    raise ValueError("the base has no pocket ceiling at 10 mm")


@work_instruction(out="../docs/desk_lamp_work_instructions.pdf")
def desk_lamp_wi():
    wi = Instruction(
        ASSEMBLY,
        title="DESK LAMP ASSEMBLY",
        number="WI-DL-001",
        revision="A",
        part_number="desk-lamp",
        rigor="simple",
        emphasis="visual",
        scope="Putting one desk lamp together from its printed parts, its steel weight, the LED module and its screws.",
        tools=["4 mm hex key", "8 mm spanner", "2.5 mm hex key"],
    )

    wi.operation("Weight the base")
    wi.step("Lay the base upside down on the bench", install=["base"], camera="bottom")
    (wi.step("Bond the steel weight into the base's pocket, flush with the underside", install=["weight"], camera="bottom")
       .bond(None, surfaces=[pocket_ceiling()])
       .inspect("The weight sits flat on the pocket's ceiling, its underside flush with the base's", record="flush, yes or no"))

    wi.operation("Fit the LED module into the head")
    wi.step("Lay the head on the bench, its opening up", install=["head"], camera="bottom")
    (wi.step("Set the LED module on the head's two bosses, its emitter out of the shade", install=["led_module"], camera="bottom")
       .note("Lead the LED's wires up through a vent beside the yoke before the board goes on."))
    (wi.step("Screw the LED module to the bosses", install=["m3x8_screw:left", "m3x8_screw:right"], camera="bottom")
       .fasten("ISO 4762 M3 x 8 socket head screw", qty=2, torque=None)
       .instruct("The screws cut their own thread in the bosses' 2.5 mm pilot holes: drive them until the board is held, no further."))

    wi.operation("Hang the arm on the base")
    wi.step("Turn the base over and put the arm's lower end between the clevis's cheeks", install=["arm"])
    wi.step("Push the hinge screw through the clevis and the arm, its head on the cheek nearest you", install=["m5x30_screw:base_hinge"])
    (wi.step("Run the locknut onto the hinge screw", install=["m5_locknut:base_hinge"])
       .fasten("M5 nylon insert locknut on the M5 x 30 hinge screw", qty=1, torque=None))

    wi.operation("Hang the head on the arm")
    wi.step("Put the head's yoke over the arm's upper end, the shade in front")
    wi.step("Push the hinge screw through the yoke and the arm", install=["m5x30_screw:head_hinge"])
    (wi.step("Run the locknut onto the hinge screw", install=["m5_locknut:head_hinge"])
       .fasten("M5 nylon insert locknut on the M5 x 30 hinge screw", qty=1, torque=None))

    wi.operation("Set and check the hinges")
    (wi.step("Tighten each hinge's locknut until the arm and the head hold wherever they are set", frame="assembly")
       .inspect("With the arm at its lowest, 10 degrees up from the desk, it holds there and the lamp stands", record="holds, yes or no")
       .inspect("With the head square to the arm as assembled, the arm swings from 10 degrees up from the desk, over the top, to 10 degrees below level behind, touching nothing", record="clear, yes or no")
       .inspect("With the arm at 55 degrees up, the head swings from 45 degrees down to 175 degrees up from hanging level, touching nothing", record="clear, yes or no"))
    return wi


if __name__ == "__main__":
    desk_lamp_wi()
