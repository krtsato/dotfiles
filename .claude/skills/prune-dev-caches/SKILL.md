---
name: prune-dev-caches
description: >-
  開発用の Mac で、使うたびに増えて誰も片付けない**取り直せる置き場**を片付ける。
  対象は uv の cache（`uv cache clean`）、mise の不要な版（`mise prune`）、npx の取得物、
  Xcode の DerivedData、GitHub Actions の自宅 Mac の runner に残る古い本体・更新用の写し・
  使っていない Go、どこにも書かれていない Docker の土台イメージの 6 種。既定は一覧と大きさを
  出すだけで、`--apply` のときだけ消す。使用中のものは種類ごとに確かめて残す。
  "キャッシュを掃除して" / "ディスクを空けたい" / "定期の片付け" / "uv cache を消して" /
  "runner が太っている" / "DerivedData を消して" のようなリクエストや、月 1 回の保守で使用。
  Do NOT use for: `~/.claude` の片付け（prune-agent-storage を使う）、Homebrew の
  `brew cleanup`、Go のモジュール・ビルドの cache、会話の記録（Claude・Codex）の削除、
  版を上げる作業（upgrade-runtimes を使う）。
compatibility: >-
  macOS（`/bin/bash` 3.2、BSD の `find`・`df`・`stat`）。`jq`、`gh`（認証済み）、`lsof`、
  `uv`、`mise`、`docker`、`rg` を使う。Docker の判定は upgrade-runtimes の
  `scripts/find-unused-base-images.sh` を呼ぶ。runner の作業フォルダは `~/dev/me/<repo>/actions-runners`
  （`DEV_ROOT` で変えられる）。
allowed-tools: Bash(~/.claude/skills/prune-dev-caches/scripts/prune-dev-caches.sh:*), Bash(bash:*), Bash(df:*), Bash(du:*)
---

# 開発用の置き場を片付ける

スクリプト 1 本を、まず**見るだけ**で流し、確かめてから `--apply` で消す。6 種それぞれの「使用中」の確かめ方は
スクリプトが持ち、疑わしい種類は消さずに `skip:` で理由を出す。種類ごとの細則は [種類ごとの決まり](#種類ごとの決まり)、
試験の場面は [references/evaluations.md](references/evaluations.md)。

## 目次

- [前提](#前提)
- [注意 — 消す前に必ず確かめること](#注意--消す前に必ず確かめること)
- [手順](#手順)
- [種類ごとの決まり](#種類ごとの決まり)
- [使用例](#使用例)
- [実行チェックリスト](#実行チェックリスト)
- [完了の基準](#完了の基準)

## 前提

| 必要なもの | 確かめ方 |
| --- | --- |
| `jq`・`lsof`・`uv`・`mise`・`docker`・`rg` | `command -v jq lsof uv mise docker rg` |
| `gh` の認証（runner の待機中を GitHub に問い合わせる） | `gh auth status` |
| upgrade-runtimes の `scripts/find-unused-base-images.sh`（Docker の判定） | `test -x ~/.claude/skills/upgrade-runtimes/scripts/find-unused-base-images.sh` |

## 注意 — 消す前に必ず確かめること

| 状況 | 起きること | 対処 |
| --- | --- | --- |
| uv の鍵を誰かが持っている | `uv cache clean` が待ちで失敗する | スクリプトが**鍵を持つ会話のフォルダと端末**を出す。uvx で起動する MCP サーバーは会話の間ずっと鍵を持つので、その会話を閉じてから流し直す |
| Xcode か xcodebuild が動いている | 使用中の DerivedData を消す | スクリプトが Xcode 分を飛ばす。閉じてから流し直す |
| runner が job を実行中（待機中でない）、または夜間の時間帯 | 実行中の job を壊す | スクリプトが runner 分を飛ばす。昼間に流し直す |
| Docker の判定が `check-by-eye` か失敗 | 使用中の土台を消す | スクリプトが Docker 分を消さない。出た `FROM` を読んでから手で消す |

どれかを飛ばした回は**終了コード 1** で終わる。飛ばした理由は出力の `skip:` の行にある。

## 手順

1. **見るだけで流す。** 何がどれだけ消えるかを確かめる。

   ```bash
   bash ~/.claude/skills/prune-dev-caches/scripts/prune-dev-caches.sh
   ```

2. **`skip:` を読む。** 上の表の対処をしてから、同じコマンドを流し直す。消すものが無い種類は `nothing to prune` か `0 of N` と出る。

3. **消す。** 種類を絞るときは `--only` を付ける。

   ```bash
   bash ~/.claude/skills/prune-dev-caches/scripts/prune-dev-caches.sh --apply
   bash ~/.claude/skills/prune-dev-caches/scripts/prune-dev-caches.sh --only uv,npx --apply
   ```

4. **確かめる。** 見るだけで流し直し、消した種類が `0 of N`（または `nothing to prune`）になったこと、
   runner を触った回は全台が待機中（online・busy=false）に戻ったことを見る。

   ```bash
   bash ~/.claude/skills/prune-dev-caches/scripts/prune-dev-caches.sh
   gh api repos/<owner>/<repo>/actions/runners --jq '.runners[] | "\(.name) \(.status) busy=\(.busy)"'
   ```

5. **報告する。** 種類ごとの `freed`（空いた量）と、飛ばした種類とその理由を伝える。

## 種類ごとの決まり

| 種類 | 消すもの | 残すもの | 決まりの根拠 |
| --- | --- | --- | --- |
| uv | cache 全部 | なし（次に使うとき取り直す） | 鍵が外れていれば全消しが最も単純。日付で選ぶ公式の手段は無い |
| mise | `mise ls --prunable` に出る版 | 設定が求める版 | mise 自身の判定に従う |
| npx | 30 日触っていない取得物 | 実行中のプロセスの引数に出る取得物 | 30 日は月 1 回の保守の間隔。使い続けているものは日付が新しく残る |
| Xcode | 30 日触っていない DerivedData | それ以外 | 同上。消すと次の組み立てが 1 回遅くなるだけ |
| runner | リンクが指していない古い `bin.*`・`externals.*`、`_work/_update`、ワークフローの `go-version` に無い Go | 使用中の版、`go-version` の版 | `go-version` に `1.27` のような省略・matrix・`go-version-file` があると要る版が決まらないので Go を残す。夜間（01:30〜09:30）は自動の job が走るので触らない |
| Docker | `find-unused-base-images.sh` が `unused` とした土台 | `used`・`held`、コンテナが使う土台 | 判定の中身は upgrade-runtimes の `references/docker-images.md` |

## 使用例

| 入力 | 期待する出力 |
| --- | --- |
| 「キャッシュを掃除して」 | 見るだけで流し、種類ごとの件数と大きさ、`skip:` の理由を表で示す。消すかどうかを聞いてから `--apply` |
| 「uv cache を消して」（AWS の MCP を積んだ会話が開いている） | `skip: the cache is locked by:` と、鍵を持つ会話（例: `Claude Code in /Users/me/dev/me (ttys001)`）を示し、閉じてから流し直すよう伝える |
| 「runner の残骸を消して」（昼間・全台待機中） | `--only runner --apply` で台ごとの `freed` を示し、全台が待機中に戻ったことを確かめる |

## 実行チェックリスト

- [ ] 見るだけで流し、種類ごとの件数と大きさを確かめた
- [ ] `skip:` の行を読み、対処した（または飛ばしたまま報告する）
- [ ] `--apply` で消した（種類を絞るなら `--only`）
- [ ] 見るだけで流し直し、消した種類が 0 件になった
- [ ] runner を触った回は、全台が待機中に戻った
- [ ] 種類ごとの空いた量と、飛ばした理由を報告した

## 完了の基準

- 消した種類が、流し直した一覧で 0 件（`0 of N` か `nothing to prune`）
- 飛ばした種類があれば、その理由と対処が報告に入っている
- runner を触った回は、全台が待機中に戻っている

試験の場面は [references/evaluations.md](references/evaluations.md)。
