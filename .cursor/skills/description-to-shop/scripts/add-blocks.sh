#!/usr/bin/env bash
# Append blocks to a page, verifying each one actually landed.
#
# add-block returns exit code 0 even on HTTP 500, and an invalid block name
# gives a bare 500 with no list of valid names. The only reliable check is to
# diff the block count against get-structure, which is what this does.
#
# Usage: ./add-blocks.sh <slug> <page-path> <block> [block...]
source "$(dirname "$0")/lib.sh"

SLUG="${1:?usage: add-blocks.sh <slug> <page-path> <block>...}"; shift
PATH_="${1:?missing page path}"; shift
[ "$#" -gt 0 ] || die "no blocks given"
require_auth

LID=$(landing_id "$SLUG"); [ -n "$LID" ] || die "no landing '$SLUG'"
PID=$(page_id "$SLUG" "$PATH_") || exit 1

fail=0
for b in "$@"; do
  before=$(block_count "$SLUG")
  sb add-block $IDS --landing-id "$LID" --page-id "$PID" --block "$b" >/dev/null 2>&1
  after=$(block_count "$SLUG")
  if [ "$after" -gt "$before" ]; then
    echo "  + $b"
  else
    echo "  x $b  (rejected — not a valid block template)"; fail=$((fail+1))
  fi
done
[ "$fail" -eq 0 ] || die "$fail block(s) rejected; see references/cli-commands.md for the valid list"
