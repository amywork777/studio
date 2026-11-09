"""Mass, fit and tip-over of the phone stand. Calls the stand's model (its volume and centre of mass) and the model of
the stand with the phone placeholder in it (for the fit), so it checks them as they are now, works out whether the stand
tips when the phone's screen is tapped, writes its findings to docs/phone_stand_mass_and_tip.md, prints them as one
JSON line, and exits 1 when a requirement fails. Run it from anywhere: cad run checks/phone_stand_tip.py

The tip-over is statics, the stand and phone as one rigid body on a flat desk: it tips back about the rear edge of
the base's flat bottom when a tap's moment about that edge passes the weight's. A tap pushes square into the screen,
at the top of the screen in the middle, the worst place on it."""

import json
import sys
from math import cos, radians, sin
from pathlib import Path

import build123d as bd
from cad.build123d import closest_points, overlap_volume

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT / "parts"), str(ROOT / "assemblies")]

from phone_stand import ANGLE, LEDGE_HEIGHT, LIP_HEIGHT, PHONE_SLOT, along_rest, phone_stand  # noqa: E402
from phone_stand_portrait import phone_stand_portrait  # noqa: E402
from sizes import PHONE_LENGTH, PHONE_THICKNESS, PHONE_WIDTH  # noqa: E402

STAND = "parts/phone_stand.py"
ASSEMBLY = "assemblies/phone_stand_portrait.py"
FINDINGS = "docs/phone_stand_mass_and_tip.md"

G = 9.81  # m/s²
# Filament densities, g/cm³, from Bambu Studio 02.05.00.66's presets ("filament_density").
DENSITIES = {"PLA (Bambu PLA Basic)": 1.26, "PETG (Bambu PETG HF)": 1.28}
MATERIAL = "PLA (Bambu PLA Basic)"
# Bambu Studio's "0.20mm Standard @BBL X1C" process, the P1S's default: 2 walls (0.42 + 0.45 mm), 15% infill.
WALLS_MM = 0.42 + 0.45
INFILL = 0.15
# Assumed phones: the lightest and heaviest a large phone in its case is likely to weigh. Not measured.
PHONE_MASSES_G = (150.0, 240.0)
TAP_N = 1.0  # assumed: the firm tap the stand must stand, square into the screen. Not from a source.


def screen_point(distance: float, out: float) -> tuple[float, float]:
    """(Y, Z) of a point `distance` up the rest from the ledge and `out` from the rest's face."""
    return along_rest(LEDGE_HEIGHT + distance, out)


def tip(stand_g: float, stand_com: tuple[float, float], phone_g: float, phone_height: float, rear: float) -> dict:
    """The tap at the top of the screen that tips the stand back about the rear edge, `rear` (Y), with the phone
    `phone_height` tall standing in it."""
    c, s = cos(radians(ANGLE)), sin(radians(ANGLE))
    phone_com = screen_point(phone_height / 2, PHONE_THICKNESS / 2)
    total = stand_g + phone_g
    com_y = (stand_g * stand_com[0] + phone_g * phone_com[0]) / total
    weight = total / 1000 * G
    holding = weight * (rear - com_y)  # N·mm about the rear edge
    tap_y, tap_z = screen_point(phone_height, PHONE_THICKNESS)
    # A tap of 1 N square into the screen: (0, +sin, -cos) back and down. Its moment about the rear edge, tipping it.
    per_newton = s * tap_z - c * (rear - tap_y)
    return {
        "phone_g": phone_g,
        "com_y_mm": round(com_y, 2),
        "behind_com_mm": round(rear - com_y, 2),
        "tap_at_mm": [round(tap_y, 2), round(tap_z, 2)],
        "tipping_tap_N": round(holding / per_newton, 2),
    }


def main() -> int:
    stand = phone_stand().shape
    (solid,) = stand.solids()
    volume = solid.volume  # mm³
    com = solid.center(bd.CenterOf.MASS)
    bottom = [face for face in solid.faces() if face.geom_type == bd.GeomType.PLANE
              and face.normal_at().Z < -0.999 and abs(face.center().Z) < 1e-6]
    footprint = bd.Compound(bottom).bounding_box()
    front, rear = footprint.min.Y, footprint.max.Y
    # The printed stand: a skin of its walls' thickness over its whole surface solid, the rest of it at the infill.
    # A hand estimate until it is sliced (an inward offset of the solid would be closer; the kernel refused it).
    skin = solid.area * WALLS_MM
    printed = skin + (volume - skin) * INFILL
    masses = {name: {"solid_g": round(volume / 1000 * rho, 1), "printed_estimate_g": round(printed / 1000 * rho, 1)}
              for name, rho in DENSITIES.items()}
    stand_g = masses[MATERIAL]["printed_estimate_g"]
    stand_solid_g = masses[MATERIAL]["solid_g"]
    stand_com = (com.Y, com.Z)

    cases = []
    for orientation, height in (("portrait", PHONE_LENGTH), ("landscape", PHONE_WIDTH)):
        for phone_g in PHONE_MASSES_G:
            row = tip(stand_g, stand_com, phone_g, height, rear)
            row["orientation"] = orientation
            row["solid_stand_tipping_tap_N"] = tip(stand_solid_g, stand_com, phone_g, height, rear)["tipping_tap_N"]
            row["passes"] = row["tipping_tap_N"] >= TAP_N and row["behind_com_mm"] > 0
            cases.append(row)
    empty = round(rear - com.Y, 2)

    # Fit: the phone placeholder in the stand, each placed part in world coordinates.
    solids = {}
    for part in phone_stand_portrait().shape.leaves:
        (solids[part.label],) = part.solids()
    phone, holder = solids["phone_placeholder"], solids["phone_stand"]
    overlap = overlap_volume(phone, holder)
    touch = closest_points(phone, holder)
    lip_gap = PHONE_SLOT - PHONE_THICKNESS

    worst = min(cases, key=lambda row: row["tipping_tap_N"])
    failed = not all(row["passes"] for row in cases) or overlap > 0.01 or lip_gap <= 0
    result = {
        "stand": STAND,
        "assembly": ASSEMBLY,
        "volume_mm3": round(volume, 1),
        "centre_of_mass_mm": [round(com.X, 2), round(com.Y, 2), round(com.Z, 2)],
        "masses": masses,
        "footprint_y_mm": [round(front, 2), round(rear, 2)],
        "empty_com_ahead_of_rear_mm": empty,
        "tap_N": TAP_N,
        "cases": cases,
        "worst": worst,
        "fit": {"overlap_mm3": round(overlap, 3), "phone_to_stand_mm": round(touch.distance, 3),
                "phone_to_lip_mm": lip_gap, "lip_over_screen_mm": LIP_HEIGHT},
        "passes": not failed,
    }
    (ROOT / FINDINGS).write_text(markdown(result), encoding="utf-8")
    print(json.dumps(result))
    return 1 if failed else 0


def markdown(r: dict) -> str:
    m = r["masses"]
    worst = r["worst"]
    lines = [
        "# Phone stand: mass, fit and tip-over",
        "",
        f"Checked `{r['stand']}` and `{r['assembly']}` with `cad run checks/phone_stand_tip.py`. Every number below comes from that run.",
        "",
        "## Verdict",
        "",
        (f"**{'It stands' if r['passes'] else 'It tips'}.** The weakest case is a {worst['phone_g']:g} g phone in "
         f"{worst['orientation']}: a tap of {worst['tipping_tap_N']} N square into the top of its screen tips it back, "
         f"against the {r['tap_N']:g} N it must stand (assumed). The phone fits: it sits in the slot "
         f"{'without touching anything but the rest and the ledge' if r['fit']['overlap_mm3'] < 0.01 else 'overlapping the stand'}, "
         f"{r['fit']['phone_to_lip_mm']:g} mm behind the lip."),
        "",
        "## Mass",
        "",
        f"The stand is {r['volume_mm3'] / 1000:.1f} cm³ of solid, its centre of mass at "
        f"({', '.join(f'{v:g}' for v in r['centre_of_mass_mm'])}) mm.",
        "",
        "| Material | Solid (g) | Printed, estimated (g) |",
        "|---|---|---|",
        *[f"| {name} | {v['solid_g']} | {v['printed_estimate_g']} |" for name, v in m.items()],
        "",
        (f"Densities are Bambu Studio's presets. The printed mass is a hand estimate for Bambu Studio's default P1S "
         f"process (0.20mm Standard): a skin {WALLS_MM:g} mm thick (its two walls) over the part's whole surface, solid, "
         f"and the rest at {INFILL:.0%} infill. The slicer was not run here (see the README's Open actions), so it is not the "
         f"slicer's figure; the tip-over uses it, and the solid mass for comparison."),
        "",
        "## Tip-over",
        "",
        (f"The base's flat bottom runs from {r['footprint_y_mm'][0]:g} to {r['footprint_y_mm'][1]:g} mm back from its "
         f"front edge (its edges are rounded R2). Empty, the stand's centre of mass is {r['empty_com_ahead_of_rear_mm']:g} mm "
         f"ahead of the rear edge. With a phone in it, it tips back about that edge when a tap's moment passes the "
         f"weight's. The tap pushes square into the screen at the top in the middle, the worst place; the phone "
         f"stands on the ledge with its back on the rest, its weight at its middle."),
        "",
        "| Phone | Mass (g) | Centre of mass ahead of the rear edge (mm) | Tap that tips it (N) | With a solid stand (N) | Stands 1 N |",
        "|---|---|---|---|---|---|",
        *[f"| {row['orientation']} | {row['phone_g']:g} | {row['behind_com_mm']} | {row['tipping_tap_N']} | "
          f"{row['solid_stand_tipping_tap_N']} | {'yes' if row['passes'] else 'no'} |" for row in r["cases"]],
        "",
        ("The phone is the largest the stand is for, 80 × 165 × 12 mm (parts/sizes.py; the length is assumed), at "
         "the lightest and heaviest a large phone in a case is likely to weigh (assumed). A lighter phone tips more "
         "easily, as its weight holds the stand down behind the tap. Sliding is not checked: a tap's push back can "
         "slide the stand before it tips on a slippery desk."),
        "",
        "## Fit",
        "",
        f"- The phone placeholder overlaps the stand by {r['fit']['overlap_mm3']} mm³ and touches it "
        f"({r['fit']['phone_to_stand_mm']} mm): on the rest and the ledge, as it stands.",
        f"- The slot is {PHONE_SLOT:g} mm wide for a {PHONE_THICKNESS:g} mm phone: {r['fit']['phone_to_lip_mm']:g} mm to the lip.",
        f"- The lip stands {r['fit']['lip_over_screen_mm']:g} mm above the ledge, over the bottom of the screen.",
        "",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
