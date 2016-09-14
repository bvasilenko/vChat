#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "${1:-.}" && pwd)"

DONOR_PATTERNS=(
  'alexy-os'
  'delta5-hq'
  'quant5-lab'
  'github\.com/alexy-os'
  'github\.com/delta5-hq'
  'github\.com/quant5-lab'
  'ui8kit'
  'buildy-ui'
  'ui\.buildy\.tw'
  'hinddy/tailwind-builder'
  'ruvnet/ruflo'
  'TauricResearch/TradingAgents'
  '/tmp/donors/'
  '@buildy/'
  '@editory/'
)

VOICE_PATTERNS=(
  'PixiJS'
  'RxDB'
  'Wireflow'
  'kien game'
  'generic graph agent'
)

tracked_text_files() {
  # Exclude the scrub test itself: it contains forbidden strings as test fixtures,
  # not as donor leaks.
  git -C "$ROOT" ls-files \
    | grep -E '\.(ts|tsx|md|json|yml|toml)$' \
    | grep -v '^tests/scrub\.test\.ts$' \
    | sed "s|^|$ROOT/|"
}

joined_pattern() {
  local IFS='|'
  echo "$*"
}

gate_check() {
  local gate="$1"
  shift
  local pattern
  pattern="$(joined_pattern "$@")"

  local files
  files="$(tracked_text_files)"
  if [[ -z "$files" ]]; then
    return 0
  fi

  if echo "$files" | xargs grep -niE -- "$pattern" /dev/null 2>/dev/null; then
    printf '\nSCRUB FAIL [%s]: forbidden pattern detected above\n' "$gate" >&2
    return 1
  fi
  return 0
}

exit_code=0
gate_check gate4-donor-leak  "${DONOR_PATTERNS[@]}"  || exit_code=1
gate_check gate5-voice-leak  "${VOICE_PATTERNS[@]}"  || exit_code=1
exit "$exit_code"
