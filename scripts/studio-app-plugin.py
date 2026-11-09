#!/usr/bin/env python3
"""text-to-cad's plugin for the Studio app: a checkout's skills and CAD server, laid out as the
marketplace the packaged app carries (scripts/build-studio-app.sh).

The app's own Python runs the server, but the app can live anywhere, so its path is not known when
the app is built. Every place that names it holds @@STUDIO_PYTHON@@, with @@STUDIO_BIN@@ for the
folder of Studio's `cad` command; the app fills them in on each start
(apps/desktop/src/studio/studioAppBundle.ts), and registers that Python's CAD server in Studio's own
CAD state there. The skills name no version: they run `cad`, the current installation, which is
that one. The plugin's MCP server is `cad-mcp` run by that Python, which reaches the server it
carries (`cad_mcp.engine`), whose wheel carries the CAD app's page. The layout is a development
install's (scripts/install/dev_install.py); its channel is "dev", as Studio's own is, which keeps
the CAD server's update notices and telemetry off. Studio's job skills join its skills
(scripts/studio_job_skills.py).

    python3 scripts/studio-app-plugin.py <text-to-cad checkout> <out folder>
"""

from __future__ import annotations

import sys
from pathlib import Path

from studio_job_skills import add_job_skills

PYTHON = "@@STUDIO_PYTHON@@"
BIN = "@@STUDIO_BIN@@"


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__.strip().splitlines()[-1].strip(), file=sys.stderr)
        return 2
    checkout = Path(argv[1]).resolve()
    out = Path(argv[2]).resolve()
    sys.path.insert(0, str(checkout / "scripts" / "install"))
    import dev_install

    version = (checkout / "VERSION").read_text(encoding="utf-8").strip()
    name = dev_install.plugin_name(checkout)
    server = {
        "command": PYTHON,
        "args": ["-m", "cad_mcp"],
        "env": dev_install.CHANNEL,
        "startup_timeout_sec": dev_install.CODEX_STARTUP_SECONDS,
    }
    # `~/.local/bin/cad` is Studio's own, and the installer is the app's to run, never a skill's:
    # each skill's install paragraph (the same words in every one) becomes what to do in Studio. It
    # follows "Otherwise" in 0.10's skills and "If it is missing," in 0.11's, so it starts after them.
    install = (
        "install text-to-cad, outside a sandbox or with its permission:\n\n"
        f"```bash\n{dev_install.INSTALL_COMMANDS[0]}\n```\n\n"
        f"On Windows, in PowerShell: `{dev_install.INSTALL_COMMANDS[1]}`. "
    )
    rewrites = {
        install: "the CAD tools are Studio's own: never install text-to-cad here, and ask the person "
        "to restart Studio, which sets them up again.\n\n",
        "~/.local/bin": BIN,
    }
    plugin = out / "plugins" / name
    dev_install.assemble("codex", plugin, version, server, root=checkout, rewrites=rewrites)
    # Studio's job skills beside text-to-cad's ($fdm, $export, $board-fab: scripts/studio_job_skills.py).
    add_job_skills(plugin)
    dev_install.write_json(out / ".claude-plugin" / "marketplace.json", {
        "name": "studio-app",
        "owner": {"name": "Studio"},
        "description": f"{name} {version}, inside the Studio app",
        "plugins": [{"name": name, "source": f"./plugins/{name}", "version": version}],
    })
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
