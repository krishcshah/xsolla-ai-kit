# Shared helpers for description-to-shop scripts. Source, don't execute.
#
# Two things every script here must respect:
#   1. `xsolla shopbuilder` returns exit code 0 even on HTTP 500. Never trust $?.
#      Classify on output, and verify structural writes against get-structure.
#   2. An invalid XSOLLA_API_KEY in the environment silently overrides a valid
#      `xsolla auth login` session. Shop Builder calls must run without it.

set -uo pipefail

: "${XSOLLA_MERCHANT_ID:?set XSOLLA_MERCHANT_ID}"
: "${XSOLLA_PROJECT_ID:?set XSOLLA_PROJECT_ID}"

IDS="--merchant-id ${XSOLLA_MERCHANT_ID} --project-id ${XSOLLA_PROJECT_ID}"

# Shop Builder uses the login session. Strip XSOLLA_API_KEY so it can't shadow it.
sb() { env -u XSOLLA_API_KEY xsolla shopbuilder "$@"; }

die() { echo "error: $*" >&2; exit 1; }

# sb_ok <cmd...> — run a shopbuilder command, fail loudly on an error in the output
sb_ok() {
  local out; out=$(sb "$@" 2>&1)
  if grep -qi "^Error" <<<"$out"; then
    echo "$out" >&2
    die "shopbuilder $1 failed"
  fi
  printf '%s' "$out"
}

# structure <slug> — full landing JSON on stdout.
#
# get-structure is throttled: roughly half a dozen rapid calls in a row start
# returning empty. Callers should fetch ONCE and work from the cached JSON
# rather than re-reading per item. This retries with backoff for the cases
# where that is not possible.
structure() {
  local out i
  for i in 1 2 3 4 5; do
    out=$(sb get-structure $IDS --slug "$1" --json 2>/dev/null)
    if [ "${out:0:1}" = "{" ]; then
      printf '%s' "$out"; return 0
    fi
    sleep "$i"
  done
  return 1
}

# landing_id <slug>
landing_id() { structure "$1" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["_id"])'; }

# page_id <slug> <path> — page _id for a URL path
page_id() {
  structure "$1" | python3 -c '
import json,sys
want=sys.argv[1]
for p in json.load(sys.stdin)["data"].get("pages",[]):
    if p.get("path")==want: print(p["_id"]); break
else: sys.exit("no page with path "+want)' "$2"
}

# block_count <slug> — total blocks across all pages, for verifying adds
block_count() {
  structure "$1" | python3 -c '
import json,sys
d=json.load(sys.stdin)["data"]
print(sum(len(p.get("blocks",[])) for p in d.get("pages",[])))'
}

# require_auth — refuse to run against an expired session
require_auth() {
  local s; s=$(env -u XSOLLA_API_KEY xsolla auth status 2>&1)
  grep -qi "expired" <<<"$s" && die "auth token expired — run 'xsolla auth login'"
  grep -qi "logged in" <<<"$s" || die "not logged in — run 'xsolla auth login'"
}
