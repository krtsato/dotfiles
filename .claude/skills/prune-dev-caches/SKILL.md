---
name: prune-dev-caches
description: >-
  開発用の Mac で、使うたびに増えて誰も片付けない**取り直せる置き場**を片付ける。
  対象は uv の cache（`uv cache clean`）、mise の不要な版（`mise prune`）、npx の取得物、
  npm の取得の cache、Xcode の DerivedData、iOS の端末ごとの古い DeviceSupport、goimports の索引、
  GitHub Actions の自宅 Mac の runner に残る古い本体・更新用の写し・使っていない Go、
  どこにも書かれていない Docker の土台イメージ、どのイメージも使わない Docker のビルドの cache、
  Chrome の cache の 11 種。既定は一覧と大きさを出すだけで、`--apply` のときだけ消す。
  使用中のものは種類ごとに確かめて残す（Chrome は終了していなければ飛ばし、自分では終了させない）。
  Go のビルドの cache は**大きさを測って 10 GB を超えたら警告するだけ**で、消さない。
  "キャッシュを掃除して" / "ディスクを空けたい" / "定期の片付け" / "uv cache を消して" /
  "runner が太っている" / "DerivedData を消して" / "Chrome のキャッシュを消して" /
  "ディスクが逼迫している" のようなリクエストや、月 1 回の保守で使用。
  Do NOT use for: `~/.claude` の片付け（prune-agent-storage を使う）、Homebrew の
  `brew cleanup`、Go のモジュールの cache、Chrome の履歴・cookie・ログイン情報の削除、
  会話の記録（Claude・Codex）の削除、版を上げる作業（upgrade-runtimes を使う）。
compatibility: >-
  macOS（`/bin/bash` 3.2、BSD の `find`・`df`・`stat`）。`jq`、`gh`（認証済み）、`lsof`、
  `uv`、`mise`、`npm`、`docker`、`rg` を使う。Docker の判定は upgrade-runtimes の
  `scripts/find-unused-base-images.sh` を呼ぶ。runner の作業フォルダは `~/dev/me/<repo>/actions-runners`
  （`DEV_ROOT` で変えられる）。
allowed-tools: Bash(~/.claude/skills/prune-dev-caches/scripts/prune-dev-caches.sh:*), Bash(bash:*), Bash(df:*), Bash(du:*)
---

# 開発用の置き場を片付ける

スクリプト 1 本を、まず**見るだけ**で流し、確かめてから `--apply` で消す。11 種それぞれの「使用中」の確かめ方は
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
| `jq`・`lsof`・`uv`・`mise`・`npm`・`docker`・`rg` | `command -v jq lsof uv mise npm docker rg` |
| `gh` の認証（runner の待機中を GitHub に問い合わせる） | `gh auth status` |
| upgrade-runtimes の `scripts/find-unused-base-images.sh`（Docker の判定） | `test -x ~/.claude/skills/upgrade-runtimes/scripts/find-unused-base-images.sh` |

## 注意 — 消す前に必ず確かめること

| 状況 | 起きること | 対処 |
| --- | --- | --- |
| uv の鍵を誰かが持っている | `uv cache clean` が待ちで失敗する | スクリプトが**鍵を持つ会話のフォルダと端末**を出す。uvx で起動する MCP サーバーは会話の間ずっと鍵を持つので、その会話を閉じてから流し直す |
| Xcode か xcodebuild が動いている | 使用中の DerivedData・DeviceSupport を消す | スクリプトが Xcode の 2 種を飛ばす。閉じてから流し直す |
| npm の処理が動いている（取得物を起動し終えた `npm exec`・`npm x` を除く） | 使用中の cache を消してその処理が壊れる | スクリプトが npm 分を飛ばし、そのコマンドを出す。命令の種類は列挙せず、npm なら何でも止める。例外の `npm exec` は、npx の置き場（`_npx/<番号>/node_modules/.bin/`）のプログラムを子として起動済みのもの（会話の間ずっと動く npx の MCP サーバー）だけ。取得中に動く git などの子は印にならない。状態行などの短い `npm exec` に当たったら数秒後に流し直す |
| gopls か goimports が動いている | 書き込み中の索引を消す | スクリプトが goimports 分を飛ばす。エディタを閉じてから流し直す |
| `docker build` が動いている | 組み立て中の cache を消す | スクリプトがビルドの cache 分を飛ばす |
| Chrome が動いている | 使用中の cache を消す | スクリプトが Chrome 分を飛ばす。**ユーザーの了承を得てから** `osascript -e 'tell application "Google Chrome" to quit'` で通常の終了をさせ（強制終了しない。タブの記録が書き終わる）、流し直した後に `open -a "Google Chrome"` で起動し直す |
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
   `warn:` の行が出ていれば、Go のビルドの cache の大きさと消すコマンドを添え、消すかどうかを聞く。

## 種類ごとの決まり

| 種類 | 消すもの | 残すもの | 決まりの根拠 |
| --- | --- | --- | --- |
| uv | cache 全部 | なし（次に使うとき取り直す） | 鍵が外れていれば全消しが最も単純。日付で選ぶ公式の手段は無い |
| mise | `mise ls --prunable` に出る版 | 設定が求める版 | mise 自身の判定に従う |
| npx | 30 日触っていない取得物 | 実行中のプロセスの引数に出る取得物 | 30 日は月 1 回の保守の間隔。使い続けているものは日付が新しく残る |
| npm | 取得の cache（`~/.npm/_cacache`）全部を `npm cache clean --force` で | なし（次の取得で取り直す） | 中身は取得物の写しだけ。npx の取得物（`_npx`）は別の置き場で、上の行が扱う |
| Xcode | 30 日触っていない DerivedData | それ以外 | 同上。消すと次の組み立てが 1 回遅くなるだけ |
| DeviceSupport | 名前が `<機種> <版> (<build>)` の形のうち、機種ごとに最新の iOS 以外 | 機種ごとの最新の版、形の違う名前（機種名の無い古い形など） | 端末をつなぐと Xcode が端末から写し直す。iOS を上げるたびに 1 版あたり数 GB 増える（2026-11-24 に 2 版で消した） |
| goimports | 索引（`~/Library/Caches/goimports`）全部 | なし | エディタが必要なときに作り直す |
| runner | リンクが指していない古い `bin.*`・`externals.*`、`_work/_update`、ワークフローの `go-version` に無い Go | 使用中の版、`go-version` の版 | `go-version` に `1.27` のような省略・matrix・`go-version-file` があると要る版が決まらないので Go を残す。夜間（01:30〜09:30）は自動の job が走るので触らない |
| Docker | `find-unused-base-images.sh` が `unused` とした土台 | `used`・`held`、コンテナが使う土台 | 判定の中身は upgrade-runtimes の `references/docker-images.md` |
| ビルドの cache | `docker builder prune -f` が消す分（どのイメージも使っていない cache） | 今あるイメージの組み立てに使う cache | `--all` を付けないので、次の組み立ては速いまま。2026-11-24 は 4.8 GB が 2.2 GB に減った |
| Chrome | `~/Library/Caches/Google/Chrome` の中身全部 | 履歴・cookie・ログイン情報（`Application Support` 側にあり触らない） | 閲覧するたびに増え、2026-11-24 は 9.3 GB あった。消すとサイトの初回表示が 1 回遅くなるだけ |
| Go のビルドの cache | **なし（警告だけ）**。`GO_CACHE_WARN_GB`（既定 10）を超えると `warn:` と消すコマンドを出す | 全部 | Go は 5 日使われなかったものしか消さないので、毎日ビルドすると減らない（2026-11-14 に 31 GB でディスクの空きが 3 GB まで減った）。ビルドの最中に消すとそのビルドが壊れるため、`go build`・`go test` が走っておらず runner が全台待機中のときに、人が `go clean -cache` を流す |

## 使用例

| 入力 | 期待する出力 |
| --- | --- |
| 「キャッシュを掃除して」 | 見るだけで流し、種類ごとの件数と大きさ、`skip:` の理由を表で示す。消すかどうかを聞いてから `--apply` |
| 「uv cache を消して」（AWS の MCP を積んだ会話が開いている） | `skip: the cache is locked by:` と、鍵を持つ会話（例: `Claude Code in /Users/me/dev/me (ttys001)`）を示し、閉じてから流し直すよう伝える |
| 「runner の残骸を消して」（昼間・全台待機中） | `--only runner --apply` で台ごとの `freed` を示し、全台が待機中に戻ったことを確かめる |
| 「Chrome のキャッシュを消して」（Chrome が起動中） | `skip: Chrome is running` を受けて、終了させてよいか聞く。了承後に通常の終了 → `--only chrome --apply` → 起動し直し、空いた量と「タブは履歴から戻せる」ことを伝える |

## 実行チェックリスト

- [ ] 見るだけで流し、種類ごとの件数と大きさを確かめた
- [ ] `skip:` の行を読み、対処した（または飛ばしたまま報告する）
- [ ] `--apply` で消した（種類を絞るなら `--only`）
- [ ] 見るだけで流し直し、消した種類が 0 件になった
- [ ] runner を触った回は、全台が待機中に戻った
- [ ] Chrome を終了させた回は、起動し直した
- [ ] 種類ごとの空いた量と、飛ばした理由を報告した

## 完了の基準

- 消した種類が、流し直した一覧で 0 件（`0 of N` か `nothing to prune`）
- 飛ばした種類があれば、その理由と対処が報告に入っている
- runner を触った回は、全台が待機中に戻っている
- Chrome を終了させた回は、起動し直している

試験の場面は [references/evaluations.md](references/evaluations.md)。
