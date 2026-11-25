# 評価シナリオ

## Should trigger

| 依頼の言葉 | 期待する動作 |
| --- | --- |
| 「キャッシュを掃除して」 | 発動する。見るだけで流して一覧を示し、確認を取ってから `--apply` |
| 「ディスクを空けたい」 | 発動する。6 種の大きさと、Go のビルドの cache の大きさ（目安を超えれば警告）を示す。`~/.claude` も重いなら prune-agent-storage を併せて案内する |
| 「uv cache を消して」 | 発動する。鍵を持つ会話があれば、そのフォルダと端末を示して閉じるよう伝える |
| 「runner が太っている」 | 発動する。`--only runner` で古い本体・`_update`・使っていない Go を示す |
| 「Chrome のキャッシュを消して」 | 発動する。起動中なら終了させてよいかを聞き、了承後に通常の終了 → 消す → 起動し直す |

## Should NOT trigger

| 依頼の言葉 | 期待する動作 |
| --- | --- |
| 「取り残された編集前の退避を消して」 | 発動しない。prune-agent-storage を使う（`~/.claude` の中は対象外） |
| 「brew cleanup して」 | 発動しない。Homebrew は対象外 |
| 「Go を上げて」 | 発動しない。upgrade-runtimes を使う |
| 「Chrome の閲覧履歴を消して」 | 発動しない。履歴・cookie は cache ではない |

## 安全側に倒れることの確認

試験用の置き場を作り、`NPX_DIR`・`DERIVED`・`DEVICE_SUPPORT`・`NPM_CACHE`・`GOIMPORTS_CACHE`・`CHROME_CACHE`・`DEV_ROOT` で差し替え、偽の `gh` と `svc.sh` を置いて流す。

| 場面 | 期待 |
| --- | --- |
| npx・DerivedData に 30 日超と最近のものが 1 つずつ | 古い方だけが消える |
| runner に古い本体・`_update`・`go-version` に無い Go | その 3 種だけが消え、`svc.sh` が stop → start の順に 1 回ずつ呼ばれる |
| `gh` が busy=true を返す | runner は何も消さず、`svc.sh` も呼ばない。終了コード 1 |
| `go-version: '1.27'` が混ざる | Go は残し、古い本体だけを候補に出す。終了コード 1 |
| Go のビルドの cache が目安を超える（`GO_CACHE_WARN_GB=0` で再現） | `warn:` と `go clean -cache` のコマンドが出る。`--apply` を付けても cache の大きさは変わらず、終了コードも 0 のまま |
| `GO_CACHE_WARN_GB` が整数の GB でない（`0.5`・`oops`） | `skip:` で知らせて 10 GB を目安に使う。終了コード 1。`08` は 8 GB として読む |
| 消すものが 0 件 | 大きさが 0 と出る（作業フォルダ全体を測らない） |
| uv の鍵を別の処理が持つ | uv は消さず、鍵を持つ処理の会話のフォルダと端末を出す |
| DeviceSupport に同じ機種の `26.5.2`・`26.6.1`・`26.10.1` と別機種 1 つ | `26.10.1`（数として最新）と別機種が残り、2 つが消える |
| DeviceSupport に機種名の無い `17.0 (21A329)`・`16.4 (20E247)` と `weird` | どれも消えない（形の違う名前は残す） |
| `NPM_CACHE` を試験用に差し替えて `--apply` | 試験用の置き場だけが消え、本物の `~/.npm/_cacache` は残る |
| `NPM_CACHE` が `/_cacache` で終わらない／`ps` が失敗する／`npm cache add` が動いている | どれも npm 分を消さない。終了コード 1 |
| Chrome が起動中 | Chrome 分は消さず、終了のコマンドを `skip:` に出す。終了コード 1。スクリプトは Chrome を終了させない |
| `npm install`・`npm it` などの取得か、子の処理の無い `npm exec` が動いている（偽の `ps` で再現） | npm 分は消さず、そのコマンドを出す。終了コード 1。子のある `npm exec` だけなら、動いている時間に関係なく消す |
