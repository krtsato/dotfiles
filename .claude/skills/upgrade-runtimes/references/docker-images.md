# Docker イメージの版上げと片付け

`Dockerfile*` の `FROM` を上げるときと、手元・自宅 Mac の runner に溜まったイメージを片付けるときに読む。
Go の版上げ（SKILL.md の手順 3）で `golang:<版>-…` を書き換えるときも、ここの手順 2〜4 を通す。

## 目次

- [1. 土台を洗い出して分類する](#1-土台を洗い出して分類する)
- [2. 新しい名札を確かめる](#2-新しい名札を確かめる)
- [3. 書き換える](#3-書き換える)
- [4. 名前を付けてビルドし、中の道具を動かす](#4-名前を付けてビルドし中の道具を動かす)
- [5. 名前の付け方を点検する](#5-名前の付け方を点検する)
- [6. 片付ける](#6-片付ける)
- [もっと軽い土台にできるか](#もっと軽い土台にできるか)

## 1. 土台を洗い出して分類する

```bash
cd ~/dev/me
grep -rn --include='Dockerfile*' --exclude-dir=.worktrees --exclude-dir=actions-runners '^FROM ' mcp-* trade-moomoo mdreview
```

2026-10-20 時点の土台。**種類ごとに上げ方が違う**ので、まずこの表のどれに当たるかを決める。

| 種類 | 名札 | 置き場 | 上げ方 |
| --- | --- | --- | --- |
| Go のビルド用 | `golang:<Go の版>-alpine3.24` | invest-knowledge・mediable・note・tradingview ×3 | Go の版は `go.mod` に合わせる。**alpine の版も明示する** |
| Go のビルド用 | `golang:<Go の版>-trixie` | youtube | 同上。Debian の世代も明示する |
| 実行用・最小 | `gcr.io/distroless/static-debian13:nonroot` | invest-knowledge・tradingview ×3・youtube | Debian の世代が上がったら数字を上げる。`nonroot`（uid 65532）は変わらない |
| 実行用・道具入り | `alpine:3.24` | mediable（ffmpeg） | alpine の版を上げる。**中の ffmpeg の版も変わる**ので手順 4 が必須 |
| 実行用・道具入り | `debian:trixie-slim` | note（MCP server の日本語 OCR） | 世代名を上げる。**中の道具の版も変わる**ので手順 4 が必須 |
| Python | `python:<版>-alpine3.24` | tradingview の取り込み 3 本 | Python の版と alpine の版を上げる。依存に **Alpine 向けの wheel（`musllinux`）** があるか手順 4 で確かめる（`--progress=plain` の記録に `Building wheel` が出たらソースから組まれている） |
| Python・digest 付き | `python:<版>-slim@sha256:…` | trade-moomoo | **digest も張り替える** |
| Node | `node:<版>-alpine<alpine の版>` | mdreview | 偶数の LTS の版にする。2026-10-31 時点は浮動の `node:22-alpine` で、**次に上げるときに alpine の版を明示する** |

**浮動の名札（`golang:1.27.2-alpine`）を見つけたら明示に直す。** 中身の alpine が黙って変わる。
2026-10-20 時点で中身は既に 3.24.2 で、明示は「上げる」ではなく「黙って変わらないようにする」作業だった。

## 2. 新しい名札を確かめる

**名札は推測で書かない。** 実在を確かめてから書き換える。

```bash
docker manifest inspect golang:1.27.2-alpine3.24 >/dev/null && echo ok
docker manifest inspect gcr.io/distroless/static-debian13:nonroot >/dev/null && echo ok
docker run --rm golang:1.27.2-alpine cat /etc/alpine-release   # 浮動の名札の中身
```

`alpine3.25` のように**まだ提供されていない組み合わせ**がある（2026-10-20 に実在しなかった）。

## 3. 書き換える

**1 リポ 1 PR。** 同じリポの `Dockerfile*` はまとめて上げる（ビルド用と実行用の世代を揃える）。

| 確かめること | 理由 |
| --- | --- |
| `useradd`・`apt-get`・`apk` の行 | 土台の種類を替えると書き方が変わる（Debian は `useradd`、Alpine は `adduser -D`） |
| 実行ユーザーの uid | distroless の `nonroot` は 65532、自前のユーザーは 10001。マウント先の権限に効く |
| 証明書 | 外へ HTTPS で問い合わせるイメージは、証明書の入った土台か `ca-certificates` を入れる |

## 4. 名前を付けてビルドし、中の道具を動かす

**ビルドが通っただけでは足りない。** 版の問題は中の道具が動くときに出る。確認用のイメージには
`upgrade-check-<リポ>-<用途>` のように**必ず名前を付け**、確認後に名前ごと消す。

```bash
docker build -q -t upgrade-check-mediable -f Dockerfile .
docker run --rm --entrypoint ffmpeg upgrade-check-mediable -hide_banner -version | head -1
docker rmi upgrade-check-mediable
```

| イメージ | 動かすもの | 合格 |
| --- | --- | --- |
| mediable | 実際と同じ引数で HLS を mp4 にまとめる（試験用の HLS を別のコンテナから配る） | 映像と音声の両方が入った mp4 ができる |
| note | `tesseract --list-langs` と実際の画像 | `jpn` があり、読み取り結果が今と大きく変わらない。**日次同期はこのイメージを使わない**（自宅 Mac の Apple Vision で読む） |
| tradingview の取り込み 3 本 | **今の土台と新しい土台で同じ日のデータを取り込む** | 出力が 1 バイトも違わない。逆日歩は moomoo の接続先が動いているときだけ実データ、止まっていれば単体テストと部品の読み込みまで。**逆日歩の出力には記録時刻（`captured_at`）が入る**ので、その列を除いて比べる。**`--user` を付けずにワークフローと同じ形で動かす**（付けると家フォルダが `/` になり、moomoo の部品が設定を書けず `Permission denied: '/.com.moomoo.OpenD'` で落ちる。土台の故障と取り違えない） |
| Go の配布物 | 起動して版を出す・`--help` | 期待どおりの出力 |

試験用の HLS は `ffmpeg -f lavfi -i testsrc=d=6 … -c:v libx264 -c:a aac -f hls` で作る。
**`-c:v mpeg4` で作ると、どの土台でも mp4 へのまとめが失敗する**ので、それを土台の故障と取り違えない。

## 5. 名前の付け方を点検する

名前の無いイメージ・後に残るコンテナを作っていないかを見る。

ビルドと起動は**別々に**拾う。1 本の grep で両方を見ると、`docker builder prune` やコメントが混ざり、
`-t` を持つ起動（`docker run -t`）が「名前あり」として黙って外れる。

```bash
cd ~/dev/me
# 1. ビルド: -t / --tag の無い行。builder（prune）とコメント行は除く
grep -rnE 'docker (image )?build( |\\|$)' --include='*.y*ml' --include='*.sh' --include=Makefile \
  --exclude-dir=.worktrees --exclude-dir=actions-runners mcp-* trade-moomoo watcher \
  | grep -vE ':[0-9]+:[[:space:]]*#' | grep -vE -- '(-t|--tag)[ =]'

# 2. 起動: 全件を後ろ 3 行つきで出し、--rm があるかを目で確かめる
grep -rnE -A3 'docker run( |\\|$)' --include='*.y*ml' --include='*.sh' --include=Makefile \
  --exclude-dir=.worktrees --exclude-dir=actions-runners mcp-* trade-moomoo watcher
```

**起動は目で確かめる。** オプションが `\` で次の行へ続く書き方では、`--rm` が `docker run` と別の行に来るので、
行単位の grep では判定できない（`-A3` で後ろの行を一緒に出しているのはそのため）。

| 見つかったもの | すること |
| --- | --- |
| `-t` の無い `docker build` | 名前を付ける。名前の無いイメージが毎回 1 つ残る |
| `--rm` の無い `docker run` | `--rm` を付ける。止まったコンテナが毎回 1 つ残る |
| MCP サーバーの起動（`.mcp.json`・`.claude/settings.json` の `docker run --rm -i`） | **`--name` を足さない。** 自動で付く名前は `--rm` で消えて残らない。固定の名前は、同じサーバーを 2 つの会話が同時に起動したときに 2 つ目が「名前が使用中」で落ちる |

**同じ名前で作り直すと、古い方は「名前の無いイメージ」になる。** これは名前の付け忘れではなく、作り直しの仕様。
対策は名前を足すことではなく、手順 6 の片付け。

## 6. 片付ける

### 毎日作り直す自宅 Mac の runner のワークフロー

最後に「常に走る」片付けの手順があるかを見る。無ければ足す。

```yaml
      - name: Reclaim runner disk
        if: ${{ always() }}
        run: |
          docker image prune --force
          docker builder prune --force --filter until=24h
          docker system df
```

| 消すもの | 消さないもの | 理由 |
| --- | --- | --- |
| 名前の外れたイメージ | 名前の付いたイメージ・ボリューム | 他のワークフローが使う |
| **24 時間より古い**ビルドの中間物 | 直近の中間物 | 同じ Mac の Docker で並行して走る他のビルドが、次に使う中間物を消さない |

2026-10-20 時点で片付けを持つもの: tradingview の取り込み 3 本・mcp-mediable（`make docker-prune`）。
mcp-note の日次同期は 2026-10-20 から Docker を使わない（Apple Vision で読むため）ので、片付けの手順も外した。

### 手元

```bash
docker system df                                  # 前
docker images --format '{{.Repository}}:{{.Tag}} {{.Size}} {{.CreatedSince}}' | sort
```

| 消してよい | 消さない |
| --- | --- |
| `upgrade-check-*`・`slimcheck-*`・`chk-*` など確認用の名前 | **仕事のリポのイメージ**（ECR・社内のリポ名） |
| 古い土台（上げる前の `golang`・`python`・`golangci-lint` の名札） | 起動中の MCP サーバーのイメージ |
| 名前の外れたイメージ（`docker image prune -f`） | ボリューム |

**古い土台は版上げのたびに必ず消す**（持ち主の指示・2026-10-23）。手元にある土台の名札を 1 つずつ、
**個人のリポ全体と awa 側の両方**で文字列として探し、どこにも出てこないものだけを消す。
探すのは `scripts/find-unused-base-images.sh`（`rg` が要る。`brew install ripgrep`）。約 39 GB を読んで 1 分かからない。

```bash
~/.claude/skills/upgrade-runtimes/scripts/find-unused-base-images.sh
```

| 出力 | 意味 | すること |
| --- | --- | --- |
| `used <名札>` | どこかに名札が書かれている | 消さない |
| `unused <名札>` | どこにも書かれていない | 下の手順で消してよい |
| `held <名札> <ファイル>` | 名札は書かれていないが、その種類の土台を変数で組み立てる `FROM`（`FROM python:${V}-slim`）がある | 消さない |
| `check-by-eye <ファイル>: <行>` | 土台を丸ごと変数にした `FROM ${BASE}` がある。何を使うか文字列では分からない | **読んで確かめるまで何も消さない** |
| 終了コード 2（`SEARCH-FAILED`） | 読めない場所があった | **その回は何も消さない** |

```bash
# unused の名札ごとに: 使っているコンテナが無いことを確かめてから消す（-f を付けない）
docker ps -a --filter ancestor=<名札> --format '{{.Names}}'
docker image rm <名札>
```

| 決めごと | なぜ |
| --- | --- |
| `FROM` 行を解析せず、**名札の文字列をどこかに書いているか**で決める | `from` の小文字、`ARG BASE=…` からの `FROM ${BASE}`、`FROM --platform=…` を行の解析で拾い切れない。文字列で探せばこれらは拾える |
| **版を変数で組み立てる `FROM` が 1 行でもあれば、その種類の候補は残す**（`held`） | `ARG V=3.15.0` と `FROM python:${V}-slim` は名札の文字列をどこにも含まない。`Dockerfile` かどうかは**名前でなく中身**で決める（空行・コメント・`ARG` を除いた最初の命令が `FROM`）。SQL の `FROM ${table}` や、文書に引用された `FROM` を拾わないため。2026-10-31 時点で `held`・`check-by-eye` は 0 件（awa の `zero/*` は土台の種類に当たらない） |
| 抜け道を塞ぎ切ることは目指さない | 改行で続ける `FROM` などは拾えない。**消すのは公開の土台だけ**で、見落として消しても次のビルドで取り直されるだけ（失うのはダウンロードの時間）。取り直せない手元のビルドを消す一括の片付けとは損失の大きさが違う |
| 探す範囲は **`~/dev/me` 全体**（他のリポ・別の worktree・未追跡のファイルを含む）と **`~/go/src/github.com/awa`** | 一覧に書いたリポだけを探すと、一覧に無いリポだけが使う土台が候補に出る |
| 探す処理が失敗したら（終了コード 2）**その回は何も消さない** | 読めなかった場所に使用箇所があるかもしれない。`SEARCH-FAILED` は「使われていない」ではなく「分からない」 |
| **全名札を 1 回で探す**。名札ごとに全体を読み直さない | 以前は名札 1 つごとに約 39 GB を `grep -r` で読み直し、1 つで 10 分を超えた（2026-10-31） |
| `grep -r` でなく `rg` を使う | `grep -r` は通信用の特殊なファイル（`.codex/ipc/ipc.sock`）を開こうとして毎回失敗し、全名札が `SEARCH-FAILED` になっていた。`rg` は特殊なファイルを読み飛ばす |
| 1 回目で「どれかの名札を含むファイル」に絞り、2 回目で名札ごとに確かめる | 1 回の `-o` で済ませると、一方が他方を含む名札（`node:24` と `node:24.22.1`）で片方しか報告されず、使っている方が `unused` に出る（2026-10-31 に実測） |
| **会話の記録**（`.claude/projects`・`.claude/file-history`・`.codex/sessions`）は探さない | 会話で名前が出ただけで「使われている」になり、一度話題にした土台が永久に消せなくなる。plugin の `Dockerfile` は実際に組み立てるので探す |
| `:latest` は候補にしない | `FROM python` のように名札を書かない参照は文字列では見つからない |
| `docker image rm` に `-f` を付けない | 使っているコンテナがあれば Docker が拒否する。これが最後の安全網 |

**`docker image prune -a` で一括にしない。** 仕事のリポのイメージや、awa 側の作業が使う土台まで消える。
候補には「古い版」だけでなく「同じ版の別の種類」も出る（2026-10-23 の `python:3.15.0-slim` は、
取り込みが alpine 版へ移った後に確認用として残っていたもの）。

ビルドの中間物をまとめて消す `docker builder prune -af` は、**自宅 Mac の runner がビルド中でないとき**だけ使う
（下で 1 件も出ないことを確かめる）。

```bash
for r in mcp-tradingview mcp-invest-knowledge mcp-mediable mcp-note mcp-seeking-alpha; do
  gh api "repos/krtsato/$r/actions/runs?status=in_progress" -q ".workflow_runs[] | \"$r \\(.name)\""
done
```

最後に `docker system df` で回収量を報告する。

## もっと軽い土台にできるか

**Debian から Alpine に替えると、道具入りのイメージは大きく軽くなる。** ただし中の道具の版と同梱データが変わる。
2026-10-20 の比較。

| イメージ | Debian | Alpine | 結果 |
| --- | --- | --- | --- |
| mediable（ffmpeg） | 749 MB | 196 MB | 同じ引数で同じ mp4。ffmpeg は 7.1 → 8.1 に上がる。**採用済み**（mcp-mediable #212） |
| tradingview の取り込み 2 本（pdfplumber） | 309 MB | 198 MB | 出力が 1 バイトも違わない。**採用済み**（mcp-tradingview #550） |
| 逆日歩の取り込み（moomoo の部品） | 470 MB | 360 MB | 実データ 432 銘柄が記録時刻を除いて一致。**採用済み**（mcp-tradingview #552） |
| note（OCR） | 322 MB | 203 MB | **日本語が崩れる。** Alpine の学習データは大きい標準版で、文字の間に空白が入り数字が丸数字に化け、約 2.6 倍遅い |
| note（OCR・学習データだけ Debian から） | 322 MB | 127 MB | ほぼ一致（16 枚中 5 枚が完全一致、残りも空白を除いて 9 割台） |

**替えるかどうかは出力の比較で決める。** 出力が同じなら替えてよい。変わるなら、その差を持ち主に見せて判断を仰ぐ。
同梱データだけを Debian から持ち込むときは、多段ビルドで Debian の段からファイルだけを `COPY --from` する。
