# 設定とコマンド

runner は Bash スクリプト `sync.sh` を指し、Docker の起動とマウントを担当する。同期 CLI はコンテナ内で動く Node.js プログラムを指す。config は案件設定、manifest は公開対象または限定更新の入力定義、変更案はその manifest を検証して得る実行前の結果である。本文は操作を「公開」「限定更新」と呼び、`publish` と `apply-patches` は対応する CLI コマンド名である。`labels` の `Tab` などは変更可能な表示値であり、用語の規則ではない。

## 設定ファイル

同期 CLI は `--config=<path>` または `GOOGLE_DOCS_SYNC_CONFIG` で JSON 設定を受け取る。相対パスは config ファイルの親ディレクトリを基準に解決する。

Docker runner へ渡す config は案件リポジトリ内へ置く。相対パスと案件リポジトリ内の絶対パスを受け付け、コンテナ内の `/workspace` 配下へ変換する。案件リポジトリ外の config はマウントされないため、書き込み前に拒否する。

```json
{
  "version": 1,
  "documentTitle": "Product requirements",
  "sourceDir": "..",
  "buildDir": "build",
  "indexFile": "00-index.md",
  "imageWidthPt": 386,
  "allowPublicTemporaryImages": false,
  "tabLinkDocumentId": "google-document-id",
  "screenLabelFile": "../04-screens-and-dependencies.md",
  "labels": {
    "tabReference": "Tab",
    "unresolvedReference": "To be added",
    "screenExamplesHeading": "Screen examples",
    "screenExample": "Screen example"
  }
}
```

`imageWidthPt: 386` は画像幅をポイントで指定した例であり、文書の利用可能幅と読みやすさに合わせて変更する。`tabLinkDocumentId`、`screenLabelFile`、`labels` は不要なら省略する。`numberedHeadings` と `pdf.includeNumberedFiles` を使う場合の番号範囲は、案件の採番と提出範囲に合わせて設定する。例の数値を既定値として扱わない。

`allowPublicTemporaryImages` の既定値は `false` である。Google Docs API で画像を挿入する間だけ Drive 画像をリンク閲覧可能にし、挿入後に削除することを了承した場合に限り `true` へ変更する。

## Docker 実行

Docker デーモンを起動する。OAuth コールバックの既定ポート `127.0.0.1:8787` を使用できること。使用中なら `GOOGLE_OAUTH_CALLBACK_PORT` で空きポートを指定する。案件リポジトリは `generate` を含め、原本の読み取りと生成物・状態ファイルの保存のため読み書き可能としてマウントされる。

案件リポジトリのルートで実行する。Claude では次を使用する。Codex では `.claude` を `.codex` に読み替えてよい。実行環境がスキルの絶対パスを示す場合は、そのパスを使用する。

```bash
~/.claude/skills/sync-google-docs/scripts/sync.sh build
~/.claude/skills/sync-google-docs/scripts/sync.sh generate --config=path/to/config.json
~/.claude/skills/sync-google-docs/scripts/sync.sh pull-comments --config=path/to/config.json
```

別 config を使う場合は明示する。

```bash
~/.claude/skills/sync-google-docs/scripts/sync.sh generate --config=docs/project-a/googledocs/config.json
```

引数は CLI へそのまま渡す。

```bash
~/.claude/skills/sync-google-docs/scripts/sync.sh apply-patches --config=docs/project-a/googledocs/config.json --manifest=docs/project-a/googledocs/manifests/change.json
~/.claude/skills/sync-google-docs/scripts/sync.sh apply-patches --config=docs/project-a/googledocs/config.json --manifest=docs/project-a/googledocs/manifests/change.json --apply
```

## コマンド

| Command | Google Docs への書き込み | 用途 |
| --- | --- | --- |
| `generate` | なし | manifest とプレビューを生成する |
| `publish --new-document` | あり | 新規文書を作る |
| `publish --files=<file> --create-missing-tabs` | あり | 存在しない新規タブを追加する |
| `pull-comments` | なし | レビューコメントを取得する |
| `apply-patches --manifest=<file>` | なし | 変更案を検証する |
| `apply-patches --manifest=<file> --apply` | あり | 限定更新を反映する |
| `apply-patches --manifest=<file> --verify` | なし | 反映済み内容を再検証する |
| `sync-images` | なし | 画像差し替えの変更案を検証する |
| `sync-images --apply` | あり | 対象画像だけ差し替える |
| `export-pdf` | 一時コピーのみ | 元文書を変えず PDF を出力する |

## 認証情報

runner は既定でホストの `~/.config/gcloud/gdocs-sync` を `/credentials` としてマウントする。別の場所を使う場合は `GOOGLE_DOCS_SYNC_CREDENTIALS_DIR` を設定する。`GOOGLE_OAUTH_CREDENTIALS`、`GOOGLE_OAUTH_TOKEN`、コメント、編集、画像、PDF 用の各環境変数はコンテナ内の `/credentials/...` を指す。`stateDir` は公開状態の置き場であり、runner の認証情報の置き場ではない。

Google Cloud の対象プロジェクトで Google Docs API と Google Drive API を有効にし、ループバックコールバックを使用できるデスクトップ用 OAuth クライアントを用意する。

既定の認証ファイルは次のとおり。クライアントは利用者が用意する OAuth クライアント JSON、トークンは認証完了時に CLI が作成する。実値を文書や設定例へ転記しない。

| クライアントファイル | 作成されるトークン | 用途 |
| --- | --- | --- |
| `client.json` | `token.json` | 新規公開 |
| `comments-client.json` | `comments-token.json` | コメント取得 |
| `comments-client.json` | `edit-token.json` | 限定更新 |
| `client.json` | `pdf-token.json` | 画像同期と PDF 出力 |

既存の認証ファイルと権限を先に確認する。初回 OAuth では CLI が表示した URL をホストのブラウザで開く。Docker runner はコールバックポートをホストループバックだけへ公開し、取得したトークンを認証情報マウント上へ保存する。認証が必要な場合は利用環境の質問ツールで完了を確認し、コールバック完了後に処理を再開する。

## Docker イメージの整理

runner は配置パスごとに `google-docs-sync:<チェックサム>` のタグを使用する。配置を削除した後は、使用中のコンテナがないことと対象タグを確認し、不要なタグだけ `docker image rm <tag>` で削除する。共有タグや他のイメージを一括削除しない。
