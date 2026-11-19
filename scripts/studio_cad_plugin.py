"""text-to-cad's plugin as Studio lays it out, for the app (scripts/studio-app-plugin.py) and for a
checkout's development run (scripts/studio-dev-plugin.py): Codex's layout of a text-to-cad checkout,
its CAD server run by a Python Studio names, and Studio's own `cad` command.

From text-to-cad 0.11.12 there is one package, `cad`, whose `cad` command (`cad_server.cli`) is also
the MCP server (`cad mcp`, `python -m cad_mcp`), and an install is a global uv tool that updates
itself. Studio's is neither: Studio runs the cad its build pinned, by its own Python, with
`CAD_UPDATE_CHECK=0` (apps/desktop/src/studio/studioEngine.ts), so nothing here comes from the
checkout's install scripts. The skills' Setup sentence that installs cad (`uv tool install cad`) is
rewritten in the copy the plugin carries, never in text-to-cad/ itself, and a layout that still
tells an agent to install cad is refused.
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

# Codex waits this long for the CAD server to start: a cold kernel import on a slow disk.
STARTUP_SECONDS = 300

# The engine's own settings, as studioEngine.ts gives the app's: the bundled cad never updates
# itself, and sends no telemetry.
SERVER_ENV = {"CAD_UPDATE_CHECK": "0", "CAD_TELEMETRY": "0"}

# The one sentence in every skill's Setup that installs cad (0.11.12+): "If `cad` is missing or older
# than 0.11.12, run `uv tool install cad`, adding `--force` if uv says `cad` already exists."
INSTALL_SENTENCE = re.compile(
    r"If `cad` is missing or older than\s+[0-9.]+,\s+run `uv tool install cad`,\s+adding `--force` if uv says\s+"
    r"`cad` already exists\."
)
STUDIO_SENTENCE = (
    "`cad` is Studio's own, the release Studio was built with: never install, update or replace it here. "
    "If `cad` is missing or will not run, ask the person to restart Studio, which sets it up again."
)
# What no skill Studio carries may tell an agent to run.
INSTALLS = ("uv tool install", "pip install cad", "pipx install cad", "texttocad.dev/install")

IGNORED = shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store")


def server(python: str) -> dict:
    """Codex's entry for the CAD server: `python -m cad_mcp` (`cad mcp`) by Studio's Python."""
    return {"command": python, "args": ["-P", "-m", "cad_mcp"], "env": dict(SERVER_ENV),
            "startup_timeout_sec": STARTUP_SECONDS}


def studio_skill(text: str) -> str:
    """A skill's text as Studio carries it: its install sentence replaced by Studio's own."""
    return INSTALL_SENTENCE.sub(STUDIO_SENTENCE, text)


def lay_out(checkout: Path, plugin: Path, version: str, python: str) -> str:
    """text-to-cad's Codex plugin written into `plugin`, at `version`, its CAD server run by `python`:
    the skills (Studio's Setup sentence in each), `.codex-plugin/` (its manifest and icon) and
    `codex.mcp.json`. Returns the plugin's name. SystemExit where a skill still says to install cad."""
    if plugin.exists():
        shutil.rmtree(plugin)
    shutil.copytree(checkout / "skills", plugin / "skills", ignore=IGNORED)
    for skill in sorted(plugin.glob("skills/*/SKILL.md")):
        skill.write_text(studio_skill(skill.read_text(encoding="utf-8")), encoding="utf-8")
    manifest = json.loads((checkout / ".codex-plugin" / "plugin.json").read_text(encoding="utf-8"))
    manifest["version"] = version
    manifest["mcpServers"] = "./codex.mcp.json"
    (plugin / ".codex-plugin").mkdir(parents=True)
    for path in (checkout / ".codex-plugin").iterdir():
        if path.is_file() and path.name not in ("plugin.json", "marketplace.json"):
            shutil.copy2(path, plugin / ".codex-plugin" / path.name)
    write_json(plugin / ".codex-plugin" / "plugin.json", manifest)
    write_json(plugin / "codex.mcp.json", {"mcpServers": {"cad": server(python)}})
    refuse_installs(plugin)
    return manifest["name"]


def refuse_installs(plugin: Path) -> None:
    """SystemExit naming each skill file that tells an agent to install cad: text-to-cad reworded its
    Setup, and INSTALL_SENTENCE needs to follow it."""
    found = [f"{path.relative_to(plugin).as_posix()}: {words}"
             for path in sorted(plugin.rglob("*.md"))
             for words in INSTALLS if words in path.read_text(encoding="utf-8")]
    if found:
        raise SystemExit("Studio's CAD plugin would tell an agent to install cad (scripts/studio_cad_plugin.py's "
                         "INSTALL_SENTENCE no longer matches text-to-cad's Setup):\n  " + "\n  ".join(found))


def write_marketplace(out: Path, catalog: str, owner: str, description: str, name: str, version: str) -> None:
    """The catalog Studio reads the plugin from: `out/.claude-plugin/marketplace.json`."""
    write_json(out / ".claude-plugin" / "marketplace.json", {
        "name": catalog,
        "owner": {"name": owner},
        "description": description,
        "plugins": [{"name": name, "source": f"./plugins/{name}", "version": version}],
    })


def write_launcher(folder: Path, python: str) -> list[Path]:
    """Studio's `cad` command in `folder`, running `python -m cad_server.cli`: `cad` (sh) and `cad.cmd`."""
    folder.mkdir(parents=True, exist_ok=True)
    sh = folder / "cad"
    sh.write_text(f"#!/bin/sh\nexec {shell_quoted(python)} -P -m cad_server.cli \"$@\"\n", encoding="utf-8")
    sh.chmod(0o755)
    cmd = folder / "cad.cmd"
    cmd.write_text(f'@"{python}" -P -m cad_server.cli %*\r\n', encoding="utf-8")
    return [sh, cmd]


def shell_quoted(text: str) -> str:
    return "'" + text.replace("'", "'\"'\"'") + "'"


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
