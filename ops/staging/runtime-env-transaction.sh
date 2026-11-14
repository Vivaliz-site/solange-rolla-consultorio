#!/bin/sh
# Preserve staging.env alongside application/worker SHA during promotion.
# Never print config values: the file can contain credentials.
set -eu
umask 077

action="$1"
root="$2"
fail() { printf '%s\n' "STAGING_ENV_TRANSACTION=FAIL reason=$1" >&2; exit 1; }
[ -n "$root" ] && [ -d "$root" ] || fail invalid_root
[ -d "$root/state" ] && [ ! -L "$root/state" ] || fail missing_state_directory
target="$root/staging.env"
backup="$root/state/staging-env-predeploy.backup"
absent="$root/state/staging-env-predeploy.absent"

# No ambiguity is permitted: two markers means the previous state is unknown.
[ ! -e "$backup" ] || [ ! -e "$absent" ] || fail conflicting_markers
[ ! -L "$target" ] && [ ! -L "$backup" ] && [ ! -L "$absent" ] || fail symlink_forbidden

case "$action" in
  snapshot)
    [ ! -e "$backup" ] && [ ! -e "$absent" ] || fail existing_snapshot
    if [ -f "$target" ]; then
      tmp=$(mktemp "$root/state/.staging-env-predeploy.XXXXXXXX") || fail temp_creation
      trap 'rm -f "$tmp"' EXIT HUP INT TERM
      chmod 600 "$tmp"
      cat "$target" > "$tmp" || fail backup_copy
      cmp -s "$target" "$tmp" || fail backup_verification
      mv "$tmp" "$backup" || fail backup_publish
      trap - EXIT HUP INT TERM
    elif [ ! -e "$target" ]; then
      : > "$absent" || fail absence_marker
    else
      fail invalid_runtime_env
    fi
    printf '%s\n' "STAGING_ENV_TRANSACTION=SNAPSHOT"
    ;;
  restore)
    if [ -f "$backup" ] && [ ! -e "$absent" ]; then
      mv "$backup" "$target" || fail restore_move
      chmod 600 "$target" || fail restore_permissions
    elif [ -f "$absent" ] && [ ! -e "$backup" ]; then
      rm -f "$target" || fail remove_candidate
      rm -f "$absent" || fail remove_marker
    else
      fail missing_snapshot
    fi
    printf '%s\n' "STAGING_ENV_TRANSACTION=RESTORED"
    ;;
  finalize)
    if [ -f "$backup" ] && [ ! -e "$absent" ]; then
      rm -f "$backup" || fail backup_cleanup
    elif [ -f "$absent" ] && [ ! -e "$backup" ]; then
      rm -f "$absent" || fail marker_cleanup
    else
      fail missing_snapshot
    fi
    printf '%s\n' "STAGING_ENV_TRANSACTION=FINALIZED"
    ;;
  *)
    fail invalid_action
    ;;
esac
