---
name: sync-google-docs
description: Markdown 原本を Docker 上の Google Docs API・Google Drive API 同期 CLI で検証、公開、限定更新、コメント取得、画像同期、PDF 出力する。`.md`、`.json`、画像を対象に「Google Docs preview を生成する」「承認済み manifest を反映する」「コメントを取得する」「PDF を出力する」時に使う。通常の Google Docs 編集、未承認の変更、既存タブの全置換、本文の起案には使わない。
metadata:
  compatibility: Docker Engine と Bash が必要。ローカル CLI テストには Node.js 22 以上と npm が必要。Google API の読み書きには OAuth 認証、対象文書の権限、ネットワーク接続が必要。generate は認証不要。
---

# Google Docs 同期

Git 上の Markdown を正本として、案件設定に従い Google Docs と同期する。既存文書は承認済み manifest で対象箇所だけを更新し、コメントと書式を保護する。

## 重要事項

- 案件リポジトリのルートで実行する。dotfiles の作業ディレクトリから別案件を同期しない。
- Claude では `~/.claude/skills/sync-google-docs/scripts/sync.sh`、Codex では `~/.codex/skills/sync-google-docs/scripts/sync.sh` を使用する。実行環境がスキルの実パスを示す場合は、その絶対パスを使用する。
- 権限は実行環境の設定に従う。既存の承認は引き継ぎ、新たな認証や画像公開の了承が必要な場合は、利用環境の質問ツールで確認して回答を待つ。
- credentials と token を Git、Docker image、ログへ含めない。認証情報の配置は [設定とコマンド](references/configuration.md) に従う。
- 既存タブに `publish` を使わない。既存本文は `apply-patches` で限定更新し、タブ全体を置換しない。
- 一意に特定できない対象、権限不足、リビジョン不一致、コメントまたは書式を検証できない更新は停止して原因と影響を報告する。
- 画像挿入の一時公開は `allowPublicTemporaryImages=true` と明示的な了承がある場合だけ行う。

## ユースケース

| 依頼 | 行うこと | 成果 |
| --- | --- | --- |
| 同期前確認 | `generate` で設定と原本を検証する | API 書き込みなしの preview と manifest |
| 新規公開 | 検証後に新規文書または新規タブだけを公開する | 指定対象だけが追加された文書 |
| 既存文書の保守 | コメント、限定更新、画像、PDF を必要な範囲で実行する | コメントと書式を保護した更新または出力 |

## 成功基準

- 対象外のファイル、既存タブの全置換、意図しない Google API 更新は 0 件である。
- 生成、対象件数、反映後の読み戻しが成功し、コメント、リンク、書式、対象外タブを保護する。

## 進め方

1. `git status --short` で案件の既存変更を確認し、config、原本、同期先、操作範囲を特定する。
2. [設定とコマンド](references/configuration.md)を読み、案件ルートから `generate` を実行して preview、参照、画像を検証する。
3. 新規公開、既存本文の限定更新、画像更新、PDF 出力から必要な操作を選ぶ。外部文書を書き換える前に [書き込み安全策](references/safety.md) を読む。
4. 書き込み前に対象、旧値、一意性、文書リビジョン、承認範囲を検証する。既存文書は対象箇所だけを更新する。
5. 反映後に API 結果または生成物を読み戻し、対象件数、内容、コメント、リンク、書式を確認する。
6. 実行コマンド、対象、検証結果、残った事項を報告する。

大量のコメントの分類・読み取りは、委譲できる環境では読み取り専用の調査担当へ渡す。反映範囲の判断と検証は主担当が行い、調査担当からさらに委譲しない。

## 完了チェック

- [ ] config、原本、同期先、実行ディレクトリが意図した案件を指す
- [ ] credentials と token が Git 差分や出力ログに含まれない
- [ ] `generate` の preview、未解決参照、画像参照を確認した
- [ ] 書き込み対象、件数、リビジョン が承認済み範囲に一致する
- [ ] 反映後に内容、コメント、リンク、書式、対象外タブを検証した
- [ ] 一時画像公開は明示設定と了承を確認した
- [ ] テスト結果と未対応事項を報告した

## 参照資料

- [設定とコマンド](references/configuration.md): config、認証情報、案件ルートでの実行
- [同期 CLI](references/tool.md): CLI の設定と開発
- [書き込み安全策](references/safety.md): 既存文書を変更する前の手順
- [使用例とトラブルシューティング](references/usage-and-troubleshooting.md): 実行例と障害対応
- [評価シナリオ](references/evaluations.md): 発動条件と機能テスト
