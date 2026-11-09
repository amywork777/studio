"""The LED module: a round aluminium-core LED board with a COB emitter in its middle and two M3 holes to screw it to
the head. step.parts has no LED module, so this is a generic envelope from the sizes in sizes.py, to be checked against
the board bought. Origin: the centre of the board's back; the emitter faces +Z."""

import build123d as bd
from cad import model

from sizes import LED_BOARD, LED_BOARD_THICKNESS, LED_SCREW_HOLE, LED_SCREW_SPACING

EMITTER = 12.0  # the COB emitter's diameter
EMITTER_HEIGHT = 1.5


@model
def led_module():
    board = bd.Pos(0, 0, LED_BOARD_THICKNESS / 2) * bd.Cylinder(LED_BOARD / 2, LED_BOARD_THICKNESS)
    board -= [bd.Pos(x, 0, LED_BOARD_THICKNESS / 2) * bd.Cylinder(LED_SCREW_HOLE / 2, LED_BOARD_THICKNESS) for x in (-LED_SCREW_SPACING / 2, LED_SCREW_SPACING / 2)]
    board += bd.Pos(0, 0, LED_BOARD_THICKNESS + EMITTER_HEIGHT / 2) * bd.Cylinder(EMITTER / 2, EMITTER_HEIGHT)  # COB emitter

    board.color = "#E8E4D8"
    board.label = "led_module"
    return board


if __name__ == "__main__":
    led_module()
