# Google Docs Sync

Markdown ファイルを Google Docs のタブへ変換し、限定更新、コメント取得、画像同期、PDF 出力を行う汎用 CLI です。案件固有のパス、表示文言、番号規則、PDF 対象範囲は外部 config で指定します。

## Docker で実行

案件リポジトリのルートで実行します。

```bash
~/.claude/skills/sync-google-docs/scripts/sync.sh build
~/.claude/skills/sync-google-docs/scripts/sync.sh generate --config=path/to/config.json
```

runner はスキル内の source から配置パスごとの Docker image を build し、案件リポジトリを `/workspace` へ mount します。実行対象を明示する場合は `GOOGLE_DOCS_SYNC_WORKSPACE` を使用します。

## 設定

```json
{
  "version": 1,
  "documentTitle": "Product requirements",
  "sourceDir": "../source",
  "buildDir": "build",
  "indexFile": "00-index.md",
  "imageWidthPt": 386,
  "allowPublicTemporaryImages": false,
  "screenDirectory": "screens",
  "screenLabelFile": "../source/screen-labels.md",
  "labels": {
    "tabReference": "Tab",
    "unresolvedReference": "To be added",
    "screenExamplesHeading": "Screen examples",
    "screenExample": "Screen example"
  },
  "commentReference": {
    "label": "Requirement candidate",
    "directPattern": "Requirement\\s+(\\d+)",
    "nearbyPattern": "(?:^|\\D)(\\d+)(?=\\D|$)"
  },
  "numberedHeadings": {
    "prefix": "Tab",
    "min": 0,
    "max": 20
  },
  "pdf": {
    "includeNumberedFiles": {
      "min": 0,
      "max": 19
    },
    "outputFile": "document.pdf",
    "creator": "Google Docs Sync"
  }
}
```

`imageWidthPt` はポイント単位の画像幅で、文書の利用可能幅に合わせる値です。見出しと PDF の番号範囲も例であり案件ごとに設定します。

`tabLinkDocumentId`、`screenLabelFile`、`labels`、`commentReference`、`numberedHeadings`、`pdf`、`stateDir`、`repoRoot`、`temporaryImagePrefix`、`allowPublicTemporaryImages` は任意です。`commentReference` はコメント周辺から案件固有の識別子候補を抽出する場合に指定します。`export-pdf` を使う場合だけ `pdf` が必須で、`sync-images --source-ref` を使う場合だけ `repoRoot` が必須です。画像挿入では `allowPublicTemporaryImages=true` を明示し、一時画像が挿入中だけリンク閲覧可能になることを了承する必要があります。すべての相対パスは config の親ディレクトリを基準に解決します。

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
