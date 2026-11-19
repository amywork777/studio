#!/usr/bin/env python3
"""text-to-cad's plugin for the Studio app: a checkout's skills and CAD server, laid out as the
marketplace the packaged app carries (scripts/build-studio-app.sh).

The app's own Python runs the server, but the app can live anywhere, so its path is not known when
the app is built. Every place that names it holds @@STUDIO_PYTHON@@; the app fills it in on each
start and writes Studio's `cad` command beside it (apps/desktop/src/studio/studioAppBundle.ts).
The layout is scripts/studio_cad_plugin.py's: the skills run `cad`, Studio's own, never an
installed one, and the plugin's MCP server is `cad mcp` run by that Python. Studio's job skills
join its skills (scripts/studio_job_skills.py).

    python3 scripts/studio-app-plugin.py <text-to-cad checkout> <out folder>
"""

from __future__ import annotations

import sys
from pathlib import Path

from studio_cad_plugin import lay_out, write_marketplace
from studio_job_skills import add_job_skills

PYTHON = "@@STUDIO_PYTHON@@"


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__.strip().splitlines()[-1].strip(), file=sys.stderr)
        return 2
    checkout = Path(argv[1]).resolve()
    out = Path(argv[2]).resolve()
    version = (checkout / "VERSION").read_text(encoding="utf-8").strip()
    name = "text-to-cad"
    plugin = out / "plugins" / name
    named = lay_out(checkout, plugin, version, PYTHON)
    if named != name:
        print(f"text-to-cad's Codex manifest names the plugin {named!r}, not {name!r}", file=sys.stderr)
        return 1
    # Studio's job skills beside text-to-cad's ($fdm, $export, $board-fab: scripts/studio_job_skills.py).
    add_job_skills(plugin)
    write_marketplace(out, "studio-app", "Studio", f"{name} {version}, inside the Studio app", name, version)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
