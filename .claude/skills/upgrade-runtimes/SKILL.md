---
name: upgrade-runtimes
description: >-
  `~/dev/me` 配下の 11 リポ（mcp-tradingview / mcp-invest-knowledge / mcp-mediable /
  mcp-note / mcp-seeking-alpha / mcp-youtube / mcp-notebooklm / trade-moomoo / watcher /
  securerc / mdreview）で、Go・Python・Node・GitHub Actions のステップ・Docker イメージなど**固定された版を上げる**。あわせて
  自宅 Mac の runner（self-hosted）の PATH を点検する。「Go を上げて」「Python を上げて」
  「actions の版を上げて」「golangci-lint を上げて」「手元と CI で lint の結果が違う」
  「runner が古い」「定期実行が版のせいで落ちた」「Docker イメージの版を上げて」
  「使われない Docker イメージを消して」「最新の Opus にして」のような
  リクエストで使用。扱うファイルは `go.mod` / `.github/workflows/*.yaml` / `Dockerfile*` /
  `mise.toml` / `.golangci.yml` / `package.json`（`engines`）/ runner の `.path` の 7 種類と、**手元に入れた `golangci-lint`
  の実行ファイル**、スクリプトとワークフローが呼ぶ **Claude のモデル ID**。Docker の名札の点検で見つかった `Makefile` と `*.sh` の `docker build` /
  `docker run` の行も直す。Do NOT use for: 依存ライブラリ
  （`go.mod` の require 行）の更新、アプリのコード変更、runner の新規登録、
  上の 11 リポ以外のリポの作業。
compatibility: >-
  macOS + Homebrew + mise 環境を前提。`gh` CLI（認証済み）、`go`、`docker`、`rg`（ripgrep）、
  `npx markdownlint-cli2` が要る。Claude のモデルの版上げでは `claude` CLI（ログイン済み）、
  `gtimeout`（`brew install coreutils`）、`python3` も使う。自宅 Mac の runner が 5 台登録済みであること。
---

# 版を上げる

## 呼び方

| 平易な言い方 | 内部の呼び方 |
| --- | --- |
| 自宅 Mac の runner | self-hosted runner |
| GitHub の機械 | GitHub ホスト（`ubuntu-latest` 等） |
| 名札 | Docker イメージのタグ。土台（`golang:1.27.3-alpine3.24`）も、ビルドで `-t` に付ける確認用（`upgrade-check-*`）も名札と呼ぶ |
| コンテナの名前 | `docker run --name` で付ける名前 |
| 試し実行 | dry run（書き込みをしない実行） |

以降はこの表の左側（平易な言い方）に統一する。コード中の実際の値（`self-hosted` 等）はそのまま書く。

## 目次

- [使いどころ](#使いどころ)
- [この作業が難しい理由](#この作業が難しい理由)
- [前提の確認](#前提の確認)
- [手順](#手順)
- [使用例](#使用例)
- [注意 — してはいけないこと](#注意--してはいけないこと)
- [成功基準](#成功基準)
- [実行チェックリスト](#実行チェックリスト)
- [Troubleshooting](#troubleshooting)

## 使いどころ

| 場面 | きっかけ | 使う手順番号 | 得られるもの |
| --- | --- | --- | --- |
| Go の版上げ | 「Go を 1.26 に上げて」等の依頼 | 1・2・3・5・6・7 | `go.mod`・workflow・Dockerfile の版が揃った状態 |
| Python の版上げ | 「Python を上げて」「定期実行が版のせいで落ちた」 | 1・2・4・5・6 | 自宅 Mac の runner が新しい Python で動く状態（`mise.toml` が本体） |
| runner の PATH 点検 | 「runner が古い」「`xcrun` の警告が出る」 | 4 | `.path` の先頭が shims になり、陳腐化が起きなくなった状態 |
| Docker の土台の版上げ・片付け | 「docker image の版を上げて」「使われないイメージを消して」「ディスクが圧迫されている」 | 1・3・5・6（詳細は `references/docker-images.md`） | 土台の名札が最新で明示され、中の道具が動き、名札の無いイメージが溜まらない状態 |
| lint の版上げ・版ずれ | 「golangci-lint を上げて」「手元と CI で lint の結果が違う」「設定が読めないと言われる」 | 1・3・5 | CI の `version:` と手元の実行ファイルが同じ版に揃った状態 |
| Claude のモデルの版上げ | 「最新の Opus にして」「使っているモデルを上げて」、または他の版上げのついで | `references/claude-models.md` の手順 1〜4 | スクリプトとワークフローが呼ぶモデルが、同じ系統の最新になった状態 |

## この作業が難しい理由

**同じ `.github/workflows/` の中に 2 種類の実行環境が混ざっている。** 片方で正解の手が、
もう片方では必ず失敗する。2026-09-06 に 3 リポの定期実行がこれで止まった。

実行環境の前提（自宅 Mac と GitHub の機械の見分け方・揃えてはいけない所）は
`references/environments.md` にある。**先に読む。**
背景と履歴は `~/dev/me/dotfiles/docs/maintenance.md` にある。

## 前提の確認

| 確認すること | コマンド | 期待 |
| --- | --- | --- |
| 全リポが最新か | `git -C ~/dev/me/<repo> status -sb` | behind 0・dirty 0 |
| runner が動いているか | `gh api repos/krtsato/<repo>/actions/runners -q '.runners[]\|"\(.name) \(.status) busy=\(.busy)"'` | online・busy=false |
| mise が持っている版 | `mise ls` | 上げたい版が入っている |
| Claude の CLI（モデルの版上げのとき） | `claude --version` と `command -v gtimeout python3` | 版が出て、2 つとも見つかる |

**busy=true の runner は触らない。** job を殺す。

## 手順

**手順のコマンドは素の bash で流す**（Claude Code からは `bash -c '…'`）。Claude Code のシェルは zsh で、
`grep`・`find` も別の道具に差し替わっている。隠しフォルダを飛ばす、`-mtime` 以外の日付の書き方が通らない、
`~` が展開されない位置がある、と結果が変わる（2026-10-31 に 4 回踏んだ）。

### 1. 上げる対象を洗い出す

版が書かれている場所を全部拾う。**1 か所でも漏らすと、ビルドは通るのに CI だけ古い版**になる。

```bash
cd ~/dev/me
for r in mcp-tradingview mcp-invest-knowledge mcp-mediable mcp-note \
         mcp-seeking-alpha mcp-youtube mcp-notebooklm trade-moomoo watcher \
         securerc mdreview; do
  echo "== $r"
  grep -rnE "^go |go-version:|python-version:|node-version:|\"node\"[[:space:]]*:|uses: .*@|version: v?[0-9]|^FROM " "$r" \
    --include='go.mod' --include='*.yaml' --include='*.yml' --include='package.json' \
    --include='mise.toml' --include='Dockerfile*' --include='.golangci.yml' \
    --exclude-dir=node_modules --exclude-dir=actions-runners --exclude-dir=.worktrees 2>/dev/null
done
```

**一覧から漏れたリポを先に探す。** 上の一覧は手で書いたもので、新しいリポは黙って外れる
（2026-10-12、`mcp-notebooklm` が漏れていた）。版を固定しているリポを全部拾い、一覧と比べる。

```bash
cd ~/dev/me
for r in */; do r=${r%/}; [ -d "$r/.git" ] || continue
  grep -rqsE "^go |go-version|python-version|node-version|\"node\"[[:space:]]*:|^FROM (golang|python|node)" "$r" \
    --include=go.mod --include='*.yml' --include='*.yaml' --include='Dockerfile*' --include=package.json \
    --exclude-dir=.worktrees --exclude-dir=actions-runners --exclude-dir=node_modules --exclude-dir=.claude --exclude-dir=.codex && echo "$r"
done
```

2026-10-31 時点の出力は上の一覧の 11 リポと blogs。**blogs は対象外**（持ち主が対象に選んでいない）。
`.codex` を除くのは、codex が取り込んだ他人の部品（git の管理外）の `go.mod`・`Dockerfile` が dotfiles に当たるため。
Node のリポ（securerc・mdreview）は 2026-10-31 に持ち主の指示で対象に加えた。

`actions-runners/` と `.worktrees/` は**作業コピーであって正本ではない**ので必ず除外する
（含めて数えると件数が倍になる）。

**`golangci-lint` の版は 2 つの設定で決まり、実際に走るのはそれとは別の実行ファイル。**

| 層 | 何か | 正本か |
| --- | --- | --- |
| ワークフローの `version:` | CI が使う版 | **CI の版の正本** |
| `~/dev/me/mise.toml` | 手元で使う版 | **手元の版の正本**。CI は読まないので `version:` と同じ値に保つ |
| PATH で最初に見つかる実行ファイル | 実際に走るもの | 正本ではない。`~/go/bin` の古い版が割り込むことがある |

**3 層目は洗い出しの grep に出てこない**ので、手順 3 で別途揃える。

**ファイル名の `*` を展開させない。** zsh は一致しない `*` を見つけるとその行を丸ごと中断するので、
`Dockerfile` を持たないリポ（seeking-alpha・watcher・securerc）が**黙って 1 件も出ない**。
ファイルの絞り込みは `--include` に任せる。

### 2. `runs-on` で仕分ける

**これを飛ばすと壊す。** ワークフローごとに実行環境を確かめる。

```bash
grep -rn "runs-on" ~/dev/me/*/.github/workflows/*.y*ml | grep -v actions-runners
```

| 見つかったもの | してよいこと |
| --- | --- |
| `ubuntu-latest` 等 | `actions/setup-python` を含め何でも使える |
| `[self-hosted, macOS, *]` | **`actions/setup-python` を足さない**。Python の版は mise が決める |

`actions/setup-go` は**両方で使える**。同じ `setup-*` でも挙動が違うので、まとめて扱わない。

**`watcher` と `mcp-notebooklm` は GitHub の機械だけで動く。** 自宅 Mac の runner を持たないので手順 4 は要らない。
どちらも `Dockerfile` も `mise.toml` も無く、版が書かれているのは `go.mod` の `go` 行・`go-version`・
`golangci-lint-action` の `version` の 3 か所。

**Node のリポも自宅 Mac の runner を持たない。** 手順 4 は要らない。

| リポ | 実行環境 | 版が書かれている場所 |
| --- | --- | --- |
| securerc | GitHub の機械（`ubuntu-latest`）だけ | ワークフローの `node-version`・`package.json` の `engines.node` |
| mdreview | ワークフローが無い（手元の Docker で動く） | `Dockerfile` の `FROM node:…`・`package.json` の `engines.node` |

### 3. 版を書き換える

**同じ版を指す場所は同時に直す。**

| 直す順 | 対象 |
| --- | --- |
| 1 | `go.mod` の `go` 行と、全ワークフローの `go-version` |
| 2 | `mise.toml`（invest-knowledge のみ）— 自宅 Mac の実際の版がここで決まる |
| 3 | `Dockerfile*` の `FROM`。**手順は `references/docker-images.md`**（分類・名札の実在確認・中の道具の確認・名札の付け方・片付け）。**digest 付き（trade-moomoo）は digest も張り替える**。alpine は `golang:<版>-alpine3.24` のように**明示する**（浮動の名札は中身が黙って変わる） |
| 4 | `golangci-lint-action` の `version`（action 自体の `@v9` とは別物） |
| 5 | **手元の `golangci-lint` を 4 と同じ版に入れ直す**（下記） |
| 6 | Node のリポ（securerc・mdreview）: ワークフローの `node-version` と `Dockerfile` の `FROM node:<版>-alpine<alpine の版>`。**偶数の LTS の版**にし、alpine の版も明示する（浮動の名札を見つけたら明示に直す）。`package.json` の `engines.node` の下限が、実際に使う版より新しくなっていないことも確かめる |

#### golangci-lint も揃える

**Go の修正版を上げただけで、古い lint が標準ライブラリを読めなくなることがある。** Go の版を上げる PR では、lint の版も同じ PR で上げ、
手元の実行ファイルを CI の `version:` と同じ版にしてから PR にする。手順と、`~/go/bin` の古い版が割り込む故障の直し方は
[references/golangci-lint.md](references/golangci-lint.md)。

### 4. runner の PATH を点検する

版を上げると、runner の `.path`（登録時の写し）が指す先が消えることがある。先頭が mise の shims で欠落が無いかを点検し、
崩れていれば直す。点検と直し方は [references/environments.md](references/environments.md) の「runner の前提」。

runner の古い本体・更新用の写し・使っていない Go は、マージ後に手順 7 でまとめて消す。

### 5. 検証する

| 何を | どう |
| --- | --- |
| ビルドとテスト | 各 Go リポで `mise x -- go build ./... && mise x -- go test ./...`。**素の `go` を使わない**——作業中のシェルの PATH が古い Go のフォルダを直接指していることがあり（2026-10-20、1.27.2 のリポを 1.27.1 で走らせて偽の失敗が出た） |
| Node のビルドとテスト | securerc は `mise x node@<版> -- sh -c 'npm ci && npm run typecheck && npm test'`、mdreview は `mise x node@<版> -- sh -c 'npm ci && npm test'`。上げた先の版で走らせる。**mdreview の `npm run build` は Docker のイメージを作り直す**ので、新しい `FROM node` の確かめはこちらで行い、続けて `npm run start` でサイトが開くことを見る |
| Docker の土台 | `references/docker-images.md` の手順 4。新しい土台で全 `Dockerfile*` を**名札を付けて**ビルドし、中の道具を動かしてから名札ごと消す。取り込みは**今の土台と同じ日のデータで出力を比べる** |
| Docker の片付け | `references/docker-images.md` の手順 5・6。名札の無いビルド・`--rm` の無い起動が無いこと、毎日作り直すワークフローに片付けの手順があること、手元の `docker system df` の前後 |
| lint | **手元で `mise x -- golangci-lint run ./...`**。走らせる前に `mise x -- golangci-lint version` が CI の `version:` と同じことを確かめる。`~/dev/me` 配下で実行する（外では版が決まらず `No version is set`） |
| **自宅 Mac の runner の実動作** | ワークフローを 1 本 `workflow_dispatch` で走らせる。**試し実行は途中で止まることがある**ので、どのステップまで到達したかを必ず確認する |
| runner が新設定を読んだか | run のログから `/usr/bin/xcrun` の警告が消えたこと |

### 6. PR にする

**1 PR = 1 リポ。** 横断でまとめない（1 つが赤いと全部止まる）。
本文には「どの版から どの版へ」と「自宅 Mac の runner に影響があるか」を書く。

### 7. 版上げで溜まった物を消す

**マージした後に必ず行う**（持ち主の指示）。版を上げると、使われなくなった物が 3 か所に残る。
片付けは skill `prune-dev-caches` が持つ（使用中の確かめ方もそちら）。ここに手順を複製しない。

| 溜まる物 | なぜ残るか |
| --- | --- |
| runner の古い本体・`_work/_update`・使っていない Go | runner は自己更新で旧版を残し、`actions/setup-go` は古い `_work/_tool/go/<版>` を消さない |
| mise の古い版 | Go・Python を上げても、mise は前の版を消さない |
| どこにも書かれていない Docker の土台 | `FROM` を上げても、手元のイメージは残る |

```bash
~/.claude/skills/prune-dev-caches/scripts/prune-dev-caches.sh --only runner,mise,docker          # 見るだけ
~/.claude/skills/prune-dev-caches/scripts/prune-dev-caches.sh --only runner,mise,docker --apply  # 消す
```

`skip:` が出た種類は、その理由（夜間・runner が job を実行中・`check-by-eye` など）を解いてから流し直す。
Docker の判定の中身と、`docker image prune -a` で一括にしない理由は `references/docker-images.md` の「手元」。
最後に `docker system df` の前後を報告する。

## 使用例

| ユーザーの言葉 | 実行するコマンド | 期待される結果 |
| --- | --- | --- |
| 「mcp-tradingview の Go を 1.26 に上げて」 | 手順 1 の grep で対象を洗い出し、`go.mod` と全 workflow の `go-version` を書き換えて `mise x -- go build ./... && mise x -- go test ./...` を流す | ビルドとテストが通り、`go.mod` と全 workflow の版が一致する |
| 「invest-knowledge の定期実行が Python の版で落ちた」 | `mise.toml` の版を上げ、自宅 Mac の runner のワークフローを `workflow_dispatch` で 1 本走らせる | run が成功し、run のログから `/usr/bin/xcrun` の警告が出ない |

## 注意 — してはいけないこと

| してはいけないこと | なぜ |
| --- | --- |
| **自宅 Mac の runner のワークフローに `actions/setup-python` を足す** | `/Users/runner` に入れようとして必ず失敗する（2026-09-06 に 3 リポが停止） |
| **`.path` に「今の PATH」をそのまま書き写す** | 対話シェルの PATH には存在しないフォルダが多数混ざる。**shims を先頭に置く**のが正解 |
| **busy な runner を再起動する** | 実行中の job を殺す |
| **distroless と道具入りの土台（alpine・debian）を無理に揃える** | mediable は ffmpeg、note は日本語 OCR が要る。**理由があって分かれている** |
| **`actions-runners/` 配下のファイルを正本として数える／編集する** | 作業コピー。正本はリポジトリ直下 |
| **MCP サーバーの `docker run` に `--name` を足す** | 2 つの会話が同時に起動すると 2 つ目が「コンテナの名前が使用中」で落ちる。`--rm` なので自動で付いたコンテナの名前は残らない |
| **自宅 Mac の runner がビルド中に `docker builder prune -af` する** | 並行するビルドが次に使う中間物を消す。ワークフローでは `--filter until=24h` を付ける |
| **名札を推測で書く** | `alpine3.25` のように存在しない組み合わせがある。`docker manifest inspect` で確かめる |
| **Claude のモデルの系統を版上げのついでに変える**（Opus → Sonnet 等） | 費用と品質の釣り合いは持ち主が選んだもの。版上げは同じ系統の中だけ |
| 版だけ上げて動作確認しない | 版の問題は**ビルドではなく実行時**に出る |

## 成功基準

- 版を書いている場所が**全部**同じ値になっている（手順 1 の洗い出しで再確認）
- 自宅 Mac の runner のワークフローを 1 本実際に走らせて成功している（自宅 Mac の runner を持つリポを上げたとき）
- runner の `.path` に欠落が無く、先頭が shims（同上）
- CI を持つリポの CI が green（mdreview は CI が無いので、手順 5 の手元の確かめで代える）
- 手元に、どこにも書かれていない土台イメージが無い

## 実行チェックリスト

- [ ] `references/environments.md` を読んだ
- [ ] 全リポが behind 0・dirty 0
- [ ] runner が online・busy=false
- [ ] 版が書かれている場所を洗い出した（作業コピーを除外して）
- [ ] `runs-on` で自宅 Mac の runner と GitHub の機械を仕分けた
- [ ] 版を書き換えた（go.mod / workflows / mise.toml / Dockerfile / lint）
- [ ] Docker の土台は `references/docker-images.md` の手順で、名札の実在・中の道具・名札の付け方・片付けまで確かめた
- [ ] **手元の `mise x -- golangci-lint version` が CI の `version:` と一致することを確かめた**（Go のリポを上げたとき）
- [ ] runner の `.path` を点検した（自宅 Mac の runner を持つリポを上げたとき）
- [ ] `go build` と `go test` が通る（Go のリポを上げたとき）
- [ ] Node のリポ（securerc・mdreview）で、上げた先の版の `npm test` が通る
- [ ] `mise x -- golangci-lint run ./...` が通る（CI 任せにしない）（Go のリポを上げたとき）
- [ ] 自宅 Mac の runner のワークフローを 1 本実際に走らせた（同上）
- [ ] Claude のモデル ID と共著者の表記を `references/claude-models.md` の手順で洗い出し、同じ系統の最新で呼べることを確かめた
- [ ] リポごとに PR を出した
- [ ] マージ後、`prune-dev-caches.sh --only runner,mise,docker --apply` を流し、`skip:` が出た種類は理由を解いて流し直した

## Troubleshooting

| 症状 | 見る場所 |
| --- | --- |
| `mkdir: /Users/runner: Permission denied`・版を上げたのに古い版で動く・`/usr/bin/xcrun` の警告・定期実行が「取り消し」 | [references/troubleshooting.md](references/troubleshooting.md) |
| golangci-lint の v1/v2 の設定違い・`export data version`・手元で lint が動かない | [references/golangci-lint.md](references/golangci-lint.md) の「よくある故障」 |
