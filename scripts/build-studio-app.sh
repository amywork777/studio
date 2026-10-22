#!/usr/bin/env bash
# Builds Studio as a desktop app that runs with nothing else installed: on an Apple silicon Mac,
# release/Studio-<version>-arm64.dmg; on Windows (in Git Bash), the installer
# release/Studio-<version>-x64.exe. It carries the CAD tools with a Python of their own, and its
# first screen installs Claude Code and signs in.
#
# On a Mac, unsigned (the default), it is signed ad hoc: the person opening it chooses Open Anyway
# once (System Settings, Privacy & Security), and a new version is a new download. With
# STUDIO_SIGN=1 it is signed with the Developer ID Application certificate in this Mac's keychain,
# notarized by Apple (APPLE_KEYCHAIN_PROFILE names the credentials `xcrun notarytool
# store-credentials` saved), and it updates itself from the releases of amywork777/studio-download
# (scripts/lib/studio-app.ts). On Windows it updates itself signed or not; unsigned, Windows warns
# the first time it opens (More info, then Run anyway). STUDIO_SIGN=1 there signs it with Microsoft
# Trusted Signing, set up in the AZURE_* settings T3 Code's build reads.
#
# Run it from a checkout set up with scripts/setup-studio.sh (on Windows, the steps in
# .github/workflows/studio-windows.yml), with Rust's cargo installed for the desktop build. It
# stages build/studio-bundle (the CAD tools' Python, their plugin and page, and studio.json), which
# the desktop build copies into the app's resources (scripts/lib/studio-app.ts) and which the app
# sets itself up from on each start (apps/desktop/src/studio/studioAppBundle.ts).
#
#   scripts/build-studio-app.sh [version]    (0.1.0 when left out)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CAD="$ROOT/text-to-cad"
BUNDLE="$ROOT/build/studio-bundle"
VERSION="${1:-0.1.0}"
export PATH="$ROOT/node_modules/.bin:$HOME/.local/bin:$PATH"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
stop() {
  printf '\n\033[1mBuild stopped.\033[0m %s\n' "$1" >&2
  exit 1
}

case "$(uname -s)" in
  Darwin)
    [ "$(uname -m)" = arm64 ] || stop "Build the Mac app on an Apple silicon Mac."
    platform=mac target=dmg arch=arm64
    venv_python="$CAD/.venv/bin/python"
    bundle_python="$BUNDLE/python/bin/python3"
    ;;
  MINGW* | MSYS*)
    platform=win target=nsis arch=x64
    venv_python="$CAD/.venv/Scripts/python.exe"
    bundle_python="$BUNDLE/python/python.exe"
    ;;
  *) stop "Build the Studio app on an Apple silicon Mac, or on Windows in Git Bash." ;;
esac
# A path as Windows programs (node, uv, Python) take it; on a Mac, as it is.
native() {
  if [ "$platform" = win ]; then cygpath -w "$1"; else printf '%s' "$1"; fi
}

[ -x "$venv_python" ] && [ -e "$ROOT/node_modules/.bin/vp" ] ||
  stop "Set this checkout up first: scripts/setup-studio.sh"
command -v cargo >/dev/null 2>&1 || stop "The desktop build needs Rust's cargo: https://rustup.rs"
# Its resource monitor's dependencies need Rust 1.95 or newer.
rust="$(rustc --version 2>/dev/null | awk '{print $2}')"
rust_minor="$(printf '%s' "$rust" | cut -d. -f2)"
[ "${rust%%.*}" = 1 ] && [ "${rust_minor:-0}" -ge 95 ] ||
  stop "The desktop build needs Rust 1.95 or newer; this computer has ${rust:-none}. Run rustup update stable, or install 1.95 and set RUSTUP_TOOLCHAIN=1.95."
signed=false
if [ "${STUDIO_SIGN:-}" = 1 ] && [ "$platform" = mac ]; then
  security find-identity -v -p codesigning | grep -q "Developer ID Application" ||
    stop "STUDIO_SIGN=1 needs a Developer ID Application certificate in this Mac's keychain (STUDIO.md, The Mac app)."
  [ -n "${APPLE_KEYCHAIN_PROFILE:-}" ] ||
    { [ -n "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_KEY_ID:-}" ] && [ -n "${APPLE_API_ISSUER:-}" ]; } ||
    { [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; } ||
    stop "STUDIO_SIGN=1 needs notarization credentials: set APPLE_KEYCHAIN_PROFILE to the profile xcrun notarytool store-credentials saved."
  signed=true
elif [ "${STUDIO_SIGN:-}" = 1 ]; then
  for name in AZURE_TENANT_ID AZURE_CLIENT_ID AZURE_CLIENT_SECRET AZURE_TRUSTED_SIGNING_ENDPOINT \
    AZURE_TRUSTED_SIGNING_ACCOUNT_NAME AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME \
    AZURE_TRUSTED_SIGNING_PUBLISHER_NAME; do
    [ -n "${!name:-}" ] || stop "STUDIO_SIGN=1 on Windows needs Microsoft Trusted Signing's $name."
  done
  signed=true
fi

step "Building the CAD tools' runtime and page"
(cd "$CAD" && scripts/bundle/bundle.sh && npm run build:mcp)

step "Making the CAD tools' own Python"
rm -rf "$BUNDLE"
mkdir -p "$BUNDLE"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
uv python install 3.13
python="$(uv python find --managed-python 3.13)"
# uv's own CPython build moves with the folder it is in, so the app can carry it. Windows's keeps
# python.exe at the top of that folder; a Mac's, in its bin.
if [ "$platform" = win ]; then
  cp -RL "$(dirname "$(cygpath -u "$python")")" "$BUNDLE/python"
else
  cp -R "$(cd "$(dirname "$python")/.." && pwd -P)" "$BUNDLE/python"
fi
uv build --wheel --out-dir "$(native "$work")" "$(native "$CAD/packages/cadgen")"
wheel="$(ls "$work"/cadgen-*.whl)"
if [ "$platform" = win ]; then wheel_url="file:///$(cygpath -m "$wheel")"; else wheel_url="file://$wheel"; fi
# The versions the checkout's CAD tools run on, so the app runs the same ones.
uv pip freeze --python "$(native "$venv_python")" | grep -v -E '^-e |^cadgen|^ziglang' >"$work/constraints.txt"
uv pip install --python "$(native "$bundle_python")" --break-system-packages \
  -c "$(native "$work/constraints.txt")" "cadgen[fea] @ $wheel_url"
"$bundle_python" -c "import cadgen.mcp.server, OCP, netgen"
# The bundle carries no symlinks: copying it into the app turns relative links into links that
# point outside the app, which fails the app's signature check.
find "$BUNDLE" -type l | while IFS= read -r link; do
  cp -RL "$link" "$link.real" && mv -f "$link.real" "$link"
done

step "Laying out the CAD plugin"
"$bundle_python" "$(native "$ROOT/scripts/studio-app-plugin.py")" "$(native "$CAD")" "$(native "$BUNDLE/marketplace")"
mkdir -p "$BUNDLE/page"
cp "$CAD/apps/mcp/dist/index.html" "$BUNDLE/page/index.html"
# The Electron profile's folder is named by the app's id, which no other app shares; a folder
# called "studio" could be any app's of that name.
cat >"$BUNDLE/studio.json" <<'JSON'
{
  "name": "Studio",
  "home": ".text-to-cad-studio",
  "profile": "com.amywork777.studio",
  "plugins": ["text-to-cad"]
}
JSON

step "Building the app"
cd "$ROOT"
T3CODE_DESKTOP_SIGNED="$signed" T3CODE_DESKTOP_STUDIO_BUNDLE="$(native "$BUNDLE")" VITE_APP_BASE_NAME=Studio \
  T3CODE_BRAND_DIR="$(native "$ROOT/brand")" \
  node scripts/build-desktop-artifact.ts --platform "$platform" --target "$target" --arch "$arch" --build-version "$VERSION"

if [ "$platform" = win ]; then
  # The download's one name, as on a Mac: releases/latest/download/Studio-Setup.exe.
  cp "$ROOT/release/Studio-$VERSION-x64.exe" "$ROOT/release/Studio-Setup.exe"
  printf '\n\033[1mStudio is built:\033[0m %s\n' "$ROOT/release/Studio-$VERSION-x64.exe"
  # What a running Studio updates from: the installer, its blockmap (for downloading only what
  # changed) and latest.yml, which names them.
  printf "Add it to the version's release with:\n\n  gh release upload v%s %s --repo amywork777/studio-download\n\n" \
    "$VERSION" "Studio-Setup.exe Studio-$VERSION-x64.exe Studio-$VERSION-x64.exe.blockmap latest.yml"
  exit 0
fi

# The download's one name: the guide page and amywork777/studio-download's README link to
# releases/latest/download/Studio-arm64.dmg, so publishing a version changes no link.
cp -c "$ROOT/release/Studio-$VERSION-arm64.dmg" "$ROOT/release/Studio-arm64.dmg" 2>/dev/null ||
  cp "$ROOT/release/Studio-$VERSION-arm64.dmg" "$ROOT/release/Studio-arm64.dmg"
printf '\n\033[1mStudio is built:\033[0m %s\n' "$ROOT/release/Studio-$VERSION-arm64.dmg"
assets="$ROOT/release/Studio-arm64.dmg"
if [ "$signed" = true ]; then
  # What a running Studio updates from: the zip, its blockmap (for downloading only what changed) and
  # latest-mac.yml, which names them.
  assets="$assets $ROOT/release/Studio-$VERSION-arm64.zip $ROOT/release/Studio-$VERSION-arm64.zip.blockmap $ROOT/release/latest-mac.yml"
fi
printf 'Publish it with:\n\n  gh release create v%s %s --repo amywork777/studio-download --title "Studio %s"\n\n' \
  "$VERSION" "$assets" "$VERSION"
