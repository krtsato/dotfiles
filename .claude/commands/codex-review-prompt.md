---
description: OpenAI Codex用のコードレビュー依頼を準備（複数ファイル・ディレクトリ対応）
allowed-tools: ["Read", "Bash"]
argument-hint: [file-or-dir...]
---

# 🤖 Codex Code Review Preparation

OpenAI Codex Prompting Guide のベストプラクティスに従ったレビュー依頼を生成します。

**対応する入力:**
- 単一ファイル: `file.py`
- 複数ファイル: `file1.py file2.py file3.py`
- ディレクトリ: `src/components/`
- 混在: `file.py src/utils/`

---

## Phase 1: 入力の解析とファイル収集

!bash -c '
FILES_TO_REVIEW=()

if [ $# -eq 0 ]; then
    echo "❌ ファイルまたはディレクトリを指定してください"
    echo ""
    echo "使用例:"
    echo "  /codex-review-prompt file.py"
    echo "  /codex-review-prompt file1.py file2.py"
    echo "  /codex-review-prompt src/components/"
    exit 1
fi

echo "📊 入力を解析中..."
echo ""

for ARG in "$@"; do
    if [ -f "$ARG" ]; then
        FILES_TO_REVIEW+=("$ARG")
        echo "✅ ファイル: $ARG"
    elif [ -d "$ARG" ]; then
        echo "📁 ディレクトリ: $ARG"
        while IFS= read -r -d "" file; do
            FILES_TO_REVIEW+=("$file")
            echo "  └─ $(basename "$file")"
        done < <(find "$ARG" -type f \( \
            -name "*.py" -o -name "*.js" -o -name "*.ts" -o \
            -name "*.tsx" -o -name "*.jsx" -o -name "*.go" -o \
            -name "*.java" -o -name "*.rb" -o -name "*.rs" -o \
            -name "*.c" -o -name "*.cpp" -o -name "*.h" -o \
            -name "*.hpp" -o -name "*.sh" -o -name "*.bash" -o \
            -name "*.tf" -o -name "*.yaml" -o -name "*.yml" -o \
            -name "*.json" \
        \) -print0 | head -z -n 50)
    else
        echo "⚠️  スキップ: $ARG (存在しません)"
    fi
done

TOTAL_FILES=${#FILES_TO_REVIEW[@]}
if [ $TOTAL_FILES -eq 0 ]; then
    echo ""
    echo "❌ レビュー対象のファイルが見つかりません"
    exit 1
fi

echo ""
echo "📝 レビュー対象: $TOTAL_FILES ファイル"

mkdir -p ~/Desktop/tmp
printf "%s\n" "${FILES_TO_REVIEW[@]}" > ~/Desktop/tmp/review-files-list.txt

' "$@"

---

## Phase 2: ファイル情報の取得

!bash -c '
echo ""
echo "📊 ファイル統計:"
echo ""

TOTAL_LINES=0
declare -A LANG_COUNT

while IFS= read -r FILE; do
    if [ ! -f "$FILE" ]; then
        continue
    fi

    FILE_NAME="$(basename "$FILE")"
    FILE_EXT="${FILE##*.}"
    LINE_COUNT=$(wc -l < "$FILE" 2>/dev/null | tr -d " " || echo "0")
    TOTAL_LINES=$((TOTAL_LINES + LINE_COUNT))

    case "$FILE_EXT" in
        tf) LANG="Terraform" ;;
        py) LANG="Python" ;;
        js) LANG="JavaScript" ;;
        ts|tsx) LANG="TypeScript" ;;
        jsx) LANG="JavaScript/JSX" ;;
        go) LANG="Go" ;;
        java) LANG="Java" ;;
        rb) LANG="Ruby" ;;
        rs) LANG="Rust" ;;
        c|h) LANG="C" ;;
        cpp|cc|cxx|hpp) LANG="C++" ;;
        sh|bash) LANG="Shell" ;;
        yaml|yml) LANG="YAML" ;;
        json) LANG="JSON" ;;
        *) LANG="Other" ;;
    esac

    LANG_COUNT[$LANG]=$((${LANG_COUNT[$LANG]:-0} + 1))

    echo "  📄 $FILE_NAME ($LINE_COUNT 行, $LANG)"
done < ~/Desktop/tmp/review-files-list.txt

echo ""
echo "  📏 総行数: $TOTAL_LINES"
echo "  📚 言語別:"
for LANG in "${!LANG_COUNT[@]}"; do
    echo "    - $LANG: ${LANG_COUNT[$LANG]} ファイル"
done
echo ""
'

---

## Phase 3: Claude Code による初期分析

対象ファイルを読み込んで分析します：

!bash -c '
echo "📖 ファイル内容を読み込み中..."
FILE_COUNT=0
while IFS= read -r FILE; do
    FILE_COUNT=$((FILE_COUNT + 1))
    if [ $FILE_COUNT -le 5 ]; then
        echo "  Reading: $FILE"
    elif [ $FILE_COUNT -eq 6 ]; then
        echo "  ... (残りは省略)"
    fi
done < ~/Desktop/tmp/review-files-list.txt
echo ""
'

!bash -c '
head -5 ~/Desktop/tmp/review-files-list.txt | while IFS= read -r FILE; do
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

以下の観点で分析：

#### 1. コード品質
- 可読性、命名規則、複雑度

#### 2. ベストプラクティス
- 言語固有の慣習、デザインパターン

#### 3. セキュリティ
- 潜在的な脆弱性、入力検証

#### 4. パフォーマンス
- 最適化の余地、リソース効率

[Claude Code 分析中...]

---

## Phase 4: Codex用プロンプト生成（最適化版）

!bash -c '
OUTPUT="~/Desktop/tmp/codex-review-prompt.txt"

TOTAL_FILES=$(wc -l < ~/Desktop/tmp/review-files-list.txt | tr -d " ")
TOTAL_LINES=0
TOTAL_SIZE=0

while IFS= read -r FILE; do
    if [ -f "$FILE" ]; then
        LINES=$(wc -l < "$FILE" 2>/dev/null | tr -d " " || echo "0")
        SIZE=$(wc -c < "$FILE" 2>/dev/null | tr -d " " || echo "0")
        TOTAL_LINES=$((TOTAL_LINES + LINES))
        TOTAL_SIZE=$((TOTAL_SIZE + SIZE))
    fi
done < ~/Desktop/tmp/review-files-list.txt

PRIMARY_LANG=$(while IFS= read -r FILE; do
    echo "${FILE##*.}"
done < ~/Desktop/tmp/review-files-list.txt | sort | uniq -c | sort -rn | head -1 | awk '\''{print $2}'\'')

case "$PRIMARY_LANG" in
    py) LANG="Python"; FOCUS="PEP 8, type hints, Pythonic patterns" ;;
    js|ts|tsx|jsx) LANG="JavaScript/TypeScript"; FOCUS="ES6+, async, type safety" ;;
    go) LANG="Go"; FOCUS="Go idioms, error handling" ;;
    java) LANG="Java"; FOCUS="SOLID, design patterns" ;;
    rb) LANG="Ruby"; FOCUS="Ruby idioms" ;;
    rs) LANG="Rust"; FOCUS="ownership, borrowing" ;;
    tf) LANG="Terraform"; FOCUS="IaC, security" ;;
    *) LANG="Multiple"; FOCUS="code quality, security" ;;
esac

cat > "$OUTPUT" << '\''PROMPT_EOF'\''
# Code Review

Expert code reviewer. Review files for security, bugs, quality. Be specific, cite lines, prioritize by severity.

## Context
PROMPT_EOF

echo "- Files: $TOTAL_FILES, Lines: $TOTAL_LINES, Language: $LANG, Focus: $FOCUS" >> "$OUTPUT"
echo "" >> "$OUTPUT"

cat >> "$OUTPUT" << '\''PROMPT_EOF'\''

## Files

PROMPT_EOF

FILE_NUM=0
while IFS= read -r FILE; do
    if [ ! -f "$FILE" ]; then
        continue
    fi

    FILE_NUM=$((FILE_NUM + 1))
    FILE_EXT="${FILE##*.}"

    echo "### $FILE_NUM: $FILE" >> "$OUTPUT"
    echo "\`\`\`$FILE_EXT" >> "$OUTPUT"
    cat "$FILE" >> "$OUTPUT"
    echo "\`\`\`" >> "$OUTPUT"
    echo "" >> "$OUTPUT"
done < ~/Desktop/tmp/review-files-list.txt

cat >> "$OUTPUT" << '\''PROMPT_EOF'\''

## Review (Temperature: 0.3)

### 🔴 CRITICAL
Security, data loss, breaking changes, critical bugs
Format: **File**|**Line**|**Issue**|**Risk**|**Fix**

### 🟡 IMPORTANT
Quality, architecture, performance, maintainability
Format: **File**|**Line**|**Issue**|**Impact**|**Recommendation**

### 🟢 SUGGESTIONS
Refactoring, optimization, documentation

### 🔗 CROSS-FILE
Duplication, inconsistency, coupling, missing abstractions

### ✅ STRENGTHS
Good practices, effective patterns

---
Begin review:
PROMPT_EOF

echo "✅ Codex プロンプト生成完了: $OUTPUT"
echo ""
SIZE_KB=$((TOTAL_SIZE / 1024))
echo "📊 プロンプト情報:"
echo "  - ファイル数: $TOTAL_FILES"
echo "  - 総行数: $TOTAL_LINES"
echo "  - 総サイズ: ${SIZE_KB}KB"
'

---

## Phase 5: プロンプトファイルを開く

!bash -c '
echo ""
echo "📊 プロンプト統計:"
LINES=$(wc -l < ~/Desktop/tmp/codex-review-prompt.txt | tr -d " ")
WORDS=$(wc -w < ~/Desktop/tmp/codex-review-prompt.txt | tr -d " ")
SIZE_KB=$(wc -c < ~/Desktop/tmp/codex-review-prompt.txt | awk "{print int(\$1/1024)}")
echo "  総行数: $LINES"
echo "  単語数: $WORDS"
echo "  ファイルサイズ: ${SIZE_KB}KB"
echo ""
'

!bash -c 'open ~/Desktop/tmp/codex-review-prompt.txt && echo "📂 プロンプトファイルを開きました"'

**次の操作を行ってください：**

1. 📂 開いたファイルの内容を全選択（Cmd+A）
2. 📋 クリップボードにコピー（Cmd+C）
3. 🚀 VSCode の Codex に貼り付けてレビューを実行

---

## 📝 次のステップ

### ステップ1: VSCode で Codex を開く

1. VSCode を開く
2. Codex 拡張機能を起動
3. プロンプトを貼り付け (Cmd+V)
4. Model: GPT-4, Temperature: 0.3 推奨

### ステップ2: 結果を保存

```bash
# 方法1: 直接保存
code ~/Desktop/tmp/codex-review-result.txt
# Codexの結果を貼り付けて保存

# 方法2: クリップボード経由
pbpaste > ~/Desktop/tmp/codex-review-result.txt
```

### ステップ3: 結果を統合

```
/codex-review-merge [元の入力と同じファイル/ディレクトリ]
```

---

## 💡 使用例

```bash
# 単一ファイル
/codex-review-prompt app.py

# 複数ファイル
/codex-review-prompt app.py utils.py models.py

# ディレクトリ
/codex-review-prompt src/components/

# 混在
/codex-review-prompt app.py src/utils/
```

---

## ⚠️ 注意事項

**トークン制限:**
- GPT-4: 128K tokens
- 目安: 50ファイル以下、10,000行以下

**推奨:**
- 関連するファイルをグループ化
- 大きなディレクトリは分割

---

**プロンプト生成が完了しました！** 🚀
