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

## Pull Request

- リポジトリに `PULL_REQUEST_TEMPLATE.md` があれば、その内容に従う
- タイトルは英語で、コミットメッセージと同じ形式。**本文は日本語**
- できる限り issue 番号を関連付ける
- 指定が無ければ **draft** で作成する
- 作成後に GitHub Copilot をレビュワーに追加する
- **1 つの PR は 1 つの目的に絞る**

### Copilot のレビュー依頼

REST は 200 を返しても無視されることがある。GraphQL の `requestReviews` に bot の id を渡し、
**送った後に実際に付いたかを確認する**。

```sh
gh pr view <番号> --json reviewRequests
```

## GitHub の操作

適切な GitHub MCP tool があればそれを使い、無ければ `gh` CLI を使う。
