# 定型保守 — 版上げと runner の手入れ

`~/dev/me` 配下の 7 リポと、それらを動かす自宅 Mac（self-hosted runner）の保守手順。
**版を上げるときに壊れやすい所**と、**揃っていないが揃えてはいけない所**を書く。

実行手順は skill `upgrade-runtimes` にある。この文書は**なぜそうするのか**を持つ。

## 最重要 — 自宅 Mac と GitHub の機械を混同しない

**同じ `.github/workflows/` の中に 2 種類の実行環境が混在している。** 見分けは `runs-on:` の 1 行だけ。

| `runs-on` | どこで動くか | 使えるもの |
| --- | --- | --- |
| `ubuntu-latest` 等 | GitHub の機械 | `actions/setup-*` が全部使える |
| `[self-hosted, macOS, *]` | **自宅の Mac** | **`actions/setup-python` は使えない**（後述） |

自宅 Mac で動くワークフローは **15 本**（tradingview 4 / invest-knowledge 7 / mediable 2 / note 1 / seeking-alpha 1）。

### `actions/setup-python` を self-hosted に足してはいけない

このアクションが落とす Python は **GitHub の macOS 機械向けにビルド**されており、
インストール先が `/Users/runner` に固定されている。自宅 Mac にそのパスは無く、作れない。

```text
##[error]mkdir: /Users/runner: Permission denied
```

**2026-09-06 に 3 リポの定期実行がこれで止まった。** 版番号は無関係で、ステップの追加そのものが原因。

`actions/setup-go` は**問題なく使える**（Go の配布物は場所に依存しない）。同じ「setup-*」でも挙動が違う。

自宅 Mac で Python の版を決めているのは **mise**。ワークフロー側で決めるものではない。

## runner の PATH は登録時の写しで、黙って古くなる

`<runner>/.path` は `config.sh` を実行した瞬間の PATH を**そのまま保存したファイル**で、job の PATH になる。
mise は Go と terraform を**版番号つきのパス**で PATH に入れるため、**版を上げるたびに指し先が消える**。

2026-09-07 の実測では **5 台中 3 台**が存在しない `mise/installs/go/1.26.4` を指していた。

### 直し方 — 写し直すのではなく、変わらない場所を指す

`~/.local/share/mise/shims` を `.path` の**先頭**に置く。shims は版が上がってもパスが変わらないので、
**同じ陳腐化が二度と起きない**。

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
`Unexpected error attempting to determine if executable file exists` を出していた。実測 4 件 → 0 件。

**job が動いている間は再起動しない**。`gh api repos/krtsato/<repo>/actions/runners -q '.runners[].busy'` で確認する。

## 版が書かれている場所

| 場所 | どのリポ | 備考 |
| --- | --- | --- |
| `go.mod` の `go` | Go 6 リポ | trade-moomoo は Python なので無い |
| `.github/workflows/*.yaml` の `go-version` | Go 6 リポ | self-hosted でも `actions/setup-go` を使う |
| `.github/workflows/*.yaml` の `python-version` | **GitHub の機械のみ** | self-hosted に足さない |
| `.github/workflows/*.yaml` の `uses: <action>@<版>` | 全リポ | `checkout@v4` 等 |
| `golangci-lint-action` の `version` | Go 6 リポ | action の版（`v7`）と lint 本体の版（`v2.13.2`）は別 |
| `Dockerfile*` の `FROM` | 6 リポ | **固定の仕方が 2 通り**（下記） |
| `mise.toml` の `[tools]` | invest-knowledge のみ | 自宅 Mac の版を決める |
| `.golangci.yml` | tradingview のみ | 他 5 リポは既定設定 |

## 揃っていないが、揃えてはいけないもの

**直そうとする前にここを読む。** いずれも理由があって分かれている。

| 分かれている所 | 理由 |
| --- | --- |
| mediable の実行イメージが `debian:bookworm-slim` | **ffmpeg が要る**。distroless にはパッケージ管理が無く入れられない |
| note の実行イメージが `debian:bookworm-slim` | **日本語 OCR（tesseract）が要る**。同上 |
| tradingview / invest-knowledge / youtube が distroless | 外部コマンドが不要なので、攻撃面の小さい方を選べる |

## 揃っていて、揃えてよいもの

| 分かれている所 | 揃えるとどうなるか |
| --- | --- |
| youtube のビルド用イメージが `bookworm`（他は `alpine`） | **どちらでも出力は同じ**（`CGO_ENABLED=0` の静的バイナリ）。揃えても壊れないが、得るものも無い |
| Python イメージの固定（trade-moomoo は digest 付き・他はタグのみ） | digest 付きは**同じ物が確実に手に入る**。代わりに版上げのたび digest も張り替える必要がある |
| `.golangci.yml` が 1 リポだけ | 他 5 リポへ配ると **`modernize` が新たに効いて指摘が出る**。CI が一時的に赤くなるので、直す時間とセットで判断する |

## 版上げの順番

1. **`go.mod` と `go-version` は同時に**。片方だけ上げると、ビルドは通るのに CI だけ古い版になる
2. **`mise.toml` があるリポは同時に**（invest-knowledge）。runner の実際の版がここで決まる
3. **Dockerfile の `FROM`** も同じ版に。digest 付きは digest も張り替える
4. **runner の `.path`** を確認する（shims が先頭にあれば何もしなくてよい）
5. **self-hosted のワークフローを 1 本 dry run** して確かめる

## 版上げ以外の定型保守

| 何を | いつ | どうやって |
| --- | --- | --- |
| 定期実行の失敗通知 | 毎朝 | Slack に来る。`notify-failures.yaml` が全リポにある |
| 停滞の検知 | 毎日 | `health-check.yaml`（tradingview / invest-knowledge / mediable）。**新しい定期ワークフローを足したら manifest への追記が要る** |
| Docker の掃除 | 毎回の同期で自動 | note の同期が `always()` で prune する |
| 止められた digest の下書き | 失敗を調べるとき | `~/.config/mcp-invest-knowledge/withheld-drafts`（14 日 / 50 件） |

## 関連文書

- 各リポ `docs/health-check.md`（tradingview / invest-knowledge / mediable）— 停滞検知の仕組みと盲点
- `mcp-invest-knowledge/docs/github-actions-pipeline.md` — self-hosted runner の前提が最も詳しい（`claude` の keychain 認証など）
- `mcp-tradingview/docs/ledger-sync.md` — 台帳同期の設定値
