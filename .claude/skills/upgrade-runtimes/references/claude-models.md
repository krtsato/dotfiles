# Claude のモデルを同じ系統の最新へ上げる

定期実行やスクリプトが `claude -p --model <ID>` で呼ぶモデルは、**ID を固定して書いた時点で古くなり始める**。
2026-10-26、講義まとめのワークフローが `claude-opus-4-8` のまま、最新の Opus 5.5 より 2 世代前で動いていた
（mcp-invest-knowledge #585 で修正）。誰も気づかなかったのは、古いモデルでも**失敗せずに動き続ける**から。

## 方針 — 系統は変えず、版だけ上げる

| 変えてよい | 変えない |
| --- | --- |
| 同じ系統の中での版（Opus 5 → 5.5、Fable 5 → 5.1） | 系統そのもの（Opus → Sonnet 等）。費用と品質の釣り合いを持ち主が選んだ結果なので、版上げの作業で動かさない |

系統を変えたいときは別の依頼として持ち主に確かめる。

## 1. 使われている ID を洗い出す

**ファイルの種類で絞らず、git が管理するファイルだけを探す。** skill の手順書（`.md`）に書かれた
`claude -p --model` も実際に走る（2026-10-26、`apply-digest-findings` の手順書だけが旧 ID のまま残っていた）。
旧形式の ID（`claude-3-5-sonnet-20241022`）も拾う。

```bash
cd ~/dev/me
for r in */; do r=${r%/}; [ -d "$r/.git" ] || continue
  git -C "$r" grep -nIE "claude-(opus|sonnet|haiku|fable)-[0-9]|claude-[0-9]-[0-9a-z-]*(opus|sonnet|haiku)" \
    -- ':!vault' ':!data' 2>/dev/null | sed "s|^|$r/|"
done
```

**`grep -r` を使わない理由は 2 つ。**

| 罠 | 起きること |
| --- | --- |
| フォルダ丸ごとを探す | dotfiles の `.claude/` にある会話の記録や取得物の保存先まで拾い、2026-10-26 の実測で 8.7 MB になった |
| Claude Code の会話の中の `grep` | 別の検索道具に置き換わっており、`.claude` のような**隠しフォルダを黙って飛ばす**。手順書の旧 ID が 0 件に見えた |

`git grep` なら隠しフォルダも探し、管理外の記録は最初から含まない。`vault/` と `data/` は取得したデータなので外す。

**コミットの共著者の表記と、別名の固定も同時に拾う。** どちらも ID とは別の文字列なので上の検索には出ない。

```bash
cd ~/dev/me
for r in */; do r=${r%/}; [ -d "$r/.git" ] || continue
  git -C "$r" grep -niIE "co-authored-by: claude|ANTHROPIC_(DEFAULT_[A-Z]+_MODEL|MODEL)|--model (opus|sonnet|haiku|fable)" \
    -- ':!vault' ':!data' 2>/dev/null | sed "s|^|$r/|"
done
```

拾ったものを 3 つに仕分ける。**上げるのは 1 つ目だけ。**

| 仕分け | 例 | 扱い |
| --- | --- | --- |
| 実行時に使われる指定 | ワークフローの既定値、スクリプトの `MODEL=`、手順書の `claude -p --model` | 上げる |
| 共著者の表記 | `Co-Authored-By: Claude Opus 5.5` | **そのスクリプトが実際に使うモデル**に合わせる。会話しているモデルの名前を書かない（2026-10-26、ノートを書くのは Fable なのに Opus と記録していた） |
| 履歴の記述 | 「fable-5 が上限に達したので」のような経緯のコメント、この文書の事例、テストの固定値 | 触らない。PR に除外した理由を書く |

**別名（`--model opus`）は書き換えないが、解決先は確かめる。** 解決先を決めるのは 3 つで、
どれか 1 つが古いと別名でも旧モデルが動く。

| 決めるもの | 確かめ方 |
| --- | --- |
| CLI の版 | `claude --version`。別名が新しい版を指すのは CLI がその版に対応してから（`opus` が Opus 5.5 になったのは v2.1.280） |
| 環境変数 | `env \| command grep -E '^ANTHROPIC_(DEFAULT_[A-Z]+_MODEL\|MODEL)='` |
| git 管理外の設定 | `~/.claude/settings.json`・各リポの `.claude/settings.local.json` の `model` と `env` |

**手元と自宅 Mac の runner で別々に確かめる。** runner は別のシェルで動くので、手元の結果は runner の保証にならない。
実際の解決先は手順 3 の確かめ方を `--model opus` で流せば分かる。

`actions-runners/` と `.worktrees/` は git の管理外なので、上の検索には最初から出ない。

## 2. 同じ系統の最新を確かめる

**記憶で書かない。** 次のどちらかで確かめる。

| 確かめ方 | 中身 |
| --- | --- |
| 公式のモデル一覧 | `https://docs.claude.com/en/docs/about-claude/models/overview` |
| 会話の環境欄 | Claude Code が起動時に示す「最新のモデル ID」の一覧 |

## 3. 呼べることを確かめる

ID が実在しても、**手元の CLI が古いと呼べない**ことがある。書き換える前に 1 回呼ぶ。

**応答が返っただけでは足りない。** 設定によっては別のモデルへ切り替わって成功するので、
実際に応答したモデルを JSON の `modelUsage` で確かめる。

```bash
printf 'Reply OK\n' | gtimeout 120 claude -p --model <新しい ID> --output-format json \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["is_error"], list(d["modelUsage"]))'
```

`False ['<新しい ID>']` 以外なら書き換えない。原因を切り分けてからやり直す。

| 出たもの | 疑う所 |
| --- | --- |
| 「モデルが無い」 | 手元の CLI が古い。`claude --version` を確かめて上げる |
| 利用上限 | 契約の枠。時間をおくか、持ち主に確かめる |
| 認証の誤り | ログインが切れている。持ち主にログインし直してもらう |
| 別の ID が出る | 別名の固定や切り替えの設定。手順 1 の 2 つ目の grep |

**手元で呼べても、自宅 Mac の runner で呼べるとは限らない。** runner はログインの持ち方が別なので、
マージした後にワークフローを 1 本 `workflow_dispatch` で走らせる（入力で件数を最小にできるなら最小にする）。
**モデルを呼ぶステップまで着いただけでは合格にしない。** 次の 2 つを run のログで確かめる。

| 確かめること | 不合格の例 |
| --- | --- |
| モデルの呼び出しが成功している | 認証の誤り・利用上限で止まり、後のステップが「対象なし」で緑になる |
| 応答したモデルが新しい ID | ログに出るモデル名が古い。出ないワークフローなら、ステップの中で手順 3 の確かめ方を 1 回流す |
