#!/bin/sh
# Restore release identity exactly as it existed before staging promotion.
# The .absent marker distinguishes a real first deployment from a missing snapshot.
set -eu
root="$1"
[ -n "$root" ] && [ -d "$root/state" ] && [ ! -L "$root/state" ] || {
  echo 'STAGING_SHA_ROLLBACK=FAIL reason=missing_state' >&2
  exit 1
}
state="$root/state"
current="$state/deployed-sha.txt"
previous="$state/previous-deployed-sha.txt"
absent="$state/previous-deployed-sha.absent"
[ ! -L "$current" ] && [ ! -L "$previous" ] && [ ! -L "$absent" ] || {
  echo 'STAGING_SHA_ROLLBACK=FAIL reason=symlink' >&2
  exit 1
}
if [ -f "$previous" ] && [ ! -e "$absent" ]; then
  mv "$previous" "$current"
elif [ -f "$absent" ] && [ ! -e "$previous" ]; then
  rm -f "$current"
  rm -f "$absent"
else
  echo 'STAGING_SHA_ROLLBACK=FAIL reason=missing_or_ambiguous_snapshot' >&2
  exit 1
fi
echo 'STAGING_SHA_ROLLBACK=RESTORED'
