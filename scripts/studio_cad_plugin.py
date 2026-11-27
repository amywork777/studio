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
import sys
from pathlib import Path

import studio_freecad

# Codex waits this long for the CAD server to start: a cold kernel import on a slow disk.
STARTUP_SECONDS = 300

# The engine's own settings, as studioEngine.ts gives the app's: the bundled cad never updates
# itself, and sends no telemetry. `CAD_STUDIO_ENGINE=1` (studio-base's cad_mcp/studio.py): `cad mcp`
# starts Studio's own server even where the person has a global cad installed, which 0.11.12+ would
# otherwise hand the start to. `CAD_MCP_PRESENTATION=tabs`: 0.11.12+ serves CAD views only to a client
# named codex, and Studio (t3code) shows them as tabs. `PYTHONDONTWRITEBYTECODE=1`, as the app's
# (studioAppBundle.ts): the app's Python writes no `.pyc` into the signed app, which would break its seal.
SERVER_ENV = {"CAD_UPDATE_CHECK": "0", "CAD_TELEMETRY": "0", "CAD_STUDIO_ENGINE": "1",
              "CAD_MCP_PRESENTATION": "tabs", "PYTHONDONTWRITEBYTECODE": "1"}

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
# The cam skill's macOS step: FreeCAD dragged into Applications, then `open -a FreeCAD` for macOS's question about a
# downloaded app, which nobody answers while an agent works, so every plan waited (0.1.19). Studio installs its own,
# which macOS asks nothing about (scripts/studio_freecad.py).
FREECAD_MAC_STEP = re.compile(
    r"- macOS: drag the `\.dmg`'s FreeCAD into Applications.*?Never remove FreeCAD's quarantine to skip it\.",
    re.DOTALL,
)
STUDIO_FREECAD_STEP = (
    "- macOS, in Studio: before the first plan, run `studio-install-freecad --check`, which runs nothing and says\n"
    "  whether Studio's FreeCAD is installed. If it is not, ask the person before planning, recommending they let\n"
    "  Studio install FreeCAD (a download of about 650 MB), and run `studio-install-freecad` once they say yes. That is\n"
    "  the one question before the first plan: ask it alone, as which to do (\"How should I get FreeCAD? 1. Install\n"
    "  FreeCAD for Studio (Recommended) 2. Not now\"), never \"Should I install it?\", with nothing about the controller,\n"
    "  the tools or the machine, and say no plan has run yet. Until a plan has run, never say you planned, or what\n"
    "  with. It\n"
    "  downloads FreeCAD 1.1.4 from FreeCAD's own release, checks its SHA-256 and FreeCAD's signature, and installs it\n"
    "  in Studio's own folder, where `cad <type> plan` finds it from the next plan, ahead of one in Applications;\n"
    "  macOS asks no question about it. Until then Studio's `freecadcmd` only says FreeCAD is not installed for\n"
    "  Studio, so a plan stops at once saying Studio's `freecadcmd` reports no version: that means the same, whatever\n"
    "  install advice follows it. If a plan says macOS is waiting for someone to answer whether to open FreeCAD,\n"
    "  the answer to recommend is the same: install FreeCAD for Studio with `studio-install-freecad`. Never recommend\n"
    "  opening FreeCAD from Applications or answering macOS's question, and never put FreeCAD in Applications, start\n"
    "  it with `open`, or remove its quarantine."
)
# The cam skill's word on a plan that stalled: answer macOS's question, which an agent's person may never see.
FREECAD_MAC_STALL = re.compile(r"\(on macOS: answer macOS's question about opening FreeCAD,\s+then plan again\)")
STUDIO_FREECAD_STALL = (
    "(on macOS in Studio, when it says macOS is waiting for someone to answer whether to open FreeCAD: its advice to\n"
    "answer that question or open FreeCAD from Applications is not Studio's. Recommend installing FreeCAD for Studio,\n"
    "and once the person says yes to the download of about 650 MB, run `studio-install-freecad`, then plan again)"
)
# What no skill Studio carries may tell an agent to do with FreeCAD on a Mac.
FREECAD_MAC_INSTALLS = ("open -a FreeCAD", "drag the `.dmg`'s FreeCAD into Applications",
                        "answer macOS's question about opening FreeCAD")
# The cam skill's step 2: ask for the machine and every tool's data, and never fill one in, before any plan. An agent
# stopped there to ask for flute lengths, stickout, stock, clamping and travel (0.1.19); Studio builds first, then
# asks (AGENTS.md, law 5).
CAM_ASK_FIRST = re.compile(r"2\. \*\*Ask what you cannot see\.\*\*.*?which features are\s+critical\.\n", re.DOTALL)
STUDIO_CAM_DEFAULTS = (
    "2. **Plan first, with stated defaults, then ask.** In Studio you make the job and plan it before asking\n"
    "   anything about the machine or the tools: never stop to ask for tool data, stock, holding or travel first.\n"
    "   Fill in what the person has not said with these, and list each as an assumption:\n"
    "   - **The controller** (`machine.post`): a dialect read by the wrong controller moves the machine wrongly, so\n"
    "     never guess it from the make. When the person has not named it, plan with `grbl`; once that plan has run,\n"
    "     say at the top of your reply that the G-code is for GRBL only and must not run on another controller, and\n"
    "     ask which controller runs the machine (GRBL (Recommended), LinuxCNC, Mach3/4, Fanuc, Centroid, UCCNC,\n"
    "     Smoothieware) with the questions after the plan; plan again with its post.\n"
    "   - **The spindle's top speed** (`machine.max_rpm`): 10000, unless the person names the spindle or machine.\n"
    "     On a faster spindle that only cuts slower, never harder.\n"
    "   - The machine's travel, slowest spindle speed and feed limit (`travel_mm`, `min_rpm`, `max_feed_mm_min`): in\n"
    "     the job only as the person gave them, never a number of your own or the example's. Without them the plan\n"
    "     checks none of them, and your reply says travel and feed limits were not checked.\n"
    "   - **The tools**: the fewest common carbide tools that fit, each one's data stated: a 6 mm 3-flute flat end mill\n"
    "     (20 mm flutes, 30 mm stickout, 6 mm shank); a 3 mm one (12 mm flutes, 20 mm stickout, 6 mm shank) only\n"
    "     where a pocket corner or slot needs it; a jobber drill of each hole's size (118° point, flutes 5 mm past\n"
    "     the hole's depth, stickout 15 mm past the flutes), numbered T1, T2 and on; longer flutes where the part is\n"
    "     deeper.\n"
    "   - **The stock**: the part's bounds plus `margin_mm` `[3, 3, 1]`.\n"
    "   - **How the part is held**: in a machine vise, cut from the top (`+Z`, `stock-top-center`); a second setup,\n"
    "     flipped, only for faces the top cannot reach.\n"
    "   - The material the person named (6061, not \"aluminium\"), else 6061 for an aluminium part.\n"
    "   Tool data the person gives, or their tool table, replaces these. Once the plan has run, and before any\n"
    "   question, say in one plain line what you planned with, for example: \"Planned with: GRBL, a 10000 rpm\n"
    "   spindle, a 6 mm flat end mill and a drill for each hole size, 3 mm of stock a side and 1 mm on top, held in\n"
    "   a vise from the top; travel and feed limits not checked.\" Then ask, the controller first whenever the person has not named it, then the tools, the spindle\n"
    "   speed and how the part is held: each question's first answer is the one you planned with, marked\n"
    "   (Recommended), and you plan again with what they change. Only the FreeCAD download is asked before the\n"
    "   first plan (Install FreeCAD), and alone.\n"
)
# The job in the cam skill's step 3 sets a machine's travel and feed limit, which an agent copied into a job for a machine
# nobody had described (0.1.19): Studio's example holds only what Studio plans with (law 4, no made-up numbers).
CAM_EXAMPLE_MACHINE = re.compile(
    r'"machine": \{"post": "grbl", "travel_mm": \[300, 300, 80\], "max_rpm": 24000,\s+"max_feed_mm_min": 2500\},'
)
STUDIO_CAM_EXAMPLE_MACHINE = '"machine": {"post": "grbl", "max_rpm": 10000},'
# The words that told an agent to ask before planning, or set limits nobody gave, which no cam skill Studio carries may keep.
CAM_ASKS_FIRST = ("Ask what you cannot see", "Never fill one of these in yourself", '"travel_mm": [300, 300, 80]',
                  '"max_feed_mm_min": 2500')

# Each skill's Show the model gives the person the viewer's page as a link, and the cam skill's step 6 gives the `url`
# `cad viewer` prints: that link carries the viewer's access token (`?token=`), and an agent pasted it into a chat
# (0.1.19). Studio shows models and files in its own tabs.
SHOW_LINK = re.compile(
    r"2\. A tool that opens a page in the app's own browser pane.*?3\. Neither: give the person the link, to open in\s+"
    r"their browser\.",
    re.DOTALL,
)
STUDIO_SHOW = (
    "2. Neither, in Studio: name the model's script or the file in code formatting (`parts/bracket.py`), which\n"
    "   Studio opens in its viewer.\n\n"
    "In Studio, never put a page's link in a reply (the `view:` line or the `url` `cad viewer` prints): it carries\n"
    "the viewer's access key (`token=`), and Studio shows every model and file in its own tabs."
)
CAM_SHOW_LINK = re.compile(
    r"otherwise run `cad viewer --json CAM/result\.glb` and give the user the `url` it prints for\s+the file, once\."
)
STUDIO_CAM_SHOW = (
    "otherwise name `CAM/result.glb` in code formatting, which Studio opens in its viewer. Never put a viewer\n"
    "   link in a reply: it carries the viewer's access key (`token=`)."
)
# What no skill Studio carries may tell an agent to do with a viewer page's link.
VIEWER_LINKS = ("give the person the link", "give the user the `url`")

IGNORED = shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store")


def server(python: str) -> dict:
    """Codex's entry for the CAD server: `python -m cad_mcp` (`cad mcp`) by Studio's Python."""
    return {"command": python, "args": ["-P", "-m", "cad_mcp"], "env": dict(SERVER_ENV),
            "startup_timeout_sec": STARTUP_SECONDS}


def studio_skill(text: str) -> str:
    """A skill's text as Studio carries it: its install sentence, the cam skill's macOS FreeCAD step, its word on a
    stalled plan, its asking before a plan and its example's machine limits, and every viewer link it gives the person,
    replaced by Studio's own."""
    text = INSTALL_SENTENCE.sub(STUDIO_SENTENCE, text)
    text = FREECAD_MAC_STEP.sub(lambda _match: STUDIO_FREECAD_STEP, text)
    text = FREECAD_MAC_STALL.sub(lambda _match: STUDIO_FREECAD_STALL, text)
    text = CAM_ASK_FIRST.sub(lambda _match: STUDIO_CAM_DEFAULTS, text)
    text = CAM_EXAMPLE_MACHINE.sub(lambda _match: STUDIO_CAM_EXAMPLE_MACHINE, text)
    text = SHOW_LINK.sub(lambda _match: STUDIO_SHOW, text)
    return CAM_SHOW_LINK.sub(lambda _match: STUDIO_CAM_SHOW, text)


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
    found = [f"{path.relative_to(plugin).as_posix()}: {words}"
             for path in sorted(plugin.rglob("*.md"))
             for words in FREECAD_MAC_INSTALLS if words in path.read_text(encoding="utf-8")]
    if found:
        raise SystemExit("Studio's CAD plugin would tell an agent to put FreeCAD in Applications on a Mac "
                         "(scripts/studio_cad_plugin.py's FREECAD_MAC_STEP no longer matches the cam skill):\n  "
                         + "\n  ".join(found))
    found = [f"{path.relative_to(plugin).as_posix()}: {words}"
             for path in sorted(plugin.rglob("*.md"))
             for words in CAM_ASKS_FIRST if words in path.read_text(encoding="utf-8")]
    if found:
        raise SystemExit("Studio's CAD plugin would tell an agent to ask for the machine and tools before a CNC plan, "
                         "or show it machine limits nobody gave (scripts/studio_cad_plugin.py's CAM_ASK_FIRST or "
                         "CAM_EXAMPLE_MACHINE no longer matches the cam skill):\n  "
                         + "\n  ".join(found))
    found = [f"{path.relative_to(plugin).as_posix()}: {words}"
             for path in sorted(plugin.rglob("*.md"))
             for words in VIEWER_LINKS if words in path.read_text(encoding="utf-8")]
    if found:
        raise SystemExit("Studio's CAD plugin would tell an agent to give the person a viewer link, which carries its "
                         "access token (scripts/studio_cad_plugin.py's SHOW_LINK or CAM_SHOW_LINK no longer matches):"
                         "\n  " + "\n  ".join(found))


def write_marketplace(out: Path, catalog: str, owner: str, description: str, name: str, version: str) -> None:
    """The catalog Studio reads the plugin from: `out/.claude-plugin/marketplace.json`."""
    write_json(out / ".claude-plugin" / "marketplace.json", {
        "name": catalog,
        "owner": {"name": owner},
        "description": description,
        "plugins": [{"name": name, "source": f"./plugins/{name}", "version": version}],
    })


def write_launcher(folder: Path, python: str, platform: str = sys.platform) -> list[Path]:
    """Studio's commands in `folder`, as the app's (studioAppBundle.ts): `cad` (sh) and `cad.cmd`, running
    `python -m cad_server.cli`, and `studio-install-freecad`, running this checkout's scripts/studio_freecad.py;
    on a Mac, until Studio's FreeCAD is installed, the stand-in `freecadcmd` (studio_freecad.STAND_IN)."""
    folder.mkdir(parents=True, exist_ok=True)
    sh = folder / "cad"
    sh.write_text(f"#!/bin/sh\nexec {shell_quoted(python)} -P -B -m cad_server.cli \"$@\"\n", encoding="utf-8")
    sh.chmod(0o755)
    cmd = folder / "cad.cmd"
    cmd.write_text(f'@"{python}" -P -B -m cad_server.cli %*\r\n', encoding="utf-8")
    installer = folder / "studio-install-freecad"
    script = Path(__file__).resolve().parent / "studio_freecad.py"
    installer.write_text(f"#!/bin/sh\nexec {shell_quoted(python)} -P -B {shell_quoted(str(script))} \"$@\"\n",
                         encoding="utf-8")
    installer.chmod(0o755)
    if platform == "darwin":
        studio_freecad.stand_in(studio_freecad.Place(folder))
    return [sh, cmd, installer]


def shell_quoted(text: str) -> str:
    return "'" + text.replace("'", "'\"'\"'") + "'"


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
