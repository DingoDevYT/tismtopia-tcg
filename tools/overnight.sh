#!/usr/bin/env bash
# Overnight balance pipeline: waits for the current big run, then runs focus tests, strategy matrix and rule variants
# on every CPU thread, and writes review/sim/night/report.txt. Results are a few MB at most.
cd "$(dirname "$0")/.." || exit 1
N=$(node -e "console.log(require('os').cpus().length)")
while [ ! -s review/sim/big/decks.txt ]; do sleep 60; done
OUT=review/sim/night; rm -rf "$OUT"; mkdir -p "$OUT"
par() { # par <folder> <env...> -- <games> : run one sim per thread with different seeds
  local dir="$OUT/$1"; shift; mkdir -p "$dir"; local envs=(); while [ "$1" != "--" ]; do envs+=("$1"); shift; done; shift; local games=$1; shift
  for s in $(seq 1 "$N"); do env "${envs[@]}" node tools/sim.js "$games" $((s * 2741 + RANDOM)) "$@" > "$dir/run$s.json" & done; wait
}
for id in jimmy_arhakoth scrunge_maxos jegg_anxio jangle_drow_paladin scrunge_nexus scrunge_anna_lee lord_osric_hayden item_hidden_blade; do
  par "focus-$id" FOCUS=$id -- 1500
done
par matrix MATRIX=1 -- 60
par cards-d20 CARDS=1 -- 1000
par cards-d30 CARDS=1 DECK=30 -- 1500
par cards-hp1.0 CARDS=1 -- 1000 10 1
par cards-hp1.5 CARDS=1 -- 1000 10 1.5
node tools/simnight.js "$OUT" > "$OUT/report.txt"
echo overnight done
