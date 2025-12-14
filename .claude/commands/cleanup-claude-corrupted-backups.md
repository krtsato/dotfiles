---
description: Clean up corrupted Claude Code backup files (.claude.json.corrupted.*)
argument-hint: "[--force]"
---

# Claude Code Corrupted バックアップファイルのクリーンアップ

`~/dev/me/shells/cleanup-claude-corrupted-backups.sh` スクリプトを実行して、14日以上経過した古いバックアップファイル (`.claude.json.corrupted.*`) を削除してください。

**オプション:**
- 引数なし: 14日以上経過したファイルのみ削除
- `-f` または `--force`: 日数に関係なくすべてのバックアップファイルを強制削除

実行後、削除されたファイル数と残りのファイル数を報告してください。
