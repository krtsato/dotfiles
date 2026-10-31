# 評価シナリオ

## Should trigger

| 依頼の言葉 | 期待する動作 |
| --- | --- |
| 「キャッシュを掃除して」 | 発動する。見るだけで流して一覧を示し、確認を取ってから `--apply` |
| 「ディスクを空けたい」 | 発動する。6 種の大きさを示す。`~/.claude` も重いなら prune-agent-storage を併せて案内する |
| 「uv cache を消して」 | 発動する。鍵を持つ会話があれば、そのフォルダと端末を示して閉じるよう伝える |
| 「runner が太っている」 | 発動する。`--only runner` で古い本体・`_update`・使っていない Go を示す |

## Should NOT trigger

| 依頼の言葉 | 期待する動作 |
| --- | --- |
| 「古い plan を消して」 | 発動しない。prune-agent-storage を使う |
| 「brew cleanup して」 | 発動しない。Homebrew は対象外 |
| 「Go を上げて」 | 発動しない。upgrade-runtimes を使う |

## 安全側に倒れることの確認

試験用の置き場を作り、`NPX_DIR`・`DERIVED`・`DEV_ROOT` で差し替え、偽の `gh` と `svc.sh` を置いて流す。

| 場面 | 期待 |
| --- | --- |
| npx・DerivedData に 30 日超と最近のものが 1 つずつ | 古い方だけが消える |
| runner に古い本体・`_update`・`go-version` に無い Go | その 3 種だけが消え、`svc.sh` が stop → start の順に 1 回ずつ呼ばれる |
| `gh` が busy=true を返す | runner は何も消さず、`svc.sh` も呼ばない。終了コード 1 |
| `go-version: '1.27'` が混ざる | Go は残し、古い本体だけを候補に出す。終了コード 1 |
| 消すものが 0 件 | 大きさが 0 と出る（作業フォルダ全体を測らない） |
| uv の鍵を別の処理が持つ | uv は消さず、鍵を持つ処理の会話のフォルダと端末を出す |
