#!/usr/bin/env bash
set -euo pipefail

# Compare two benchmark result JSON files and alert on >10% regression.
# Usage: ./scripts/check-regression.sh <baseline.json> <current.json>

if [ $# -ne 2 ]; then
  echo "Usage: $0 <baseline.json> <current.json>"
  exit 1
fi

BASELINE="$1"
CURRENT="$2"
THRESHOLD=10
FAILED=0

echo "Comparing benchmarks (threshold: ${THRESHOLD}% regression)"
echo "  Baseline: ${BASELINE}"
echo "  Current:  ${CURRENT}"
echo ""

for metric in parse bundle render; do
  base_val=$(jq -r ".${metric} // 0" "$BASELINE")
  curr_val=$(jq -r ".${metric} // 0" "$CURRENT")

  if [ "$base_val" = "0" ] || [ "$base_val" = "null" ]; then
    echo "  ${metric}: no baseline — skipping"
    continue
  fi

  pct_change=$(echo "scale=2; (($curr_val - $base_val) / $base_val) * 100" | bc)
  echo "  ${metric}: ${base_val}ms -> ${curr_val}ms (${pct_change}%)"

  regression=$(echo "$pct_change > $THRESHOLD" | bc -l)
  if [ "$regression" = "1" ]; then
    echo "  ⚠ REGRESSION: ${metric} regressed by ${pct_change}% (threshold: ${THRESHOLD}%)"
    FAILED=1
  fi
done

echo ""
if [ "$FAILED" = "1" ]; then
  echo "FAIL: Performance regression detected"
  exit 1
else
  echo "PASS: No significant regressions"
fi
