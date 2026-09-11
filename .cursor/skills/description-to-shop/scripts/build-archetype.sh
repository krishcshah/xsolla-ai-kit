#!/usr/bin/env bash
# Build one of the three shop archetypes end to end.
#
#   mobile        single-page top-up shop        (mobile free-to-play)
#   pc-portal     multi-page store portal        (PC premium / editions)
#   live-service  bundle-led single-page shop    (seasonal live-service)
#
# The archetype fixes the page and block skeleton. Catalog groups are passed in,
# because a store block binds to a *group* — so the caller's catalog decides what
# each store section shows. Nothing here creates catalog entities.
#
# get-structure is throttled, so this paces itself between pages. A build takes
# a minute or two; that is the API's pace, not wasted time.
#
# Usage: ./build-archetype.sh <mobile|pc-portal|live-service> <slug> <name> [group=type:layout ...]
#   defaults if no groups given:
#     mobile        currency-packs=virtual_currency_package:vertical
#     pc-portal     editions=virtual_item:large  cosmetics=virtual_item:vertical
#     live-service  featured-bundles=bundle:featured  currency-packs=virtual_currency_package:horizontal
source "$(dirname "$0")/lib.sh"
HERE="$(cd "$(dirname "$0")" && pwd)"

ARCH="${1:?usage: build-archetype.sh <mobile|pc-portal|live-service> <slug> <name> [group=type:layout ...]}"
SLUG="${2:?missing slug}"
NAME="${3:?missing display name}"
shift 3 || true
BINDINGS=("$@")

case "$ARCH" in
  mobile)       [ ${#BINDINGS[@]} -gt 0 ] || BINDINGS=(currency-packs=virtual_currency_package:vertical) ;;
  pc-portal)    [ ${#BINDINGS[@]} -gt 0 ] || BINDINGS=(editions=virtual_item:large cosmetics=virtual_item:vertical) ;;
  live-service) [ ${#BINDINGS[@]} -gt 0 ] || BINDINGS=(featured-bundles=bundle:featured currency-packs=virtual_currency_package:horizontal) ;;
  *) die "unknown archetype '$ARCH' (mobile | pc-portal | live-service)" ;;
esac
require_auth

echo "== $ARCH -> $SLUG =="
"$HERE/create-landing.sh" "$SLUG" "$NAME" store >/dev/null || die "could not create landing"
echo "  + landing created (type store)"

add_page() { sb add-page $IDS --slug "$SLUG" --name "$1" --path "$2" >/dev/null 2>&1; sleep 2; }

declare -a STORE_BLOCKS=()
# Must be process substitution, not a pipe: a piped `while` runs in a subshell
# and the array would be discarded when it exits.
shape() {
  local out; out=$("$HERE/shape-page.sh" "$@") || die "shaping failed"
  while IFS=$'\t' read -r _ mod bid; do
    [ "$mod" = newStore ] && STORE_BLOCKS+=("$bid")
  done < <(printf '%s\n' "$out")
}

case "$ARCH" in
  mobile)
    add_page Main /
    shape "$SLUG" / header leadGameSales newStore faq footer
    ;;
  pc-portal)
    add_page Home /
    shape "$SLUG" / header leadGameSales description gallery footer
    sleep 3
    add_page Store /store
    shape "$SLUG" /store header newStore newStore footer
    sleep 3
    add_page Support /support
    shape "$SLUG" /support header faq requirements footer
    ;;
  live-service)
    add_page Main /
    shape "$SLUG" / header leadGameSales newStore newStore faq footer
    ;;
esac

echo "  + pages shaped (${#STORE_BLOCKS[@]} store block(s))"

n=0
for bid in "${STORE_BLOCKS[@]}"; do
  spec="${BINDINGS[$n]:-}"
  if [ -z "$spec" ]; then echo "  ! store block $bid left unbound (no binding given)"; n=$((n+1)); continue; fi
  group="${spec%%=*}"; rest="${spec#*=}"; itype="${rest%%:*}"; layout="${rest#*:}"
  [ "$layout" = "$rest" ] && layout=featured
  sleep 2
  "$HERE/bind-store-section.sh" "$SLUG" "$bid" "$group" "$itype" "$layout" || die "binding failed"
  n=$((n+1))
done

echo
echo "built: $SLUG"
"$HERE/preview.sh" "$SLUG" || echo "  (preview unavailable — see message above; the shop itself is built)"
