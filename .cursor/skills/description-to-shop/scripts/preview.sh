#!/usr/bin/env bash
# Enable public preview and print the link. The end of every build.
#
# This is the deliverable. There is no publish command in the CLI — publishing
# is done by a human in Publisher Account, by design (SB-8786 safety rule 4).
#
# Preview requires the merchant's licensing agreements to be signed. Until they
# are, enable-preview and preview-link both return 403 and verify-website 400.
# Signing them is a legal action a human takes in Publisher Account.
#
# Usage: ./preview.sh <slug>
source "$(dirname "$0")/lib.sh"
SLUG="${1:?usage: preview.sh <slug>}"
require_auth

unsigned=$(sb list-agreements --merchant-id "$XSOLLA_MERCHANT_ID" --json 2>/dev/null | python3 -c '
import json,sys
try: d=json.load(sys.stdin)["data"]
except Exception: sys.exit(0)
bad=[a for a in d if a.get("status") not in ("signed","active")]
for a in bad: print("%s (%s)" % (a.get("agreement_type"), a.get("status")))')

if [ -n "$unsigned" ]; then
  echo "Cannot enable preview — this merchant has unsigned licensing agreements:" >&2
  sed 's/^/  - /' <<<"$unsigned" >&2
  cat >&2 <<'MSG'

Sign them in Publisher Account -> Company -> Agreements. That is a legal
acceptance, so it has to be done by a person; no script should do it.

The shop itself is built and can be inspected with:
  xsolla shopbuilder get-structure --slug <slug> --json
MSG
  exit 2
fi

sb enable-preview --slug "$SLUG" >/dev/null 2>&1
sb preview-link --slug "$SLUG"
echo
echo "Preview only. To publish, a human opens Publisher Account -> Shop Builder."
