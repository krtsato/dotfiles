#!/usr/bin/env bash
#
# List or remove stale files under ~/.claude that nothing else cleans up.
#
# Session logs (~/.claude/projects/*/<uuid>.jsonl) rotate out after about 30
# days on their own, so they are deliberately NOT touched. Four other kinds do
# pile up, and they deserve different thresholds:
#
#   plans        180 days  written plans; worth re-reading for a while
#   subagents     30 days  per-subagent transcripts under a session directory
#   tool-results  30 days  files fetched by tools (json / images / pdf)
#   file-history  30 days  snapshots taken before editing a file
#
# Never in scope:
#   memory/   persists across sessions on purpose; age is normal, not staleness
#   plugins/  installed code; an old mtime does not mean unused
#
# These trees live inside a git repository but .claude/.gitignore excludes them,
# so deletions cannot be undone from history. Hence: listing is the default,
# --apply moves to the macOS Trash, and only --purge deletes outright.
set -euo pipefail

CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
DAYS=          # empty means "use the per-kind default"
MODE=list
TARGETS=all

ALL_KINDS="plans subagents tool-results file-history"

usage() {
	cat <<'EOF'
Usage: prune-agent-storage.sh [--days N] [--only KIND] [--apply | --purge]

  (no option)   List candidates only. Nothing is removed.
  --apply       Move candidates to ~/.Trash/agent-prune-<timestamp>/.
  --purge       Delete candidates permanently. Cannot be undone.
  --days N      One threshold for every kind. Default: per kind (see below).
  --only KIND   Restrict to one kind.

  Kind           Default  What it is
  plans          180 日   ~/.claude/plans/*.md
  subagents       30 日   subagent transcripts under a session directory
  tool-results    30 日   files fetched by tools (json / images / pdf)
  file-history    30 日   snapshots taken before editing a file

Never touched: memory/, plugins/, and session logs (they rotate automatically).

Environment:
  CLAUDE_DIR    Root to scan. Default: ~/.claude
  TRASH_DIR     Where --apply moves files. Default: ~/.Trash
EOF
}

while [ $# -gt 0 ]; do
	case "$1" in
	--days)
		[ $# -ge 2 ] || {
			echo "error: --days needs a value" >&2
			exit 2
		}
		DAYS="$2"
		shift 2
		;;
	--days=*)
		DAYS="${1#*=}"
		shift
		;;
	--only)
		[ $# -ge 2 ] || {
			echo "error: --only needs a value" >&2
			exit 2
		}
		TARGETS="$2"
		shift 2
		;;
	--only=*)
		TARGETS="${1#*=}"
		shift
		;;
	--apply)
		MODE=apply
		shift
		;;
	--purge)
		MODE=purge
		shift
		;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		echo "error: unknown option: $1" >&2
		usage >&2
		exit 2
		;;
	esac
done

if [ -n "$DAYS" ]; then
	case "$DAYS" in
	*[!0-9]*)
		echo "error: --days must be a non-negative integer, got: $DAYS" >&2
		exit 2
		;;
	esac
fi

if [ "$TARGETS" != all ]; then
	case " $ALL_KINDS " in
	*" $TARGETS "*) ;;
	*)
		echo "error: --only must be one of: $ALL_KINDS; got: $TARGETS" >&2
		exit 2
		;;
	esac
fi

if [ ! -d "$CLAUDE_DIR" ]; then
	echo "error: claude directory not found: $CLAUDE_DIR" >&2
	exit 1
fi

# days_for echoes the threshold for one kind: the --days override when given,
# otherwise the per-kind default.
days_for() {
	if [ -n "$DAYS" ]; then
		echo "$DAYS"
		return
	fi
	case "$1" in
	plans) echo 180 ;;
	*) echo 30 ;;
	esac
}

wants() { [ "$TARGETS" = all ] || [ "$TARGETS" = "$1" ]; }

candidates=()
kinds=()
collect() {
	local kind="$1"
	shift
	local f
	while IFS= read -r -d '' f; do
		candidates+=("$f")
		kinds+=("$kind")
	done < <("$@" -print0 2>/dev/null | sort -z)
}

# memory and plugins are excluded by construction: plans is its own directory,
# subagents and tool-results only ever live under a session directory, and
# file-history is a sibling tree. No path below can reach memory or plugins.
if wants plans && [ -d "$CLAUDE_DIR/plans" ]; then
	collect plans find "$CLAUDE_DIR/plans" -maxdepth 1 -type f -name '*.md' -mtime "+$(days_for plans)"
fi
if wants subagents && [ -d "$CLAUDE_DIR/projects" ]; then
	collect subagents find "$CLAUDE_DIR/projects" -type f -path '*/subagents/*' -mtime "+$(days_for subagents)"
fi
if wants tool-results && [ -d "$CLAUDE_DIR/projects" ]; then
	collect tool-results find "$CLAUDE_DIR/projects" -type f -path '*/tool-results/*' -mtime "+$(days_for tool-results)"
fi
if wants file-history && [ -d "$CLAUDE_DIR/file-history" ]; then
	collect file-history find "$CLAUDE_DIR/file-history" -type f -mtime "+$(days_for file-history)"
fi

total_bytes=0
for f in ${candidates+"${candidates[@]}"}; do
	total_bytes=$((total_bytes + $(stat -f '%z' "$f")))
done

echo "対象ディレクトリ: $CLAUDE_DIR"
if [ -n "$DAYS" ]; then
	echo "しきい値: 全種類 ${DAYS} 日より古い更新日時"
else
	echo "しきい値: plans は 180 日、その他は 30 日より古い更新日時"
fi
echo "対象の種類: $TARGETS"
echo "該当: ${#candidates[@]} 件 / $((total_bytes / 1024 / 1024)) MB"
echo
echo "セッションログ・memory・plugins は対象外です。"
echo

if [ "${#candidates[@]}" -eq 0 ]; then
	echo "片付けたファイル数: 0"
	echo
	echo "しきい値より古いファイルはありません。"
	exit 0
fi

echo "=== 種類ごとの内訳 ==="
for kind in $ALL_KINDS; do
	n=0
	b=0
	i=0
	while [ "$i" -lt "${#candidates[@]}" ]; do
		if [ "${kinds[$i]}" = "$kind" ]; then
			n=$((n + 1))
			b=$((b + $(stat -f '%z' "${candidates[$i]}")))
		fi
		i=$((i + 1))
	done
	[ "$n" -gt 0 ] && printf '%-14s %5s 件  %6s MB  (%s 日)\n' "$kind" "$n" "$((b / 1024 / 1024))" "$(days_for "$kind")"
done
echo

echo "=== 古い順の上位 10 件 ==="
# Read the sorted listing into an array and stop at ten while iterating. Piping
# into `head` would close the pipe early, and with `set -eo pipefail` that
# aborts the whole script before anything is moved.
sorted=()
while IFS= read -r line; do
	sorted+=("$line")
done < <(for f in "${candidates[@]}"; do
	printf '%s\t%s\n' "$(stat -f '%m' "$f")" "$f"
done | sort -n)
shown=0
for line in ${sorted+"${sorted[@]}"}; do
	[ "$shown" -ge 10 ] && break
	m="${line%%$'\t'*}"
	p="${line#*$'\t'}"
	rel="${p#"$CLAUDE_DIR"/}"
	printf '%s  %8s bytes  %s\n' "$(date -r "$m" '+%Y-%m-%d')" "$(stat -f '%z' "$p")" "$rel"
	# A plan's first heading says what it was about; worth seeing before removal.
	if [ "${rel#plans/}" != "$rel" ]; then
		title=$(grep -m 1 '^# ' "$p" 2>/dev/null | sed 's/^# //' || true)
		[ -n "$title" ] && printf '            %s\n' "$title"
	fi
	shown=$((shown + 1))
done
echo

if [ "$MODE" = list ]; then
	echo "片付けたファイル数: 0"
	echo
	echo "これは一覧のみです。ゴミ箱へ移すには --apply、完全に消すには --purge を付けてください。"
	exit 0
fi

removed=0
if [ "$MODE" = apply ]; then
	dest="${TRASH_DIR:-$HOME/.Trash}/agent-prune-$(date '+%Y%m%d-%H%M%S')"
	for f in "${candidates[@]}"; do
		# Keep the original layout so a restore is unambiguous.
		rel="${f#"$CLAUDE_DIR"/}"
		mkdir -p "$dest/$(dirname "$rel")"
		mv "$f" "$dest/$rel"
		removed=$((removed + 1))
	done
	echo "移動先: $dest"
else
	for f in "${candidates[@]}"; do
		rm -f "$f"
		removed=$((removed + 1))
	done
fi

# Drop directories left empty by the move, but never the roots themselves.
for root in "$CLAUDE_DIR/projects" "$CLAUDE_DIR/file-history"; do
	[ -d "$root" ] && find "$root" -mindepth 1 -type d -empty -delete 2>/dev/null || true
done

echo "片付けたファイル数: ${removed}"
echo "解放した容量: $((total_bytes / 1024 / 1024)) MB"
echo "残っているファイル数: $(find "$CLAUDE_DIR/plans" "$CLAUDE_DIR/projects" "$CLAUDE_DIR/file-history" -type f 2>/dev/null | wc -l | tr -d ' ')"
