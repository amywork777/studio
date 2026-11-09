#!/usr/bin/env python3
"""text-to-cad's development plugin for Studio: a checkout's working copy, not the release.

Studio reads a text-to-cad checkout as a marketplace, and that plugin runs the released CAD tools
(`uvx --from cad-mcp==<VERSION>`), so work on a branch (FEA, CAM) never reaches it. With
TEXT_TO_CAD_DEV=1, scripts/studio.ts runs this first. It lays the plugin out the way the checkout's
own scripts/install/dev_install.py lays one out for Codex, through that script's functions: the
checkout's .venv registered as this install's version (`<version>-dev.<time>`), made current, and
the `cad` command written, both in Studio's own CAD state (scripts/studio.ts sets CAD_STATE_DIR and
CAD_LAUNCHER_DIR before it runs this), so the skills' `cad` runs it, and `cad-mcp` run by that .venv,
serving a fresh build of apps/mcp, with Studio's job skills beside the skills
(scripts/studio_job_skills.py). The result is a marketplace at <checkout>/tmp/studio-dev, which
Studio uses in place, and its path is the one line printed.

Needs the checkout set up as CONTRIBUTING.md says: `.venv` (Python 3.14) from requirements-dev.txt,
`npm ci`, and `scripts/bundle/bundle.sh`.

    python3 scripts/studio-dev-plugin.py <text-to-cad checkout>
"""

from __future__ import annotations

import sys
from pathlib import Path

from studio_job_skills import add_job_skills


class Options:
    """dev_install's arguments: the checkout's .venv, with the page built fresh."""

    wheel = False
    build = True


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__.strip().splitlines()[-1].strip(), file=sys.stderr)
        return 2
    checkout = Path(argv[1]).resolve()
    sys.path.insert(0, str(checkout / "scripts" / "install"))
    try:
        import dev_install
    except ImportError:
        print(f"{checkout} has no scripts/install/dev_install.py to build a dev plugin with.", file=sys.stderr)
        return 1
    # Studio runs the skills, as the plugin hosts do: without this, dev_install treats "studio" as a
    # host with none (Claude Desktop's chat), registers nothing and leaves the skills on the release.
    if "studio" not in dev_install.PLUGIN_HOSTS:
        dev_install.PLUGIN_HOSTS = (*dev_install.PLUGIN_HOSTS, "studio")
    try:
        version = dev_install.dev_version()
        # Registers the .venv as `version` in Studio's state and writes the `cad` command.
        server, rewrites, _ = dev_install.runtime("studio", Options, version)
        name = dev_install.plugin_name()
        root = dev_install.dev_root("studio")
        # Codex's layout: its manifest carries the plugin's icon and starter prompts.
        plugin = root / "plugins" / name
        dev_install.assemble("codex", plugin, version, server, rewrites=rewrites)
        # Studio's job skills beside text-to-cad's ($fdm, $export, $board-fab: scripts/studio_job_skills.py).
        add_job_skills(plugin)
        dev_install.write_json(root / ".claude-plugin" / "marketplace.json", {
            "name": "text-to-cad-studio-dev",
            "owner": {"name": "this checkout"},
            "description": f"{name} from {checkout}, for Studio",
            "plugins": [{"name": name, "source": f"./plugins/{name}", "version": version}],
        })
    except dev_install.Refused as refused:
        print(refused, file=sys.stderr)
        return 1
    print(root)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
