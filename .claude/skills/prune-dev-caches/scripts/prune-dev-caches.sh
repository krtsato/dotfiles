#!/bin/bash
# Prune regenerable caches that grow on this Mac and that nothing else cleans.
#
# usage: prune-dev-caches.sh [--apply] [--only <item>[,<item>...]]
#   items: uv, mise, npx, xcode, runner, docker   (default: all)
#   Without --apply it only lists what would go and how big it is.
#
# Everything removed here is downloaded or rebuilt again on next use; nothing
# here is user data. Each item checks its own "in use" condition and skips
# itself (exit status 1 at the end) instead of removing anything in doubt.
set -u

AGE_DAYS=30                       # npx and Xcode entries untouched this long
NIGHT_START=0130 NIGHT_END=0930   # nightly runner jobs; never touch runners then
DEV_ROOT=${DEV_ROOT:-$HOME/dev/me}
UV_CACHE=${UV_CACHE_DIR:-$HOME/.cache/uv}
NPX_DIR=${NPX_DIR:-$HOME/.npm/_npx}
DERIVED=${DERIVED:-$HOME/Library/Developer/Xcode/DerivedData}
FIND_UNUSED=$HOME/.claude/skills/upgrade-runtimes/scripts/find-unused-base-images.sh

apply=0
only=uv,mise,npx,xcode,runner,docker
while [ "$#" -gt 0 ]; do
  case $1 in
    --apply) apply=1 ;;
    --only) only=$2; shift ;;
    -h | --help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

skipped=0
want() { case ",$only," in *",$1,"*) return 0 ;; esac; return 1; }
# du with no operand measures the current directory, so an empty list is 0.
kb() { [ "$#" -gt 0 ] || { echo 0; return; }; du -sk "$@" 2>/dev/null | awk '{s += $1} END {print s + 0}'; }
human() { awk -v k="$1" 'BEGIN {printf (k >= 1048576 ? "%.1f GB" : "%.0f MB"), (k >= 1048576 ? k / 1048576 : k / 1024)}'; }
avail() { df -k / | awk 'NR == 2 {print $4}'; }
skip() { echo "  skip: $*"; skipped=1; }
section() { echo "=== $1"; }
# True when something under $1 changed within AGE_DAYS, or when that cannot be
# told (find failed): an unreadable entry is kept, never taken for old.
recent() {
  local out
  out=$(find "$1" -maxdepth "$2" -mtime -"$AGE_DAYS" -print -quit 2>/dev/null) || return 0
  [ -n "$out" ]
}
# Report freed space from df, which also counts clones and hard links correctly.
freed() { local k=$(($(avail) - $1)); [ "$k" -gt 0 ] || k=0; echo "  freed $(human "$k")"; }

# A process's Claude Code session, shown as its folder and terminal.
session_of() {
  local p=$1 n=0 c
  while [ "$n" -lt 8 ]; do
    n=$((n + 1))
    p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
    [ -z "$p" ] || [ "$p" = 1 ] && break
    c=$(ps -o comm= -p "$p" 2>/dev/null)
    case $c in *claude*)
      echo "Claude Code in $(lsof -a -p "$p" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p') ($(ps -o tty= -p "$p" | tr -d ' '))"
      return ;;
    esac
  done
  ps -o command= -p "$1" 2>/dev/null | cut -c1-80 | grep . || echo "(exited since the check)"
}

if want uv; then
  section "uv cache ($UV_CACHE)"
  if [ ! -d "$UV_CACHE" ]; then
    echo "  nothing to prune"
  else
    holders=$(lsof -t "$UV_CACHE/.lock" 2>/dev/null | sort -u)
    echo "  size $(human "$(kb "$UV_CACHE")")"
    if [ -n "$holders" ]; then
      skip "the cache is locked by:"
      for h in $holders; do echo "    pid $h: $(session_of "$h")"; done
      echo "    close those sessions (an MCP server started with uvx holds the lock for the whole session), then rerun"
    elif [ "$apply" = 1 ]; then
      s=$(avail); uv cache clean >/dev/null 2>&1 || skip "uv cache clean failed"; freed "$s"
    fi
  fi
fi

if want mise; then
  section "mise versions no config asks for"
  list=$(mise ls --prunable 2>/dev/null)
  if [ -z "$list" ]; then
    echo "  nothing to prune"
  else
    printf '%s\n' "$list" | sed 's/^/  /'
    if [ "$apply" = 1 ]; then s=$(avail); mise prune -y >/dev/null 2>&1 || skip "mise prune failed"; freed "$s"; fi
  fi
fi

if want npx; then
  section "npx packages untouched for $AGE_DAYS days ($NPX_DIR)"
  # In use = named in a process's arguments, or open / the working directory
  # of any process (a server started as "node server.js" inside the package).
  # shellcheck disable=SC2009  # the package path is in the arguments, which pgrep cannot print
  args=$(ps -axo command= | grep -oE "$NPX_DIR/[^/[:space:]]+")
  open_files=$(lsof -Fn 2>/dev/null | sed -n 's/^n//p')
  if [ -z "$open_files" ]; then
    skip "lsof listed no open files, so packages in use cannot be told apart"
    want_npx=0
  else
    want_npx=1
  fi
  inuse=" $(printf '%s\n%s\n' "$args" "$open_files" | grep -oE "$NPX_DIR/[^/[:space:]]+" \
    | sort -u | xargs -n1 basename 2>/dev/null | grep -v '^\[' | tr '\n' ' ') "  # drop this grep's own pattern
  old=()
  for d in "$NPX_DIR"/*/; do
    [ "$want_npx" = 1 ] || break
    [ -d "$d" ] || continue
    d=${d%/}
    recent "$d" 2 && continue
    case $inuse in *" ${d##*/} "*) continue ;; esac
    old+=("$d")
  done
  echo "  ${#old[@]} of $(find "$NPX_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' '), $(human "$(kb ${old[@]+"${old[@]}"})") (in use, kept:${inuse% })"
  if [ "$apply" = 1 ] && [ "${#old[@]}" -gt 0 ]; then s=$(avail); rm -rf "${old[@]}"; freed "$s"; fi
fi

if want xcode; then
  section "Xcode DerivedData untouched for $AGE_DAYS days"
  if pgrep -x Xcode >/dev/null || pgrep -f xcodebuild >/dev/null; then
    skip "Xcode or xcodebuild is running"
  else
    old=()
    for d in "$DERIVED"/*/; do
      [ -d "$d" ] || continue
      recent "$d" 3 || old+=("${d%/}")
    done
    echo "  ${#old[@]} of $(find "$DERIVED" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' '), $(human "$(kb ${old[@]+"${old[@]}"})")"
    if [ "$apply" = 1 ] && [ "${#old[@]}" -gt 0 ]; then s=$(avail); rm -rf "${old[@]}"; freed "$s"; fi
  fi
fi

if want runner; then
  section "self-hosted runner leftovers (old runner versions, _update, unused Go)"
  now=$(date +%H%M)
  if [ "$now" -ge "$NIGHT_START" ] && [ "$now" -lt "$NIGHT_END" ]; then
    skip "nightly jobs run between $NIGHT_START and $NIGHT_END"
  else
    for meta in "$DEV_ROOT"/*/actions-runners/.runner "$DEV_ROOT"/*/actions-runners/*/.runner; do
      [ -f "$meta" ] || continue
      d=${meta%/.runner}
      name=$(jq -r .agentName "$meta"); slug=$(jq -r .gitHubUrl "$meta" | sed -E 's#^https://github.com/##; s#/$##')
      repo=$DEV_ROOT/${slug#*/}
      busy=$(gh api "repos/$slug/actions/runners" --jq ".runners[] | select(.name == \"$name\") | .busy" 2>/dev/null)
      if [ "$busy" != false ] || pgrep -f "$d/bin[^ ]*/Runner.Worker" >/dev/null; then
        skip "$name: busy or unknown (gh said '${busy:-nothing}')"; continue
      fi
      b=$(basename "$(readlink "$d/bin")"); e=$(basename "$(readlink "$d/externals")")
      targets=()
      newest() { printf '%s\n' "$d"/"$1".* | sed 's#.*/##' | sort -V | tail -n 1; }
      if [ -n "$b" ] && [ -n "$e" ] && [ -d "$d/$b" ] && [ -d "$d/$e" ] \
         && [ "$(newest bin)" = "$b" ] && [ "$(newest externals)" = "$e" ]; then
        for o in "$d"/bin.* "$d"/externals.*; do
          case ${o##*/} in "$b" | "$e") ;; *) targets+=("$o") ;; esac
        done
        [ -d "$d/_work/_update" ] && targets+=("$d/_work/_update")
      else
        skip "$name: bin/externals links are unreadable or a newer version is unpacked"
      fi
      # Go versions: keep exactly what the workflows pin; any range, matrix or
      # go-version-file makes the needed set unknown, so keep everything.
      specs=$(grep -rhE '^[[:space:]]*go-version(-file)?:' "$repo/.github/workflows" 2>/dev/null \
        | sed -E "s/^[^:]*:[[:space:]]*//; s/[\"' ]//g")
      if [ -d "$d/_work/_tool/go" ]; then
        if [ -z "$specs" ] || grep -rqE '^[[:space:]]*go-version-file:' "$repo/.github/workflows" \
           || printf '%s\n' "$specs" | grep -qvxE '[0-9]+\.[0-9]+\.[0-9]+'; then
          skip "$name: go-version is not a full x.y.z everywhere; Go versions kept"
        else
          for vd in "$d/_work/_tool/go"/*/; do
            v=$(basename "$vd")
            printf '%s\n' "$specs" | grep -qxF "$v" || targets+=("${vd%/}")
          done
        fi
      fi
      echo "  $name: ${#targets[@]} item(s), $(human "$(kb ${targets[@]+"${targets[@]}"})")"
      for t in ${targets[@]+"${targets[@]}"}; do echo "    ${t#"$d"/}"; done
      if [ "$apply" = 1 ] && [ "${#targets[@]}" -gt 0 ]; then
        (cd "$d" && ./svc.sh stop >/dev/null) || { skip "$name: svc.sh stop failed"; continue; }
        # Re-check once stopped: a job or a self-update may have begun after the
        # checks above. Anything different means the list is stale; remove nothing.
        if pgrep -f "$d/bin[^ ]*/Runner.Worker" >/dev/null \
           || [ "$(basename "$(readlink "$d/bin")")" != "$b" ] || [ "$(basename "$(readlink "$d/externals")")" != "$e" ] \
           || [ "$(newest bin)" != "$b" ] || [ "$(newest externals)" != "$e" ]; then
          skip "$name: changed while stopping; nothing removed"
          (cd "$d" && ./svc.sh start >/dev/null) || skip "$name: svc.sh start failed; start it by hand"
          continue
        fi
        s=$(avail); rm -rf "${targets[@]}"; freed "$s"
        (cd "$d" && ./svc.sh start >/dev/null) || skip "$name: svc.sh start failed; start it by hand"
      fi
    done
  fi
fi

if want docker; then
  section "Docker base images written nowhere"
  if ! docker info >/dev/null 2>&1; then
    skip "Docker is not running"
  elif [ ! -x "$FIND_UNUSED" ]; then
    skip "$FIND_UNUSED is missing"
  else
    rc=0; out=$("$FIND_UNUSED") || rc=$?
    printf '%s\n' "$out" | sed 's/^/  /'
    unused=$(printf '%s\n' "$out" | sed -n 's/^unused //p')
    if [ "$rc" -ne 0 ]; then
      skip "the search failed; nothing removed"
    elif printf '%s\n' "$out" | grep -q '^check-by-eye '; then
      skip "a FROM builds its base from a variable; read it, then remove by hand"
    elif [ "$apply" = 1 ] && [ -n "$unused" ]; then
      s=$(avail)
      for img in $unused; do
        if [ -n "$(docker ps -aq --filter "ancestor=$img")" ]; then skip "$img: a container uses it"; continue; fi
        docker image rm "$img" >/dev/null || skip "$img: docker image rm refused"
      done
      freed "$s"
    fi
  fi
fi

[ "$apply" = 1 ] || echo "(dry run: nothing removed; rerun with --apply)"
exit "$skipped"
