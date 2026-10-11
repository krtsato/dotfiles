---
name: manage-securerc
description: Secure Remote Control（securerc）の起動、Running 確認、状態確認、停止、完了済み会話の整理、診断、初期設定確認、明示的な provider 終了確認を行う。Discord の bot が応答しない、会話を整理したい、Mac を離れる前に止めたい、または「securerc を管理して」と依頼されたときに使う。Discord の通常タスク実行、任意の Discord スレッド削除、任意パスの診断ログ読取、token の表示・変更だけには使わない。
license: MIT
compatibility: macOS、Node.js、npm、~/dev/me/securerc、~/.config/securerc/config.json を使用する。Discord bot token の内容は読まない。
allowed-tools: Bash(securerc:*), Bash(command:*), Bash(ps:*), Bash(~/.claude/skills/manage-securerc/scripts/bootstrap.sh:*), Bash(stat:*), Bash(test:*), Bash(sleep:*), AskUserQuestion
metadata:
  author: s11639
  version: "1.0"
---

# securerc を管理する

## 目次

- [重要な境界](#重要な境界)
- [実行手順](#実行手順)
- [使い方の例](#使い方の例)
- [完了条件](#完了条件)
- [トラブルシューティング](#トラブルシューティング)

## 重要な境界

- `securerc` の実行前に、この skill の `scripts/bootstrap.sh` を実行する。CLI の real path が既定の `~/dev/me/securerc/dist/src/cli.js`（移行・検証時は `SECURERC_REPOSITORY` 配下）と完全一致すれば副作用なく終了する。未導入、壊れた link、別 checkout を指す場合だけ、Git repository と `package.json` を確認して `npm ci`、`npm run build`、`npm link` を順に実行する。link 後は real path を再確認し、設定ファイルがある場合だけ `securerc status` も確認する。`sudo` は使わない。token file は内容を読まず、`test` と `stat` で存在と mode `0600` だけを確認する。値の表示・コピー・変更はしない。
- 曖昧な依頼の既定は **状態確認 → 必要なら起動 → `Running` 確認**。会話の削除、停止、終了確認は既定で実行しない。
- `Starting` は準備中であり、成功ではない。`securerc status` を 5 秒間隔、最大 5 分繰り返す。5 秒はローカル状態確認の過剰な反復を避け、5 分は無限待機を防ぎ、60 秒以内の進捗報告は無応答に見せないためである。`Running` になるまで利用者へ起動完了と報告せず、新規 Discord 投稿を案内しない。上限時は失敗または未完了としてログを診断し、`Running` と報告しない。
- 完了会話の整理対象は、securerc が記録した `completed` または `failed` のスレッドだけである。未知の Forum 投稿、実行中の会話、設定ファイルは削除しない。bridge が `Running` の場合、`down` は別の実行中・入力待ち task も中断し得るため、その影響を明示して利用者の確認を得るまで停止・整理しない。
- `acknowledge-provider-exit` は、ユーザーが task ID を明示し、`ps` で該当 provider process が存在しないことを確認できた場合だけ実行する。task ID がないときは、対話可能なら `AskUserQuestion` を 1 回だけ使って task ID を取得する。対話不能なら不足を報告して終了する。推測で確認済みにしない。
- securerc 自身が起動した Discord task からこの skill を呼んだ場合、bootstrap、`down`、`tidy`、`acknowledge-provider-exit` は自身の実行環境を変更、停止または中断させるため実行しない。既存 CLI の `status` と `logs` だけを許可し、CLI がなければローカル agent session から bootstrap するよう案内する。
- 診断ログは `securerc logs` だけを使う。任意 path のログを読まない。

## 実行手順

1. **呼出元と CLI を確認する。** 最初に `test "${SECURERC_PROVIDER_TASK:-}" = "1"` 相当で provider-origin を確認する。`1` なら bootstrap、`down`、`tidy`、`acknowledge-provider-exit` を必ず拒否する。既存 CLI があれば `status` と `logs` だけを許可し、なければローカル agent session から bootstrap するよう案内して止める。provider-origin でなければ `~/.claude/skills/manage-securerc/scripts/bootstrap.sh` を実行し、失敗時はエラーを報告して停止する。その後、起動・状態・停止・整理・診断・終了確認に分類し、不明なら状態確認として扱う。設定ファイルがなければ設定手順を案内して止める。存在する場合は、内容を読まず mode が `0600` であることを `stat` で確認し、不一致または取得不能なら `securerc` を実行せず停止する。
2. **状態を読む。** `securerc status` を実行し、`Stopped`、`Starting`、`Running`、異常のいずれかを記録する。診断が必要なときだけ `securerc logs` を使う。
3. **必要な操作だけを行う。** 起動は `securerc up`、停止は `securerc down`、整理は `securerc tidy` を使う。終了確認は task ID 明示、provider-origin ではないこと、`status` が `Stopped`、`ps -Ao pid=,command=` に `codex app-server --stdio` がなく、Claude SDK の `--output-format stream-json` と `--input-format stream-json` を併せ持つ process も 1 件もないことを確認した場合だけ `securerc acknowledge-provider-exit <task-id>` を使う。task 単位の process 識別はできないため、これは全 provider 不在を要する保守条件である。条件が不明または満たさなければ実行しない。通常の Discord タスクは Discord スレッド上の bot に任せる。
4. **起動は完了まで待つ。** `up` 後、5 秒ごとに `securerc status` を確認し、60 秒以内に進捗を報告する。`Starting` の間は最大 5 分待機する。上限時は失敗または未完了としてログの安全な末尾と次の復旧操作を示し、`Running` と報告しない。
5. **整理は連続性を守る。** 整理前の状態を記録する。`Running` なら、停止によって別の実行中・入力待ち task が `recovery-required` になり得ることを説明し、`AskUserQuestion` で停止してよいか 1 回だけ確認する。確認を得られなければ `down` も `tidy` も実行しない。確認後は `down` の直後に `status` が `Stopped` と確認できてからだけ `tidy` を実行する。確認できなければ `tidy` は実行せず原因を報告する。元が `Running` で最新状態が `Running` でなければ、安全に `up` と `Running` 待機を試みて状態を戻す。各 task の worktree 整理、Discord スレッド削除、スキップ、失敗を全件報告する。
6. **結果を検証して報告する。** 操作後に `securerc status` を再実行する。実行したコマンド、開始前後の状態、削除数・スキップ数・失敗数、残る人手作業を短く報告する。

### 操作別チェックリスト

- [ ] `securerc` と設定ファイルの存在を確認した
- [ ] bootstrap が CLI の link 先を確認し、必要な場合だけ `npm link` を修復した
- [ ] bootstrap の失敗時に `sudo` を使わず、表示された権限・npm 設定を確認するよう案内した
- [ ] token の値を読まず、出力にも含めていない
- [ ] token file の存在と mode `0600` だけを確認した
- [ ] provider-origin を最初に確認し、該当時は bootstrap を含む `status` と `logs` 以外を拒否した
- [ ] 依頼が曖昧な場合は削除せず、状態確認から始めた
- [ ] `Starting` を成功として報告せず、`Running` まで確認した
- [ ] polling 中に 60 秒以内の進捗報告をした
- [ ] 整理前の状態を記録した
- [ ] 整理前が `Running` なら、他 task の中断リスクを説明して明示確認を得た
- [ ] `down` 後に `Stopped` を確認できなければ `tidy` を実行していない
- [ ] 整理後、元が `Running` なら失敗時も再起動を試みた
- [ ] 終了確認では task ID、`Stopped`、全 provider process 不在を確認した
- [ ] 終了状態、件数、失敗・スキップを報告した

## 使い方の例

### 例 1: 曖昧な依頼

入力: `securerc を使える状態にして`

期待出力: `Stopped → Running を確認しました。Discord の Forum スレッドで新しい指示を送れます。`

### 例 2: 完了会話の整理

入力: `終わった securerc の会話を整理して`

期待出力: `bridge 停止で実行中・入力待ち task も中断し得ることを確認後、Stopped を確認して整理しました。完了 2 件を削除、失敗 1 件は dirty worktree のためスキップし、bridge は Running に復帰しています。`

### 例 3: 停止

入力: `外出するので securerc を止めて`

期待出力: `Running → Stopped を確認しました。Discord の新規指示は受け取りません。`

### 例 4: provider 終了確認

入力: `task abc123 の provider 終了を確認して`

期待出力: `task abc123 の終了確認を、Stopped と全 provider process 不在を確認して記録しました。`

## 完了条件

| 操作 | 定量的な確認 | 質的な確認 |
| --- | --- | --- |
| 起動 | `status` が `Running` を 1 回返す | Discord が新しい指示を受け取れる状態である |
| 停止 | `status` が `Stopped` を 1 回返す | 新しい処理を開始しない |
| 整理 | `Running` なら明示確認を 1 回得て、`down` 後に `Stopped` を 1 回確認する | 別 task を無断で中断せず、未知・実行中・危険な worktree を消さない |
| 終了確認 | task ID、`Stopped`、全 provider process 不在を確認する | 実行中 provider を誤って終了扱いにしない |

## トラブルシューティング

| Error | Cause | Solution |
| --- | --- | --- |
| `securerc: command not found` | CLI 未導入または PATH 未設定 | securerc リポジトリの導入手順を実施し、新しい shell で再確認する |
| bootstrap が失敗する | repository がない、または `npm ci`、build、link が失敗した | `SECURERC_REPOSITORY` または既定の `~/dev/me/securerc` を確認する。`sudo` は使わず、npm の prefix と対象 directory の権限を直してから再実行する |
| 設定ファイルがない | 初期設定が未完了 | `~/.config/securerc/config.json` を作る手順を案内する。token は依頼者だけが入力する |
| `Starting` が続く | Discord 接続または provider の準備待ち | `securerc logs` を確認し、認証・ネットワーク・CLI 導入を順に確認する |
| `down` 後に `Stopped` を確認できない | bridge が停止していない、または状態取得に失敗した | `tidy` は実行せず原因を報告する。元が `Running` で最新状態が異なるなら、安全に再起動を試みる |
| `Running` 中の整理を確認される | 停止すると別の実行中・入力待ち task も中断し得る | 中断を許容できる場合だけ承認する。承認されなければ状態を変えず終了する |
| `tidy` の一部が失敗 | dirty worktree または Discord API の失敗 | 失敗した task を残して報告する。bridge が元は `Running` なら再起動を完了まで確認する |
| 終了確認を拒否された | task ID がない、bridge が `Stopped` でない、または provider process が残る | task ID がなければ対話可能な場合に `AskUserQuestion` を 1 回だけ使う。全 provider が終了し bridge が `Stopped` になってから再実行する |
| Discord task 内で整理・停止を依頼した | 操作すると自身が停止する | ローカル agent session から同じ依頼を実行する |

## 使わない場合

- Discord 上で通常の goal を開始・停止・再開する場合は、この skill ではなく対象スレッドの bot コマンドを使う。
- Forum の投稿を任意に消す場合は、対象を確認して Discord で操作する。`tidy` は securerc 管理下の終了 task に限定する。
- token の確認・表示・再発行は、この skill の対象外である。

## 評価シナリオ

具体的な trigger、拒否条件、edge case は [評価シナリオ](references/evaluations.md) を参照する。
