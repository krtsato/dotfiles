# golangci-lint の版を揃える

手順 3 の「直す順」5（手元の `golangci-lint` を CI と同じ版に入れ直す）の詳細。

## Go の版を上げる PR では golangci-lint も上げる

**Go の修正版を上げただけで、古い lint が標準ライブラリを読めなくなることがある。**
2026-10-12、Go 1.27.1 → 1.27.2 で v2.13.2 が全 8 リポで型検査の誤りを出し、v2.14.0 で 0 件に戻った
（下の「よくある故障」）。**Go の版を上げる PR では、lint を走らせて確かめてから PR にする。**

## 手元の golangci-lint を CI に揃える

**版は mise が管理する。** `~/dev/me/mise.toml` に書いてあり、CI の `version:` と同じ値にする。

```bash
grep -rh -A2 'golangci-lint-action' ~/dev/me/*/.github/workflows/*.y*ml | grep 'version:'
grep golangci ~/dev/me/mise.toml
```

両方が同じでなければ `mise.toml` を直して `mise install` する。

## 割り込んでいる実行ファイルを退ける

**よくある故障はこちら。** `go install` で入った古い版が `~/go/bin` に居座り、
**mise の shims より PATH で先に来る**。mise は正しい版を持っているのに、走るのは別物になる。

```bash
which -a golangci-lint      # 1 行目が ~/go/bin なら割り込まれている
golangci-lint version       # 走る版を必ず確かめる
```

**割り込みの診断と、それを消した後の確認では、わざと `mise x --` を付けない。** エディタやフックが
素の名前で呼んだときに実際に何が走るかを見るのが目的だから（このファイルの素の呼び出しはすべてこれ）。
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

## よくある故障

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
