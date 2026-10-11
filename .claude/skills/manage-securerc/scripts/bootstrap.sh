#!/bin/sh
# Ensure that the securerc command resolves to this checkout without using sudo.

set -eu

repository=${SECURERC_REPOSITORY:-"$HOME/dev/me/securerc"}
config=${SECURERC_CONFIG:-"$HOME/.config/securerc/config.json"}

fail() {
  printf '%s\n' "manage-securerc bootstrap: $*" >&2
  exit 1
}

[ "${SECURERC_PROVIDER_TASK:-}" != "1" ] || fail "refusing to modify the CLI from a securerc provider task; run bootstrap from a local agent session"

resolve_path() {
  path=$1
  link_hops=0
  # Match the common kernel symlink traversal limit to bound cycles.
  max_link_hops=40

  while [ -L "$path" ]; do
    link_hops=$((link_hops + 1))
    [ "$link_hops" -le "$max_link_hops" ] || return 1
    directory=$(CDPATH= cd -P "$(dirname "$path")" 2>/dev/null && pwd) || return 1
    target=$(readlink "$path") || return 1
    case $target in
      /*) path=$target ;;
      *) path=$directory/$target ;;
    esac
  done

  directory=$(CDPATH= cd -P "$(dirname "$path")" 2>/dev/null && pwd) || return 1
  printf '%s/%s\n' "$directory" "$(basename "$path")"
}

repository_path=$(CDPATH= cd -P "$repository" 2>/dev/null && pwd) || repository_path=
expected_command=${repository_path:+"$repository_path/dist/src/cli.js"}

command_path=
if command -v securerc >/dev/null 2>&1; then
  command_path=$(command -v securerc)
  command_path=$(resolve_path "$command_path" 2>/dev/null || true)
fi

if [ -n "$expected_command" ] && [ "$command_path" = "$expected_command" ]; then
  printf '%s\n' "manage-securerc bootstrap: securerc already uses $command_path"
  exit 0
fi

[ -n "$repository_path" ] || fail "repository is unavailable: $repository"
[ -e "$repository_path/.git" ] || fail "not a Git repository: $repository_path"
[ -f "$repository_path/package.json" ] || fail "package.json is missing: $repository_path"

if [ -n "$command_path" ]; then
  printf '%s\n' "manage-securerc bootstrap: repairing securerc link from $command_path" >&2
else
  printf '%s\n' "manage-securerc bootstrap: installing securerc link" >&2
fi

(
  cd "$repository_path" || exit 1
  npm ci || exit 1
  npm run build || exit 1
  npm link || exit 1
) || fail "npm setup failed. Do not use sudo; check npm's prefix and directory permissions, then retry."

command -v securerc >/dev/null 2>&1 || fail "npm link completed but securerc is not on PATH"
linked_path=$(resolve_path "$(command -v securerc)" 2>/dev/null || true)
[ "$linked_path" = "$expected_command" ] || fail "npm link completed but securerc resolves to an unexpected path: ${linked_path:-unresolved}"

if [ -f "$config" ]; then
  securerc status
else
  printf '%s\n' "manage-securerc bootstrap: securerc linked; configuration is not created yet: $config"
fi
