# Phone stand: product requirements

## Summary

A desk stand for a phone, printed in one piece on a Bambu Lab printer in PLA. It holds a phone up to 80 mm wide and 12 mm thick in its case, leaning back at 65° from the desk, in portrait or landscape. A charging cable's plug goes down through a slot in the ledge the phone stands on, and the cable runs along the base and out the back. It must not tip when the screen is tapped. It is an example project to learn Studio with.

## The problem and who has it

A phone lying flat on a desk is hard to read and to charge at the same time. The stand holds it up at an angle that is comfortable to read from a chair, with its charging port free, and stays put when someone taps the screen. The brief names no user beyond someone with a phone and a desk: who it is for, and which phones, is an open question.

## Users and use cases

- A person learning Studio opens the project to see a printed part modelled, checked and drawn.
- Whoever makes one prints it on a Bambu Lab printer from `parts/phone_stand_print.3mf`.
- In use, it stands on a desk; the phone goes in portrait for a video call or landscape for a video, with its cable plugged in through the slot.

## Requirements, each measurable, as must, should and could

Must:

- M1. Hold a phone up to 80 mm wide and 12 mm thick in its case, in portrait and in landscape.
- M2. Hold it at a comfortable viewing angle: 65° back from the desk.
- M3. Let a charging cable's plug into the phone's bottom port, with a slot through the ledge and a way for the cable out of the back.
- M4. Not tip back when the top of the screen is tapped with 1 N (an assumed tap), with the lightest phone it is for (150 g, assumed) in portrait.
- M5. Print on a Bambu Lab printer in PLA or PETG with no supports.

Should:

- S1. Print on a P1S's 256 × 256 mm plate in one piece.
- S2. Warp less off the plate than ISO 2768-2 K's flatness for its size (0.4 mm).
- S3. Leave 2 mm between the phone and the lip, so a phone in a thick case drops in.

Could:

- C1. Take a phone longer than 165 mm in portrait.
- C2. Take rubber feet, so it does not slide.

## Performance targets: loads, life, temperatures, cycles

- Tipping: a 150 g phone in portrait tips it back at 1.05 N into the top of its screen; a 240 g phone at 1.48 N. In landscape, 2.63 N and 3.77 N (`docs/phone_stand_mass_and_tip.md`, with the printed mass estimated).
- The phone's weight and a tap are the only loads. Life, cycles and the temperatures it must stand (a car's dashboard would soften PLA) are not set (open questions).

## Size, weight and interfaces

- Size: 80 mm wide, 140 mm deep and 105 mm tall. The rest is 110 mm long up its face and 5 mm thick.
- Weight: 151.1 g if printed solid in PLA; about 66.5 g with Bambu Studio's default 2 walls and 15% infill (a hand estimate until it is sliced).
- Phone: a 14 mm slot between the rest and an 8 mm lip, on a ledge 40 mm up the rest, square to it.
- Cable: a 14 × 14 mm slot through the ledge, rest to lip, in the middle, and a 10 × 8 mm pass under the foot of the rest.
- Desk: the base's flat bottom, 136 × 80 mm between its rounded edges.

## Safety and regulations

No standard or regulation is named for it (open question). It is a passive desk object with no electrics of its own; the cable is the user's.

## Cost target and volumes

Not set. One is to be printed first; no quantity beyond that is given.

## How success is measured

- The FDM check finds nothing to fix: now none, with 8 mm bridges and no supports (`parts/phone_stand_fdm.md`).
- The tip-over check passes with a 150 g phone: now 1.05 N against 1 N, a thin margin.
- A printed stand holds a real phone, takes its charging cable and does not tip when its screen is tapped: not printed yet.

## Out of scope

- The phone and the cable themselves.
- A stand that charges the phone (a wireless charger in the rest).

## Milestones

- Done (2026-10-26): the stand modelled, its print file, the FDM check, the mass, fit and tip-over check, and its drawing.
- Next, not dated: slice it, print one, try it with a real phone and cable, and settle the open questions below.

## Open questions

- Which phones: how light can one be (the tip-over is weakest with a light phone), and is any longer than 165 mm?
- How hard is a tap? The stand is checked against 1 N, which is assumed, not measured.
- How long is the user's charging plug with its strain relief? The space under the ledge is 35 mm along the rest.
- Does the 8 mm lip cover too much of the bottom of the screen?
- Which tolerances matter, and should it print in PETG instead, for a warm place?
