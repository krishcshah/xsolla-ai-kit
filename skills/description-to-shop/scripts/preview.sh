#!/usr/bin/env bash
# Report how to get a preview link for a landing.
#
# IMPORTANT: the CLI cannot mint a preview token. `enable-preview` and
# `preview-link` return 403 on a normal publisher login, and `verify-website`
# returns 400. That is not an agreements problem — previews work fine with
# unsigned licensing agreements. The editor's own Preview button mints a
# short-lived, per-landing, browser-session-scoped token that the CLI has no
# equivalent for.
#
# So the honest end of an automated build is: the shop is built and verified,
# and a human clicks Preview in the editor to look at it. This script prints
# that link and reports the structure so the result is checkable without a
# browser.
#
# There is no publish command anywhere in the CLI — publishing is a human step
# in Publisher Account (SB-8786 safety rule 4).
#
# Usage: ./preview.sh <slug>
source "$(dirname "$0")/lib.sh"
SLUG="${1:?usage: preview.sh <slug>}"
require_auth

out=$(sb preview-link --slug "$SLUG" 2>&1)
if ! grep -qi "^Error" <<<"$out"; then
  printf '%s\n' "$out"
  echo
  echo "Preview only. To publish, a human opens Publisher Account -> Shop Builder."
  exit 0
fi

TMP=$(mktemp -t sbstruct.XXXXXX); trap 'rm -f "$TMP"' EXIT
structure "$SLUG" > "$TMP" || die "could not read structure for '$SLUG'"

cat <<MSG
Built: $SLUG

The CLI cannot generate a preview token (preview-link returned 403; this is
expected on a publisher login and is not about licensing agreements).

To view it, open the editor and click Preview:
  https://publisher.xsolla.com/${XSOLLA_MERCHANT_ID}/projects/${XSOLLA_PROJECT_ID}/site-builder/${SLUG}/editor

The preview then lives at https://preview.xsollasitebuilder.com/${SLUG}
until that browser session's token expires.

Note the editor canvas sometimes shows "No items found" for a store section
while the live preview renders it correctly. Trust the preview, not the canvas.

Structure as built:
MSG
python3 - "$TMP" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))["data"]
for p in d.get("pages",[]):
    parts=[]
    for b in p.get("blocks",[]):
        m=b.get("module")
        if m=="newStore":
            secs=[]
            for c in (b.get("components") or []):
                it=(c.get("section") or {}).get("item") or {}
                secs.append("%s/%s" % (it.get("group"), it.get("type")))
            m="newStore[%s]" % ",".join(secs)
        parts.append(m)
    print("  %-10s %s" % (p.get("path"), " -> ".join(parts)))
PY
echo
echo "Nothing was published."
