---
name: upgrade-runtimes
description: >-
  `~/dev/me` 配下の 7 リポ（mcp-tradingview / mcp-invest-knowledge / mcp-mediable /
  mcp-note / mcp-seeking-alpha / mcp-youtube / trade-moomoo）で、Go・Python・
  GitHub Actions のステップ・Docker イメージなど**固定された版を上げる**。あわせて
  自宅 Mac の self-hosted runner の PATH を点検する。「Go を上げて」「Python を上げて」
  「actions の版を上げて」「runner が古い」「定期実行が版のせいで落ちた」のような
  リクエストで使用。Do NOT use for: 依存ライブラリ（`go.mod` の require 行）の更新、
  アプリのコード変更、runner の新規登録、GitHub ホスト専用リポの作業。
compatibility: >-
  macOS + Homebrew + mise 環境を前提。`gh` CLI（認証済み）、`go`、`docker`、
  `npx markdownlint-cli2` が要る。self-hosted runner が 5 台登録済みであること。
---

# 版を上げる

## この作業が難しい理由

**同じ `.github/workflows/` の中に 2 種類の実行環境が混ざっている。** 片方で正解の手が、
もう片方では必ず失敗する。2026-09-06 に 3 リポの定期実行がこれで止まった。

背景と「揃えてはいけない所」の一覧は `~/dev/me/dotfiles/docs/maintenance.md` にある。**先に読む。**

## 前提の確認

| 確認すること | コマンド | 期待 |
| --- | --- | --- |
| 全リポが最新か | `git -C ~/dev/me/<repo> status -sb` | behind 0・dirty 0 |
| runner が動いているか | `gh api repos/krtsato/<repo>/actions/runners -q '.runners[]\|"\(.name) \(.status) busy=\(.busy)"'` | online・busy=false |
| mise が持っている版 | `mise ls` | 上げたい版が入っている |

**busy=true の runner は触らない。** job を殺す。

## 手順

### 1. 上げる対象を洗い出す

版が書かれている場所を全部拾う。**1 か所でも漏らすと、ビルドは通るのに CI だけ古い版**になる。

```bash
cd ~/dev/me
for r in mcp-tradingview mcp-invest-knowledge mcp-mediable mcp-note mcp-seeking-alpha mcp-youtube trade-moomoo; do
  echo "== $r"
  grep -rnE "^go |go-version:|python-version:|uses: .*@|version: v?[0-9]|^FROM " \
    "$r/go.mod" "$r/.github/workflows/" "$r/Dockerfile"* "$r/mise.toml" "$r/.golangci.yml" 2>/dev/null \
    | grep -vE "actions-runners|\.worktrees"
done
```

`actions-runners/` と `.worktrees/` は**作業コピーであって正本ではない**ので必ず除外する
（含めて数えると件数が倍になる）。

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

### 3. 版を書き換える

**同じ版を指す場所は同時に直す。**

| 直す順 | 対象 |
| --- | --- |
| 1 | `go.mod` の `go` 行と、全ワークフローの `go-version` |
| 2 | `mise.toml`（invest-knowledge のみ）— 自宅 Mac の実際の版がここで決まる |
| 3 | `Dockerfile*` の `FROM`。**digest 付き（trade-moomoo）は digest も張り替える** |
| 4 | `golangci-lint-action` の `version`（action 自体の `@v7` とは別物） |

digest の取り方:

```bash
docker pull python:3.14.7-slim >/dev/null && \
  docker inspect --format='{{index .RepoDigests 0}}' python:3.14.7-slim
```

### 4. runner の PATH を点検する

`.path` は登録時の写しなので**版を上げると指し先が消える**。shims が先頭にあれば何もしなくてよい。

```bash
for d in ~/dev/me/mcp-note/actions-runners/magazine-sync \
         ~/dev/me/mcp-seeking-alpha/actions-runners/alpha-picks-sync \
         ~/dev/me/mcp-mediable/actions-runners \
         ~/dev/me/mcp-invest-knowledge/actions-runners \
         ~/dev/me/mcp-tradingview/actions-runners; do
  echo "== $d"
  head -c 60 "$d/.path"; echo
  tr ':' '\n' < "$d/.path" | while read -r e; do [ -n "$e" ] && [ ! -d "$e" ] && echo "   欠落 $e"; done
done
```

先頭が `.../mise/shims` でない、または「欠落」が出たら `docs/maintenance.md` の手順で直す。

### 5. 検証する

| 何を | どう |
| --- | --- |
| ビルドとテスト | 各 Go リポで `go build ./... && go test ./...` |
| lint | CI に任せる（ローカルの golangci-lint は Go の版ずれで壊れることがある） |
| **self-hosted の実動作** | ワークフローを 1 本 `workflow_dispatch` で走らせる。**dry run は途中で止まることがある**ので、どのステップまで到達したかを必ず確認する |
| runner が新設定を読んだか | run のログから `/usr/bin/xcrun` の警告が消えたこと |

### 6. PR にする

**1 PR = 1 リポ。** 横断でまとめない（1 つが赤いと全部止まる）。
本文には「どの版から どの版へ」と「self-hosted に影響があるか」を書く。

## 禁止事項

| してはいけないこと | なぜ |
| --- | --- |
| **self-hosted のワークフローに `actions/setup-python` を足す** | `/Users/runner` に入れようとして必ず失敗する（2026-09-06 に 3 リポが停止） |
| **`.path` に「今の PATH」をそのまま書き写す** | 対話シェルの PATH には存在しないフォルダが多数混ざる。**shims を先頭に置く**のが正解 |
| **busy な runner を再起動する** | 実行中の job を殺す |
| **distroless と debian を無理に揃える** | mediable は ffmpeg、note は日本語 OCR が要る。**理由があって分かれている** |
| **`actions-runners/` 配下のファイルを正本として数える／編集する** | 作業コピー。正本はリポジトリ直下 |
| 版だけ上げて動作確認しない | 版の問題は**ビルドではなく実行時**に出る |

## 成功基準

- 版を書いている場所が**全部**同じ値になっている（手順 1 の洗い出しで再確認）
- self-hosted のワークフローを 1 本実際に走らせて成功している
- runner の `.path` に欠落が無く、先頭が shims
- 各リポの CI が green

## 実行チェックリスト

- [ ] `docs/maintenance.md` を読んだ
- [ ] 全リポが behind 0・dirty 0
- [ ] runner が online・busy=false
- [ ] 版が書かれている場所を洗い出した（作業コピーを除外して）
- [ ] `runs-on` で self-hosted と GitHub ホストを仕分けた
- [ ] 版を書き換えた（go.mod / workflows / mise.toml / Dockerfile / lint）
- [ ] runner の `.path` を点検した
- [ ] `go build` と `go test` が通る
- [ ] self-hosted のワークフローを 1 本実際に走らせた
- [ ] リポごとに PR を出した

## Troubleshooting

### `mkdir: /Users/runner: Permission denied`

self-hosted に `actions/setup-python` が入っている。**削除する**。Python の版は mise が決める。

### 版を上げたのに古い版で動く

`.path` が古い版のパスを指している。手順 4 で点検し、shims を先頭に置く。

### `Unexpected error attempting to determine if executable file exists '/usr/bin/xcrun/git'`

`/usr/bin/xcrun` が PATH に入っている（**ディレクトリでなく実行ファイル**）。害は無いがノイズになる。
`.path` から実在しない項目を除くと消える。**新しい `.path` を読んだかどうかの目印**にもなる。

### golangci-lint がローカルで動かない

Go の版と golangci-lint の版がずれていることが多い。**CI に判定させる**（GitHub ホストで動く）。

### 定期実行が「取り消し」で終わる

打ち切り時間に当たっている。失敗ではないので通知が出ないことがある。
`timeout-minutes` と実際の所要時間を比べる。
