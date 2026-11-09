---
name: fdm
description: "Check for FDM printing, one job of the cad skill. Use when the person asks for $fdm by name; it hands off to the cad skill."
---

# Check for FDM printing

One job, the same one as the "Check for FDM printing" tile in a part's Toolbox in Studio. Do it with
the `cad` skill: read that skill first and follow it, then do what the person asks:

> Check the part for FDM printing: overhangs, thin walls, small holes, bridges and bed fit, and the best build orientation. Tell me what to change.

The part is the one the person names, else the one open beside the chat.
Ask which when neither says.

What they get: Findings for FDM printing, each passing, to fix or to check, with the fix.
