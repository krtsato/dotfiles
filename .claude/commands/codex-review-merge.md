---
description: Claude Code と Codex のレビュー結果を統合（複数ファイル・ディレクトリ対応）
allowed-tools: ["Read", "Bash"]
argument-hint: [file-or-dir...]
---

# 📊 Review Integration: Claude Code + OpenAI Codex

Claude Code と OpenAI Codex の両方のレビュー結果を統合し、実行可能な改善計画を生成します。

**対応する入力:**
- 単一ファイル: `file.py`
- 複数ファイル: `file1.py file2.py file3.py`
- ディレクトリ: `src/components/`

---

## Phase 1: Codex レビュー結果の確認

### 結果ファイルの存在確認

!bash -c '
RESULT_FILE="~/Desktop/tmp/codex-review-result.txt"

if [ ! -f "$RESULT_FILE" ]; then
    echo "❌ Codex レビュー結果が見つかりません"
    echo ""
    echo "📋 以下の手順で結果を保存してください:"
    echo "  1. Codex のレビュー結果全体を選択"
    echo "  2. コピー (Cmd+C)"
    echo "  3. 以下のコマンドを実行:"
    echo "     pbpaste > ~/Desktop/tmp/codex-review-result.txt"
    echo ""
    echo "  または:"
    echo "     code ~/Desktop/tmp/codex-review-result.txt"
    echo "     # 貼り付けて保存 (Cmd+S)"
    exit 1
fi

echo "✅ Codex レビュー結果を発見"
echo ""
echo "📊 ファイル情報:"
wc -l "$RESULT_FILE" | awk '\''{print "  行数: " $1}'\''
wc -w "$RESULT_FILE" | awk '\''{print "  単語数: " $1}'\''
ls -lh "$RESULT_FILE" | awk '\''{print "  サイズ: " $5}'\''
'

### Codex レビュー内容

@~/Desktop/tmp/codex-review-result.txt

---

## Phase 2: 対象ファイルの収集と再分析

!bash -c '
# 引数から対象ファイルを収集（codex-review-prompt と同じロジック）
FILES_TO_REVIEW=()

if [ $# -eq 0 ]; then
    # 引数がない場合、前回のリストを使用
    if [ -f ~/Desktop/tmp/review-files-list.txt ]; then
        echo "📂 前回のファイルリストを使用"
        while IFS= read -r file; do
            FILES_TO_REVIEW+=("$file")
        done < ~/Desktop/tmp/review-files-list.txt
    else
        echo "❌ ファイルリストが見つかりません"
        echo "💡 /codex-review-prompt を先に実行してください"
        exit 1
    fi
else
    # 引数からファイルを収集
    for ARG in "$@"; do
        if [ -f "$ARG" ]; then
            FILES_TO_REVIEW+=("$ARG")
        elif [ -d "$ARG" ]; then
            while IFS= read -r -d "" file; do
                FILES_TO_REVIEW+=("$file")
            done < <(find "$ARG" -type f \( \
                -name "*.py" -o -name "*.js" -o -name "*.ts" -o \
                -name "*.tsx" -o -name "*.jsx" -o -name "*.go" -o \
                -name "*.java" -o -name "*.rb" -o -name "*.rs" -o \
                -name "*.c" -o -name "*.cpp" -o -name "*.h" -o \
                -name "*.hpp" -o -name "*.sh" -o -name "*.bash" -o \
                -name "*.tf" -o -name "*.yaml" -o -name "*.yml" -o \
                -name "*.json" \
            \) -print0 | head -z -n 50)
        fi
    done
fi

TOTAL_FILES=${#FILES_TO_REVIEW[@]}
echo ""
echo "📊 対象ファイル: $TOTAL_FILES ファイル"
echo ""

# リストを保存（なければ）
if [ ! -f ~/Desktop/tmp/review-files-list.txt ]; then
    printf "%s\n" "${FILES_TO_REVIEW[@]}" > ~/Desktop/tmp/review-files-list.txt
fi
' "$@"

### Claude Code の再分析

対象ファイルを再度読み込み、独自の視点で分析：

!bash -c '
# 最初の3ファイルのみ表示（多すぎる場合の対策）
head -3 ~/Desktop/tmp/review-files-list.txt | while IFS= read -r FILE; do
    echo "FILE_PATH:$FILE"
done
' | while IFS=: read -r PREFIX PATH; do
    if [ "$PREFIX" = "FILE_PATH" ]; then
        echo "### ファイル: $PATH"
        echo ""
        @"$PATH"
        echo ""
    fi
done

**Claude Codeの独自分析:**

1. **構造的な問題**
   - アーキテクチャレベルの課題
   - モジュール間の依存関係
   - 設計パターンの適用

2. **実装の詳細**
   - ロジックの正確性
   - エッジケースの処理
   - エラーハンドリングの網羅性

3. **保守性**
   - コードの読みやすさ
   - ドキュメンテーション
   - 将来の拡張性

---

## Phase 3: 統合分析

### 🎯 統合レビューサマリー

**レビュー実施日時**: `date '+%Y-%m-%d %H:%M:%S'`
**レビューアー**: Claude Code + OpenAI Codex

!bash -c '
TOTAL_FILES=$(wc -l < ~/Desktop/tmp/review-files-list.txt 2>/dev/null | tr -d " " || echo "0")
echo "**対象ファイル数**: $TOTAL_FILES"
echo ""
'

---

### 📈 発見事項の分類

Claude Code と Codex の両方のレビュー結果を分析し、以下の基準で分類します：

#### 🔴 Critical（即時対応必須）

**両者が共通して指摘した重大な問題:**

[共通の Critical issues をリストアップ]

- **Issue**: [問題の説明]
  - **Files**: [影響を受けるファイル]
  - **Claude Code**: [Claude の指摘内容]
  - **Codex**: [Codex の指摘内容]
  - **Impact**: [影響範囲と深刻度]
  - **Action**: [推奨される修正方法]

---

#### 🟡 Important（優先対応推奨）

**一方のみが指摘、または両者で優先度が異なる問題:**

**Claude Code が強調した問題:**
- [項目]
  - **Reason**: [なぜこれが重要か]
  - **Recommendation**: [推奨される対応]

**Codex が強調した問題:**
- [項目]
  - **Reason**: [なぜこれが重要か]
  - **Recommendation**: [推奨される対応]

---

#### 🟢 Suggestions（検討推奨）

**コード品質向上のための提案:**

- **Refactoring**: [リファクタリング案]
- **Optimization**: [パフォーマンス改善案]
- **Documentation**: [ドキュメント改善案]
- **Testing**: [テスト強化案]

---

#### 🔗 Cross-File Issues（複数ファイルにまたがる問題）

**複数ファイルに影響する問題:**

- **Code Duplication**: 重複コードの存在
- **Inconsistent Patterns**: 一貫性のないパターン
- **Tight Coupling**: 密結合の問題
- **Missing Abstractions**: 抽象化の欠如

---

### ✅ 評価された点

**両者が評価した良い実装:**

[Good practices をリストアップ]

---

### 🗺️ アクションプラン

優先度順に整理された実行計画:

#### Phase 1: 即時対応（今すぐ）
1. [ ] **[Critical Issue 1]**
   - 修正内容: [具体的な修正]
   - 影響ファイル: [ファイル名]
   - 所要時間: [推定時間]

2. [ ] **[Critical Issue 2]**
   - 修正内容: [具体的な修正]
   - 影響ファイル: [ファイル名]
   - 所要時間: [推定時間]

#### Phase 2: 短期対応（1-3日以内）
- [ ] **[Important Issue 1]**
- [ ] **[Important Issue 2]**

#### Phase 3: 中期改善（1-2週間）
- [ ] **[Suggestion 1]**
- [ ] **[Suggestion 2]**

---

### 🔧 具体的な修正提案

最も優先度の高い問題について、**Before/After のコード例**を提示：

**修正が必要な箇所を特定:**

[最優先の修正案を提示]

**Before:**
```
[現在のコード]
```

**After:**
```
[提案するコード]
```

**説明:**
- なぜこの修正が必要か
- どのような問題を解決するか
- 副作用や注意点

---

## Phase 4: レポート保存

!bash -c '
REPORT_FILE="~/Desktop/tmp/integrated-review-$(date +%Y%m%d-%H%M%S).md"

cat > "$REPORT_FILE" << '\''REPORT_EOF'\''
# Integrated Code Review Report

**Date**: $(date)
**Reviewers**: Claude Code + OpenAI Codex

## Files Reviewed

REPORT_EOF

if [ -f ~/Desktop/tmp/review-files-list.txt ]; then
    cat ~/Desktop/tmp/review-files-list.txt >> "$REPORT_FILE"
else
    echo "N/A" >> "$REPORT_FILE"
fi

cat >> "$REPORT_FILE" << '\''REPORT_EOF'\''

## Claude Code Analysis

See above in Claude Code session.

## Codex Review Results

REPORT_EOF

cat ~/Desktop/tmp/codex-review-result.txt >> "$REPORT_FILE"

echo ""
echo "✅ 統合レポートを保存: $REPORT_FILE"
echo ""
echo "📂 レポートを開く:"
echo "   code $REPORT_FILE"
'

---

## 📊 統合レビュー完了

### 次のアクション

1. **修正を実施する場合**
   - 上記のアクションプランに従って修正
   - 各修正後にテストを実行
   - 必要に応じて再度レビューを依頼

2. **修正を保留する場合**
   - 理由を記録
   - 将来の TODO として記録
   - チームと共有が必要な場合は文書化

3. **追加の質問がある場合**
   - 特定の指摘について詳細を確認
   - 代替案の検討を依頼

---

## 🧹 クリーンアップ

レビューが完了したら、一時ファイルを削除できます：

```bash
# 確認
ls -lh ~/Desktop/tmp/codex-review-*.txt ~/Desktop/tmp/integrated-review-*.md

# 削除
rm ~/Desktop/tmp/codex-review-*.txt ~/Desktop/tmp/integrated-review-*.md ~/Desktop/tmp/review-files-list.txt
```

または、保管する場合：

```bash
# プロジェクトディレクトリに移動
mkdir -p ~/code-reviews
mv ~/Desktop/tmp/integrated-review-*.md ~/code-reviews/
```

---

## 💡 Tips

### より良いレビューのために

1. **適切な単位でレビュー**
   - 関連するファイルをグループ化
   - 機能単位でレビュー
   - 大きなディレクトリは分割

2. **定期的にレビュー**
   - PRの前に必ずレビュー
   - リファクタリング時にもレビュー
   - 大きな機能追加の前後

3. **両者の強みを活かす**
   - Claude Code: 構造的な分析、アーキテクチャ、複数ファイル間の関係
   - Codex: 言語固有の最適化、パターン認識、細かいバグ検出

4. **フィードバックループ**
   - 修正後に再度レビュー
   - 改善の進捗を追跡
   - チームで知見を共有

---

## 🔗 関連コマンド

| コマンド | 用途 |
|---------|------|
| `/codex-review-prompt <files>` | Codex用プロンプト生成 |
| `/codex-review-merge <files>` | 結果統合（このコマンド） |
| `/codex-review-workflow <files>` | 完全ワークフロー |
| `/codex-review-diff [args]` | Git差分レビュー |

---

**統合レビューが完了しました！** 🎉

修正を進めるか、追加の質問があればお知らせください。
