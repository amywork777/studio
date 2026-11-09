"""The NEMA 17 stepper, 40 mm body, as a reference part: step.parts' simplified model
(stepper_motor_nema17_l0040_single_shaft, checksum verified), read as it was downloaded. Its origin is the centre of
the back of the motor, +Z up the shaft; its face is 40 mm up. The model's pilot is 17.8 mm across and 3.4 mm tall,
smaller than the 22 mm by 2 mm pilot the plate's bore is sized for (sizes.py): check the bought motor."""

from pathlib import Path

from cad import model, step

SOURCE = Path(__file__).resolve().parent / "imported" / "stepper_motor_nema17_l0040_single_shaft.step"


@model
def nema17():
    motor = step.read(SOURCE)
    motor.label = "nema17_stepper"
    return motor


if __name__ == "__main__":
    nema17()
