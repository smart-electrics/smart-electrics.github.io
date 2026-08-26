#!/bin/sh

set -eu

if [ -n "${RUBYOPT:-}" ] || [ -n "${RUBYLIB:-}" ] || [ -n "${TESTOPTS:-}" ]; then
  echo "Quality policy violation: Ruby execution controls are forbidden (RUBYOPT, RUBYLIB, TESTOPTS)." >&2
  exit 1
fi

exec bundle exec ruby "$(dirname "$0")/run_ruby_test.rb" "$@"
