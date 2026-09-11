#!/usr/bin/env bash
# Create a landing and finalise its type. SB-8786.
#
# Always two calls: create-website only accepts --type topup, and can leave
# type:null, which leaves the landing unconfigured and 404s the preview.
# set-landing-type immediately after is what finalises it.
#
# Usage: ./create-landing.sh <slug> <name> <topup|store|sellingpage> [theme-json]
source "$(dirname "$0")/lib.sh"

SLUG="${1:?usage: create-landing.sh <slug> <name> <type> [theme-json]}"
NAME="${2:?missing name}"
TYPE="${3:?missing type: topup|store|sellingpage}"
THEME="${4:-}"
case "$TYPE" in topup|store|sellingpage) ;; *) die "type must be topup, store or sellingpage" ;; esac
require_auth

if [ -n "$(structure "$SLUG" | python3 -c 'import json,sys
try: print(json.load(sys.stdin)["data"]["_id"])
except Exception: pass' 2>/dev/null)" ]; then
  die "landing '$SLUG' already exists — back it up and pick another slug"
fi

echo "creating landing '$SLUG' ($TYPE)"
if [ -n "$THEME" ]; then
  sb_ok create-website $IDS --slug "$SLUG" --name "$NAME" --type topup --theme "$THEME" >/dev/null
else
  sb_ok create-website $IDS --slug "$SLUG" --name "$NAME" --type topup >/dev/null
fi
echo "  + created"

sb_ok set-landing-type $IDS --slug "$SLUG" --type "$TYPE" >/dev/null
echo "  + type set to $TYPE"

LID=$(landing_id "$SLUG")
[ -n "$LID" ] || die "landing created but structure unreadable"
echo "$LID"
