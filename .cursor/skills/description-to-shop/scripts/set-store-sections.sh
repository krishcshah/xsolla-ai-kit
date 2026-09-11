#!/usr/bin/env bash
# Set ALL sections on a newStore block, in order.
#
# Two traps this exists to avoid, both silent:
#
#  1. A fresh newStore block ships with FOUR default sections, not one. Patching
#     only components[0] leaves three stale sections rendering whatever the
#     defaults picked up. This replaces the whole array.
#
#  2. The API stores an unrecognised item type verbatim — no error, no coercion.
#     The storefront then matches nothing and renders loading skeletons forever.
#     Only these four values work; anything else is accepted and silently broken:
#
#       virtual_good      "Virtual items"    priced in real money or currency
#       virtual_currency  "Virtual currency" use group __all__ for every currency
#       bundle            "Bundles"
#       game_key          "Game keys"
#
#     Note virtual_good, NOT virtual_item. There is no virtual_currency_package.
#
# Each section is cloned from the block's existing components[0], so card layout
# defaults are preserved rather than invented.
#
# Usage: ./set-store-sections.sh <slug> <block-id> <group=type:layout> [more...]
#        group may be __all__ .  layout defaults to featured.
source "$(dirname "$0")/lib.sh"

SLUG="${1:?usage: set-store-sections.sh <slug> <block-id> <group=type:layout>...}"
BLOCK="${2:?missing block id}"; shift 2
[ "$#" -gt 0 ] || die "no sections given"
SPECS=("$@")

VALID="virtual_good virtual_currency bundle game_key"
for spec in "${SPECS[@]}"; do
  t="${spec#*=}"; t="${t%%:*}"
  grep -qw -- "$t" <<<"$VALID" || die "invalid item type '$t' — must be one of: $VALID
the API accepts bad values silently and the storefront then renders nothing"
done
require_auth

LID=$(landing_id "$SLUG"); [ -n "$LID" ] || die "no landing '$SLUG'"
TMP=$(mktemp -t sbstruct.XXXXXX); trap 'rm -f "$TMP"' EXIT
structure "$SLUG" > "$TMP" || die "could not read structure"
[ -s "$TMP" ] || die "structure read came back empty (throttled) — retry in a minute"

# python3 - reads the PROGRAM from stdin, so the JSON has to arrive by path.
DATA=$(python3 - "$TMP" "$BLOCK" "${SPECS[@]}" <<'PY'
import json,sys,copy
path, block, specs = sys.argv[1], sys.argv[2], sys.argv[3:]
d=json.load(open(path))["data"]
tpl=None
for p in d.get("pages",[]):
    for b in p.get("blocks",[]):
        if b.get("_id")==block:
            comps=b.get("components") or []
            if not comps: sys.exit("block %s has no components to use as a template" % block)
            tpl=comps[0]
if tpl is None: sys.exit("block %s not found on landing" % block)

out=[]
for spec in specs:
    group, rest = spec.split("=",1)
    itype, _, layout = rest.partition(":")
    layout = layout or "featured"
    c=copy.deepcopy(tpl)
    c.pop("_id", None)
    c.setdefault("section",{})["item"]={"autoSelected":False,"group":group,"type":itype}
    c.setdefault("card",{})["selectedLayoutType"]=layout
    c["enable"]=True
    out.append(c)

print(json.dumps({"r1":{"type":"block","id":block,
                        "patches":[{"op":"replace","path":["components"],"value":out}]}}))
PY
) || exit 1

sb_ok update-block $IDS --landing-id "$LID" --data "$DATA" >/dev/null
sleep 3

# Verify every section, not just the one we wrote — the old script checked the
# same path it had just written, which passes even when the value is nonsense.
structure "$SLUG" > "$TMP" || die "could not re-read structure to verify"
[ -s "$TMP" ] || die "verification read came back empty (throttled) — re-check manually"
python3 - "$TMP" "$BLOCK" "${SPECS[@]}" <<'PY'
import json,sys
path, block, specs = sys.argv[1], sys.argv[2], sys.argv[3:]
want=[]
for s in specs:
    g,r=s.split("=",1); t,_,l=r.partition(":")
    want.append((g,t,l or "featured"))
d=json.load(open(path))["data"]
for p in d.get("pages",[]):
    for b in p.get("blocks",[]):
        if b.get("_id")!=block: continue
        got=[]
        for c in (b.get("components") or []):
            it=(c.get("section") or {}).get("item") or {}
            got.append((it.get("group"), it.get("type"), (c.get("card") or {}).get("selectedLayoutType")))
        if got != want:
            sys.exit("verification failed\n  wanted: %s\n  got:    %s" % (want, got))
        for g,t,l in got: print("  + section %s / %s / %s" % (g,t,l))
        sys.exit(0)
sys.exit("block %s not found after write" % block)
PY
