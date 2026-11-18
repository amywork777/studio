#!/usr/bin/env bash
# Moves Studio's text-to-cad pin to the head of `studio-base`, so a change merged on the fork reaches
# Studio without a review of its own (STUDIO.md, Releasing). It keeps one review, `pin/studio-base`,
# that only moves the pin, and merges it once every check on it has passed. A failed check leaves it
# open for a person. Jake's releases still come through `scripts/studio-bump-text-to-cad.sh`.
#
#     STUDIO_BUMP_TOKEN=<token> scripts/studio-pin-studio-base.sh
#
# The bump's token, since the default token's reviews start no CI. With none this says so and stops.
set -euo pipefail

FORK_REPO="${FORK_REPO:-amywork777/text-to-cad-upstream}"
STUDIO_REPO="${STUDIO_REPO:-amywork777/studio}"
GIT_HOST="${GIT_HOST:-https://github.com}"
BASE=studio-base
REVIEW=pin/studio-base

if [ -z "${STUDIO_BUMP_TOKEN:-}" ]; then
  echo "::notice::STUDIO_BUMP_TOKEN is not set, so the pin was not moved (STUDIO.md, Releasing)."
  exit 0
fi
export GH_TOKEN="$STUDIO_BUMP_TOKEN" GIT_TERMINAL_PROMPT=0
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0="http.$GIT_HOST/.extraheader"
GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\n')"
export GIT_CONFIG_VALUE_0
export GIT_AUTHOR_NAME="github-actions[bot]" GIT_AUTHOR_EMAIL="41898282+github-actions[bot]@users.noreply.github.com"
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"

work="$(mktemp -d "${TMPDIR:-/tmp}/studio-pin.XXXXXX")"
trap 'rm -rf "$work"' EXIT
git clone --quiet --bare --filter=blob:none "$GIT_HOST/$STUDIO_REPO.git" "$work/studio"
studio() { git -C "$work/studio" "$@"; }

pin="$(studio rev-parse main:text-to-cad)"
head="$(gh api "repos/$FORK_REPO/branches/$BASE" --jq .commit.sha)"
number="$(gh pr list --repo "$STUDIO_REPO" --head "$REVIEW" --state open --json number --jq '.[0].number // empty')"

if [ "$pin" = "$head" ]; then
  echo "::notice::Studio's pin is $BASE's head, ${head:0:12}."
  [ -z "$number" ] || gh pr close "$number" --repo "$STUDIO_REPO" --delete-branch --comment "main already has ${head:0:12}."
  exit 0
fi
# Only ever forward: a pin that is not under the head means someone moved it by hand.
status="$(gh api "repos/$FORK_REPO/compare/$pin...$head" --jq .status)"
if [ "$status" != "ahead" ]; then
  echo "::error::$BASE (${head:0:12}) is $status of Studio's pin (${pin:0:12}), so the pin was not moved."
  exit 1
fi

# The review's commit: main with only the pin moved. Remade when the head moved or main conflicts.
tip="$(studio rev-parse --verify --quiet "refs/heads/$REVIEW" || true)"
mergeable=""
[ -z "$number" ] || mergeable="$(gh pr view "$number" --repo "$STUDIO_REPO" --json mergeable --jq .mergeable)"
if [ -z "$tip" ] || [ "$(studio rev-parse "$tip:text-to-cad")" != "$head" ] || [ "$mergeable" = "CONFLICTING" ]; then
  index="$work/index"
  GIT_INDEX_FILE="$index" studio read-tree main
  GIT_INDEX_FILE="$index" studio update-index --cacheinfo "160000,$head,text-to-cad"
  tree="$(GIT_INDEX_FILE="$index" studio write-tree)"
  tip="$(studio commit-tree "$tree" -p "$(studio rev-parse main)" -m "Move text-to-cad to $BASE ${head:0:12}")"
  studio push --quiet --force origin "$tip:refs/heads/$REVIEW"
fi

notes="$work/review.md"
{
  printf 'Moves the text-to-cad pin from `%s` to `%s`, the head of `%s` on the fork. Nothing else changes.\n\n' "${pin:0:12}" "${head:0:12}" "$BASE"
  printf '## Merged on the fork since the last pin\n\n'
  gh api "repos/$FORK_REPO/compare/$pin...$head" --jq '.commits[] | select(.parents | length > 1) | .commit.message | split("\n") | .[0]' |
    sed -E "s#^Merge pull request \#([0-9]+) .*#- $FORK_REPO\#\1#" | sort -u
  printf '\n`scripts/studio-pin-studio-base.sh` merges this once every check passes; a failed one leaves it for a person.\n'
} >"$notes"
title="Move text-to-cad to $BASE ${head:0:12}"
if [ -z "$number" ]; then
  gh pr create --repo "$STUDIO_REPO" --base main --head "$REVIEW" --title "$title" --body-file "$notes"
  echo "::notice::Opened: $title. A later run merges it once its checks pass."
  exit 0
fi
gh pr edit "$number" --repo "$STUDIO_REPO" --title "$title" --body-file "$notes" >/dev/null

# Merged only when every check on this exact commit has finished and passed.
states="$(gh pr view "$number" --repo "$STUDIO_REPO" --json headRefOid,statusCheckRollup --jq "
  if .headRefOid != \"$tip\" then \"STALE\" else
  [.statusCheckRollup[] | if (.conclusion // \"\") != \"\" then .conclusion elif (.state // \"\") != \"\" then .state else \"PENDING\" end]
  | unique | join(\",\") end")"
if [ -z "$states" ] || printf '%s' "$states" | grep -q -E 'STALE|PENDING|EXPECTED|QUEUED|IN_PROGRESS|WAITING'; then
  echo "::notice::#$number is waiting on its checks (${states:-none yet})."
elif printf '%s' "$states" | tr ',' '\n' | grep -q -v -x -E 'SUCCESS|SKIPPED|NEUTRAL'; then
  echo "::warning::#$number has a failed check ($states), so it stays open for a person."
else
  gh pr merge "$number" --repo "$STUDIO_REPO" --squash --delete-branch --match-head-commit "$tip"
  echo "::notice::Merged #$number: $title."
fi
