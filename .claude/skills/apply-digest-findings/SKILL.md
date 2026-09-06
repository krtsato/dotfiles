---
name: apply-digest-findings
description: >-
  mcp-invest-knowledge の講義 digest（`derived/mediable/*-digest.md`）について、PR 本文に
  記録された Codex 監査の指摘を逐語字幕と突合して反映し、機械ゲートを通して PR に積む。
  「digest の指摘を反映して」「未反映の監査指摘を直して」「digest PR を仕上げて」
  「溜まった draft PR を処理して」のようなリクエストで使用。draft PR と merge 済み digest の
  双方に適用できる。監査サービス停止中でも実行可能（新規監査を要さないため）。
  Do NOT use for: digest の新規著述（digest-author.yaml が行う）、technique note の起案、
  監査そのものの実行、mcp-invest-knowledge 以外のリポジトリ。
compatibility: >-
  macOS + Homebrew 環境を前提。`claude` CLI（認証済み）、`gh` CLI（認証済み）、Go 1.26 系、
  `npx`（markdownlint-cli2 を実行）、`timeout`（GNU coreutils）が PATH にあること。
  `~/dev/me/mcp-mediable` と `~/dev/me/dotfiles/.markdownlint.yaml` がローカルに存在すること。
  ネットワークは GitHub と Claude API に到達できればよい（Codex への到達は不要）。
---

# apply-digest-findings: 監査指摘を digest に反映する

## 目次

- [ユースケース](#ユースケース)
- [前提条件](#前提条件)
- [Important: 完了の定義](#important-完了の定義)
- [処理手順](#処理手順)
- [禁止事項](#禁止事項)
- [成功基準](#成功基準)
- [実行チェックリスト](#実行チェックリスト)
- [Troubleshooting](#troubleshooting)

## ユースケース

### Use Case 1: 滞留した draft PR をまとめて仕上げる

- **Trigger**: `digest-author.yaml` が作った draft PR が merge されず溜まっている
- **Steps**: 各 PR 本文から指摘を抽出 → 字幕接地で改稿 → 機械ゲート → 同じブランチに push
- **Result**: 各 PR が「指摘を消化済み」の状態になり、人手レビュー → merge に進める

### Use Case 2: merge 済み digest に残る未反映の指摘を回収する

- **Trigger**: 過去に指摘が未反映のまま merge された digest がある（commit 1 個が目印）
- **Steps**: merge 済み PR 本文から指摘を抽出 → 改稿 → **1 digest = 1 commit** で 1 本の PR に集約
- **Result**: corpus 全体が指摘反映済みになる。down-stream の technique note が誤った知識を入力しない

### Use Case 3: 監査サービス停止中に digest の質を進める

- **Trigger**: Codex が使えず `digest-author.yaml` が新しい draft を作れない
- **Steps**: 既存の指摘一覧は PR 本文にあるので、それを消化する
- **Result**: 停止中でも作業が進む。止まるのは「新しい指摘を出すこと」だけ

## 前提条件

| 要件 | 確認方法 |
| --- | --- |
| `claude` CLI が認証済み | `claude -p --output-format text <<< "OK"` |
| `gh` CLI が認証済み | `gh auth status` |
| Go ツールチェーン | `go version`（1.26 系） |
| `timeout`（GNU coreutils） | `command -v timeout \|\| command -v gtimeout` |
| markdownlint の設定 | `ls ~/dev/me/dotfiles/.markdownlint.yaml` |
| 字幕リポジトリが最新 | `git -C ~/dev/me/mcp-mediable pull --ff-only` |

**字幕リポジトリの最新化は必須。** 手元が古いと新しい講義の字幕が無く、「元字幕が見つからない」
で落ちる（実際に発生した）。

## Important: 完了の定義

**「PR 本文に列挙された指摘を消化したら完了」。再監査で判定しない。**

同一バイト列を 2 回監査すると結果がぶれる（実測 11 本で平均 2.4 件・最大 5 件のずれ。
7 件 → 2 件、6 件 → 9 件の例あり）。「監査が綺麗になるまで回す」は**収束せず、本文の
書き換えが延々と続く**。書き換えるほど元 draft から離れ、字幕への忠実さがむしろ危うくなる。

指摘一覧は有限で確定しているので、その消化は必ず終わる。

**根拠の無い指摘は反映しない。** 推測で埋めると、このパイプラインが防ごうとしている捏造そのものになる。
反映できなかった指摘はその旨を報告する。

## 処理手順

### ステップ1: 指摘を取り出す

PR 本文の表から抽出する。**本文の形式が 2 種類ある**ので両方に対応する。

```bash
# 新形式（4 列・初回監査を <details> で折りたたむ）
gh pr view "$PR" --json body --jq '.body' | sed -n '/^## Codex/,/^<details>/p' \
  | grep -E '^\| (高|中|低) \|'

# 旧形式（3 列・<details> なし。セクション末尾まで）
gh pr view "$PR" --json body --jq '.body' | sed -n '/^## Codex/,$p' \
  | grep -E '^\| (高|中|低) \|'
```

### ステップ2: 元字幕を引く

**digest の id8 で字幕フォルダを検索しても絶対に見つからない。** 層が違うため。
必ず `> 動画:` 行の video id で引く（詳細は memory `three-id-layers-caption-vault-digest`）。

```bash
vid="$(sed -nE 's#^> 動画:.*(youtu\.be/|watch\?v=)([A-Za-z0-9_-]{11}).*#\2#p' "$digest" | sed -n 1p)"
src="$(grep -l -F "$vid" ~/dev/me/mcp-mediable/captions/normalized/*.md | sed -n 1p)"
grep -E '^\[[0-9]+:[0-9]{2}' "$src" > "$W/transcript.txt"
```

### ステップ3: 改稿プロンプトを組む

以下の拘束を**すべて**入れる。後半 3 つは実際に落ちた原因への対策。

```text
- 指摘 1 件ずつに対応する。字幕に根拠がある変更のみ行う。根拠が見つからない指摘は
  反映せず本文をそのまま残す（推測で埋めない）。
- 指摘に無い箇所は書き換えない（差分を最小にする）。
- `> 動画:` 行と `> 出典:` 行は一字一句変更しない。
- front matter の content_type と published_at は変更しない。
- 出力は digest の Markdown 全文のみ。1 行目は必ず `---`。前置き・差分の説明・
  コードフェンスを書かない。
- 要点と原則系セクションの箇条書きは 1 つ残らず [m:ss] 錨を持つこと。
- 錨を 2 つ以上続けて書かない（[1:37][18:20] は参照リンクと解釈され書式検査に落ちる）。
```

呼び出しは時間上限を切る。

```bash
timeout --kill-after=30 1800 claude -p --model claude-opus-4-8 --output-format text \
  < "$W/prompt.md" > "$W/revised.md"
```

### ステップ4: 前置きを機械的に除去する

拘束しても LLM は前置きを書くことがある（実測 17 本中 3 本）。1 行目が `---` でなければ、
最初の `---` 行までを削る。**内容ではなく包装を落とすだけ**で、後段のゲートも通す。

```bash
if [ "$(head -n1 "$W/revised.md")" != "---" ]; then
  ln="$(grep -n -m1 -x -- '---' "$W/revised.md" | cut -d: -f1)"
  [ -n "$ln" ] && tail -n +"$ln" "$W/revised.md" > "$W/t" && mv "$W/t" "$W/revised.md"
fi
```

### ステップ5: 機械ゲート（この順序で）

```bash
# 1) provenance が一字一句同じか
grep -Fxq "$(grep -m1 '^> 動画:' "$W/current.md")" "$W/revised.md" || fail
grep -Fxq "$(grep -m1 '^> 出典:' "$W/current.md")" "$W/revised.md" || fail

# 2) 保護フィールドが不変か（published_at は derive-check を素通りする）
fm() { sed -n "2,/^---$/{s/^$2:[[:space:]]*//p;}" "$1" | sed -n 1p; }
for k in content_type published_at; do
  [ "$(fm "$W/current.md" "$k")" = "$(fm "$W/revised.md" "$k")" ] || fail
done

# 3) 書式 → 内容 → 書式検証
npx markdownlint-cli2 --fix --config ~/dev/me/dotfiles/.markdownlint.yaml "$W/revised.md"
go run ./cmd/knowledge-derive-check --derived "$W/scope" --vault "$W/vault" || fail
npx markdownlint-cli2 --config ~/dev/me/dotfiles/.markdownlint.yaml "$W/revised.md" || fail
```

**`published_at` は `derive-check` を素通りする。** 1999 年に書き換えても "all digests valid"
と出る（実測）。ここで自前に比較しないと、講義日が黙って書き換わる。

**ゲートに落ちたら修正前を残す。** 改稿は改善の試みであって、新しい失敗経路にしない。
**落ちた出力は捨てずに保存する**（原因が複数あり、推測で 1 つに決めると残りが直らない）。

### ステップ6: 再試行

`claude -p` は確率的で、1 回目がゲートに落ちても 2 回目で通ることがある
（実測 17 本中 4 本が該当し、再試行で全て成功）。**1 回だけ**再試行する。

### ステップ7: PR にする

- **1 digest = 1 commit**。内容忠実性は機械検証できず、人手の commit 単位レビューが前提
- draft PR への追記なら push のみ。merge 済み digest なら新しいブランチに全件まとめて 1 PR
- PR 本文に「再監査していない・残指摘の件数は未知」と明記する
- Copilot をレビュワーに追加し、指摘をトリアージしてから merge する

## 禁止事項

- **対話用の説明書式を digest 本文に書かない。** `★ Insight` ブロックが実際に 2 本混入していた
  （「指摘4 は…という指示に忠実に」という改稿の弁明）。digest は「本文はすべて字幕に接地している」
  という契約の文書であり、接地していない文章が入ると契約自体が壊れる。
- **編集者向け TODO を残さない。** 「（音声要確認）」のような書き方をしない。
  分からないなら「字幕からは判別できない」と事実として書く。
- **未定義の略語を導入しない。** 実例: `PER（PR）` の `PR` がどこにも定義されていなかった。
- **根拠の無い指摘を推測で埋めない。**

## 成功基準

**定量**:

- 対象 PR の指摘を 100% 消化（反映または「根拠なし」として明示的に却下）
- `knowledge-derive-check` が corpus 全体で "all digests valid"
- `markdownlint` が `derived/mediable/*.md` 全件で 0 issues
- 混入検査（`★ Insight` / `指摘N` の参照）が corpus 全体で 0 件

**定性**:

- 人手レビュアーが commit 単位で差分を追え、字幕との突合が可能
- 元 draft から離れすぎておらず、差分が指摘の範囲に収まっている
- ユーザーが追加の指示を出さずに済む（前置き除去・再試行が自動で回る）

## 実行チェックリスト

- [ ] `mcp-mediable` を最新化した
- [ ] 前提条件の CLI・設定がすべて揃っている
- [ ] PR 本文の形式（新／旧）を判別して指摘を抽出した
- [ ] video id で元字幕を引いた（id8 で検索していない）
- [ ] 改稿プロンプトに 7 つの拘束をすべて入れた
- [ ] 前置き除去を通した
- [ ] provenance・保護フィールド・書式・内容の 4 つのゲートを通した
- [ ] ゲート落ちの出力を保存し、原因を個別に確認した
- [ ] 1 digest = 1 commit にした
- [ ] corpus 全体で混入検査を実行した
- [ ] PR 本文に「再監査していない」と明記した
- [ ] Copilot レビューをトリアージしてから merge した

## Troubleshooting

### Error: `元字幕が見つからない` / `grep -l` が 0 件

**Cause**: 手元の `mcp-mediable` が古く、新しい講義の字幕が無い。または digest の id8 で
字幕フォルダを検索している（層が違うので絶対に一致しない）。

**Solution**:

1. `git -C ~/dev/me/mcp-mediable pull --ff-only`
2. 検索は必ず `> 動画:` 行の video id で行う（ステップ2 参照）

### Error: `derive-check` が `every 要点/principle bullet must carry a [m:ss] anchor`

**Cause**: 改稿で錨の無い箇条書きが混ざった。

**Solution**: 修正前を残したうえで 1 回だけ再試行する。プロンプトの「1 つ残らず錨を持つこと」
が抜けていないか確認する。

### Error: `markdownlint` が `MD052/reference-links-images`

**Cause**: 錨が 2 つ連続している（`[1:37][18:20]` が参照リンクと解釈される）。

**Solution**: bullet を分けてそれぞれに 1 つずつ錨を付けるよう、プロンプトで明示する。

### Error: ゲートが `no front matter` で落ちる

**Cause**: LLM が出力の先頭に説明文を書いた。

**Solution**: ステップ4 の前置き除去が入っているか確認する。除去後も落ちる場合は
出力を保存して中身を見る（コードフェンスで包んでいる可能性）。

### Error: `no derived digests found`

**Cause**: 検査用に置いたファイル名が `.md` で終わっていない（vault walker は `.md` しか拾わない）。

**Solution**: 検査時は**最終的な digest ファイル名**で staging する。作業用の中間名のまま
渡さない。
