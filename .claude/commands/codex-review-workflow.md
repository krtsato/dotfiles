---
description: Claude Code + Codex の統合レビューワークフロー（複数ファイル・ディレクトリ対応）
allowed-tools: ["Read", "Bash"]
argument-hint: [file-or-dir...]
---

# 🚀 Dual-Agent Code Review Workflow

Claude Code と OpenAI Codex を活用した統合コードレビューワークフローです。

**対応する入力:**
- 単一ファイル: `file.py`
- 複数ファイル: `file1.py file2.py file3.py`
- ディレクトリ: `src/components/`
- 混在: `file.py src/utils/`

---

このコマンドは `/codex-review-prompt` の機能をベースに、完全なワークフローを実行します。

---

## 実行：プロンプト生成フェーズ

以下のコマンドを内部的に実行します：

```
/codex-review-prompt "$@"
```

**処理内容:**
1. ファイル/ディレクトリの解析
2. ファイル収集とメタ情報取得
3. Claude Code による初期分析
4. Codex用プロンプト生成
5. クリップボードへのコピー

---

## 📝 次のステップ（手動）

### ステップ1: VSCode で Codex を開く

1. VSCode を起動
2. Codex 拡張機能を開く（コマンドパレット: Cmd+Shift+P）
3. クリップボードの内容を貼り付け（Cmd+V）
4. オプション設定:
   - Model: GPT-4 推奨
   - Temperature: 0.3

### ステップ2: レビュー結果を保存

```bash
# 方法1: VSCodeで直接保存
code ~/Desktop/tmp/codex-review-result.txt
# Codexの結果を貼り付けて保存

# 方法2: クリップボード経由
pbpaste > ~/Desktop/tmp/codex-review-result.txt
```

### ステップ3: 結果を統合

Codexのレビュー結果を保存したら：

```
/codex-review-merge [元の入力と同じ引数]
```

例：
- 単一ファイルの場合: `/codex-review-merge file.py`
- 複数ファイルの場合: `/codex-review-merge file1.py file2.py`
- ディレクトリの場合: `/codex-review-merge src/components/`

---

## 💡 Quick Tips

### ファイル数の目安
- **小規模**: 1-5ファイル、1,000行以下 → 最適
- **中規模**: 6-20ファイル、5,000行以下 → 良好
- **大規模**: 21-50ファイル、10,000行以下 → 分割推奨
- **超大規模**: 50ファイル以上 → 必ず分割

### トークン制限対策
```bash
# ディレクトリ内を分割してレビュー
/codex-review-workflow src/components/auth/
/codex-review-workflow src/components/dashboard/

# 重要なファイルのみ指定
/codex-review-workflow src/app.py src/models.py src/utils.py
```

### 両者の強みを活用
- **Claude Code**: アーキテクチャ、構造的分析、複数ファイル間の関係性
- **Codex**: 言語固有の最適化、細かいバグ検出、パターン認識

---

## 🔗 関連コマンド

| コマンド | 用途 |
|---------|------|
| `/codex-review-workflow <files>` | 完全ワークフロー（このコマンド） |
| `/codex-review-prompt <files>` | プロンプト生成のみ |
| `/codex-review-merge <files>` | 結果統合のみ |
| `/codex-review-diff [args]` | Git差分レビュー |

---

## 📚 参考情報

**このワークフローの特徴:**
- ✅ OpenAI Codex Prompting Guide 準拠
- ✅ 汎用的（全プログラミング言語対応）
- ✅ 複数ファイル・ディレクトリ対応
- ✅ MCPサーバー不要
- ✅ ユーザーレベルで利用可能

**参考資料:**
- [OpenAI GPT-5 Codex Prompting Guide](https://cookbook.openai.com/examples/gpt-5-codex_prompting_guide)
- [Code Review Best Practices](https://google.github.io/eng-practices/review/)

---

**ワークフローを開始しました！** 🚀

次: VSCode で Codex を開いてレビューを実行してください。
