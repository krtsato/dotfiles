---
name: screen-margin-improving-stocks
description: Screen Japanese stocks that satisfy three conditions at once — margin ratio improving week over week, trading volume rising, and a lecture-derived technique firing in the forward ledger — then report code, name, sector and the Japanese technique names in a table. Triggers on requests like "売買代金が上がっていて信用倍率が改善している銘柄を教えて", "買い推奨できそうな銘柄を30個", "信用需給が改善している銘柄のスクリーニング". Reads mcp-tradingview JSONL data (data/seido-margin, data/paper-ledger.jsonl) and one TradingView scanner response. Do NOT use for US stocks, for backtesting a single technique, for placing or sizing orders, or for evaluating the seido study itself (that is tradingview-seido-study).
compatibility: Requires local clones of mcp-tradingview and mcp-invest-knowledge, Docker, and outbound access to scanner.tradingview.com. The screen runs inside a container so the host's Go version and TLS roots cannot change the result; the image builds itself on first use. No API key, no Python, no jq. Read-only; the data and notes are mounted read-only and nothing is written.
allowed-tools: Bash(sh *), Bash(docker *), Bash(ls *), Read, Glob, Grep, Agent
---

# 信用倍率が改善していて売買が活発な買い候補を出す

## CRITICAL: 先に読むこと

- **条件を緩めて件数を合わせない。** 要求件数に届かなければ、**届かない事実をそのまま報告**する。
  緩めると「条件に合った銘柄」ではなく「件数を満たした銘柄」になる。
- **「儲かる」と書かない。** このデータ基盤自身の検証結果は「単独の技法にエッジ無し」。
  出力は**「条件に合った」**であって推奨の保証ではない。**必ず注意書きを添える**（[出力](#出力)）。
- **技法の重なりを確からしさとして読ませない。** 大半の銘柄に同じ技法（多くは一目均衡表）が入るため、
  **技法の内訳を必ず併記**する。
- **倍率の急低下は良い意味とは限らない。** 買い残の整理か、株価急落による投げかは倍率だけでは区別できない。

## 目次

- [ユースケース](#ユースケース)
- [前提条件](#前提条件)
- [手順](#手順)
- [出力](#出力)
- [チェックリスト](#チェックリスト)
- [成功基準](#成功基準)
- [完了基準](#完了基準)
- [Troubleshooting](#troubleshooting)
- [参照](#参照)

## ユースケース

### 1. 定例の絞り込み依頼

- **Trigger**: 「売買代金が日に日に上がっていて、信用倍率が改善傾向で、技法で買い推奨できる銘柄を 30 個」
- **Steps**: 市場データを 1 回取得 → スクリプトで 3 条件を掛け合わせ → 表と注意書きを出す
- **Result**: コード・銘柄名・セクター・技法（日本語）の表と、技法の内訳・注意書き

### 2. 件数を変えた再実行

- **Trigger**: 「さっきの条件で 10 個だけ」「50 個出して」
- **Steps**: 件数を変えて再実行（`screen.sh 10` のように**位置引数**で渡す）
- **Result**: 同じ条件・同じ順序の上位 N 件

### 3. 該当が少ないことの確認

- **Trigger**: 「今週は候補が少ない気がする」
- **Steps**: 通常どおり実行し、**絞り込みの各段階の件数**を読む
- **Result**: どの条件で落ちたかが分かる（例: 倍率改善 251 → 3 条件 32）

## 前提条件

| 要る物 | 確認方法 |
| --- | --- |
| mcp-tradingview のクローン | `ls ~/dev/me/mcp-tradingview/data/seido-margin` |
| mcp-invest-knowledge のクローン | `ls ~/dev/me/mcp-invest-knowledge/sources/technique-notes` |
| Docker | 判定はコンテナの中で動く。**Go も Python も jq もホストに要らない** |
| 外部接続 | `scanner.tradingview.com` へ **1 回だけ**問い合わせる。認証不要 |
| image | **毎回作り直す**。変更が無ければ 10 秒ほど（layer が再利用される） |

## 手順

### ステップ 1: 前提が揃っているか見る

```bash
ls ~/dev/me/mcp-tradingview/data/seido-margin
```

`syumatsu*.jsonl` が **4 つ以上**あること。無ければ週次の取り込みが止まっている。
**その場合は絞り込みを続けず、取り込みの失敗を先に直す。**

### ステップ 2: 絞り込みを実行する

引数は件数だけ。市場データの取得も 3 条件の判定も、**コンテナの中で**行う。
image は毎回作り直される（変更が無ければ 10 秒ほど。**tag の有無だけで済ませると古いコードで判定してしまう**）。

```bash
sh ~/.claude/skills/screen-margin-improving-stocks/scripts/screen.sh 30
```

**コンテナを使うのは、実行するマシンによって結果が変わらないようにするため。**
Go の版も証明書の中身も image に固定してあるので、**同じデータなら同じ表が出る**。
データと技法ノートは**読み取り専用**で渡され、コンテナは何も書かない。

標準出力に表、標準エラーに**絞り込みの各段階の件数**と**技法の内訳**が出る。**両方を読む。**

### ステップ 3: 表と注意書きを出す

[出力](#出力)の形をそのまま使う。**注意書きを省かない。**

### ステップ 4: 上位銘柄を掘り下げる（依頼があったときだけ）

「この銘柄をもっと詳しく」と言われた場合のみ、`Agent` ツールで調査を委譲する。
**メインの文脈を株価履歴や決算資料で埋めない。**

## 出力

表のあとに、**次の 4 点を必ず書く**。

1. **技法の内訳**（例: 30 件中 26 件に一目均衡表 → 重なりは実質「一目＋もう 1 つ」）
2. **代金が小さい銘柄**（1 億円未満は活況の比率が高くても売買できる量が小さい）
3. **倍率の急低下の読み方**（買い残の整理か株価急落かは区別できない）
4. **順位が「—」の銘柄の読み方**（上位 300 の記録外というだけで、**取引が無いという意味ではない**）
5. **「条件に合った」であって「儲かる」ではない**（この基盤の検証結果は「単独技法にエッジ無し」）

### 入出力の例

**入力**: 「信用倍率が改善していて売買が活発な買い候補を 5 個」

**出力**:

```text
倍率が改善 251 → 株式 245 → 売買が活発 77 → 技法が該当 32 件
うち順位の推移が分かるもの: 4 件（残りは上位 300 の外）

| # | コード | 銘柄名 | セクター | 終値 | 当日代金(億) | 順位の推移 | 出来高比 | 信用倍率 4週前→今 | 該当した技法 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 5019 | 出光興産 | エネルギー資源 | 1650 | 123 | 231位→104位 (+127) | 1.31 | 32.55 → 10.22 | 一目均衡表・雲上抜け |
```

**入力**: 「該当が 3 件しかないなら条件を緩めて 30 件にして」

**出力**: 緩めない。「3 件しか該当しません」と報告し、**どの条件で落ちたか**（各段階の件数）を示す。

## チェックリスト

- [ ] 週次データが 4 週以上あることを確認した
- [ ] **コンテナ経由**で実行した（ホスト直実行に切り替えていない）
- [ ] 件数は**位置引数**で渡した（`screen.sh 30`）
- [ ] 標準エラーの**絞り込み各段階の件数**を読んだ
- [ ] 要求件数に届かない場合、**条件を緩めずそのまま報告**した
- [ ] 表にコード・銘柄名・**セクター**・**日本語の技法名**を含めた
- [ ] **技法の内訳**を併記した
- [ ] **代金が小さい銘柄**を指摘した
- [ ] **「条件に合った」であって「儲かる」ではない**と明記した

## 成功基準

| 種類 | 基準 |
| --- | --- |
| **定量** | 起動から表の出力まで **Bash 5 回以内**／外部への問い合わせ **1 回**／条件を緩めた回数 **0 回** |
| **定性** | 利用者が追加の指示を出さなくても、**技法名が日本語で読め、注意書きが揃っている**こと |

## 完了基準

| 満たすこと | 確認方法 |
| --- | --- |
| 表の行数が要求件数、または該当件数と一致 | 表の最終行の番号を数える |
| 全行にセクターと技法（日本語）がある | 「不明」やローマ字の slug が無いことを目視 |
| 絞り込みの各段階の件数を報告した | 標準エラーの 2 行が出力に反映されている |
| 注意書き 5 点がある | [出力](#出力)の 5 項目と突き合わせる |

## Troubleshooting

### Error: `信用残高のファイルが見つかりません`

- **Cause**: `SCREEN_REPO` が mcp-tradingview を指していない、または週次データが未取得。
- **Solution**: `ls ~/dev/me/mcp-tradingview/data/seido-margin` で `syumatsu*.jsonl` の存在を確認する。
  無ければ週次の取り込みが止まっている。**絞り込みを続けず、取り込みの失敗を先に直す。**

### Error: `公表週が N 週しかありません`

- **Cause**: 週次データが 4 週分に満たない（新しい環境、または取り込みの停止）。
- **Solution**: 取り込みの実行履歴を確認する。**週数を減らして回避しない**——
  3 週の倍率変化は傾向ではなく雑音で、条件の意味が変わる。

### Error: `技法ノートが読めません`

- **Cause**: 技法ノートのパスが違う、または mcp-invest-knowledge が未クローン。
- **Solution**: `ls ~/dev/me/mcp-invest-knowledge/sources/technique-notes` を確認する。
  **技法名をローマ字の slug のまま出さない**——読み手が意味を取れない。

### 症状: 該当が 0 件になる

- **Cause**: 市場全体が閑散（売買が活発の条件で全滅）か、市場データの取得に失敗している。
- **Solution**: 標準エラーの**絞り込みの各段階の件数**を読む。「株式」の段階で 0 なら取得の問題、
  「売買が活発」の段階で 0 なら市場が閑散。**0 件は「該当なし」であって「エラー」ではない**ので、
  取得が正常なら 0 件をそのまま報告する。

### Error: `docker が見つかりません`

- **Cause**: Docker が未インストール、または起動していない。
- **Solution**: Docker を起動する。**やむを得ずホストで直接動かす場合は結果が Go の版に依存する**ので、
  そのことを報告に添える（コマンドはエラーメッセージが示す）。

### Error: `x509: certificate signed by unknown authority`

- **Cause**: image の土台に証明書が入っていない。`static-debian12:nonroot` ではなく
  `static-debian12:static-nonroot` を使うとこうなる。
- **Solution**: `Dockerfile.screen` の土台を確認する。**このコマンドは外部へ HTTPS で
  問い合わせるので、証明書の入った土台でなければ毎回失敗する。**

### 症状: コンテナとホストで結果が違う

- **Cause**: マウントしたパスが違う（別のリポジトリを指している）か、image が古い。
- **Solution**: `docker image rm tradingview-screen-margin:local` で作り直す。
  **結果が違うこと自体が異常**なので、報告する前に必ず原因を突き止める。

### 症状: 順位の推移が全部「—」になる

- **Cause**: 日次の順位記録が 8 営業日分に満たない、または該当銘柄が上位 300 の外。
- **Solution**: `ls ~/dev/me/mcp-tradingview/data/turnover-rank/japan` の件数を見る。
  8 日分未満なら記録の蓄積待ち。**「—」は「取引が無い」ではなく「上位 300 の記録外」**なので、
  そのまま報告してよい。

### 症状: 表の技法名が英字の slug のまま

- **Cause**: 該当する技法ノートに `title:` が無い、またはノートが削除された。
- **Solution**: `grep -L "^title:" ~/dev/me/mcp-invest-knowledge/sources/technique-notes/*.md` で
  題名の無いノートを特定する。**知識層側の欠落なので、そちらを直す。**

## 参照

- 判定の根拠と各条件の意味: [references/conditions.md](references/conditions.md)
- 評価シナリオ: [references/evaluations.md](references/evaluations.md)
