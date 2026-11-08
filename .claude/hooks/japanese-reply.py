#!/usr/bin/env python3
"""Refuse chat text that is written in English.

Replies drifted into English 14 times in a month even though the rule was in
CLAUDE.md and in memory. A rule that is read is not a rule that is checked, so
this hook checks it mechanically. One script serves three events:

  MessageDisplay  store each displayed line under its message id.
  PreToolUse      judge the stored text not yet judged; deny the call when it
                  is English, so the model rewrites it in Japanese first.
                  The last line of a message arrives with its final flush,
                  about 0.7 s after the PreToolUse of the call right after it,
                  so English is usually denied one call late. Waiting instead
                  would delay every call that has no text before it.
  Stop            judge last_assistant_message (the final report); block once
                  or twice so the model rewrites it.

The transcript is not used: text written after a thinking block is not in it
when the tool call starts (a probe found none of 7 such texts). MessageDisplay
gets every displayed line.

Code, inline code, URLs and paths are removed before counting. Text counts as
English when it has at least MIN_WORDS English words and fewer Japanese
characters than English words. Against this session's 28 replies it flagged
the 9 English ones and none of the 19 Japanese ones.

Subagents are skipped: their text is not shown to the user.
Exits 0 in every path. A checker must never break the turn.
"""

import glob
import json
import os
import re
import sys
import tempfile

MIN_WORDS = 8
MAX_STOP_BLOCKS = 2  # per stop sequence, so a false positive cannot loop forever

# A block still streaming has no closing fence yet; treat it as code to the end.
FENCE = re.compile(r"```.*?(?:```|\Z)", re.S)
INLINE = re.compile(r"`[^`\n]*`")
URL = re.compile(r"https?://\S+")
PATH = re.compile(r"(?:~|\.{0,2})?/[\w.\-/]+|[\w\-]+\.(?:md|json|ya?ml|sh|py|go|ts|toml)\b")
JA = re.compile(r"[぀-ヿ㐀-鿿ｦ-ﾟ]")
EN_WORD = re.compile(r"[A-Za-z]{2,}")

REASON = (
    "チャットの文が英語になっている（冒頭: 「{excerpt}」）。"
    "ユーザーへの文はツールの合間の 1 文も含めてすべて日本語で書く。"
    "謝罪は書かず、同じ内容を日本語で書き直してから続ける。"
    "コミットメッセージ・PR の題・コード内のコメントは英語のままでよい。"
)


def is_english(text):
    body = PATH.sub(" ", URL.sub(" ", INLINE.sub(" ", FENCE.sub(" ", text))))
    words = len(EN_WORD.findall(body))
    return words >= MIN_WORDS and len(JA.findall(body)) < words


def state_dir(session_id):
    path = os.path.join(tempfile.gettempdir(), "claude-japanese-reply", re.sub(r"[^\w-]", "_", session_id))
    os.makedirs(path, exist_ok=True)
    return path


def unflagged_messages(directory):
    """Return {path: full text} for displayed messages not yet denied.

    A message is kept whole until Stop and judged again as lines arrive: its
    last line comes late, and halves judged apart can each fall under
    MIN_WORDS while the whole message does not.
    """
    messages = {}
    for path in sorted(glob.glob(os.path.join(directory, "*.txt")), key=os.path.getmtime):
        if os.path.exists(path + ".denied"):
            continue
        with open(path, encoding="utf-8") as f:
            messages[path] = f.read()
    return messages


def forget_messages(directory):
    for path in glob.glob(os.path.join(directory, "*.txt*")):
        os.remove(path)


def english_reason(texts):
    english = [t for t in texts if is_english(t)]
    if not english:
        return None
    excerpt = next(line for line in english[-1].splitlines() if line.strip()).strip()[:80]
    return REASON.format(excerpt=excerpt)


def stop_blocks_so_far(directory, stop_hook_active):
    """Count blocks within one stop sequence; a stop not caused by this hook resets it."""
    path = os.path.join(directory, "stop-blocks")
    count = 0
    if stop_hook_active:
        try:
            with open(path) as f:
                count = int(f.read())
        except (OSError, ValueError):
            pass
    with open(path, "w") as f:
        f.write(str(count + 1))
    return count


def main():
    payload = json.load(sys.stdin)
    if payload.get("agent_id"):
        return
    event = payload.get("hook_event_name")
    directory = state_dir(payload.get("session_id", "unknown"))

    if event == "MessageDisplay":
        name = re.sub(r"[^\w-]", "_", payload.get("message_id", "unknown"))
        with open(os.path.join(directory, name + ".txt"), "a", encoding="utf-8") as f:
            f.write(payload.get("delta", ""))
        return

    if event == "PreToolUse":
        messages = unflagged_messages(directory)
        reason = english_reason(list(messages.values()))
        if reason:
            for path, text in messages.items():
                if is_english(text):
                    open(path + ".denied", "w").close()
            print(json.dumps({"hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
            }}, ensure_ascii=False))
        return

    if event == "Stop":
        texts = list(unflagged_messages(directory).values()) + [payload.get("last_assistant_message") or ""]
        forget_messages(directory)
        reason = english_reason(texts)
        if reason and stop_blocks_so_far(directory, payload.get("stop_hook_active")) < MAX_STOP_BLOCKS:
            print(json.dumps({"decision": "block", "reason": reason}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception:  # noqa: BLE001 - a checker must never break the turn
        pass
