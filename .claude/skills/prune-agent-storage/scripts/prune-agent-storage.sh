#!/usr/bin/env bash
#
# List or remove leftovers under ~/.claude that Claude Code's automatic cleanup
# missed.
#
# Claude Code deletes old data on its own (cleanupPeriodDays, default 30):
# session logs (projects/<p>/<session>.jsonl) and, together with the parent log,
# projects/<p>/<session>/{subagents,tool-results}/ and file-history/<session>/.
# Data of a session whose log is still alive must stay: file-history is the
# rewind point of that conversation. So this script never judges by file age.
# It judges per session:
#
#   subagents / tool-results / file-history of a session whose log
#   (projects/*/<session>.jsonl) exists under no project  ->  leftover
#
# It also warns when session logs older than cleanupPeriodDays remain, which
# means the automatic cleanup itself is not running (never deleted here).
#
# Never in scope: plans (cleaned automatically), memory/, jobs/, daemon/,
# plugins/, and session logs.
#
# These trees live inside a git repository but .claude/.gitignore excludes them,
# so deletions cannot be undone from history. Hence: listing is the default,
# --apply moves to the macOS Trash, and only --purge deletes outright.
set -euo pipefail

CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
MODE=list
TARGETS=all

ALL_KINDS="subagents tool-results file-history"

usage() {
	cat <<'EOF'
Usage: prune-agent-storage.sh [--only KIND] [--apply | --purge]

  (no option)   List leftovers only. Nothing is removed.
  --apply       Move leftovers to ~/.Trash/agent-prune-<timestamp>/.
  --purge       Delete leftovers permanently. Cannot be undone.
  --only KIND   Restrict to one kind.

  Kind           What it is
  subagents      subagent transcripts of a session with no log
  tool-results   files fetched by tools, of a session with no log
  file-history   pre-edit snapshots of a session with no log

A session is a leftover when projects/*/<session>.jsonl exists nowhere.
Sessions whose log is alive are never touched, however old their files are.

Also warns (never deletes) when session logs older than cleanupPeriodDays
remain: the automatic cleanup may have stopped. Check /status.

Never touched: plans/, memory/, jobs/, daemon/, plugins/, and session logs.

Environment:
  CLAUDE_DIR    Root to scan. Default: ~/.claude
  TRASH_DIR     Where --apply moves files. Default: ~/.Trash
EOF
}

while [ $# -gt 0 ]; do
	case "$1" in
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

wants() { [ "$TARGETS" = all ] || [ "$TARGETS" = "$1" ]; }

# find's stderr is collected, not discarded: an unreadable subtree would
# otherwise look the same as "no leftovers there".
find_errors="$(mktemp)"
live_ids="$(mktemp)"
on_exit() {
	local rc=$?
	if [ "$rc" -eq 0 ] && [ -s "$find_errors" ]; then
		rc=1
	fi
	rm -f "$find_errors" "$live_ids"
	exit "$rc"
}
trap on_exit EXIT

report_errors() {
	echo "確かめられなかった箇所（読めないフォルダがあり、そこは「0 件」ではなく未確認です）:" >&2
	sed 's/^/  /' "$find_errors" >&2
	echo "終了コードは 1 になります。" >&2
	echo >&2
}

# cleanupPeriodDays comes from settings.json (Claude Code's own setting); this
# script keeps no day count of its own. Missing or invalid falls back to 30,
# the documented default.
period=30
period_note=""
if [ -f "$CLAUDE_DIR/settings.json" ]; then
	if command -v jq >/dev/null 2>&1; then
		if ! v="$(jq -r '.cleanupPeriodDays // empty' "$CLAUDE_DIR/settings.json" 2>/dev/null)"; then
			v=""
			period_note="settings.json を読めません（自動の片付けも止まる原因になります）。30 日として扱います"
		fi
		case "$v" in
		'') ;;
		*[!0-9]* | 0) period_note="settings.json の cleanupPeriodDays（$v）を読めないため 30 日として扱います" ;;
		*) period="$v" ;;
		esac
	else
		period_note="jq が無いため cleanupPeriodDays を読めません。30 日として扱います"
	fi
fi

# Index of live sessions: every projects/*/<session>.jsonl. memory/ sits one
# level deeper, so it cannot appear here. If this listing is incomplete, every
# session would look orphaned, so any error aborts before anything is judged.
if [ -d "$CLAUDE_DIR/projects" ]; then
	/usr/bin/find "$CLAUDE_DIR/projects" -mindepth 2 -maxdepth 2 -type f -name '*.jsonl' -print 2>>"$find_errors" |
		while IFS= read -r p; do
			b="${p##*/}"
			echo "${b%.jsonl}"
		done >"$live_ids" || true
	if [ -s "$find_errors" ]; then
		report_errors
		echo "会話の記録の一覧が不完全なため、取り残しの判定を行いません。" >&2
		exit 1
	fi
fi

units=()
unit_kinds=()
# add_unit KIND DIR SESSION: keep DIR only when SESSION has no live log.
add_unit() {
	local kind="$1" dir="$2" sid="$3"
	if ! /usr/bin/grep -Fxq -- "$sid" "$live_ids"; then
		units+=("$dir")
		unit_kinds+=("$kind")
	fi
}

if wants file-history && [ -d "$CLAUDE_DIR/file-history" ]; then
	while IFS= read -r -d '' d; do
		add_unit file-history "$d" "${d##*/}"
	done < <(/usr/bin/find "$CLAUDE_DIR/file-history" -mindepth 1 -maxdepth 1 -type d -print0 2>>"$find_errors" | sort -z)
fi
if [ -d "$CLAUDE_DIR/projects" ]; then
	for kind in subagents tool-results; do
		wants "$kind" || continue
		while IFS= read -r -d '' d; do
			parent="${d%/*}"
			add_unit "$kind" "$d" "${parent##*/}"
		done < <(/usr/bin/find "$CLAUDE_DIR/projects" -mindepth 3 -maxdepth 3 -type d -name "$kind" -print0 2>>"$find_errors" | sort -z)
	done
fi

candidates=()
kinds=()
i=0
while [ "$i" -lt "${#units[@]}" ]; do
	while IFS= read -r -d '' f; do
		candidates+=("$f")
		kinds+=("${unit_kinds[$i]}")
	done < <(/usr/bin/find "${units[$i]}" -type f -print0 2>>"$find_errors" | sort -z)
	i=$((i + 1))
done

if [ -s "$find_errors" ]; then
	report_errors
fi

total_bytes=0
for f in ${candidates+"${candidates[@]}"}; do
	total_bytes=$((total_bytes + $(stat -f '%z' "$f")))
done

echo "対象ディレクトリ: $CLAUDE_DIR"
echo "判定: 会話の記録（projects/*/<session>.jsonl）がどこにも無い session の分だけを取り残しとみなす"
echo "対象の種類: $TARGETS"
echo "該当: ${#candidates[@]} 件 / $((total_bytes / 1024 / 1024)) MB"
echo
echo "続いている会話・plans・memory・plugins・会話の記録は対象外です。"
echo

# Watch: the automatic cleanup removes logs older than cleanupPeriodDays. Logs
# older than that mean it has stopped (unreadable settings, etc.). Report only.
echo "=== 自動の片付けの見張り（cleanupPeriodDays = ${period} 日）==="
[ -n "$period_note" ] && echo "注意: $period_note"
stale_n=0
oldest=""
if [ -d "$CLAUDE_DIR/projects" ]; then
	while IFS= read -r -d '' f; do
		stale_n=$((stale_n + 1))
		m="$(stat -f '%m' "$f")"
		if [ -z "$oldest" ] || [ "$m" -lt "$oldest" ]; then oldest="$m"; fi
	done < <(/usr/bin/find "$CLAUDE_DIR/projects" -mindepth 2 -maxdepth 2 -type f -name '*.jsonl' -mtime "+$period" -print0 2>>"$find_errors")
fi
if [ "$stale_n" -gt 0 ]; then
	echo "警告: ${period} 日より古い会話の記録が ${stale_n} 件残っています（最古 $(date -r "$oldest" '+%Y-%m-%d')）。"
	echo "自動の片付けが止まっている可能性があります。Claude Code で /status を確認してください。（ここでは消しません）"
else
	echo "期限切れの会話の記録は残っていません。"
fi
echo

if [ "${#units[@]}" -eq 0 ]; then
	echo "片付けたファイル数: 0"
	echo
	echo "取り残されたファイルはありません。"
	exit 0
fi

echo "=== 種類ごとの内訳 ==="
for kind in $ALL_KINDS; do
	s=0
	n=0
	b=0
	i=0
	while [ "$i" -lt "${#units[@]}" ]; do
		[ "${unit_kinds[$i]}" = "$kind" ] && s=$((s + 1))
		i=$((i + 1))
	done
	i=0
	while [ "$i" -lt "${#candidates[@]}" ]; do
		if [ "${kinds[$i]}" = "$kind" ]; then
			n=$((n + 1))
			b=$((b + $(stat -f '%z' "${candidates[$i]}")))
		fi
		i=$((i + 1))
	done
	[ "$s" -gt 0 ] && printf '%-14s %5s session  %6s 件  %6s MB\n' "$kind" "$s" "$n" "$((b / 1024 / 1024))"
done
echo

echo "=== 古い順の上位 10 件 ==="
# Read the sorted listing into an array and stop at ten while iterating. Piping
# into `head` would close the pipe early, and with `set -eo pipefail` that
# aborts the whole script before anything is moved.
sorted=()
while IFS= read -r line; do
	sorted+=("$line")
done < <(for f in ${candidates+"${candidates[@]}"}; do
	printf '%s\t%s\n' "$(stat -f '%m' "$f")" "$f"
done | sort -n)
shown=0
for line in ${sorted+"${sorted[@]}"}; do
	[ "$shown" -ge 10 ] && break
	m="${line%%$'\t'*}"
	p="${line#*$'\t'}"
	rel="${p#"$CLAUDE_DIR"/}"
	printf '%s  %8s bytes  %s\n' "$(date -r "$m" '+%Y-%m-%d')" "$(stat -f '%z' "$p")" "$rel"
	shown=$((shown + 1))
done
echo

if [ "$MODE" = list ]; then
	echo "片付けたファイル数: 0"
	echo
	echo "これは一覧のみです。ゴミ箱へ移すには --apply、完全に消すには --purge を付けてください。"
	exit 0
fi

# Re-check right before touching anything: the transcript list above is a
# snapshot, and a session may have started (or resumed) since. A unit whose
# session now has a transcript, or that was written to in the last hour, is
# left alone.
sid_of() {
	case "$1" in
	file-history/*) printf '%s\n' "$1" | cut -d/ -f2 ;;
	projects/*) printf '%s\n' "$1" | cut -d/ -f3 ;;
	esac
}
still_orphan() {
	local sid="$1" unit="$2" t
	for t in "$CLAUDE_DIR"/projects/*/"$sid".jsonl; do
		[ -e "$t" ] && return 1
	done
	[ -z "$(find "$unit" -type f -mmin -60 -print 2>/dev/null | head -n 1)" ]
}
kept_sids=" "
for d in ${units[@]+"${units[@]}"}; do
	rel_unit="${d#"$CLAUDE_DIR"/}"
	sid="$(sid_of "$rel_unit")"
	if ! still_orphan "$sid" "$d"; then
		case "$kept_sids" in *" $sid "*) ;; *) kept_sids="$kept_sids$sid " ;; esac
	fi
done
if [ "$kept_sids" != " " ]; then
	echo "消す直前に会話の記録が現れた、または直近 60 分に更新された会話は残します:$kept_sids"
fi
skip_file() {
	local s
	s="$(sid_of "${1#"$CLAUDE_DIR"/}")"
	case "$kept_sids" in *" $s "*) return 0 ;; esac
	return 1
}

removed=0
if [ "$MODE" = apply ]; then
	dest="${TRASH_DIR:-$HOME/.Trash}/agent-prune-$(date '+%Y%m%d-%H%M%S')"
	for f in ${candidates+"${candidates[@]}"}; do
		skip_file "$f" && continue
		# Keep the original layout so a restore is unambiguous.
		rel="${f#"$CLAUDE_DIR"/}"
		mkdir -p "$dest/$(dirname "$rel")"
		mv "$f" "$dest/$rel"
		removed=$((removed + 1))
	done
	echo "移動先: $dest"
else
	for f in ${candidates+"${candidates[@]}"}; do
		skip_file "$f" && continue
		rm -f "$f"
		removed=$((removed + 1))
	done
fi

# Drop directories left empty under each leftover unit; the session directory
# itself too when nothing else is in it. Roots and live sessions are untouched.
for d in ${units[@]+"${units[@]}"}; do
	skip_file "$d" && continue
	find "$d" -depth -type d -empty -delete 2>/dev/null || true
	case "${d#"$CLAUDE_DIR"/}" in
	projects/*) rmdir "${d%/*}" 2>/dev/null || true ;;
	esac
done

echo "片付けたファイル数: ${removed}"
echo "解放した容量: $((total_bytes / 1024 / 1024)) MB"
