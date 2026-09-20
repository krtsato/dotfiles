# 実行環境の前提

版を上げる作業に**必要な事実だけ**をここに置く。背景や過去の実測値は
`~/dev/me/dotfiles/docs/maintenance.md` にある。

## 自宅 Mac と GitHub の機械の見分け方

**同じ `.github/workflows/` の中に 2 種類の実行環境が混在している。** 見分けは `runs-on:` の 1 行だけ。

| `runs-on` | どこで動くか | 使えるもの |
| --- | --- | --- |
| `ubuntu-latest` 等 | GitHub の機械 | `actions/setup-*` が全部使える |
| `[self-hosted, macOS, *]` | 自宅 Mac | **`actions/setup-python` は使えない**（後述） |

`watcher` は GitHub の機械だけで動く（自宅 Mac の runner を持たない）。

## `actions/setup-python` を自宅 Mac の runner に足してはいけない理由

このアクションが落とす Python は **GitHub の機械（macOS）向けにビルド**されており、
インストール先が `/Users/runner` に固定されている。自宅 Mac にそのパスは無く、作れない。

```text
##[error]mkdir: /Users/runner: Permission denied
```

**2026-09-06 に 3 リポの定期実行がこれで止まった。** 版番号は無関係で、ステップの追加そのものが原因。

`actions/setup-go` は**問題なく使える**（Go の配布物は場所に依存しない）。同じ「setup-*」でも挙動が違う。

自宅 Mac で Python の版を決めているのは **mise**。ワークフロー側で決めるものではない。

## 揃えてはいけない 3 件

**直そうとする前にここを読む。** いずれも理由があって分かれている。

| 分かれている所 | 理由 |
| --- | --- |
| mediable の実行イメージが `debian:bookworm-slim` | **ffmpeg が要る**。distroless にはパッケージ管理が無く入れられない |
| note の実行イメージが `debian:bookworm-slim` | **日本語 OCR（tesseract）が要る**。同上 |
| tradingview / invest-knowledge / youtube が distroless | 外部コマンドが不要なので、攻撃面の小さい方を選べる |

## runner の前提

`<runner>/.path` は `config.sh` を実行した瞬間の PATH を**そのまま保存したファイル**で、job の PATH になる。
mise は Go と terraform を**版番号つきのパス**で PATH に入れるため、**版を上げるたびに指し先が消える**。

### 直し方 — 写し直すのではなく、変わらない場所を指す

`~/.local/share/mise/shims` を `.path` の**先頭**に置く。shims は版が上がってもパスが変わらないので、
同じ陳腐化が二度と起きない。

```bash
# 1 台ぶん。全台は skill が回す
d=~/dev/me/<repo>/actions-runners   # note と seeking-alpha はさらに 1 階層下
cp "$d/.path" "$d/.path.bak-$(date +%Y%m%d-%H%M%S)"
# 実在するディレクトリだけ残し、shims を先頭に置く
tr ':' '\n' < "$d/.path" | awk -v s=~/.local/share/mise/shims 'BEGIN{print s} $0!=s' \
  | while IFS= read -r e; do [ -n "$e" ] && [ -d "$e" ] && printf '%s:' "$e"; done \
  | sed 's/:$//' > "$d/.path.new" && mv "$d/.path.new" "$d/.path"
(cd "$d" && ./svc.sh stop && ./svc.sh start)
```

**効いたことの確認**: run のログから `/usr/bin/xcrun` の警告が消える。
`/usr/bin/xcrun` は**ディレクトリでなく実行ファイル**なのに PATH に入っており、毎回
`Unexpected error attempting to determine if executable file exists` を出していた。

**job が動いている間は再起動しない**。
`gh api repos/krtsato/<repo>/actions/runners -q '.runners[].busy'` で確認する。
