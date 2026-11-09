"""Studio's job skills (studio-job-skills/), added to the text-to-cad plugin Studio lays out.

Each job of a text-to-cad skill that does more than one is a skill of its own, so a person can call
one by name in the chat ($fdm, $export, $board-fab). Its files are written from Studio's job list
(apps/web/src/components/workbench/jobSkills.ts) and each only hands off to the text-to-cad skill
that does the job. They live outside text-to-cad/, which holds only Jake's skills, and join its
skills in the plugin's own folder: scripts/studio-dev-plugin.py and scripts/studio-app-plugin.py
call `add_job_skills` once the plugin is laid out.
"""

from __future__ import annotations

import shutil
from pathlib import Path

JOB_SKILLS = Path(__file__).resolve().parent.parent / "studio-job-skills"


def add_job_skills(plugin: Path) -> list[str]:
    """Copy each job skill into `plugin`'s skills/ and return their names; one named as a skill
    already there is refused, so a job never hides one of text-to-cad's own."""
    skills = plugin / "skills"
    names = sorted(path.parent.name for path in JOB_SKILLS.glob("*/SKILL.md"))
    taken = [name for name in names if (skills / name).exists()]
    if taken:
        raise SystemExit(f"Studio's job skills are named as text-to-cad's own: {', '.join(taken)}")
    for name in names:
        shutil.copytree(JOB_SKILLS / name, skills / name)
    return names
