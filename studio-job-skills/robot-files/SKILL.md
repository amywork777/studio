---
name: robot-files
description: "Robot files, one job of the robot-simulation skill. Use when the person asks for $robot-files by name; it hands off to the robot-simulation skill."
---

# Robot files

One job, the same one as the "Robot files" tile in a part's Toolbox in Studio. Do it with
the `robot-simulation` skill: read that skill first and follow it, then do what the person asks:

> Make a URDF for the part from its joints, limits and materials, and validate it. Ask me whether I also want a MoveIt SRDF.

The part is the one the person names, else the one open beside the chat.
Ask which when neither says.

What they get: A validated URDF with its links, joints, limits and meshes, and a MoveIt SRDF if you want.
