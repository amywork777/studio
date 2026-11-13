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
# stages build/studio-bundle (the CAD tools' Python, the FEA solver, their plugin and page, the
# sample project, the license notices and studio.json), which the desktop build copies into the app's resources (scripts/lib/studio-app.ts)
# and which the app sets itself up from on each start (apps/desktop/src/studio/studioAppBundle.ts).
#
#   scripts/build-studio-app.sh [version]    (0.1.0 when left out)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CAD="$ROOT/text-to-cad"
BUNDLE="$ROOT/build/studio-bundle"
VERSION="${1:-0.1.0}"
export PATH="$ROOT/node_modules/.bin:$HOME/.local/bin:$PATH"
# Its scratch folders (the work folder here, the desktop build's stage) stay out of the system's
# temp folder, which macOS empties nightly of files unopened for three days (dirhelper): a build
# then lost the bundle's old empty files and its update zip no longer matched the signature. On a
# Mac they also stay out of the repository, whose node_modules the bundle's self-check refuses.
if [ "$(uname -s)" = Darwin ]; then
  export TMPDIR="$HOME/Library/Caches/studio-build/tmp"
else
  export TMPDIR="$ROOT/build/tmp"
fi

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
# The app carries Electron's license and Chromium's as files (the bundle's licenses folder, below).
# A Windows app has both beside Studio.exe already, where electron-builder leaves them; from a Mac
# app it takes them out, so a Mac build copies them from the Electron this checkout installed, the
# version the app is built on. Looked for now, so a build that lacks them stops in its first second.
electron_notices=""
if [ "$platform" = mac ]; then
  electron="$(node -p 'require(process.argv[1]).dependencies.electron' "$ROOT/apps/desktop/package.json")"
  for dist in "$ROOT"/node_modules/.pnpm/electron@"$electron"*/node_modules/electron/dist; do
    if [ -f "$dist/LICENSE" ] && [ -f "$dist/LICENSES.chromium.html" ]; then
      electron_notices="$dist"
      break
    fi
  done
  [ -n "$electron_notices" ] ||
    stop "Electron $electron's license files are not in this checkout (node_modules/.pnpm/electron@$electron/node_modules/electron/dist). Run scripts/setup-studio.sh again."
fi
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

rm -rf "$TMPDIR"
mkdir -p "$TMPDIR"

step "Checking text-to-cad is at Studio's pin"
# text-to-cad is a submodule (STUDIO.md): the app ships the commit Studio pins, never another.
[ -f "$CAD/package.json" ] || git -C "$ROOT" submodule update --init text-to-cad
case "$(git -C "$ROOT" submodule status text-to-cad)" in
  +*) stop "text-to-cad is checked out at another commit than Studio pins. Run git submodule update text-to-cad, or commit the new pin first." ;;
esac

step "Building the CAD tools' runtime and page"
# text-to-cad's own packages first, as its lockfile names them: a checkout copied from another (or
# one made before 0.10, whose packages are @cad/*) lacks some.
(cd "$CAD" && npm ci --no-audit --no-fund && scripts/bundle/bundle.sh && npm run build:mcp)

step "Making the CAD tools' own Python"
rm -rf "$BUNDLE"
mkdir -p "$BUNDLE"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
# The CAD packages need 3.14.
uv python install 3.14
python="$(uv python find --managed-python 3.14)"
# uv's own CPython build moves with the folder it is in, so the app can carry it. Windows's keeps
# python.exe at the top of that folder; a Mac's, in its bin.
if [ "$platform" = win ]; then
  cp -RL "$(dirname "$(cygpath -u "$python")")" "$BUNDLE/python"
else
  cp -R "$(cd "$(dirname "$python")/.." && pwd -P)" "$BUNDLE/python"
fi
# The library with its kernel and the integrations a part, a strength check and a manufacturing
# check run on (`cad[build123d,netgen,calculix,trimesh]`: 0.11 counts an integration present only when
# its extra is installed, else it makes an environment for it), the server (its packaged runtime,
# which bundle.sh just built) and the agent apps' stdio transport, `cad-mcp`.
wheel_url() {
  local wheel
  wheel="$(ls "$work"/"$1"-*.whl)"
  if [ "$platform" = win ]; then echo "file:///$(cygpath -m "$wheel")"; else echo "file://$wheel"; fi
}
# setuptools packs whatever its build/lib holds, and keeps old files there: the viewer's renamed
# bundles from every earlier build (392 files, not 64, by 0.1.11). Each build starts it empty.
for package in cad cad-server cad-mcp; do
  rm -rf "$CAD/packages/$package/build"
  uv build --wheel --out-dir "$(native "$work")" "$(native "$CAD/packages/$package")"
done
# The versions the checkout's CAD tools run on, so the app runs the same ones.
uv pip freeze --python "$(native "$venv_python")" | grep -v -E '^-e |^cad(-server|-mcp)?==|^ziglang' >"$work/constraints.txt"
uv pip install --python "$(native "$bundle_python")" --break-system-packages \
  -c "$(native "$work/constraints.txt")" \
  "cad[build123d,netgen,calculix,trimesh] @ $(wheel_url cad)" "cad-server @ $(wheel_url cad_server)" "cad-mcp @ $(wheel_url cad_mcp)"
"$bundle_python" -c "import cad_mcp.shim, cad_server.cli, OCP, netgen, cad_ccx, trimesh"
# An integration made on first use (kicad's) installs the library again in an environment of its own,
# from the archive its record names (direct_url.json): here the build's wheel, gone once the build ends.
# So the app keeps the library's wheel (`wheels`, which it names to the CAD tools as
# CAD_UPDATE_FIND_LINKS, studioAppBundle.ts) and the records go: `cad==<version>` then resolves to that
# wheel, Studio's text-to-cad, before the index's.
mkdir -p "$BUNDLE/wheels"
cp "$work"/cad-*.whl "$BUNDLE/wheels/"
"$bundle_python" - <<'PY'
from importlib.metadata import distribution

for name in ("cad", "cad-server", "cad-mcp"):
    found = distribution(name)
    for file in found.files or ():
        if file.name != "direct_url.json":
            continue
        record = found.locate_file(file)
        record.unlink(missing_ok=True)
        listing = record.with_name("RECORD")
        kept = [line for line in listing.read_text(encoding="utf-8").splitlines(keepends=True)
                if not line.startswith(f"{record.parent.name}/direct_url.json,")]
        listing.write_text("".join(kept), encoding="utf-8")
PY
"$bundle_python" -c "
from importlib.metadata import distribution
left = [name for name in ('cad', 'cad-server', 'cad-mcp') if distribution(name).read_text('direct_url.json')]
assert not left, f'still named by a build wheel: {left}'"

# The FEA solver is cad[calculix]'s own CalculiX (the cad-ccx package), which carries its libraries
# and moves with the bundle's Python. `ccx -v` prints its version and exits 201.
ccx="$("$bundle_python" -c "import cad_ccx; print(cad_ccx.executable())" | tr -d '\r')"
[ "$platform" = win ] && ccx="$(cygpath -u "$ccx")"
ccx_says="$("$ccx" -v 2>&1 || true)"
case "$ccx_says" in
  *"Version 2."*) ;;
  *) stop "The bundled CalculiX does not run. ccx -v printed: ${ccx_says:-nothing}" ;;
esac
# The bundle carries no symlinks: copying it into the app turns relative links into links that
# point outside the app, which fails the app's signature check.
find "$BUNDLE" -type l | while IFS= read -r link; do
  cp -RL "$link" "$link.real" && mv -f "$link.real" "$link"
done

step "Laying out the CAD plugin"
text_to_cad="$(tr -d '[:space:]' <"$CAD/VERSION")"
"$bundle_python" "$(native "$ROOT/scripts/studio-app-plugin.py")" "$(native "$CAD")" "$(native "$BUNDLE/marketplace")"
# Studio's law 13 (AGENTS.md): every skill of text-to-cad's ships in the app.
skills_of() { find "$1" -mindepth 2 -maxdepth 2 -name SKILL.md | awk -F/ '{print $(NF-1)}' | sort; }
# text-to-cad's skills (law 13) and Studio's job skills (scripts/studio_job_skills.py), all of them.
left_out="$(comm -23 <(cat <(skills_of "$CAD/skills") <(skills_of "$ROOT/studio-job-skills") | sort) <(skills_of "$BUNDLE"/marketplace/plugins/*/skills))"
[ -z "$left_out" ] || stop "The app's CAD plugin leaves out these skills: $(echo $left_out)"
# The Electron profile's folder is named by the app's id, which no other app shares; a folder
# called "studio" could be any app's of that name.
# A build sends anonymous usage counts, once the person says yes, to Studio's usage receiver
# (infra/usage), or to STUDIO_USAGE_URL; STUDIO_USAGE_URL= (empty) makes one that sends nothing.
# No build carries a database key: the receiver holds it.
usage_url=""
STUDIO_USAGE_URL="${STUDIO_USAGE_URL-https://studio-usage.vercel.app}"
if [ -n "$STUDIO_USAGE_URL" ]; then
  usage_url=",
  \"usageUrl\": \"$STUDIO_USAGE_URL\""
fi
# Its version, for the server to say to clients and in usage counts (studioAppBundle.ts), as the
# web client's build is told below; and the text-to-cad it includes, which projects are stamped with.
cat >"$BUNDLE/studio.json" <<JSON
{
  "name": "Studio",
  "version": "$VERSION",
  "textToCad": "$text_to_cad",
  "home": ".text-to-cad-studio",
  "profile": "com.amywork777.studio",
  "plugins": ["text-to-cad"]$usage_url
}
JSON

# The finished sample projects (`T3CODE_SAMPLES_DIR` points here), which Examples copies into new projects.
step "Copying the examples"
cp -R "$ROOT/studio-sample" "$BUNDLE/sample"

# The notices the app carries as files, in its resources' studio/licenses: T3 Code's, whose app
# Studio is built on, and on a Mac Electron's and Chromium's (found above), under the names
# electron-builder gives them on Windows. The CAD tools' Python and its packages keep theirs where
# they are installed (the bundle's python folder), and Settings, About, View licenses shows notices
# in the app itself.
step "Copying the license notices"
mkdir -p "$BUNDLE/licenses"
cp "$ROOT/LICENSE" "$BUNDLE/licenses/LICENSE.t3code.txt"
if [ -n "$electron_notices" ]; then
  cp "$electron_notices/LICENSE" "$BUNDLE/licenses/LICENSE.electron.txt"
  cp "$electron_notices/LICENSES.chromium.html" "$BUNDLE/licenses/LICENSES.chromium.html"
fi

step "Building the app"
cd "$ROOT"
T3CODE_DESKTOP_SIGNED="$signed" T3CODE_DESKTOP_STUDIO_BUNDLE="$(native "$BUNDLE")" VITE_APP_BASE_NAME=Studio \
  APP_VERSION="$VERSION" T3CODE_BRAND_DIR="$(native "$ROOT/brand")" \
  node scripts/build-desktop-artifact.ts --platform "$platform" --target "$target" --arch "$arch" --build-version "$VERSION"
# A build whose pages say another version would count every use under the wrong release. The
# minifier writes the version as a template string (`0.1.5`), so either quote counts.
grep -rqF --include='*.js' -e "\"$VERSION\"" -e "\`$VERSION\`" "$ROOT/apps/server/dist/client/assets" ||
  stop "The app's pages do not say version $VERSION: APP_VERSION did not reach the web build."

if [ "$platform" = win ]; then
  # The download's one name, as on a Mac: releases/latest/download/Studio-Setup.exe.
  cp "$ROOT/release/Studio-$VERSION-x64.exe" "$ROOT/release/Studio-Setup.exe"
  printf '\n\033[1mStudio is built:\033[0m %s\n' "$ROOT/release/Studio-$VERSION-x64.exe"
  # What a running Studio updates from: the installer, its blockmap (for downloading only what
  # changed) and latest.yml, which names them. They join the Mac build's draft, so neither updater
  # reads a release that lacks its feed.
  printf "Add it to the version's draft with:\n\n  gh release upload v%s %s --repo amywork777/studio-download\n\n" \
    "$VERSION" "Studio-Setup.exe Studio-$VERSION-x64.exe Studio-$VERSION-x64.exe.blockmap latest.yml"
  exit 0
fi

# The built app's own CAD tools rebuild the examples' STEP files and solve their strength studies, held
# to what the examples ship with (scripts/studio-app-check.py), and the app must open
# (scripts/studio-app-open-check.mjs): a build that fails is not offered for publishing. On Windows
# the workflow checks the installed app the same way.
# It checks the app inside the DMG, the one a person downloads, mounted read-only.
step "Checking the app's CAD tools"
mounted="$(mktemp -d "$TMPDIR/studio-dmg.XXXXXX")"
hdiutil attach -readonly -nobrowse -mountpoint "$mounted" "$ROOT/release/Studio-$VERSION-arm64.dmg" >/dev/null
app_studio="$mounted/Studio.app/Contents/Resources/studio"
checked=true
"$app_studio/python/bin/python3" "$ROOT/scripts/studio-app-check.py" "$app_studio" || checked=false
# A release must open: the same app starts on a home of its own and shows its first screen.
step "Opening the app"
opened=true
node "$ROOT/scripts/studio-app-open-check.mjs" "$mounted/Studio.app" || opened=false
# The app's background setup can still be running from the disk image for a moment.
hdiutil detach "$mounted" >/dev/null || hdiutil detach -force "$mounted" >/dev/null
[ "$checked" = true ] || stop "The built app could not rebuild the examples or solve their strength studies."
[ "$opened" = true ] || stop "The built app did not open to its first screen."

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
# A draft first, with its notes (STUDIO.md, Releasing), so neither updater reads a release that lacks
# its feed. Nothing here publishes: Amy adds the Windows files, tries the download, then publishes.
printf 'Draft it with:\n\n  gh release create v%s %s --repo amywork777/studio-download --draft --title "Studio %s (text-to-cad %s)" --notes-file release/notes.md\n\n' \
  "$VERSION" "$assets" "$VERSION" "$text_to_cad"
printf 'Add the Windows files, try its download, then publish with:\n\n  gh release edit v%s --repo amywork777/studio-download --draft=false --latest\n\n' \
  "$VERSION"
