#!/usr/bin/env python3
"""Checks Studio's own plugins (studio-plugins/): each is listed, each skill is whole, and the scripts their
references carry still parse and, with --run, still run.

A skill ships no program: the script an agent starts from is a fenced block in a reference, under a
`<!-- file: NAME.py -->` line. Without --run this reads the folders alone and needs nothing but Python: every
listed plugin has its manifest, every skill its front matter, its Codex listing and links that resolve, and every
carried script parses. With --run it also writes each skill's scripts to a scratch folder and runs, with `cad run`,
those that take no arguments, and fails on one that does not exit 0.

    python3 scripts/studio-plugins-check.py [--run] [plugin ...]

--run uses the cad command on the PATH and its server: set CAD_STATE_DIR, CAD_CACHE_DIR and CAD_ENGINE_DIR first to
keep it off the computer's own, as scripts/studio-samples-check.py says.
"""

from __future__ import annotations

import ast
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "studio-plugins"
BLOCK = re.compile(r"<!-- file: ([\w.-]+) -->\n+```python\n(.*?)\n```", re.S)   # the formatter puts a blank line between
LINK = re.compile(r"\]\(([^)#\s]+)(#[^)\s]*)?\)")
DESCRIPTION_LIMIT = 500      # every installed skill's description is in the agent's context on every turn


def front_matter(text: str) -> dict[str, str]:
    parts = text.split("---", 2)
    if len(parts) != 3 or parts[0].strip():
        return {}
    fields = {}
    for line in parts[1].strip().splitlines():
        key, _, value = line.partition(":")
        fields[key.strip()] = value.strip().strip('"')
    return fields


def anchors(text: str) -> set[str]:
    found = set()
    for heading in re.findall(r"^#{1,6} (.+)$", re.sub(r"```.*?```", "", text, flags=re.S), re.M):
        slug = re.sub(r"[^\w\- ]", "", heading.lower()).strip().replace(" ", "-")
        found.add(slug)
    return found


def scripts_of(skill: Path) -> dict[str, str]:
    found: dict[str, str] = {}
    for page in sorted(skill.rglob("*.md")):
        for name, source in BLOCK.findall(page.read_text(encoding="utf-8")):
            found[name] = source + "\n"
    return found


def check_skill(skill: Path, problems: list[str]) -> None:
    where = skill.relative_to(ROOT.parent)
    page = skill / "SKILL.md"
    if not page.is_file():
        problems.append(f"{where}: no SKILL.md")
        return
    text = page.read_text(encoding="utf-8")
    fields = front_matter(text)
    if fields.get("name") != skill.name:
        problems.append(f"{where}: SKILL.md's name is {fields.get('name')!r}, the folder is {skill.name!r}")
    if not fields.get("description"):
        problems.append(f"{where}: SKILL.md has no description")
    elif len(fields["description"]) > DESCRIPTION_LIMIT:
        problems.append(f"{where}: the description is {len(fields['description'])} characters, over {DESCRIPTION_LIMIT}")
    if len(text.splitlines()) > 500:
        problems.append(f"{where}: SKILL.md is over 500 lines")
    for md in sorted(skill.rglob("*.md")):
        body = md.read_text(encoding="utf-8")
        if "@@INCLUDE" in body:
            problems.append(f"{md.relative_to(ROOT.parent)}: a script was never put in")
        for target, anchor in LINK.findall(re.sub(r"```.*?```", "", body, flags=re.S)):
            if "://" in target:
                continue
            linked = (md.parent / target).resolve()
            if not linked.is_file():
                problems.append(f"{md.relative_to(ROOT.parent)}: links to {target}, which is not there")
            elif anchor and anchor[1:] not in anchors(linked.read_text(encoding="utf-8")):
                problems.append(f"{md.relative_to(ROOT.parent)}: links to {target}{anchor}, a heading that is not there")
        for anchor in re.findall(r"\]\((#[^)\s]+)\)", re.sub(r"```.*?```", "", body, flags=re.S)):
            if anchor[1:] not in anchors(body):
                problems.append(f"{md.relative_to(ROOT.parent)}: links to {anchor}, a heading that is not there")
    for name, source in scripts_of(skill).items():
        try:
            ast.parse(source, filename=name, feature_version=(3, 11))    # cad runs on Python 3.11 and newer
        except SyntaxError as error:
            problems.append(f"{where}: {name} does not parse: {error}")


def run_skill(skill: Path, problems: list[str]) -> None:
    scripts = scripts_of(skill)
    if not scripts:
        return
    scratch = Path(tempfile.mkdtemp(prefix=f"studio-plugin-{skill.name}-"))
    try:
        for name, source in scripts.items():
            (scratch / name).write_text(source, encoding="utf-8")
        for name, source in scripts.items():
            run_line = re.search(r"^Run: cad run (.+?)(?:\s{2,}|$)", source, re.M)
            if run_line is None or run_line.group(1).strip() != name:
                continue                                    # a module others import, or a script that takes arguments
            done = subprocess.run(["cad", "run", name], cwd=scratch, capture_output=True, text=True)
            tail = (done.stdout + done.stderr).strip().splitlines()[-1:] or [""]
            print(f"  {skill.name}/{name}: exit {done.returncode}  {tail[0][:110]}")
            if done.returncode != 0:
                problems.append(f"{skill.name}: cad run {name} exited {done.returncode}:\n{done.stdout[-1500:]}{done.stderr[-1500:]}")
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


def main(argv: list[str]) -> int:
    run = "--run" in argv
    wanted = [a for a in argv if not a.startswith("--")]
    problems: list[str] = []
    listed = json.loads((ROOT / ".claude-plugin" / "marketplace.json").read_text(encoding="utf-8"))["plugins"]
    names = {plugin["name"] for plugin in listed}
    for folder in sorted(p for p in ROOT.iterdir() if p.is_dir() and not p.name.startswith(".")):
        if folder.name not in names:
            problems.append(f"studio-plugins/{folder.name} is not listed in .claude-plugin/marketplace.json")
    for plugin in listed:
        if wanted and plugin["name"] not in wanted:
            continue
        folder = (ROOT / plugin["source"]).resolve()
        manifest = folder / ".codex-plugin" / "plugin.json"
        if not manifest.is_file():
            problems.append(f"{plugin['name']}: no .codex-plugin/plugin.json")
            continue
        declared = json.loads(manifest.read_text(encoding="utf-8"))
        if declared.get("name") != plugin["name"]:
            problems.append(f"{plugin['name']}: its manifest names it {declared.get('name')!r}")
        if declared.get("version") != plugin.get("version"):
            problems.append(f"{plugin['name']}: the marketplace says {plugin.get('version')}, its manifest {declared.get('version')}")
        skills = sorted(p for p in (folder / "skills").iterdir() if p.is_dir()) if (folder / "skills").is_dir() else []
        if not skills:
            problems.append(f"{plugin['name']}: no skill")
        for skill in skills:
            check_skill(skill, problems)
            if run:
                run_skill(skill, problems)
        print(f"{plugin['name']}: {len(skills)} skill(s), {sum(len(scripts_of(s)) for s in skills)} carried script(s)")
    for problem in problems:
        print(f"FAILED {problem}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
