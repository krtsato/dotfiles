# User-scope CLAUDE.md

## コミュニケーション要件

- すべての記述を日本語で行う

## Git ワークフロー

- **ブランチ作成前**と **push 前**に必ず `git fetch --all && git rebase origin/master` を実行し、最新のデフォルトブランチを取り込む
- Pull Request は必ず Draft PR で作成する
- Pull Request 作成後に GitHub Copilot をレビュワーに追加する

## Markdown Lint

- マークダウンファイルの編集後は必ず `npx markdownlint-cli2 --config ~/dev/me/dotfiles/.markdownlint.yaml <file>` を実行し、警告があれば修正する
