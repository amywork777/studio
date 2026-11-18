#!/usr/bin/env bash
# Law 10: the T3 Code files Studio changes or removes, against the T3 commit Studio last merged, must
# be exactly the ones in scripts/studio-t3-edits.txt. A new one fails until a person adds it on
# purpose; one Studio no longer changes fails until it comes off. So the list only shrinks unless
# someone decides otherwise, and every T3 sync conflicts on no file the list doesn't name.
#
#     scripts/studio-t3-edits.sh          # check (CI)
#     scripts/studio-t3-edits.sh --write  # rewrite the list (a T3 sync, or a leak taken out)
#
# The list's header records the T3 commit it was taken against, so the check needs nothing of
# T3's. --write takes the newest T3 commit Studio has merged, from T3_REF (default upstream/main;
# `git fetch upstream main` first).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
LIST=scripts/studio-t3-edits.txt

if [ "${1:-}" = "--write" ]; then
  base="$(git merge-base HEAD "${T3_REF:-upstream/main}")"
else
  base="$(sed -n 's/^# T3 base: \([0-9a-f]\{40\}\)$/\1/p' "$LIST")"
  if [ -z "$base" ] || ! git merge-base --is-ancestor "$base" HEAD; then
    echo "::error::$LIST names no T3 commit Studio has merged. Run scripts/studio-t3-edits.sh --write."
    exit 1
  fi
fi
edits="$(git diff --name-only --no-renames --diff-filter=MD "$base" HEAD | sort)"

if [ "${1:-}" = "--write" ]; then
  {
    echo "# T3 Code files Studio changes or removes (law 10). Checked by scripts/studio-t3-edits.sh;"
    echo "# add a line only on purpose, and take one off when its change moves into Studio's own files."
    echo "# T3 base: $base"
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
  echo "::error::Studio now changes T3 Code files the list doesn't name (law 10). Move the change into Studio's own files, or add them to $LIST on purpose. Just merged T3 Code? Run scripts/studio-t3-edits.sh --write:"
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
