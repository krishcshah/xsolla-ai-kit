#!/usr/bin/env bash
# Point a newStore block's section at a catalog group.
#
# There is no CLI command for this. A store block binds to an item *group* and
# *type* — never to item IDs — through components[].section.item, patched with
# update-block. Patch paths use Immer segment-array format.
#
# Usage: ./bind-store-section.sh <slug> <block-id> <group> <item-type> [layout]
#        item-type: bundle | virtual_item | virtual_currency_package | game_key
#        layout:    featured | vertical | horizontal | large | bundle_vertical | game-keys-vertical
source "$(dirname "$0")/lib.sh"

SLUG="${1:?usage: bind-store-section.sh <slug> <block-id> <group> <item-type> [layout]}"
BLOCK="${2:?missing block id}"
GROUP="${3:?missing catalog group}"
ITYPE="${4:?missing item type}"
LAYOUT="${5:-featured}"
require_auth

LID=$(landing_id "$SLUG"); [ -n "$LID" ] || die "no landing '$SLUG'"

DATA=$(python3 - "$BLOCK" "$GROUP" "$ITYPE" "$LAYOUT" <<'PY'
import json,sys
block,group,itype,layout = sys.argv[1:5]
print(json.dumps({"r1":{"type":"block","id":block,"patches":[
  {"op":"replace","path":["components",0,"section","item"],
   "value":{"autoSelected":False,"group":group,"type":itype}},
  {"op":"replace","path":["components",0,"card","selectedLayoutType"],"value":layout},
]}}))
PY
)

sb_ok update-block $IDS --landing-id "$LID" --data "$DATA" >/dev/null
echo "  + block $BLOCK -> group '$GROUP' ($ITYPE, $LAYOUT layout)"

# Confirm it stuck — update-block reports no body.
got=$(structure "$SLUG" | python3 -c '
import json,sys
bid=sys.argv[1]
d=json.load(sys.stdin)["data"]
for p in d.get("pages",[]):
    for b in p.get("blocks",[]):
        if b.get("_id")==bid:
            c=(b.get("components") or [{}])[0]
            print((c.get("section",{}).get("item",{}) or {}).get("group",""))
' "$BLOCK")
[ "$got" = "$GROUP" ] || die "patch did not stick (block reports group '$got')"
echo "  + verified"
