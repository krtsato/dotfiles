---
name: harvest-lessons
description: >-
  Claude Code と Codex CLI の会話ログを横断分析し、「繰り返し与えられている指示」と
  「訂正・手戻りシグナル」を抽出して、グローバル CLAUDE.md / AGENTS.md への追記案を
  diff 形式で提示・反映する自己改善スキル。「ログから教訓を抽出して」「エージェント指示を
  ログから改善して」「harvest lessons」のようなリクエスト、または月次メンテナンスで使用。
  Do NOT use for: プロジェクト単位の tasks/lessons.md 追記のみ、CLAUDE.md の
  品質採点（eval 系スキルを使用）、ログの単純閲覧。
---

# harvest-lessons: 会話ログからの自己改善ループ

## 目的

ユーザーが Claude / Codex に繰り返し与えている指示は、グローバル指示ファイルに載せるべきルールの候補である。
訂正・手戻りのシグナルは、エージェントが外した期待の証拠である。
このスキルはログからその両方を抽出し、グローバル CLAUDE.md / AGENTS.md の更新案として提示する。

## 対象ログ（保存場所）

| ソース | パス | 内容 |
| --- | --- | --- |
| Codex プロンプト履歴 | `~/.codex/history.jsonl` | 1 行 1 JSON: `{"session_id","ts"(unix秒),"text"}` |
| Codex セッション全文 | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | 大きい。必要時のみ個別参照 |
| Claude Code 履歴 | `~/.claude/history.jsonl` | ユーザープロンプト履歴 |
| Claude Code セッション全文 | `~/.claude/projects/<プロジェクト>/<session-id>.jsonl` | 大きい。必要時のみ個別参照 |

## 更新対象

- `~/.claude/CLAUDE.md`（Claude グローバル指示。実体は dotfiles 管理）
- `~/.codex/AGENTS.md`（Codex グローバル指示。実体は dotfiles 管理）

## 手順

1. **前回実行時刻の確認**: `~/.claude/skills/harvest-lessons/.last-run` を読む（unix 秒 1 行）。
   無ければ直近 30 日分を対象とする。
2. **差分ログの抽出**: `~/.codex/history.jsonl` と `~/.claude/history.jsonl` から、
   前回実行以降（`ts` / タイムスタンプで比較）のユーザープロンプトを抽出する。
   件数が 300 件を超える場合はサブエージェント（Explore）に分析を委任し、
   メインコンテキストを汚さない。
3. **パターン抽出**: 抽出したプロンプトを次の 2 軸で分類する。
   - **繰り返し指示**: 同種の指示が 3 回以上出現（例: commit 形式、cleanup、進捗確認、言語指定）。
     既にグローバル CLAUDE.md / AGENTS.md に記載済みのものは「記載済みなのに繰り返されている
     （= エージェントが守れていない）」として別枠で報告する。
   - **訂正・手戻りシグナル**: 「戻して」「違う」「やり直し」「また失敗」「〜ではなく〜」
     「本当に〜?」「わかった？」などを含むプロンプト。前後の文脈が必要なら該当
     session の rollout / トランスクリプトを個別に開いて原因を特定する。
4. **更新案の提示**: 発見ごとに、(a) 証拠となるプロンプト引用、(b) 追記先ファイルとセクション、
   (c) 追記文面、を diff 形式で提示する。既存記述と重複・矛盾する案は出さない。
   グローバルに載せるべきでないプロジェクト固有の教訓は、該当プロジェクトの
   `tasks/lessons.md` への追記を提案する。
5. **承認と反映**: ユーザーの承認を得てから両ファイルへ反映し、
   `npx markdownlint-cli2 --config ~/dev/me/dotfiles/.markdownlint.yaml <file>` で lint する。
6. **実行時刻の記録**: 現在時刻（unix 秒）を `.last-run` に上書き保存する。

## 注意

- CLAUDE.md と AGENTS.md で共通化すべきルール（言語・Git 規約・省略語彙など）は両方に同じ文面で反映し、乖離させない
- ログには秘匿情報（トークン・パスワード）が含まれ得る。引用時はマスクする
- 両ファイルは dotfiles リポジトリ管理下にある。反映後は `git -C ~/dev/me/dotfiles diff` を提示し、コミットはユーザー判断とする
