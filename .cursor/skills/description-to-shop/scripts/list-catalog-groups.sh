#!/usr/bin/env bash
# List the catalog's item groups, with what each one actually contains.
#
# Intake needs this. A store block binds to a group's external_id, so the
# groups ARE the storefront's sections — you cannot plan a shop without
# knowing them, and a user's description names items, not groups.
#
# Two CLI quirks handled here:
#  - `list-item-groups` takes no --merchant-id / --project-id; it resolves from
#    config, so this exports the config values first.
#  - Human output shows only the group NAME. The block binds by external_id,
#    which appears only under --json.
#
# Needs XSOLLA_API_KEY (catalog uses Basic auth, unlike Shop Builder).
#
# Usage: ./list-catalog-groups.sh
set -uo pipefail
: "${XSOLLA_MERCHANT_ID:?set XSOLLA_MERCHANT_ID}"
: "${XSOLLA_PROJECT_ID:?set XSOLLA_PROJECT_ID}"
: "${XSOLLA_API_KEY:?set XSOLLA_API_KEY (catalog uses Basic auth)}"

xsolla config set merchant-id "$XSOLLA_MERCHANT_ID" >/dev/null 2>&1
xsolla config set project-id  "$XSOLLA_PROJECT_ID"  >/dev/null 2>&1

groups=$(xsolla catalog list-item-groups --json 2>&1)
[ "${groups:0:1}" = "{" ] || { echo "$groups" >&2; exit 1; }

# Counts per type, so intake can propose a sensible item type per group.
items=$(xsolla catalog list-items    --json 2>/dev/null)
bundles=$(xsolla catalog list-bundles --json 2>/dev/null)

python3 - <<PY
import json
g=json.loads('''$groups''')["data"]["groups"]
def load(s):
    try: return json.loads(s)["data"].get("items",[])
    except Exception: return []
items=load('''${items:-}'''); bundles=load('''${bundles:-}''')
def by_group(rows):
    m={}
    for r in rows:
        for grp in (r.get("groups") or []):
            m.setdefault(grp.get("external_id"),[]).append(r.get("sku"))
    return m
gi, gb = by_group(items), by_group(bundles)
print("%-20s %-22s %-18s %s" % ("external_id","name","suggested type","contents"))
print("-"*92)
for x in g:
    e=x.get("external_id"); n=x.get("name")
    ni, nb = gi.get(e,[]), gb.get(e,[])
    t = "bundle" if nb and not ni else "virtual_good" if ni else "(empty)"
    what = ", ".join((ni+nb)[:4]) + ("..." if len(ni+nb)>4 else "")
    print("%-20s %-22s %-18s %s" % (e, n, t, what or "-"))
print()
print("Note: currency packages bind as type 'virtual_currency' with group '__all__',")
print("not through a group id. Check 'xsolla catalog admin-list-currency-packages'.")
PY
