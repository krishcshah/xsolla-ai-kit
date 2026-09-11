#!/usr/bin/env bash
# Seed a test catalog for description-to-shop eval runs.
#
# NOT part of the skill's build flow. The skill never creates catalog entities
# (scope decision, SB-8786) — it reads a catalog and wires it into a storefront.
# This exists so eval runs have something realistic to wire.
#
# Groups are the important part: a newStore block binds to a group, so these
# five groups are what the three archetypes bind their store sections to.
#
# Usage:  XSOLLA_MERCHANT_ID=... XSOLLA_PROJECT_ID=... XSOLLA_API_KEY=... ./seed-test-catalog.sh
set -uo pipefail

: "${XSOLLA_MERCHANT_ID:?set XSOLLA_MERCHANT_ID}"
: "${XSOLLA_PROJECT_ID:?set XSOLLA_PROJECT_ID}"
: "${XSOLLA_API_KEY:?set XSOLLA_API_KEY (catalog uses Basic auth, not the login session)}"

X="xsolla catalog"
IDS="--merchant-id ${XSOLLA_MERCHANT_ID} --project-id ${XSOLLA_PROJECT_ID}"
ok=0; fail=0

run() { # run <label> <cmd...> — classifies by output, not exit code
  local label="$1"; shift
  local out rc
  out=$("$@" 2>&1); rc=$?
  if grep -qiE "already exist|exist\." <<<"$out"; then
    echo "  = $label (already present)"; ok=$((ok+1))
  elif [ "$rc" -ne 0 ] || grep -qi "^Error" <<<"$out"; then
    echo "  x $label -- $(head -1 <<<"$out")"; fail=$((fail+1))
  else
    echo "  + $label"; ok=$((ok+1))
  fi
}

echo "== groups =="
run "group: currency-packs"   $X admin-create-group $IDS --external-id currency-packs   --name '{"en-US":"Shard Packs"}'     --order 1 --is-enabled
run "group: cosmetics"        $X admin-create-group $IDS --external-id cosmetics        --name '{"en-US":"Cosmetics"}'       --order 2 --is-enabled
run "group: welcome-offer"    $X admin-create-group $IDS --external-id welcome-offer    --name '{"en-US":"Welcome Offer"}'   --order 3 --is-enabled
run "group: featured-bundles" $X admin-create-group $IDS --external-id featured-bundles --name '{"en-US":"Featured Bundles"}' --order 4 --is-enabled
run "group: editions"         $X admin-create-group $IDS --external-id editions         --name '{"en-US":"Game Editions"}'   --order 5 --is-enabled

echo "== virtual currency =="
run "currency: shards" $X admin-create-currency $IDS --sku shards --name '{"en-US":"Shards"}' --description '{"en-US":"Shards"}' --is-enabled

echo "== currency packages (mobile top-up archetype) =="
run "pack: shards-100"  $X admin-create-currency-package $IDS --sku shards-100  --name '{"en-US":"100 Shards"}' --description '{"en-US":"100 Shards"}'  --content '[{"sku":"shards","quantity":100}]'  --prices '[{"amount":0.99,"currency":"USD","is_default":true,"is_enabled":true}]'  --groups '["currency-packs"]' --is-enabled --is-show-in-store
run "pack: shards-550"  $X admin-create-currency-package $IDS --sku shards-550  --name '{"en-US":"550 Shards"}' --description '{"en-US":"550 Shards"}'  --content '[{"sku":"shards","quantity":550}]'  --prices '[{"amount":4.99,"currency":"USD","is_default":true,"is_enabled":true}]'  --groups '["currency-packs"]' --is-enabled --is-show-in-store
run "pack: shards-1200" $X admin-create-currency-package $IDS --sku shards-1200 --name '{"en-US":"1200 Shards"}' --description '{"en-US":"1200 Shards"}' --content '[{"sku":"shards","quantity":1200}]' --prices '[{"amount":9.99,"currency":"USD","is_default":true,"is_enabled":true}]' --groups '["currency-packs"]' --is-enabled --is-show-in-store

echo "== cosmetics, priced in virtual currency =="
run "item: skin-ember"  $X create-items $IDS --sku skin-ember  --name '{"en-US":"Ember Skin"}' --description '{"en-US":"Ember Skin"}'  --vc-prices '[{"amount":450,"sku":"shards","is_default":true,"is_enabled":true}]' --groups '["cosmetics"]' --is-enabled --is-show-in-store
run "item: skin-frost"  $X create-items $IDS --sku skin-frost  --name '{"en-US":"Frostline Skin"}' --description '{"en-US":"Frostline Skin"}' --vc-prices '[{"amount":450,"sku":"shards","is_default":true,"is_enabled":true}]' --groups '["cosmetics"]' --is-enabled --is-show-in-store
run "item: emote-wave"  $X create-items $IDS --sku emote-wave  --name '{"en-US":"Wave Emote"}' --description '{"en-US":"Wave Emote"}'  --vc-prices '[{"amount":150,"sku":"shards","is_default":true,"is_enabled":true}]' --groups '["cosmetics"]' --is-enabled --is-show-in-store

echo "== game editions, real money (PC portal archetype) =="
run "item: edition-base"    $X create-items $IDS --sku edition-base    --name '{"en-US":"Voidwall"}' --description '{"en-US":"Voidwall"}'                --prices '[{"amount":29.99,"currency":"USD","is_default":true,"is_enabled":true}]' --groups '["editions"]' --is-enabled --is-show-in-store
run "item: edition-deluxe"  $X create-items $IDS --sku edition-deluxe  --name '{"en-US":"Voidwall Deluxe Edition"}' --description '{"en-US":"Voidwall Deluxe Edition"}' --prices '[{"amount":49.99,"currency":"USD","is_default":true,"is_enabled":true}]' --groups '["editions"]' --is-enabled --is-show-in-store

echo "== bundles (live-service archetype) =="
run "bundle: welcome-pack" $X admin-create-bundles $IDS --sku welcome-pack --name '{"en-US":"Welcome Pack"}' --description '{"en-US":"Welcome Pack"}' --content '[{"sku":"shards-550","quantity":1},{"sku":"skin-ember","quantity":1}]' --prices '[{"amount":6.99,"currency":"USD","is_default":true,"is_enabled":true}]'  --groups '["welcome-offer"]' --is-enabled
run "bundle: frostline"    $X admin-create-bundles $IDS --sku frostline    --name '{"en-US":"Frostline Bundle"}' --description '{"en-US":"Frostline Bundle"}' --content '[{"sku":"skin-frost","quantity":1},{"sku":"emote-wave","quantity":1},{"sku":"shards-1200","quantity":1}]' --prices '[{"amount":19.99,"currency":"USD","is_default":true,"is_enabled":true}]' --groups '["featured-bundles"]' --is-enabled
run "bundle: starter"      $X admin-create-bundles $IDS --sku starter      --name '{"en-US":"Starter Bundle"}' --description '{"en-US":"Starter Bundle"}' --content '[{"sku":"shards-100","quantity":1},{"sku":"emote-wave","quantity":1}]' --prices '[{"amount":2.99,"currency":"USD","is_default":true,"is_enabled":true}]' --groups '["featured-bundles"]' --is-enabled

echo
echo "seeded: $ok ok, $fail failed"
[ "$fail" -eq 0 ]
