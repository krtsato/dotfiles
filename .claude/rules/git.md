# Git と GitHub

## ブランチと push

- **ブランチ作成前**と **push 前**に、既定ブランチを検出して `git fetch --all` と rebase で最新化する
- 既定ブランチにいるなら、`git fetch origin` と `git status` で遅れを確認し、遅れていたらユーザーに警告する

## コミットメッセージ

Conventional Commits に従う。

```text
<type>(<scope>): <description>
```

- 例: `feat(auth): add login validation`
- `type` は `feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore`
- 破壊的変更は `!` を付ける（例: `feat!: remove deprecated API`）
- **コミット単位で issue 番号に紐づけない。** issue 番号は Pull Request に紐づける

## 番号の書き方

**PR と issue の番号には必ずリポジトリ名を添える**（`mcp-tradingview #398`）。
チャット、PR 本文、issue、記憶のすべてで。番号だけでは、横断で作業しているリポジトリの
どれを指すか読み手に分からない。

## Pull Request

- リポジトリに `PULL_REQUEST_TEMPLATE.md` があれば、その内容に従う
- タイトルは英語で、コミットメッセージと同じ形式。**本文は日本語**
- issue 番号を関連付ける。対応する issue が無い場合は本文に `N/A` と書く
- 指定が無ければ **draft** で作成する
- 作成後に GitHub Copilot をレビュワーに追加する
- **1 つの PR は 1 つの目的に絞る**
- 本文の Reference 欄に**課題の URL** を書く。**マージで自動的に閉じない書き方**にする

### 本文の書き方

| 決まり | |
| --- | --- |
| 構成 | **結論を先に、詳細は後**。題と本文はシンプルに保つ |
| 視覚要素 | 太字・表・箇条書き・コードブロックを使い分ける |
| 見出し | `##` に `（）` を**使わない**。修飾は ` — ` |
| 実装の細部 | `<details><summary>詳細</summary></details>` で折りたたむ |

### Copilot のレビュー依頼

REST は 200 を返しても無視されることがある。GraphQL の `requestReviews` に bot の id を渡し、
**送った後に実際に付いたかを確認する**。

```sh
gh pr view <番号> --json reviewRequests
```

## GitHub の操作

`gh` CLI を使う。GitHub MCP tool は、`gh` に同等のコマンドが無い操作のときだけ使う。
