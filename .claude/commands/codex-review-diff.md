---
description: Git差分に対してCodexレビューを実行
allowed-tools: ["Read", "Bash"]
argument-hint: [git-diff-args]
---

# 🔍 Git Diff Review Workflow

変更箇所のみを対象にしたCodexレビューです。PRレビューに最適です。

---

## 📊 使用例

```bash
# ステージングされた変更
/codex-review-diff

# 最新コミットと前
/codex-review-diff HEAD~1..HEAD

# ブランチ間
/codex-review-diff main...feature-branch

# 特定ファイルのみ
/codex-review-diff HEAD~1..HEAD -- path/to/file.py
```

---

## Phase 1: Git差分の取得

!bash -c '
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Gitリポジトリではありません"
    exit 1
fi

if [ $# -eq 0 ]; then
    DIFF_CONTENT=$(git diff --staged)
    DESCRIPTION="Staged changes"
    if [ -z "$DIFF_CONTENT" ]; then
        echo "⚠️  ステージングされた変更がありません"
        echo "📝 未ステージの変更を確認します..."
        DIFF_CONTENT=$(git diff)
        DESCRIPTION="Unstaged changes"
    fi
else
    DIFF_CONTENT=$(git diff "$@")
    DESCRIPTION="$*"
fi

if [ -z "$DIFF_CONTENT" ]; then
    echo "❌ 差分が見つかりません"
    echo ""
    echo "💡 ヒント:"
    echo "  - git status で変更を確認"
    echo "  - git add でステージング"
    exit 1
fi

echo "📊 差分情報:"
echo ""
STATS=$(echo "$DIFF_CONTENT" | git apply --stat 2>/dev/null || echo "$DIFF_CONTENT" | diffstat 2>/dev/null || echo "統計情報の取得に失敗")
echo "$STATS"
echo ""
echo "対象: $DESCRIPTION"
echo ""

mkdir -p ~/Desktop/tmp
echo "$DIFF_CONTENT" > ~/Desktop/tmp/git-diff-for-review.txt
echo "✅ 差分を保存: ~/Desktop/tmp/git-diff-for-review.txt"
' "$@"

---

## Phase 2: 変更ファイルの一覧

!bash -c '
echo ""
echo "📝 変更されたファイル:"
echo ""

if [ $# -eq 0 ]; then
    if ! git diff --staged --quiet; then
        git diff --staged --name-status
    else
        git diff --name-status
    fi
else
    git diff --name-status "$@"
fi | while read STATUS FILE; do
    case "$STATUS" in
        M) echo "  📝 Modified: $FILE" ;;
        A) echo "  ✨ Added: $FILE" ;;
        D) echo "  🗑️  Deleted: $FILE" ;;
        R*) echo "  🔄 Renamed: $FILE" ;;
        C*) echo "  📋 Copied: $FILE" ;;
        *) echo "  ❓ $STATUS: $FILE" ;;
    esac
done

echo ""
' "$@"

---

## Phase 3: Claude Code による差分分析

Git差分を分析します：

@~/Desktop/tmp/git-diff-for-review.txt

### 初期評価

以下の観点で変更を評価：

#### 1. 変更の影響範囲
- 追加/削除された行数、影響を受けるモジュール

#### 2. リスク評価
- 破壊的変更、セキュリティ、パフォーマンス

#### 3. コード品質
- 新しいコードの品質、ベストプラクティス

[Claude Code 分析中...]

---

## Phase 4: Codex用プロンプト生成（最適化版）

!bash -c '
OUTPUT="~/Desktop/tmp/codex-review-prompt-diff.txt"

TOTAL_FILES=$(git diff --name-only "$@" 2>/dev/null | wc -l | tr -d " ")
INSERTIONS=$(git diff --shortstat "$@" 2>/dev/null | grep -oE "[0-9]+ insertion" | grep -oE "[0-9]+" || echo "0")
DELETIONS=$(git diff --shortstat "$@" 2>/dev/null | grep -oE "[0-9]+ deletion" | grep -oE "[0-9]+" || echo "0")

cat > "$OUTPUT" << '\''PROMPT_EOF'\''
# Git Diff Review

Expert code reviewer for pull request diffs. Focus on changed lines, identify issues introduced/fixed, assess production impact. Be specific, cite lines.

## Summary
PROMPT_EOF

echo "- Files: $TOTAL_FILES, +$INSERTIONS, -$DELETIONS" >> "$OUTPUT"
echo "" >> "$OUTPUT"

cat >> "$OUTPUT" << '\''PROMPT_EOF'\''

## Diff

```diff
PROMPT_EOF

cat ~/Desktop/tmp/git-diff-for-review.txt >> "$OUTPUT"

cat >> "$OUTPUT" << '\''PROMPT_EOF'\''
```

## Review (Temperature: 0.3)

### 🔴 CRITICAL
Security added, breaking changes, data loss, critical bugs
Format: **File**|**Line**|**Issue**|**Risk**|**Fix**

### 🟡 IMPORTANT
Style, performance, maintainability, missing error handling
Format: **File**|**Line**|**Issue**|**Impact**|**Suggestion**

### 🟢 SUGGESTIONS
Refactoring, optimization, documentation

### ✅ GOOD CHANGES
Bug fixes, improvements, effective patterns

### 🧪 TESTING
Tests needed for changes

---
Begin review:
PROMPT_EOF

echo "✅ Git差分レビュープロンプト生成完了: $OUTPUT"
echo ""
' "$@"

---

## Phase 5: クリップボードコピー

!pbcopy < ~/Desktop/tmp/codex-review-prompt-diff.txt && echo "✅ プロンプトをクリップボードにコピーしました！"

!bash -c '
echo ""
echo "📊 プロンプト統計:"
wc -l ~/Desktop/tmp/codex-review-prompt-diff.txt | awk '\''{print "  総行数: " $1}'\''
wc -w ~/Desktop/tmp/codex-review-prompt-diff.txt | awk '\''{print "  単語数: " $1}'\''
echo ""
'

---

## 📝 Phase 6: Codex でレビュー実行（手動）

### 次の操作:

1. VSCode でCodex を開く
2. プロンプトを貼り付け (Cmd+V)
3. Model: GPT-4, Temperature: 0.3 推奨
4. レビュー結果を保存

```bash
# 結果保存
touch ~/Desktop/tmp/codex-review-result-diff.txt
code ~/Desktop/tmp/codex-review-result-diff.txt
# または
pbpaste > ~/Desktop/tmp/codex-review-result-diff.txt
```

---

## 💡 Quick Tips

### 便利な使い方

```bash
# PRレビュー前
/codex-review-diff main...HEAD

# 最新コミットのみ
/codex-review-diff HEAD~1..HEAD

# 特定ファイルのみ
/codex-review-diff HEAD -- src/important-file.py
```

### トラブルシューティング

**Q: "差分が見つかりません"**
```bash
git status
git add .
/codex-review-diff
```

**Q: 差分が大きすぎる**
```bash
# ファイルごとに分割
/codex-review-diff HEAD -- file1.py
/codex-review-diff HEAD -- file2.py
```

---

## 🔗 関連コマンド

| コマンド | 用途 |
|---------|------|
| `/codex-review-diff [args]` | Git差分レビュー（このコマンド） |
| `/codex-review-workflow <file>` | 単一ファイルの完全レビュー |
| `/codex-review-prompt <file>` | プロンプト生成のみ |

---

**Git差分レビューを開始しました！** 🚀
