#!/usr/bin/env bash
# Law 14: the T3 Code files Studio changes or removes, against the T3 commit Studio last merged, must
# be exactly the ones in scripts/studio-t3-edits.txt. A new one fails until a person adds it on
# purpose; one Studio no longer changes fails until it comes off. So the list only shrinks unless
# someone decides otherwise, and every T3 sync conflicts on no file the list doesn't name.
#
#     scripts/studio-t3-edits.sh          # check (CI)
#     scripts/studio-t3-edits.sh --write  # rewrite the list (a T3 sync, or a leak taken out)
#
# T3_REF names T3 Code's main. Without it, CI fetches it (commits only) into refs/studio/t3, and a
# checkout uses its `upstream` remote's main (`git fetch upstream main` first).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
LIST=scripts/studio-t3-edits.txt
T3_REPO="${T3_REPO:-https://github.com/pingdotgg/t3code.git}"

if [ -z "${T3_REF:-}" ] && [ -n "${CI:-}" ]; then
  # A named remote: a partial clone takes --filter only from one.
  git remote add t3 "$T3_REPO" 2>/dev/null || true
  git fetch --quiet --no-tags --filter=tree:0 t3 "+main:refs/studio/t3"
  T3_REF=refs/studio/t3
fi
T3_REF="${T3_REF:-upstream/main}"
base="$(git merge-base HEAD "$T3_REF")"
edits="$(git diff --name-only --no-renames --diff-filter=MD "$base" HEAD | sort)"

if [ "${1:-}" = "--write" ]; then
  {
    echo "# T3 Code files Studio changes or removes (law 14). Checked by scripts/studio-t3-edits.sh;"
    echo "# add a line only on purpose, and take one off when its change moves into Studio's own files."
    printf '%s\n' "$edits"
  } >"$LIST"
  echo "Wrote $(printf '%s\n' "$edits" | grep -c .) files to $LIST (T3 ${base:0:12})."
  exit 0
fi

listed="$(grep -v -e '^#' -e '^$' "$LIST" | sort)"
added="$(comm -23 <(printf '%s\n' "$edits") <(printf '%s\n' "$listed") | sed '/^$/d')"
gone="$(comm -13 <(printf '%s\n' "$edits") <(printf '%s\n' "$listed") | sed '/^$/d')"
status=0
if [ -n "$added" ]; then
  echo "::error::Studio now changes T3 Code files the list doesn't name (law 14). Move the change into Studio's own files, or add them to $LIST on purpose:"
  printf '  %s\n' $added
  status=1
fi
if [ -n "$gone" ]; then
  echo "::error::Studio no longer changes these T3 Code files, so take them off $LIST:"
  printf '  %s\n' $gone
  status=1
fi
[ "$status" -ne 0 ] || echo "Studio changes the $(printf '%s\n' "$listed" | grep -c .) T3 Code files $LIST names, against T3 ${base:0:12}."
exit "$status"
