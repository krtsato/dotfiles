#!/usr/bin/env bash
set -euo pipefail

skill_dir=$(cd "$(dirname "$0")/.." && pwd -P)
tool_dir="$skill_dir/scripts/google-docs-sync"
repo_root=$(cd "${GOOGLE_DOCS_SYNC_WORKSPACE:-$PWD}" && pwd -P)
config=${GOOGLE_DOCS_SYNC_CONFIG:-}
tool_id=$(printf '%s' "$tool_dir" | cksum)
tool_id=${tool_id%% *}
image=${GOOGLE_DOCS_SYNC_IMAGE:-google-docs-sync:${tool_id}}

for argument in "$@"; do
  if [[ $argument == --config=* ]]; then
    config=${argument#--config=}
  fi
done

filtered=()
for argument in "$@"; do
  [[ $argument == --config=* ]] || filtered+=("$argument")
done
if [[ ${#filtered[@]} -eq 0 ]]; then
  set --
else
  set -- "${filtered[@]}"
fi

if [[ ${1:-} == build ]]; then
  docker build -t "$image" "$tool_dir"
  exit 0
fi

if [[ $# -eq 0 ]]; then
  printf 'Usage: %s build | <command> --config=<path> [options]\n' "$0" >&2
  exit 1
fi

if [[ -z $config ]]; then
  printf 'Set --config=<path> or GOOGLE_DOCS_SYNC_CONFIG.\n' >&2
  exit 1
fi

if [[ $config == /* ]]; then
  config_host=$config
else
  config_host="$repo_root/$config"
fi
if [[ ! -f $config_host ]]; then
  printf 'Config file not found: %s\n' "$config_host" >&2
  exit 1
fi
config_host=$(cd "$(dirname "$config_host")" && printf '%s/%s' "$(pwd -P)" "$(basename "$config_host")")
if [[ $config_host != "$repo_root/"* ]]; then
  printf 'Config must be inside GOOGLE_DOCS_SYNC_WORKSPACE: %s\n' "$config_host" >&2
  exit 1
fi
config="/workspace/${config_host#"$repo_root/"}"

command=$1
shift

# Credentials live outside the repository so one copy serves every checkout.
# Only this directory is mounted, not the whole gcloud config, so unrelated
# service-account keys stay out of the container.
credentials_dir=${GOOGLE_DOCS_SYNC_CREDENTIALS_DIR:-$HOME/.config/gcloud/gdocs-sync}
if [[ ! -d $credentials_dir ]]; then
  # generate never calls Google, so it stays usable before the first login.
  if [[ $command == generate ]]; then
    credentials_dir=$(mktemp -d)
  else
    printf 'Credentials directory not found: %s\n' "$credentials_dir" >&2
    exit 1
  fi
fi
credentials_dir=$(cd "$credentials_dir" && pwd -P)
export GOOGLE_OAUTH_CREDENTIALS=${GOOGLE_OAUTH_CREDENTIALS:-/credentials/client.json}
export GOOGLE_OAUTH_TOKEN=${GOOGLE_OAUTH_TOKEN:-/credentials/token.json}
export GOOGLE_COMMENTS_CREDENTIALS=${GOOGLE_COMMENTS_CREDENTIALS:-/credentials/comments-client.json}
export GOOGLE_COMMENTS_TOKEN=${GOOGLE_COMMENTS_TOKEN:-/credentials/comments-token.json}
export GOOGLE_EDIT_CREDENTIALS=${GOOGLE_EDIT_CREDENTIALS:-/credentials/comments-client.json}
export GOOGLE_EDIT_TOKEN=${GOOGLE_EDIT_TOKEN:-/credentials/edit-token.json}
export GOOGLE_IMAGE_CREDENTIALS=${GOOGLE_IMAGE_CREDENTIALS:-/credentials/client.json}
export GOOGLE_IMAGE_TOKEN=${GOOGLE_IMAGE_TOKEN:-/credentials/pdf-token.json}
export GOOGLE_PDF_CREDENTIALS=${GOOGLE_PDF_CREDENTIALS:-/credentials/client.json}
export GOOGLE_PDF_TOKEN=${GOOGLE_PDF_TOKEN:-/credentials/pdf-token.json}

docker build -q -t "$image" "$tool_dir" >/dev/null
docker_args=(--rm --user "$(id -u):$(id -g)")
if [[ $command != generate ]]; then
  callback_port=${GOOGLE_OAUTH_CALLBACK_PORT:-8787}
  if [[ ! $callback_port =~ ^[0-9]+$ ]] || (( callback_port < 1 || callback_port > 65535 )); then
    printf 'GOOGLE_OAUTH_CALLBACK_PORT must be an integer between 1 and 65535.\n' >&2
    exit 1
  fi
  docker_args+=(-p "127.0.0.1:${callback_port}:${callback_port}" -e "GOOGLE_OAUTH_CALLBACK_PORT=${callback_port}")
fi
docker run "${docker_args[@]}" \
  -e GOOGLE_OAUTH_CREDENTIALS -e GOOGLE_OAUTH_TOKEN \
  -e GOOGLE_COMMENTS_CREDENTIALS -e GOOGLE_COMMENTS_TOKEN \
  -e GOOGLE_EDIT_CREDENTIALS -e GOOGLE_EDIT_TOKEN \
  -e GOOGLE_IMAGE_CREDENTIALS -e GOOGLE_IMAGE_TOKEN \
  -e GOOGLE_PDF_CREDENTIALS -e GOOGLE_PDF_TOKEN \
  -v "$repo_root:/workspace" -v "$credentials_dir:/credentials" -w /workspace \
  "$image" "$command" "--config=$config" "$@"
