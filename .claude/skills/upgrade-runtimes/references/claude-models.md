# Claude のモデルを同じ系統の最新へ上げる

定期実行やスクリプトが `claude -p --model <ID>` で呼ぶモデルは、**ID を固定して書いた時点で古くなり始める**。
2026-10-26、講義まとめのワークフローが `claude-opus-4-8` のまま、最新の Opus 5.5 より 2 世代前で動いていた
（mcp-invest-knowledge #585 で修正）。誰も気づかなかったのは、古いモデルでも**失敗せずに動き続ける**から。

## 方針 — 系統は変えず、版だけ上げる

| 変えてよい | 変えない |
| --- | --- |
| 同じ系統の中での版（Opus 5 → 5.5、Fable 5 → 5.1） | 系統そのもの（Opus → Sonnet 等）。費用と品質の釣り合いを持ち主が選んだ結果なので、版上げの作業で動かさない |

系統を変えたいときは別の依頼として持ち主に確かめる。

## 1. 使われている ID を洗い出す

```bash
cd ~/dev/me
grep -rnE "claude-(opus|sonnet|haiku|fable)-[0-9]" . \
  --include='*.sh' --include='*.y*ml' --include='*.go' --include='*.py' \
  --include='*.ts' --include='*.js' --include='*.toml' --include='*.json' \
  --exclude-dir=.worktrees --exclude-dir=actions-runners --exclude-dir=node_modules --exclude-dir=.git
```

**コミットの共著者の表記も同時に拾う。** 表記は ID とは別の文字列なので上の grep には出ない。

```bash
grep -rn "Co-Authored-By: Claude" . --include='*.sh' --include='*.y*ml' \
  --exclude-dir=.worktrees --exclude-dir=actions-runners --exclude-dir=.git
```

| 見つかったもの | 扱い |
| --- | --- |
| 版付きの ID（`claude-opus-4-8`） | 上げる対象 |
| 別名（`--model opus` など版の無い指定） | 何もしない。CLI が最新へ解決する |
| 共著者の表記 | **そのスクリプトが実際に使うモデル**に合わせる。会話しているモデルの名前を書かない（2026-10-26、ノートを書くのは Fable なのに Opus と記録していた） |

`actions-runners/` と `.worktrees/` は作業コピーなので数えない（手順 1 と同じ理由）。

## 2. 同じ系統の最新を確かめる

**記憶で書かない。** 次のどちらかで確かめる。

| 確かめ方 | 中身 |
| --- | --- |
| 公式のモデル一覧 | `https://docs.claude.com/en/docs/about-claude/models/overview` |
| 会話の環境欄 | Claude Code が起動時に示す「最新のモデル ID」の一覧 |

## 3. 呼べることを確かめる

ID が実在しても、**手元の CLI が古いと呼べない**ことがある。書き換える前に 1 回呼ぶ。

```bash
printf 'Reply with the single word: OK\n' | gtimeout 120 claude -p --model <新しい ID> --output-format text
```

`OK` が返らなければ書き換えない。`claude --version` を確かめ、CLI を上げてからやり直す。

## 4. 書き換えて PR にする

| 直す場所 | 例 |
| --- | --- |
| ワークフローの入力の既定値と `env` の既定値 | `default: 'claude-opus-5-5'`・`${{ inputs.model \|\| 'claude-opus-5-5' }}` |
| スクリプトの既定値と、それを説明するコメント | `MODEL="${MODEL:-claude-opus-5-5}"` |
| 共著者の表記 | `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` |

書き換えたら手順 1 の grep をもう一度流し、**古い ID が 0 件**であることを確かめる。

PR の本文には次を書く。

- どの ID から どの ID へ
- 手順 3 の結果
- **思考量の既定が変わったか**。同じ系統でも版で既定が違うことがある（Opus 4.8 は `high`、Opus 5.5 は `medium`）。品質が落ちたと感じたら思考量を明示する
