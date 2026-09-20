#!/usr/bin/env bash
# Expose the Claude skills of one repository to every other agent registered in
# agents.tsv, as relative symlinks so a fresh clone works without running anything.
#
# Claude is the origin. Nothing is ever written into .claude/skills.
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
使い方: share-skills.sh [--check] [リポジトリのパス]

  --check   変更せず、ずれだけを報告する（終了コード 1 でずれあり）
  省略時のリポジトリは、このスクリプトを含むリポジトリ。

エージェントの定義は agent-bridge/agents.tsv を読む。
USAGE
  exit 2
}

check_only=0
repo=""
for arg in "$@"; do
  case "$arg" in
    --check) check_only=1 ;;
    -h|--help) usage ;;
    -*) usage ;;
    *) repo="$arg" ;;
  esac
done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
registry="$here/agents.tsv"
[ -n "$repo" ] || repo="$(cd "$here/.." && pwd)"
repo="$(cd "$repo" && pwd)"

origin="$repo/.claude/skills"
if [ ! -d "$origin" ]; then
  echo "正本がありません: $origin" >&2
  exit 1
fi
if [ ! -f "$registry" ]; then
  echo "エージェントの定義がありません: $registry" >&2
  exit 1
fi

# A skill the origin does not track is not shared: vendored or scratch directories
# would otherwise appear in another agent's list with nobody maintaining them.
tracked() {
  git -C "$repo" ls-files --error-unmatch "${1#"$repo"/}/SKILL.md" >/dev/null 2>&1
}

# Frontmatter keys, one per line. Reads only the first block so a "---" inside the
# body cannot start a second one.
keys_of() {
  awk '
    /^---[[:space:]]*$/ { n++; if (n == 2) exit; next }
    n == 1 && /^[A-Za-z][A-Za-z0-9_-]*:/ { sub(/:.*/, ""); print }
  ' "$1"
}

drift=0
made=0
kept=0

while IFS=$'\t' read -r agent dest allowed; do
  case "$agent" in ''|\#*) continue ;; esac
  target_dir="$repo/$dest"
  echo "=== $agent  ($dest)"

  if [ ! -d "$target_dir" ]; then
    if [ "$check_only" = 1 ]; then
      echo "  受け入れ先が無い: $target_dir"
      drift=1
      continue
    fi
    mkdir -p "$target_dir"
  fi

  # How many "../" it takes to climb from the target directory back to the repo root.
  up=""
  for _ in $(echo "$dest" | tr '/' ' '); do up="../$up"; done

  for skill_dir in "$origin"/*/; do
    skill_dir="${skill_dir%/}"
    name="$(basename "$skill_dir")"
    [ -f "$skill_dir/SKILL.md" ] || continue
    tracked "$skill_dir" || { echo "  未追跡なので共有しない: $name"; continue; }

    want="${up}.claude/skills/$name"
    link="$target_dir/$name"

    if [ -L "$link" ]; then
      have="$(readlink "$link")"
      if [ "$have" = "$want" ]; then
        kept=$((kept + 1))
      else
        echo "  向き先が違う: $name ($have)"
        drift=1
        [ "$check_only" = 1 ] || { ln -sfn "$want" "$link"; echo "    張り直した"; }
      fi
    elif [ -e "$link" ]; then
      # A real directory with the same name is the agent's own skill. Never overwrite it.
      echo "  名前がぶつかっている（実体あり・触らない）: $name"
      drift=1
      continue
    else
      echo "  新規: $name"
      drift=1
      if [ "$check_only" != 1 ]; then
        ln -s "$want" "$link"
        made=$((made + 1))
      fi
    fi

    # Warn, never fail: an extra key has so far been ignored at run time. The report
    # exists so a key that IS rejected later is traceable to the skill that has it.
    if [ -n "${allowed:-}" ]; then
      for key in $(keys_of "$skill_dir/SKILL.md"); do
        case ",$allowed," in
          *",$key,"*) ;;
          *) echo "    項目 $key は $agent の許容外" ;;
        esac
      done
    fi
  done

  # A link whose origin is gone points at nothing; say so rather than leave it.
  for link in "$target_dir"/*; do
    [ -L "$link" ] || continue
    [ -e "$link" ] && continue
    echo "  正本が消えている: $(basename "$link") -> $(readlink "$link")"
    drift=1
  done
done < "$registry"

echo
if [ "$check_only" = 1 ]; then
  [ "$drift" = 0 ] && echo "ずれなし（既存 $kept 本）" || echo "ずれあり"
  exit "$drift"
fi
echo "作成 $made 本 / 既存 $kept 本"
