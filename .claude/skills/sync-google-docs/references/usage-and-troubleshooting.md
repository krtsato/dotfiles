# 使用例とトラブルシューティング

## 使用例

### 生成だけを確認する

**Input:** 「Markdown から Google Docs 用プレビューを生成して」

```bash
~/.claude/skills/sync-google-docs/scripts/sync.sh generate --config=path/to/config.json
```

**Expected output:** ビルドディレクトリに manifest とプレビューが生成され、Google API への書き込みは 0 件になる。

### 合意済み変更を限定反映する

**Input:** 「承認済み manifest を既存 Google Docs へ反映して」

```bash
~/.claude/skills/sync-google-docs/scripts/sync.sh apply-patches --config=path/to/config.json --manifest=path/to/approved.json
~/.claude/skills/sync-google-docs/scripts/sync.sh apply-patches --config=path/to/config.json --manifest=path/to/approved.json --apply
~/.claude/skills/sync-google-docs/scripts/sync.sh apply-patches --config=path/to/config.json --manifest=path/to/approved.json --verify
```

**Expected output:** manifest 対象だけが更新され、文書リビジョン、反映値、コメント表示の検証が成功する。

### 提出用 PDF を作る

**Input:** 「設定した範囲を PDF として出力して」

```bash
~/.claude/skills/sync-google-docs/scripts/sync.sh export-pdf --config=path/to/config.json
```

**Expected output:** 一時コピーだけが加工され、config のビルドディレクトリへ PDF が生成される。元の Google Docs は変わらない。

## 中断後の再開

- `generate` の manifest とプレビューを再生成し、同期元が変わっていないことを確認する。
- 新規文書の公開に失敗した場合、この実行で作成した不完全な文書をゴミ箱へ移し、`stateDir/.document-id` を削除する。その後に `--new-document` で再実行する。
- 既存文書への新規タブ追加に失敗した場合、この実行で追加したタブを削除する。その後に変更案の検証から再実行する。
- 不完全な文書の後片付けにも失敗した場合、エラーに表示された文書 ID を確認して手動でゴミ箱へ移してから再実行する。
- 限定更新と画像同期は変更案の検証からやり直し、リビジョンと対象件数を再確認してから反映する。
- OAuth 完了後は認証情報ディレクトリのトークンを再利用できる。認証処理だけを繰り返さない。
- 一時画像の残存エラーでは、設定した接頭辞に一致する一時ファイルだけを Drive で確認・削除してから再実行する。

## Troubleshooting

| Error | Cause | Solution |
| --- | --- | --- |
| config が見つからない | runner の既定パスが案件と異なる | `--config=<path>` で案件 config を指定する |
| OAuth コールバックが完了しない | Docker ポートが公開されていない、または URL をホストで開いていない | runner を使い、表示 URL をホストのブラウザで開く |
| refresh トークンが返らない | 過去の grant が残り、同意画面が省略された | 対象 OAuth grant を取り消し、同じアカウントで再認証する |
| 既存タブへの公開が拒否される | 公開対象が既存タブと衝突している | 既存本文は限定更新 manifest で更新する |
| 置換対象が 0 件または複数件 | manifest の旧値か対象範囲が現文書と一致しない | 最新文書を取得し、一意な対象へ manifest を修正する |
| リビジョン不一致 | 読み取り後に別の編集が入った | 最新状態から変更案を作り直す |
| 一時画像が残っている | 画像挿入後の後片付けが失敗した | エラーに表示された文書 ID の反映結果を確認し、残存画像 ID を削除する。反映済みなら再公開しない |
| 不完全な新規文書が残っている | 公開失敗後の自動後片付けにも失敗した | エラーに表示された文書 ID をゴミ箱へ移し、`.document-id` を削除してから再実行する |
| 画像同期が失敗する | Drive のリンク共有が組織ポリシーで禁止されている | ポリシーを確認し、許可済みの画像公開方式を選ぶ |
| トークンを書き込めない | bind マウントの所有者とコンテナユーザーが異なる | runner を使い、ホスト UID/GID でコンテナを実行する |
