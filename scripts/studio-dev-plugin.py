#!/usr/bin/env python3
"""text-to-cad's development plugin for Studio: a checkout's working copy, not the release.

Studio reads a text-to-cad checkout as a marketplace, and that plugin runs the released CAD tools
(`uvx cad@<VERSION> mcp`), so work on a branch (FEA, CAM) never reaches it. With TEXT_TO_CAD_DEV=1,
scripts/studio.ts runs this first, by the checkout's .venv. It lays the plugin out as the app's is
(scripts/studio_cad_plugin.py), at `<version>-dev.<time>` so Studio takes it as new, its CAD server
`cad mcp` run by that .venv, and writes Studio's `cad` command, the same .venv's, in CAD_LAUNCHER_DIR
(scripts/studio.ts sets it, with Studio's own CAD state, before it runs this), so the skills' `cad`
runs the checkout. Studio's job skills join its skills (scripts/studio_job_skills.py). The result is
a marketplace at <checkout>/tmp/studio-dev, which Studio uses in place, and its path is the one line
printed.

Needs the checkout set up as its CONTRIBUTING.md says: `uv sync` (the .venv), `npm ci`, and
`scripts/bundle/bundle.sh`, which builds the CAD page the server serves.

    python3 scripts/studio-dev-plugin.py <text-to-cad checkout>
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from studio_cad_plugin import lay_out, write_launcher, write_marketplace
from studio_job_skills import add_job_skills


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__.strip().splitlines()[-1].strip(), file=sys.stderr)
        return 2
    checkout = Path(argv[1]).resolve()
    launchers = os.environ.get("CAD_LAUNCHER_DIR", "").strip()
    if not launchers:
        print("CAD_LAUNCHER_DIR names no folder for Studio's `cad` command (scripts/studio.ts sets it).",
              file=sys.stderr)
        return 1
    # The checkout's own: this script runs by its .venv (scripts/studio.ts), whose cad is the working copy.
    python = sys.executable
    try:
        import cad_server  # noqa: F401
    except ImportError:
        print(f"{python} has no cad: set up {checkout}/.venv with `uv sync` first.", file=sys.stderr)
        return 1
    version = f"{(checkout / 'VERSION').read_text(encoding='utf-8').strip()}-dev.{time.strftime('%Y%m%d%H%M%S')}"
    root = checkout / "tmp" / "studio-dev"
    name = lay_out(checkout, root / "plugins" / "text-to-cad", version, python)
    # Studio's job skills beside text-to-cad's ($fdm, $export, $board-fab: scripts/studio_job_skills.py).
    add_job_skills(root / "plugins" / name)
    write_marketplace(root, "text-to-cad-studio-dev", "this checkout", f"{name} from {checkout}, for Studio", name,
                      version)
    write_launcher(Path(launchers), python)
    print(root)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
