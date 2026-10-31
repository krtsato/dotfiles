# 困ったとき

`upgrade-runtimes` の作業中によく出る症状と対処（golangci-lint の症状を除く）。

## `mkdir: /Users/runner: Permission denied`

自宅 Mac の runner に `actions/setup-python` が入っている。**削除する**。Python の版は mise が決める。

## 版を上げたのに古い版で動く

`.path` が古い版のパスを指している。手順 4 で点検し、shims を先頭に置く。

## `Unexpected error attempting to determine if executable file exists '/usr/bin/xcrun/git'`

`/usr/bin/xcrun` が PATH に入っている（**ディレクトリでなく実行ファイル**）。害は無いがノイズになる。
`.path` から実在しない項目を除くと消える。**新しい `.path` を読んだかどうかの目印**にもなる。

## 定期実行が「取り消し」で終わる

打ち切り時間に当たっている。失敗ではないので通知が出ないことがある。
`timeout-minutes` と実際の所要時間を比べる。
