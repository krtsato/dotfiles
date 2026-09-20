# ログの形式と抽出方法

`harvest-lessons` が読む 4 つのログファイルのスキーマと、抽出コマンドの例をまとめる。

## 対象ログ一覧

| ソース | パス | 形式 | 内容 |
| --- | --- | --- | --- |
| Codex プロンプト履歴 | `~/.codex/history.jsonl` | 1 行 1 JSON | `{"session_id","ts"(unix 秒),"text"}` |
| Codex のセッション全文（`rollout-*.jsonl`） | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | 1 行 1 JSON（イベント列） | 大きい。必要時のみ個別参照する |
| Claude Code プロンプト履歴 | `~/.claude/history.jsonl` | 1 行 1 JSON | ユーザープロンプト履歴 |
| Claude Code のセッション全文（session jsonl） | `~/.claude/projects/<プロジェクト>/<session-id>.jsonl` | 1 行 1 JSON（イベント列） | 大きい。必要時のみ個別参照する |

「セッション全文」は `rollout-*.jsonl` と Claude Code の session jsonl の総称。

## Codex プロンプト履歴（`~/.codex/history.jsonl`）

| フィールド | 型 | 内容 |
| --- | --- | --- |
| `session_id` | string | セッション識別子。セッション全文へ突合する際のキー |
| `ts` | number | unix 秒のタイムスタンプ |
| `text` | string | ユーザーが入力したプロンプト本文 |

抽出例（前回実行時刻 `$LAST_RUN` 以降のプロンプトを抽出する）:

```sh
jq -c --argjson since "$LAST_RUN" 'select(.ts > $since)' ~/.codex/history.jsonl
```

## Claude Code プロンプト履歴（`~/.claude/history.jsonl`）

| フィールド | 型 | 内容 |
| --- | --- | --- |
| `display` | string | ユーザープロンプト本文 |
| `timestamp` | string または number | 記録時刻。実装により ISO 8601 文字列と unix 秒が混在し得るため、比較前に形式を確認する |
| `project` | string | 実行時のプロジェクトパス |

抽出例:

```sh
jq -c --argjson since "$LAST_RUN" 'select((.timestamp | tonumber? // (. | fromdateiso8601? // 0)) > $since)' ~/.claude/history.jsonl
```

## セッション全文（`rollout-*.jsonl` / session jsonl）

どちらもイベントを 1 行 1 JSON で並べた形式で、ユーザー発話・アシスタント発話・ツール呼び出しが混在する。
プロンプト履歴だけでは前後の文脈（何が原因で訂正が発生したか）が分からない場合に、該当 `session_id` のファイルを個別に開いて読む。

| 用途 | 参照するフィールドの目安 |
| --- | --- |
| 発話の種類を見分ける | イベントの role や type に相当するキー（実装によって名称が異なるため、対象ファイルの先頭数行を確認してから抽出する） |
| 該当プロンプトの前後を追う | タイムスタンプでプロンプト履歴の 1 行と突合する |

セッション全文は 1 ファイルが大きくなりやすいため、全文を読み込まず `jq` や `grep` で該当箇所だけを抜き出す。
