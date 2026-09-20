# 評価シナリオ

## Should trigger

| 依頼の言葉 | 期待する動作 |
| --- | --- |
| 「Go を 1.26 に上げて」 | 発動する。手順 1 で版が書かれている場所を全リポ横断で洗い出し、`go.mod` と workflow を揃える |
| 「定期実行が Python の版で落ちた」 | 発動する。`runs-on` で自宅 Mac の runner か GitHub の機械かを仕分け、`actions/setup-python` の有無を疑う |
| 「runner の PATH が古い」 | 発動する。手順 4 だけを実施し、`.path` の先頭を shims にする |

## Should NOT trigger

| 依頼の言葉 | 期待する動作 |
| --- | --- |
| 「`go.mod` の require を更新して」 | 発動しない。依存ライブラリの更新は対象外（description の Do NOT use for に該当） |
| 「runner を新規登録して」 | 発動しない。新規登録は対象外（このスキルは既存 runner の点検のみ扱う） |
| 「アプリのバグを直して」 | 発動しない。アプリのコード変更は対象外 |
