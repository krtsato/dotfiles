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
  の実行ファイル**、スクリプトとワークフローが呼ぶ **Claude のモデル ID**。Docker の名前の点検で見つかった `Makefile` と `*.sh` の `docker build` /
  `docker run` の行も直す。Do NOT use for: 依存ライブラリ
  （`go.mod` の require 行）の更新、アプリのコード変更、runner の新規登録、
  上の 11 リポ以外のリポの作業。
compatibility: >-
  macOS + Homebrew + mise 環境を前提。`gh` CLI（認証済み）、`go`、`docker`、`rg`（ripgrep）、
  `npx markdownlint-cli2` が要る。自宅 Mac の runner が 5 台登録済みであること。
---

# 版を上げる

## 呼び方

| 平易な言い方 | 内部の呼び方 |
| --- | --- |
| 自宅 Mac の runner | self-hosted runner |
| GitHub の機械 | GitHub ホスト（`ubuntu-latest` 等） |

以降はこの表の左側（平易な言い方）に統一する。コード中の実際の値（`self-hosted` 等）はそのまま書く。

## 目次

- [使いどころ](#使いどころ)
- [この作業が難しい理由](#この作業が難しい理由)
- [前提の確認](#前提の確認)
- [手順](#手順)
- [使用例](#使用例)
- [禁止事項](#禁止事項)
- [成功基準](#成功基準)
- [実行チェックリスト](#実行チェックリスト)
- [Troubleshooting](#troubleshooting)

## 使いどころ

| 場面 | きっかけ | 使う手順番号 | 得られるもの |
| --- | --- | --- | --- |
| Go の版上げ | 「Go を 1.26 に上げて」等の依頼 | 1・2・3・5・6・7 | `go.mod`・workflow・Dockerfile の版が揃った状態 |
| Python の版上げ | 「Python を上げて」「定期実行が版のせいで落ちた」 | 1・2・4・5・6 | 自宅 Mac の runner が新しい Python で動く状態（`mise.toml` が本体） |
| runner の PATH 点検 | 「runner が古い」「`xcrun` の警告が出る」 | 4 | `.path` の先頭が shims になり、陳腐化が起きなくなった状態 |
| Docker の土台の版上げ・片付け | 「docker image の版を上げて」「使われないイメージを消して」「ディスクが圧迫されている」 | 1・3・5・6（詳細は `references/docker-images.md`） | 土台の名札が最新で明示され、中の道具が動き、名前の無いイメージが溜まらない状態 |
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
| 3 | `Dockerfile*` の `FROM`。**手順は `references/docker-images.md`**（分類・名札の実在確認・中の道具の確認・名前の付け方・片付け）。**digest 付き（trade-moomoo）は digest も張り替える**。alpine は `golang:<版>-alpine3.24` のように**明示する**（浮動の名札は中身が黙って変わる） |
| 4 | `golangci-lint-action` の `version`（action 自体の `@v9` とは別物） |
| 5 | **手元の `golangci-lint` を 4 と同じ版に入れ直す**（下記） |
| 6 | Node のリポ（securerc・mdreview）: ワークフローの `node-version` と `Dockerfile` の `FROM node:<版>-alpine<alpine の版>`。**偶数の LTS の版**にし、alpine の版も明示する（浮動の名札を見つけたら明示に直す）。`package.json` の `engines.node` の下限が、実際に使う版より新しくなっていないことも確かめる |

#### Go を上げたら golangci-lint も上げる

**Go の修正版を上げただけで、古い lint が標準ライブラリを読めなくなることがある。**
2026-10-12、Go 1.27.1 → 1.27.2 で v2.13.2 が全 8 リポで型検査の誤りを出し、v2.14.0 で 0 件に戻った
（下の Troubleshooting）。**Go を上げたら、lint を走らせて確かめてから PR にする。**

#### 手元の golangci-lint を CI に揃える

**版は mise が管理する。** `~/dev/me/mise.toml` に書いてあり、CI の `version:` と同じ値にする。

```bash
grep -rh -A2 'golangci-lint-action' ~/dev/me/*/.github/workflows/*.y*ml | grep 'version:'
grep golangci ~/dev/me/mise.toml
```

両方が同じでなければ `mise.toml` を直して `mise install` する。

#### 割り込んでいる実行ファイルを退ける

**よくある故障はこちら。** `go install` で入った古い版が `~/go/bin` に居座り、
**mise の shims より PATH で先に来る**。mise は正しい版を持っているのに、走るのは別物になる。

```bash
which -a golangci-lint      # 1 行目が ~/go/bin なら割り込まれている
golangci-lint version       # 走る版を必ず確かめる
```

**割り込みの診断と、それを消した後の確認では、わざと `mise x --` を付けない。** エディタやフックが
素の名前で呼んだときに実際に何が走るかを見るのが目的だから（この節と Troubleshooting の素の呼び出しはすべてこれ）。
検証（手順 5）では `mise x --` を付ける。

```text
$HOME/go/bin/golangci-lint                    ← v1 系が先頭
$HOME/.local/share/mise/installs/...2.14.0/   ← mise が持つ正しい版
$HOME/.local/share/mise/shims/golangci-lint
```

直し方は **`~/go/bin` の方を消す**（mise 側は触らない）。

```bash
rm ~/go/bin/golangci-lint && golangci-lint version
```

**`go install github.com/golangci/...` で入れ直さない。** それが割り込みを作った原因で、
同じ名前の実行ファイルを黙って上書きする。**手元の版の正本は mise。**

**一時的に入れる場合も `GOBIN` を分けない理由にはならない。** 2026-10-02、別の作業で
`GOBIN=<一時フォルダ> go install` したつもりが、それ以前に `~/go/bin` へ入れていた v1 系が
残っていて割り込んでいた。**入れた覚えより `which -a` を信じる。**

**見分け方は「手元 0 件・CI で指摘」。** 版が古いと新しい検査（`modernize` 系は v2 で追加）が
そもそも走らないので、**手元が緑でも何の保証にもならない**。CI で初めて出たら、
直す前に `golangci-lint version` を確かめる。

### 4. runner の PATH を点検する

`.path` は登録時の写しなので**版を上げると指し先が消える**。shims が先頭にあれば何もしなくてよい。

```bash
for d in ~/dev/me/mcp-note/actions-runners/magazine-sync \
         ~/dev/me/mcp-seeking-alpha/actions-runners/alpha-picks-sync \
         ~/dev/me/mcp-mediable/actions-runners \
         ~/dev/me/mcp-invest-knowledge/actions-runners \
         ~/dev/me/mcp-tradingview/actions-runners; do
  echo "== $d"
  cut -d: -f1 "$d/.path"; echo   # 先頭だけ見れば shims が先頭かを判定できる
  tr ':' '\n' < "$d/.path" | while read -r e; do [ -n "$e" ] && [ ! -d "$e" ] && echo "   欠落 $e"; done
done
```

先頭が `.../mise/shims` でない、または「欠落」が出たら `references/environments.md` の手順で直す。

**runner 自身の古い版も消す。** runner は版が上がるたびに `bin.<版>`・`externals.<版>` を新しく取ってきて
`bin`・`externals` のリンクを付け替え、古い版と更新用の写し `_work/_update` を残す（1 台あたり 0.8〜0.9 GB。
2026-10-22 に 5 台で約 4 GB）。消すのは **リンクが指していない、指している版より古い**版と `_work/_update` だけ。

| 条件 | なぜ |
| --- | --- |
| 夜間の実行の時間帯（1:30〜9:30）を避け、busy=false を確かめ、**その runner を `./svc.sh stop` で止めてから**消す | 更新は `_work/_update` を使う。確かめた後に自己更新が始まると、使用中の写しを消す |
| `bin`・`externals` の**両方**のリンクが読め、指す先が実在する | 読めないと除外が空になり、**全版が候補に出る** |
| `bin.*`・`externals.*` の**どちらにも**、指している版より新しいものが無い | 新しい版は、これから切り替わる途中の可能性がある |

```bash
d=<runner フォルダ>   # 1 台ずつ
(cd "$d" && ./svc.sh stop) || { echo "stop failed: $d"; exit 1; }   # 止まらなければ何も消さない
b=$(basename "$(readlink "$d/bin")" 2>/dev/null); e=$(basename "$(readlink "$d/externals")" 2>/dev/null)
if [ -n "$b" ] && [ -n "$e" ] && [ -d "$d/$b" ] && [ -d "$d/$e" ] \
   && [ "$(cd "$d" && ls -d bin.* | sort -V | tail -n 1)" = "$b" ] \
   && [ "$(cd "$d" && ls -d externals.* | sort -V | tail -n 1)" = "$e" ]; then
  (cd "$d" && ls -d bin.* externals.* | grep -v -x -e "$b" -e "$e")   # 消す候補。目で確かめてから rm -rf
  ls -d "$d/_work/_update" 2>/dev/null
else
  echo "skip $d"
fi
(cd "$d" && ./svc.sh start)   # 消した後に必ず戻し、GitHub 側で online を確かめる
```

**runner が取ってきた古い Go も消す。** `actions/setup-go` は版を上げるたびに `_work/_tool/go/<版>` を
新しく取ってきて、古い版を消さない（1 版 約 0.25 GB。2026-10-31 に 5 台で計 15 版・約 4 GB 溜まっていた）。
残すのは**そのリポのワークフローの `go-version` に書かれた版だけ**。`1.27` のような省略・matrix・`go-version-file` があれば、どの版が要るか決まらないので消さない。条件は上と同じ（時間帯・busy=false・止めてから）。

```bash
r=<リポ>; d=<runner フォルダ>; t=$d/_work/_tool/go   # 1 台ずつ
specs=$(grep -rhE '^[[:space:]]*go-version(-file)?:' ~/dev/me/$r/.github/workflows | sed -E "s/^[^:]*:[[:space:]]*//; s/[\"' ]//g")
# 1.27 / ${{ matrix.go }} / go-version-file のように版が確定しない指定が 1 つでもあれば何も消さない
if [ -z "$specs" ] || grep -rqE '^[[:space:]]*go-version-file:' ~/dev/me/$r/.github/workflows \
   || echo "$specs" | grep -qvxE '[0-9]+\.[0-9]+\.[0-9]+'; then echo "unresolved go-version in $r"; exit 1; fi
keep=$(echo "$specs" | sort -u)
(cd "$d" && ./svc.sh stop) || { echo "stop failed: $d"; exit 1; }
for v in $(ls "$t"); do echo "$keep" | grep -qxF "$v" || rm -rf "${t:?}/$v"; done
(cd "$d" && ./svc.sh start)
ls "$t"   # keep の版だけが残る
```

消しすぎても、次の実行が必要な版を取り直すだけ（数十秒）。

### 5. 検証する

| 何を | どう |
| --- | --- |
| ビルドとテスト | 各 Go リポで `mise x -- go build ./... && mise x -- go test ./...`。**素の `go` を使わない**——作業中のシェルの PATH が古い Go のフォルダを直接指していることがあり（2026-10-20、1.27.2 のリポを 1.27.1 で走らせて偽の失敗が出た） |
| Node のビルドとテスト | securerc は `mise x node@<版> -- sh -c 'npm ci && npm run typecheck && npm test'`、mdreview は `mise x node@<版> -- sh -c 'npm ci && npm test'`。上げた先の版で走らせる。**mdreview の `npm run build` は Docker のイメージを作り直す**ので、新しい `FROM node` の確かめはこちらで行い、続けて `npm run start` でサイトが開くことを見る |
| Docker の土台 | `references/docker-images.md` の手順 4。新しい土台で全 `Dockerfile*` を**名前を付けて**ビルドし、中の道具を動かしてから名前ごと消す。取り込みは**今の土台と同じ日のデータで出力を比べる** |
| Docker の片付け | `references/docker-images.md` の手順 5・6。名前の無いビルド・`--rm` の無い起動が無いこと、毎日作り直すワークフローに片付けの手順があること、手元の `docker system df` の前後 |
| lint | **手元で `mise x -- golangci-lint run ./...`**。走らせる前に `mise x -- golangci-lint version` が CI の `version:` と同じことを確かめる。`~/dev/me` 配下で実行する（外では版が決まらず `No version is set`） |
| **自宅 Mac の runner の実動作** | ワークフローを 1 本 `workflow_dispatch` で走らせる。**dry run は途中で止まることがある**ので、どのステップまで到達したかを必ず確認する |
| runner が新設定を読んだか | run のログから `/usr/bin/xcrun` の警告が消えたこと |

### 6. PR にする

**1 PR = 1 リポ。** 横断でまとめない（1 つが赤いと全部止まる）。
本文には「どの版から どの版へ」と「自宅 Mac の runner に影響があるか」を書く。

### 7. 古い土台イメージを消す

**マージした後に必ず行う**（持ち主の指示・2026-10-23）。個人のリポ全体と awa 側の
どこにも書かれていない土台の名札を手元から消す。手順は `references/docker-images.md` の「手元」。**名前で 1 つずつ消し、
`docker image prune -a` で一括にしない**（仕事のリポや awa 側の作業のイメージまで消える）。
最後に `docker system df` の前後を報告する。

## 使用例

| ユーザーの言葉 | 実行するコマンド | 期待される結果 |
| --- | --- | --- |
| 「mcp-tradingview の Go を 1.26 に上げて」 | 手順 1 の grep で対象を洗い出し、`go.mod` と全 workflow の `go-version` を書き換えて `mise x -- go build ./... && mise x -- go test ./...` を流す | ビルドとテストが通り、`go.mod` と全 workflow の版が一致する |
| 「invest-knowledge の定期実行が Python の版で落ちた」 | `mise.toml` の版を上げ、自宅 Mac の runner のワークフローを `workflow_dispatch` で 1 本走らせる | run が成功し、run のログから `/usr/bin/xcrun` の警告が出ない |

## 禁止事項

| してはいけないこと | なぜ |
| --- | --- |
| **自宅 Mac の runner のワークフローに `actions/setup-python` を足す** | `/Users/runner` に入れようとして必ず失敗する（2026-09-06 に 3 リポが停止） |
| **`.path` に「今の PATH」をそのまま書き写す** | 対話シェルの PATH には存在しないフォルダが多数混ざる。**shims を先頭に置く**のが正解 |
| **busy な runner を再起動する** | 実行中の job を殺す |
| **distroless と道具入りの土台（alpine・debian）を無理に揃える** | mediable は ffmpeg、note は日本語 OCR が要る。**理由があって分かれている** |
| **`actions-runners/` 配下のファイルを正本として数える／編集する** | 作業コピー。正本はリポジトリ直下 |
| **MCP サーバーの `docker run` に `--name` を足す** | 2 つの会話が同時に起動すると 2 つ目が「名前が使用中」で落ちる。`--rm` なので自動の名前は残らない |
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
- [ ] Docker の土台は `references/docker-images.md` の手順で、名札の実在・中の道具・名前の付け方・片付けまで確かめた
- [ ] **手元の `mise x -- golangci-lint version` が CI の `version:` と一致することを確かめた**（Go のリポを上げたとき）
- [ ] runner の `.path` を点検した（自宅 Mac の runner を持つリポを上げたとき）
- [ ] `go build` と `go test` が通る（Go のリポを上げたとき）
- [ ] Node のリポ（securerc・mdreview）で、上げた先の版の `npm test` が通る
- [ ] `mise x -- golangci-lint run ./...` が通る（CI 任せにしない）（Go のリポを上げたとき）
- [ ] 自宅 Mac の runner のワークフローを 1 本実際に走らせた（同上）
- [ ] Claude のモデル ID と共著者の表記を `references/claude-models.md` の手順で洗い出し、同じ系統の最新で呼べることを確かめた
- [ ] リポごとに PR を出した
- [ ] マージ後、どこにも書かれていない古い土台イメージを名前で消した（`scripts/find-unused-base-images.sh` の `unused` だけ。失敗・`held`・`check-by-eye` が出た回は確かめてから）

## Troubleshooting

### `mkdir: /Users/runner: Permission denied`

自宅 Mac の runner に `actions/setup-python` が入っている。**削除する**。Python の版は mise が決める。

### 版を上げたのに古い版で動く

`.path` が古い版のパスを指している。手順 4 で点検し、shims を先頭に置く。

### `Unexpected error attempting to determine if executable file exists '/usr/bin/xcrun/git'`

`/usr/bin/xcrun` が PATH に入っている（**ディレクトリでなく実行ファイル**）。害は無いがノイズになる。
`.path` から実在しない項目を除くと消える。**新しい `.path` を読んだかどうかの目印**にもなる。

### `you are using a configuration file for golangci-lint v2 with golangci-lint v1`

**手元の実行ファイルが v1 系に入れ替わっている。** 設定ファイルは v2 の書式なので読めない。

```bash
which -a golangci-lint   # 1 行目が ~/go/bin なら割り込まれている
rm ~/go/bin/golangci-lint
golangci-lint version    # mise.toml の版に戻る
```

原因は別の作業での `go install`。**`~/go/bin` は mise の shims より PATH で先に来る**ので、
mise が正しい版を持っていても走るのは古い方になる。**入れ直さず、割り込みを消す。**

### `export data version 5 is greater than maximum supported version 4`

**lint が新しい Go の標準ライブラリを読めない。** `could not import fmt` などの型検査の誤りが
全ファイルで出る。コードの問題ではない。golangci-lint を新しい版に上げる（`mise latest golangci-lint`）。

手元の `mise.toml` を直しても、**作業中のシェルの PATH は古い版のフォルダを直接指したまま**のことがある。
`golangci-lint version` が古いままなら `mise x golangci-lint@<版> -- golangci-lint run ./...` で確かめる。

### golangci-lint がローカルで動かない

まず上の版ずれを疑う。**「CI に任せる」で済ませない**——提供マシンの枠を使い切っていると
CI は実行そのものを受け付けず、**判定が一度も行われないまま緑に見える**ことがある
（2 秒・0 ステップ・runner 名が空）。手元の検査は `go vet` が見つけられない指摘を拾うので、
手元で走らせて確かめる。

### 定期実行が「取り消し」で終わる

打ち切り時間に当たっている。失敗ではないので通知が出ないことがある。
`timeout-minutes` と実際の所要時間を比べる。
