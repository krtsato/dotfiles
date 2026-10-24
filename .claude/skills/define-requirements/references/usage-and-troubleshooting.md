# 使用例とトラブルシューティング

## 使用例

### 新規要件定義

入力:

```text
提案書とPoC資料を読み、意思決定者向けの要件定義方針を作成してください。
```

期待する出力:

- 文書の読者、目的、合意範囲
- 根拠資料の優先順位
- 要求識別子と個別要件の対応方針
- 設計書や内部検討へ分離する内容
- 依存関係に基づくレビュー順

### 横断変更

入力:

```text
「管理番号」を「資産番号」へ変更し、要件定義書と派生成果物へ漏れなく反映してください。
```

期待する出力:

- 編集前の影響対象一覧
- 編集正本と派生成果物への限定的な変更
- 履歴と更新禁止の根拠資料を除いた旧表記の検索結果
- 案件指定の linter、差分の検証、関連テストの結果

### Google Docs の承認済み限定更新

入力: 「承認済みの要件変更を Google Docs の該当箇所へ反映して」

期待する出力: 対象とリビジョンを固定した変更案、合意範囲への反映結果、コメント・書式の読み戻し結果。共有スキル `sync-google-docs` が利用できる場合の例:

```bash
~/.claude/skills/sync-google-docs/scripts/sync.sh apply-patches --config=docs/config.json --manifest=docs/approved.json
~/.claude/skills/sync-google-docs/scripts/sync.sh apply-patches --config=docs/config.json --manifest=docs/approved.json --apply
~/.claude/skills/sync-google-docs/scripts/sync.sh apply-patches --config=docs/config.json --manifest=docs/approved.json --verify
```

案件ルートで実行する。Codex の共有パスは `~/.codex/skills/sync-google-docs/scripts/sync.sh`。Docker と OAuth 認証、対象の外部文書への権限が必要で、画像の一時公開はこの例の範囲に含めない。Google Docs 以外の外部サービスでは利用可能な限定更新と読み戻しの操作を確認し、保護できなければ unsupported として未反映範囲を報告する。

## 検証コマンド例

案件指定の linter と規約を優先し、利用できる場合は次のように確認する。

```bash
rg -n '変更前の名称' .
git diff --check
npx markdownlint-cli2 path/to/changed-file.md
```

検索結果が 0 件であることだけで完了とせず、ID、親概念、画面、データ列などの意味上の依存も確認する。

## Troubleshooting

| Error | Cause | Solution |
| --- | --- | --- |
| 要求の根拠を特定できない | 提案書、議事録、参考資料の位置づけが不明 | 資料の版、決定権限、合意状態を確認し、矛盾は出典と確認先を未決として記録する |
| 詳細をどこへ書くか判断できない | 要件と設計の境界が曖昧 | 実現方法を変えても業務結果が変わらないものは設計、配置・色・部品は UI 仕様として分類し、業務結果に不要な詳細は設計書へ移す |
| 旧表記が検索で見つからないが不整合が疑われる | 意味が変わった別名称や画像内文字が残っている | 文字列検索に加え、CSV 列、画像、ID 体系、リンクを意味単位で確認する |
| 外部文書の更新でコメントを保持できない | 全置換または API の制約でアンカーが失われる | 更新を止め、原文を復元できる状態を保ち、限定更新を既定とし、限定更新でもコメントを保てない場合だけ手動反映へ切り替える |
| 確認事項などの表に行を足すと markdownlint が MD060（table-column-style）で失敗する | 列の区切りをそろえる書式の表で、日本語を 1 文字幅として空白を詰めた | 日本語（全角）を 2 文字幅として数え、既存の行と同じ位置に区切りが来るよう空白を足す。規則を無効にして逃げない |
| 数値の合否条件を決められない | 範囲、評価資料、ばらつき、業務上の根拠が不足している | 条件を発明せず、測定方法と未決事項を記録して合意する |
