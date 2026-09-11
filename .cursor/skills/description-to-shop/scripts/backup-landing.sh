#!/usr/bin/env bash
# Export a landing's full configuration before any write. SB-8786 safety rule 1.
#
# Captures structure, localization and the asset list. Localization matters most:
# update-many-localization can silently blank strings, and this is the only way back.
#
# Usage: ./backup-landing.sh <slug> [out-dir]
#        A project with no landings is a valid state — recorded, not skipped.
source "$(dirname "$0")/lib.sh"

SLUG="${1:?usage: backup-landing.sh <slug> [out-dir]}"
OUT="${2:-./backups}/${SLUG}-$(date +%Y%m%d-%H%M%S)"
require_auth

# Confirm the landing exists before creating anything on disk.
RAW=$(structure "$SLUG")
LID=$(printf '%s' "$RAW" | python3 -c 'import json,sys
try: print(json.load(sys.stdin)["data"]["_id"])
except Exception: pass' 2>/dev/null)
[ -n "$LID" ] || die "no landing '$SLUG' in project $XSOLLA_PROJECT_ID — nothing to back up"

mkdir -p "$OUT"
echo "backing up '$SLUG' -> $OUT"
printf '%s' "$RAW" > "$OUT/structure.json"
echo "  + structure.json"

sb get-localization --slug "$SLUG" --json > "$OUT/localization.json" 2>/dev/null && echo "  + localization.json"

sb list-assets $IDS --landing-id "$LID" --json > "$OUT/assets.json" 2>/dev/null && echo "  + assets.json"

cat > "$OUT/manifest.txt" <<META
slug:        $SLUG
landing_id:  $LID
merchant:    $XSOLLA_MERCHANT_ID
project:     $XSOLLA_PROJECT_ID
taken:       $(date -u +%Y-%m-%dT%H:%M:%SZ)
cli:         $(xsolla --version 2>&1 | head -1)
META
echo "  + manifest.txt"
echo "$OUT"
