---
name: mujoco
description: "MuJoCo model, one job of the robot-simulation skill. Use when the person asks for $mujoco by name; it hands off to the robot-simulation skill."
---

# MuJoCo model

One job, the same one as the "MuJoCo model" tile in a part's Toolbox in Studio. Do it with
the `robot-simulation` skill: read that skill first and follow it, then do what the person asks:

> Make a MuJoCo model of the assembly from its joints, limits and materials, with collision shapes, joint dynamics and actuators, and check it with cad mujoco check. Tell me what the check found and ask me what each actuator should drive.

The assembly is the one the person names, else the one open beside the chat.
Ask which when neither says.

What they get: An MJCF for MuJoCo with collision shapes, joint dynamics and actuators, checked for model health. Downloads MuJoCo on first use, about 20 MB.
