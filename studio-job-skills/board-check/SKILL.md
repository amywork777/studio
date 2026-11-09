---
name: board-check
description: "Board checks, one job of the pcb skill. Use when the person asks for $board-check by name; it hands off to the pcb skill."
---

# Board checks

One job, the same one as the "Board checks" tile in a part's Toolbox in Studio. Do it with
the `pcb` skill: read that skill first and follow it, then do what the person asks:

> Run KiCad's rule checks on the board: the design rule check on a board, the electrical rule check on a schematic. Tell me each problem, where it is, and how to fix it.

The board is the one the person names, else the one open beside the chat.
Ask which when neither says.

What they get: KiCad's rule checks, each finding with where it is on the board or schematic and the fix.
