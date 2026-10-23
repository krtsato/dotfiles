# Google Docs Sync

Markdown ファイルを Google Docs のタブへ変換し、限定更新、コメント取得、画像同期、PDF 出力を行う汎用 CLI です。案件固有のパス、表示文言、番号規則、PDF 対象範囲は外部 config で指定します。

## 設定の追加項目

基本の config 例、実行パス、認証手順は「設定とコマンド」で管理する。次は必要な機能だけに追加する任意項目である。

| 項目 | 用途と条件 |
| --- | --- |
| `screenDirectory` | 画面例の画像ディレクトリ名。既定は `screens` |
| `screenLabelFile` | 画面例の表示名を定義するファイル |
| `commentReference` | コメント周辺の識別子抽出に使う `label`、`directPattern`、`nearbyPattern`。後 2 項目は案件の識別子に合う正規表現 |
| `numberedHeadings` | 文書見出しの `prefix`、`min`、`max`。案件の採番範囲を指定 |
| `pdf` | PDF の `includeNumberedFiles.min/max`、`outputFile`、`creator`。`export-pdf` で必須 |
| `repoRoot` | 画像同期に `--source-ref` を使う場合の Git ルート |
| `stateDir` | 公開状態ファイルの配置先。認証情報とは別 |
| `temporaryImagePrefix` | 一時画像を識別する名前の接頭辞 |
| `allowPublicTemporaryImages` | 画像挿入時の一時公開を了承済みの場合だけ `true` |

すべての相対パスは config の親ディレクトリを基準に解決する。

## コマンド

```text
google-docs-sync generate --config=<path>
google-docs-sync publish --config=<path> [options]
google-docs-sync pull-comments --config=<path> [options]
google-docs-sync apply-patches --config=<path> --manifest=<path> [--apply|--verify]
google-docs-sync sync-images --config=<path> [--apply]
google-docs-sync export-pdf --config=<path> [--output=<path>]
```

## 開発

```bash
cd ~/.claude/skills/sync-google-docs/scripts/google-docs-sync
npm ci
npm test
```

ローカルテストには Node.js 22 以上と npm が必要です。
