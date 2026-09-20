# 定型保守 — 版上げと runner の手入れ

`~/dev/me` 配下の 8 リポと、それらを動かす自宅 Mac（self-hosted runner）の保守手順。
**版を上げるときに壊れやすい所**と、**揃っていないが揃えてはいけない所**を書く。

実行手順は skill `upgrade-runtimes` にある。**運用に必要な事実（見分け方・手順の元になる
仕組み）は skill の `references/environments.md` にまとめてある。** この文書は**背景と履歴**、
つまり過去に何が起きて何を揃えたかを持つ。

## 最重要 — 自宅 Mac と GitHub の機械を混同しない

見分け方と `actions/setup-python` を足してはいけない理由は `references/environments.md` にある。

自宅 Mac で動くワークフローは **15 本**（tradingview 4 / invest-knowledge 7 / mediable 2 / note 1 / seeking-alpha 1）。
`watcher` の 2 本は GitHub の機械だけで動くので、この数に入らない。

**2026-09-06 に 3 リポの定期実行が `actions/setup-python` の追加で止まった。** この経緯が
`references/environments.md` の禁止事項の根拠になっている。

## runner の PATH は登録時の写しで、黙って古くなる

仕組みと直し方は `references/environments.md` にある。

2026-09-07 の実測では **5 台中 3 台**が存在しない `mise/installs/go/1.26.4` を指していた。
直した後は run のログから `/usr/bin/xcrun` の警告が消えることで確認した（実測 4 件 → 0 件）。

## 版が書かれている場所

| 場所 | どのリポ | 備考 |
| --- | --- | --- |
| `go.mod` の `go` | Go 7 リポ | trade-moomoo は Python なので無い |
| `.github/workflows/*.yaml` の `go-version` | Go 7 リポ | 自宅 Mac の runner でも `actions/setup-go` を使う |
| `.github/workflows/*.yaml` の `python-version` | **GitHub の機械のみ** | 自宅 Mac の runner に足さない |
| `.github/workflows/*.yaml` の `uses: <action>@<版>` | 全リポ | `checkout@v4` 等 |
| `golangci-lint-action` の `version` | Go 7 リポ | action の版（`v7`）と lint 本体の版（`v2.13.2`）は別 |
| `Dockerfile*` の `FROM` | 6 リポ | **固定の仕方が 2 通り**（下記）。watcher は配布物を作らないので無い |
| `mise.toml` の `[tools]` | invest-knowledge のみ | 自宅 Mac の版を決める |
| `.golangci.yml` | Go 7 リポ | 全リポでバイト単位に同一 |

## 揃っていないが、揃えてはいけないもの

**直そうとする前にここを読む。** 一覧と理由（ffmpeg・日本語 OCR・distroless の使い分け）は
`references/environments.md` にある。いずれも理由があって分かれている。

## 揃っていて、揃えてよいもの

| 分かれている所 | 揃えるとどうなるか |
| --- | --- |
| youtube のビルド用イメージが `bookworm`（他は `alpine`） | **どちらでも出力は同じ**（`CGO_ENABLED=0` の静的バイナリ）。揃えても壊れないが、得るものも無い |
| Python イメージの固定（trade-moomoo は digest 付き・他はタグのみ） | digest 付きは**同じ物が確実に手に入る**。代わりに版上げのたび digest も張り替える必要がある |

## 揃え終わったもの

| いつ | 何を | 実測 |
| --- | --- | --- |
| 2026-09-07 | **`.golangci.yml` を 6 リポ全部に**（以前は tradingview だけ） | 指摘は 5 リポ合計 **50 件**、すべて `--fix` で直る定型置換。他の linter からの新規指摘は 0 件 |
| 2026-09-20 | **watcher にも lint を**（Go 7 リポ全部が同一設定に） | 初回 **7 件**（`modernize` 3・`staticcheck` 4）。うち 4 件は `--fix`、3 件は大文字始まりのエラー文で手直し |

`modernize` の指摘は挙動を変えない書き換えだけだった（`errors.As` → `errors.AsType`、
`strings.Split` → `strings.SplitSeq`、`if` の大小比較 → `min` / `max` など）。

**`--fix` の後はビルドを通す。** watcher では `sort.Slice` を `slices.Sort` に置き換えた後も
`sort` の import が残り、**そのままではコンパイルできなかった**。

**「揃える」と「厳しくする」は別物**である点に注意する。設定を配るのは後者で、
配った先で新たな指摘が出る。着手前に必ず件数を測る:

```bash
GL=~/.local/share/mise/installs/golangci-lint/2.13.2/golangci-lint-2.13.2-darwin-arm64/golangci-lint
for r in <repos>; do (cd ~/dev/me/$r && echo "$r: $($GL run --config ~/dev/me/mcp-tradingview/.golangci.yml   --output.text.path stdout 2>/dev/null | grep -cE '\.go:[0-9]+')"); done
```

## 版上げの順番

1. **`go.mod` と `go-version` は同時に**。片方だけ上げると、ビルドは通るのに CI だけ古い版になる
2. **`mise.toml` があるリポは同時に**（invest-knowledge）。runner の実際の版がここで決まる
3. **Dockerfile の `FROM`** も同じ版に。digest 付きは digest も張り替える
4. **runner の `.path`** を確認する（shims が先頭にあれば何もしなくてよい）
5. **自宅 Mac の runner のワークフローを 1 本 dry run** して確かめる

## 版上げ以外の定型保守

| 何を | いつ | どうやって |
| --- | --- | --- |
| 定期実行の失敗通知 | 毎朝 | Slack に来る。`notify-failures.yaml` が全リポにある |
| 停滞の検知 | 毎日 | `health-check.yaml`（tradingview / invest-knowledge / mediable）。**新しい定期ワークフローを足したら manifest への追記が要る** |
| Docker の掃除 | 毎回の同期で自動 | note の同期が `always()` で prune する |
| 止められた digest の下書き | 失敗を調べるとき | `~/.config/mcp-invest-knowledge/withheld-drafts`（14 日 / 50 件） |

## 関連文書

- 各リポ `docs/health-check.md`（tradingview / invest-knowledge / mediable）— 停滞検知の仕組みと盲点
- `mcp-invest-knowledge/docs/github-actions-pipeline.md` — 自宅 Mac の runner の前提が最も詳しい（`claude` の keychain 認証など）
- `mcp-tradingview/docs/ledger-sync.md` — 台帳同期の設定値
