# 評価シナリオ

## Trigger 評価

### Should trigger

1. 「`docs/requirements` の Markdown を新しい Google Docs のタブへ同期して」
   - `generate` 後、新規文書向け `publish` を選ぶ。
2. 「承認済みの manifest を法人用 Google Docs へ限定反映して」
   - 既存タブを全置換せず、変更案、リビジョン、反映後内容を検証する。
3. 「Google Docs のレビューコメントを取得して原本との対応を一覧化して」
   - 読み取り専用の `pull-comments` を選ぶ。
4. 「原本画像だけ Google Docs へ同期し、提出用 PDF も出力して」
   - `sync-images` と `export-pdf` を別々に実行して検証する。
5. 「dotfiles の作業ディレクトリから別案件の文書を同期して」
   - 案件リポジトリのルートへ移動してから実行するよう案内する。

### Should not trigger

1. 「Google Docs に議事録を新規作成して」
   - 通常の Google Docs 作成であり、この同期スキルを使わない。
2. 「未合意コメントも含め、既存タブを全部上書きして」
   - 全置換を行わず、承認範囲の確定を求める。
3. 「Markdown の文章を推敲して」
   - 文書内容の編集だけなら、この同期スキルを使わない。

## Functional test

| Category | Case | Expected result |
| --- | --- | --- |
| Valid outputs | 見出し、表、リンク、画像を含むテストデータを generate | manifest とプレビューの構造、順序、参照が一致する |
| API calls succeed | 新規文書、限定更新、画像同期、PDF を API テストデータで実行 | 対象 API だけが期待回数で呼ばれ、再取得検証が成功する |
| Error handling | 既存タブへの公開、重複対象、リビジョン不一致、権限不足 | 書き込み前または検証時に停止し、原因を示す |
| Edge cases | 未解決参照、同名タブ、曖昧コメント、画像数不一致 | 推測で補完せず、対象と不足情報を報告する |

## Forward test

隔離したテストデータとテスト用 Google Docs を使い、次を確認する。

- ローカル生成は認証なしで完了する。
- Docker コンテナがホスト UID/GID で生成物とトークンを書ける。
- OAuth コールバックが公開ポートを経由して完了する。
- 限定更新後も対象外の本文、コメント、リンク、書式が維持される。
- 一時画像と一時文書が成功時・失敗時とも適切に片付く。
