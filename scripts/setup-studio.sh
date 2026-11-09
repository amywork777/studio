#!/usr/bin/env bash
# Sets Studio up on a Mac from this checkout. Run it once after cloning, and again after pulling
# changes: each step adds only what is missing or changed. It fetches the text-to-cad submodule at
# its pin, installs the app's packages, the CAD
# plugin's Python environment (text-to-cad/.venv) and its built pieces; the CAD server draws part
# pictures in that Python, with no browser. It asks for nothing and changes no shell settings. Then
# scripts/run-studio.sh starts Studio.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CAD="$ROOT/text-to-cad"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
stop() {
  printf '\n\033[1mSetup stopped.\033[0m %s\n' "$1" >&2
  exit 1
}

step "Checking this Mac"
[ "$(uname -s)" = Darwin ] || stop "This setup is for macOS."
xcode-select -p >/dev/null 2>&1 ||
  stop "Apple's command line tools are missing. Run xcode-select --install, then run this again."
command -v node >/dev/null 2>&1 ||
  stop "Node is missing. Install Node 24 from https://nodejs.org, then run this again."
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge 24 ] ||
  stop "Studio needs Node 24 or newer, and this Mac has $(node -v). Install Node 24 from https://nodejs.org, then run this again."
# uv sets up the CAD plugin's Python, downloading the Python it needs.
export PATH="$HOME/.local/bin:$PATH"
if ! command -v uv >/dev/null 2>&1; then
  step "Installing uv (https://docs.astral.sh/uv), which sets up the CAD plugin's Python"
  curl -LsSf https://astral.sh/uv/install.sh | env UV_NO_MODIFY_PATH=1 sh
fi
echo "Node $(node -v), $(uv --version)"

step "Fetching text-to-cad at Studio's pin"
git -C "$ROOT" submodule update --init text-to-cad

step "Installing Studio's packages"
cd "$ROOT"
if command -v vp >/dev/null 2>&1; then
  vp install
else
  # The vp command this repository builds with, at its pinned version, run without installing it.
  vp_version="$(sed -n 's/^  vite-plus: *//p' pnpm-workspace.yaml | head -n 1)"
  npx --yes -p "vite-plus@${vp_version:?}" vp install
fi

# Electron fetches its app on first use; fetching it now keeps Studio's first start quick.
step "Downloading the desktop app's runtime (Electron)"
(cd "$ROOT/apps/desktop" && node -e "require('electron')" >/dev/null)

step "Setting up the CAD plugin's Python"
cd "$CAD"
# 3.14, which the CAD packages need: a .venv made on an older Python is made again. Its
# requirements are the library with its kernel, the server and cad-mcp.
if ! { [ -x .venv/bin/python ] && .venv/bin/python -c 'import sys; sys.exit(sys.version_info < (3, 14))'; }; then
  uv venv --clear --python 3.14 .venv
fi
uv pip install --python .venv/bin/python -r requirements-dev.txt
# With strength checks' mesher and solver (netgen, cad-ccx's CalculiX), as the Mac app has them, so a
# check runs here at once rather than making an environment for them first.
uv pip install --python .venv/bin/python --editable "./packages/cad[build123d,trimesh,netgen,calculix]"

step "Building the CAD plugin's viewer and runtime"
npm ci
npm run build:packages
scripts/bundle/bundle.sh

step "Checking for Claude Code"
if command -v claude >/dev/null 2>&1; then
  echo "Claude Code is installed. If you haven't signed in yet, run: claude auth login"
else
  echo "Studio's AI runs on Claude Code, which is not installed yet."
  echo "Install it from https://claude.com/product/claude-code, then run: claude auth login"
fi

printf '\n\033[1mStudio is set up.\033[0m Start it with:\n\n  %s/scripts/run-studio.sh\n\n' "$ROOT"
