#!/usr/bin/env bash
# Make a page's blocks match an exact sequence.
#
# add-page always seeds the same 13-block default template (header,
# leadGameSales, description, packs x3, bento-grid x3, gallery, requirements,
# faq, footer). There is no way to create an empty page, so shaping means
# clearing the seed and appending the blocks you actually want, in order.
# Clearing then appending avoids move-block index arithmetic entirely.
#
# get-structure is throttled — a handful of rapid calls start returning empty.
# So this reads the structure exactly twice: once to plan, once to verify.
# Never add a per-block read back into this loop.
#
# Usage: ./shape-page.sh <slug> <page-path> <block>...
# Prints: index<TAB>module<TAB>block_id  for the final page, so the caller can
#         bind store sections without another read.
source "$(dirname "$0")/lib.sh"

SLUG="${1:?usage: shape-page.sh <slug> <page-path> <block>...}"; shift
PPATH="${1:?missing page path}"; shift
[ "$#" -gt 0 ] || die "no blocks given"
WANT=("$@")
require_auth

RAW=$(structure "$SLUG") || die "could not read structure for '$SLUG'"
read -r LID PID <<<"$(printf '%s' "$RAW" | python3 -c '
import json,sys
want=sys.argv[1]
d=json.load(sys.stdin)["data"]
for p in d.get("pages",[]):
    if p.get("path")==want:
        print(d["_id"], p["_id"]); break
else: sys.exit("no page with path "+want)' "$PPATH")" || exit 1

mapfile -t SEEDED < <(printf '%s' "$RAW" | python3 -c '
import json,sys
pid=sys.argv[1]
for p in json.load(sys.stdin)["data"].get("pages",[]):
    if p["_id"]==pid:
        for b in p.get("blocks",[]): print(b["_id"])
        break' "$PID")

echo "shaping $SLUG$PPATH -> ${WANT[*]}"

for bid in "${SEEDED[@]}"; do
  sb delete-block $IDS --landing-id "$LID" --page-id "$PID" --blockid "$bid" --force >/dev/null 2>&1
  sleep "${SB_PACE:-1}"
done
echo "  - cleared ${#SEEDED[@]} seeded block(s)"

# --index is mandatory here. add-block's help says a block is "appended to the
# end when omitted"; in practice it PREPENDS, so omitting the flag builds the
# page backwards. Passing an explicit index places blocks correctly.
#
# Writes are throttled too: a rapid unpaced burst silently drops every add and
# leaves the page empty. SB_PACE seconds between calls, and one repair pass.
add_all() {
  local i=0 b
  for b in "${WANT[@]}"; do
    sb add-block $IDS --landing-id "$LID" --page-id "$PID" --block "$b" --index "$i" >/dev/null 2>&1
    sleep "${SB_PACE:-1}"
    i=$((i+1))
  done
}

current_modules() {
  structure "$SLUG" | python3 -c '
import json,sys
pid=sys.argv[1]
for p in json.load(sys.stdin)["data"].get("pages",[]):
    if p["_id"]==pid:
        print(" ".join(b.get("module") for b in p.get("blocks",[]))); break' "$PID"
}

add_all
sleep 3
if [ "$(current_modules)" != "${WANT[*]}" ]; then
  echo "  ~ first pass incomplete (throttling) — clearing and retrying slower" >&2
  mapfile -t LEFT < <(structure "$SLUG" | python3 -c '
import json,sys
pid=sys.argv[1]
for p in json.load(sys.stdin)["data"].get("pages",[]):
    if p["_id"]==pid:
        for b in p.get("blocks",[]): print(b["_id"])
        break' "$PID")
  for bid in "${LEFT[@]}"; do
    sb delete-block $IDS --landing-id "$LID" --page-id "$PID" --blockid "$bid" --force >/dev/null 2>&1
    sleep 2
  done
  SB_PACE=3 add_all
fi
echo "  + requested ${#WANT[@]} block(s)"

# Single verification read. add-block exits 0 even on HTTP 500, so comparing the
# resulting module sequence to the request is the only trustworthy check.
sleep 2
FINAL=$(structure "$SLUG") || die "could not re-read structure to verify"
printf '%s' "$FINAL" | python3 -c '
import json,sys
pid, want = sys.argv[1], sys.argv[2:]
for p in json.load(sys.stdin)["data"].get("pages",[]):
    if p["_id"]==pid:
        got=[b.get("module") for b in p.get("blocks",[])]
        if got != want:
            sys.exit("verification failed\n  wanted: %s\n  got:    %s\n"
                     "  a missing block is an invalid template name — see references/cli-commands.md"
                     % (" ".join(want), " ".join(got) or "(empty)"))
        for i,b in enumerate(p.get("blocks",[])):
            print("%d\t%s\t%s" % (i, b.get("module"), b["_id"]))
        break
else: sys.exit("page vanished during shaping")' "$PID" "${WANT[@]}" || exit 1
echo "  = verified" >&2
