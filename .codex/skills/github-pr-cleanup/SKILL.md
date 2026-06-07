---
name: github-pr-cleanup
description: GitHub の変更反映ワークフローを最後まで実行する。Codex が conventional commit の作成、PR のオープン、PR 本文更新、CI 待ち、マージ、マージ後の local cleanup を依頼されたときに使用する。
---

# GitHub PR Cleanup

## 概要

このスキルは、リポジトリの変更をきれいに出荷するために使う。差分確認、意味のある粒度での commit、PR 作成、CI 確認、マージ、最後の local cleanup までを一連の作業として扱う。

## ワークフロー

1. 現状を確認する:
   - `git status --short --branch`、`git diff --stat`、`git branch --show-current` を確認する。
   - 作業ツリーに意図した変更だけがあるか確認する。ユーザーの無関係な変更は revert しない。
   - 関連する Issue、PR、レビューコメントがある場合は、リンクの扱いを確認する。ユーザーが明示しない限り `Closes ...` は書かない。

2. commit 前に検証する:
   - 変更範囲に対して信頼できる最小の check を実行する。
   - frontend / static page の変更では、可能なら対象ファイルの format / lint と `npm run build` を実行する。
   - full check が既知の無関係な問題で失敗する場合は、その旨を明記し、対象範囲の検証結果を残す。

3. 意味のある粒度で commit する:
   - 反射的に全ファイルを stage せず、論理単位ごとに stage する。
   - commit message は conventional commit にする。例: `feat(scope): ...`、`fix(scope): ...`、`docs(scope): ...`、`chore(scope): ...`。
   - 各 commit 前に `git diff --cached --stat` を確認する。
   - PR を開く前に working tree を clean にする。

4. PR を開く:
   - `git push -u origin <branch>` で branch を push する。
   - PR title は主な変更に対応する conventional 形式にする。
   - PR body は最低限、次の見出しをこの順番で含める:
     ```markdown
     ## Summary
     - ...

     ## Test
     - ...

     ## Reference

     - https://github.com/*/*/issues/*
     ```
   - `## Summary` と `## Test` の本文は、ユーザーの言語に合わせて書く。日本語の依頼では日本語で書く。
   - `## Reference` の下には関連 Issue を記載する。Issue が明示されていない場合は、会話履歴、ブランチ名、PR 文脈、ローカル差分、GitHub の関連情報から探す。それでも見つからない場合は、`## Reference` 見出しだけ置き、項目は書かない。
   - Issue をまだ閉じる段階でない場合は `Closes ...` を使わず、必ず `## Reference` 配下のリンクにする。
   - PR body は簡潔かつ事実ベースにする。
   - PR を open したら、Copilot を reviewer として必ず request する。PR 作成時に `gh pr create --reviewer @copilot ...` を使うか、作成後に `gh pr edit <PR番号> --add-reviewer @copilot` を実行する。
   - PR 作成後に `gh pr view` で Copilot review request が入っていることを確認する。入っていない場合は再度 `gh pr edit <PR番号> --add-reviewer @copilot` を実行する。

5. Copilot / reviewer コメントをトリアージする:
   - Copilot review の完了を待つ。Copilot が reviewer に入っていない場合は `gh pr edit <PR番号> --add-reviewer @copilot` で追加する。
   - `gh pr view`、`gh pr checks`、`gh api`、GitHub MCP、または利用可能なレビューコメント取得ツールで review comment と conversation を確認する。
   - すべてのレビューコメントをエージェントがトリアージする。各コメントを次のどれかに分類する:
     - `対応必要`: バグ、仕様漏れ、実装品質、テスト不足、文言誤りなど、直すべき指摘。
     - `対応不要`: 誤検知、方針と違う提案、今回のスコープ外、既に別箇所で満たしている指摘。
     - `確認必要`: 仕様判断や外部情報が必要で、合理的に決めきれない指摘。
   - `対応必要` は修正する。修正後は必要な検証を実行し、意味のある粒度で commit して push する。
   - 複数の修正がある場合も、反射的に 1 commit にまとめず、関連する修正単位ごとに conventional commit を作る。
   - `対応不要` は理由を短く説明して返信し、resolve できる場合は resolve する。
   - `確認必要` はユーザーに短く確認する。確認なしに危険な仕様判断でマージしない。
   - トリアージ済みの review thread / conversation はすべて resolve する。resolve できない権限・UI 制約がある場合は、どのコメントが残っているかを明示する。
   - 修正を push したあと、必要に応じて Copilot の re-review を依頼する。Copilot は push だけでは自動で再レビューしない場合がある。

6. 安全にマージする:
   - `gh pr view` と `gh pr checks` で状態を確認する。
   - draft、conflict、required check の failure、未解決の request changes / review comment がある場合はマージしない。
   - すべてのレビューコメントが resolve され、必要な修正が push 済みで、required check が pending または pass の状態になってから auto-merge を設定する。
   - auto-merge は `gh pr merge <PR番号> --squash --delete-branch --auto` を基本にする。ただし repo の通常 merge 方法やユーザー指定がある場合はそれに従う。
   - check が pending の場合は `gh pr checks <number> --watch --interval 10` で待つか、auto-merge 設定後に状態を確認する。
   - repo の通常の merge 方法に従う。明確でなく、ユーザー指定もない小さな単一目的 PR では squash merge を使う。
   - ユーザーが remote branch を残すよう指示していない限り、マージ時に remote branch も削除する。

7. マージ後に local cleanup する:
   - `git fetch origin` を実行する。
   - `git switch main` で `main` に戻り、`git merge --ff-only origin/main` で最新化する。
   - local feature branch を削除する。squash merge の場合は `git branch -d` が失敗することがある。PR がマージ済みで、`main` に反映済みであることを確認してから `git branch -D <branch>` を使う。
   - `git remote prune origin` を実行する。
   - `git worktree list` を確認する。この作業用に作った worktree、またはユーザーが明示した worktree だけを削除する。
   - 最後に `git status --short --branch`、`git branch --format='%(refname:short) %(upstream:short)'`、`git log --oneline --decorate -3` で clean な状態を確認する。

## 安全ルール

- `git reset --hard`、広範囲の `rm -rf`、任意の worktree 削除などの破壊的操作は、ユーザーが明示し、対象を確認できた場合だけ行う。
- CI failure を迂回してマージしない。ユーザーが明示的にリスクを受け入れた場合だけ例外とする。
- 未トリアージ・未 resolve のレビューコメントが残っている状態で auto-merge を設定しない。
- PR body の見出しは `## Summary`、`## Test`、`## Reference` を使う。`## Tests` や `## 概要` にはしない。
- GitHub API が sandbox / network 制約で失敗した場合は、適切に escalation して再実行する。
- check が長時間 pending の場合は、状態を短く報告し、待つ、auto-merge を設定する、または blocker を明確に伝える。
