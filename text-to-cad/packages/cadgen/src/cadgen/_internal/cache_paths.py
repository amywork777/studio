"""Where cadgen keeps what it downloads and makes once per machine: Studio's FEA keeps CalculiX here.

Studio's copy of cadgen 0.7's rule (cadgen 0.8 removed it with the old store): ``CADGEN_CACHE_DIR``
when set, else ``%LOCALAPPDATA%/cadgen`` on Windows, ``$XDG_CACHE_HOME/cadgen`` where that is set,
else ``~/.cache/cadgen``. The same folder as before, so a CalculiX downloaded under 0.7 is used
again. Everything under it can be deleted: it costs a download, never correctness.
"""

from __future__ import annotations

import os
from pathlib import Path

__all__ = ["cache_root"]


def cache_root() -> Path:
    override = os.environ.get("CADGEN_CACHE_DIR", "").strip()
    if override:
        # Absolutized once, against the first reader's cwd, and written back so a later reader (this
        # process after a chdir, a worker it spawns) sees the same folder.
        root = Path(override).expanduser()
        if not root.is_absolute():
            root = (Path.cwd() / root).resolve()
            os.environ["CADGEN_CACHE_DIR"] = str(root)
        return root
    if os.name == "nt":
        local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
        if local_app_data:
            return Path(local_app_data) / "cadgen"
    else:
        xdg_cache_home = os.environ.get("XDG_CACHE_HOME", "").strip()
        if xdg_cache_home:
            return Path(xdg_cache_home) / "cadgen"
    return Path.home() / ".cache" / "cadgen"
