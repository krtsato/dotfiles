---
description: Git変更を分析して自動的にコミット（Conventional Commits準拠）
allowed-tools: ["Bash", "Read"]
argument-hint: [custom-commit-message (optional)]
---

# 📝 Smart Git Commit

Git変更内容を分析し、Conventional Commits形式のメッセージを自動生成してコミットします。

**特徴:**
- ✅ 変更内容を自動分析
- ✅ Conventional Commits準拠のメッセージ生成
- ✅ カスタムメッセージも指定可能
- ❌ Push は実行しない（ローカルコミットのみ）

---

## Phase 1: Git リポジトリの確認

!bash -c '
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Gitリポジトリではありません"
    exit 1
fi

echo "✅ Git リポジトリを確認"
echo ""
echo "📍 現在のブランチ:"
git branch --show-current
echo ""
'

---

## Phase 2: 変更状況の確認

!bash -c '
echo "📊 変更ファイルの状況:"
echo ""
git status --short

CHANGED_COUNT=$(git status --short | wc -l | tr -d " ")
if [ "$CHANGED_COUNT" -eq 0 ]; then
    echo ""
    echo "⚠️  変更がありません"
    exit 1
fi

echo ""
echo "📝 変更ファイル数: $CHANGED_COUNT"
echo ""
'

---

## Phase 3: 変更差分の保存

!bash -c '
echo "📄 変更差分を取得中..."

# 未ステージの変更とステージ済みの変更を取得
UNSTAGED_DIFF=$(git diff 2>/dev/null || echo "")
STAGED_DIFF=$(git diff --cached 2>/dev/null || echo "")

# 両方を結合
FULL_DIFF="${UNSTAGED_DIFF}${STAGED_DIFF}"

if [ -z "$FULL_DIFF" ]; then
    echo "❌ 差分が取得できませんでした"
    exit 1
fi

# 一時ファイルに保存
mkdir -p ~/Desktop/tmp
echo "$FULL_DIFF" > ~/Desktop/tmp/git-commit-diff.txt

echo "✅ 差分を保存: ~/Desktop/tmp/git-commit-diff.txt"
echo ""

# 統計情報を表示
echo "📊 変更統計:"
git diff --stat
git diff --cached --stat
echo ""
'

---

## Phase 4: 変更内容の分析とコミットメッセージ生成

### 変更内容

@~/Desktop/tmp/git-commit-diff.txt

### コミットメッセージの生成

以下の観点で変更内容を分析し、**Conventional Commits形式**のメッセージを生成してください：

#### Conventional Commits形式の仕様

**フォーマット**: `<type>[optional scope]: <description>`

**Types:**
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメントのみの変更
- `style`: コードの意味に影響しない変更（空白、フォーマット、セミコロンなど）
- `refactor`: バグ修正や機能追加ではないコード変更
- `perf`: パフォーマンス改善
- `test`: テストの追加・修正
- `build`: ビルドシステムや外部依存関係の変更
- `ci`: CI設定ファイルやスクリプトの変更
- `chore`: その他の変更（ソースコードやテストに影響しない）
- `revert`: 以前のコミットを戻す

**Scope（オプション）**: 変更の影響範囲（例: `auth`, `api`, `ui`）

**Description**: 変更の簡潔な説明（50文字以内、現在形の命令形、先頭小文字）

#### 分析の観点

1. **変更の種類**: 新機能追加、バグ修正、リファクタリング、ドキュメント更新など
2. **影響範囲**: どのモジュール・コンポーネントが変更されたか
3. **変更の目的**: なぜこの変更が必要だったか
4. **主要な変更**: 最も重要な変更は何か

#### メッセージ生成ルール

- 複数ファイルにまたがる場合、最も重要な変更をメインにする
- スコープは省略可能だが、明確な場合は含める
- 日本語プロジェクトでも description は英語で記述
- 破壊的変更がある場合は `!` を追加（例: `feat!: remove deprecated API`）

**生成されたコミットメッセージ:**

```
[ここにConventional Commits形式のメッセージを1行で記述]
```

---

## Phase 5: コミットメッセージの最終決定

!bash -c '
# 引数でカスタムメッセージが指定された場合はそれを使用
if [ $# -gt 0 ]; then
    COMMIT_MSG="$*"
    echo "✅ カスタムメッセージを使用: $COMMIT_MSG"
else
    # Claude Codeが生成したメッセージを使用
    # （Phase 4で生成されたメッセージを手動でコピーして実行）
    echo "⚠️  引数にコミットメッセージを指定するか、Phase 4で生成されたメッセージを確認してください"
    echo ""
    echo "使用方法:"
    echo "  /git-commit \"feat: add user authentication\""
    echo ""
    exit 1
fi

# メッセージを一時ファイルに保存
echo "$COMMIT_MSG" > ~/Desktop/tmp/git-commit-message.txt
echo ""
' "$@"

---

## Phase 6: ステージングとコミット

### 全変更をステージング

!bash -c '
echo "📦 変更をステージング中..."
git add .
echo "✅ ステージング完了"
echo ""
'

### コミット実行

!bash -c '
if [ ! -f ~/Desktop/tmp/git-commit-message.txt ]; then
    echo "❌ コミットメッセージファイルが見つかりません"
    exit 1
fi

COMMIT_MSG=$(cat ~/Desktop/tmp/git-commit-message.txt)

echo "💾 コミット実行中..."
echo "📝 メッセージ: $COMMIT_MSG"
echo ""

git commit -m "$COMMIT_MSG"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ コミット成功"
    echo ""
    echo "📊 最新のコミット:"
    git log -1 --oneline
    echo ""

    # 一時ファイルをクリーンアップ
    rm -f ~/Desktop/tmp/git-commit-diff.txt
    rm -f ~/Desktop/tmp/git-commit-message.txt
else
    echo ""
    echo "❌ コミット失敗"
    exit 1
fi
'

---

## Phase 7: コミット後の状態確認

!bash -c '
echo ""
echo "📍 現在の状態:"
git status
echo ""
echo "📜 最近のコミット履歴:"
git log --oneline -5
echo ""
'

---

## 📝 使用方法

### 基本フロー

1. `/git-commit` 実行 → Phase 4でメッセージ生成
2. `/git-commit "生成されたメッセージ"` で再実行

### 使用例

```bash
# 新機能
/git-commit "feat(auth): implement OAuth2 login"

# バグ修正
/git-commit "fix(api): resolve null pointer exception"

# リファクタリング
/git-commit "refactor: simplify error handling"

# 破壊的変更
/git-commit "feat!: remove deprecated endpoints"
```

---

## 💡 Conventional Commits Examples

```bash
feat: add email notifications          # 新機能
fix: prevent race condition            # バグ修正
refactor: optimize connection pool     # リファクタリング
perf: reduce bundle size by 40%        # パフォーマンス改善
docs: update API documentation         # ドキュメント
test: add unit tests for auth          # テスト
chore: upgrade dependencies            # その他
```

---

## 📝 次のステップ

```bash
# Push（手動）
git push
git push -u origin $(git branch --show-current)  # 初回

# コミット修正
git commit --amend                     # メッセージ修正
git add . && git commit --amend --no-edit  # 追加変更
```

---

## ⚠️ 注意事項

- Phase 4で生成されたメッセージを確認してから実行
- `git add .` で全変更がステージングされる
- Push は手動実行が必要

---

## 🔗 関連コマンド・参考資料

| コマンド | 用途 |
|---------|------|
| `/git-commit [msg]` | スマートGitコミット（このコマンド） |
| `/codex-review-diff` | Git差分レビュー |

**参考**: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)

---

**スマートコミット準備完了！** 🚀
