# Claude Code のファイル — どこに何があり、どう直すか

Claude Code が読み書きするファイルの置き場と役割。**直す前に、そのファイルが本当に読まれているかを確かめる**ための地図。
`~/.claude` は dotfiles の `.claude` へのリンクなので、git で管理するもの（指示・設定）と、Claude Code が自動で作る記録が
同じフォルダに混ざっている。

## 目次

- [置き場の全体像](#置き場の全体像)
- [git で管理するもの — dotfiles の .claude](#git-で管理するもの--dotfiles-の-claude)
- [git で管理しないもの — Claude Code が作る記録](#git-で管理しないもの--claude-code-が作る記録)
- [~/.claude.json — 全体の状態と MCP サーバー](#claudejson--全体の状態と-mcp-サーバー)
- [各リポジトリ側のファイル](#各リポジトリ側のファイル)
- [何を直すときにどこを直すか](#何を直すときにどこを直すか)
- [読まれない場所に書かない](#読まれない場所に書かない)
- [片付け](#片付け)

## 置き場の全体像

| 置き場 | git | 中身 |
| --- | --- | --- |
| `~/.claude/`（= dotfiles の `.claude/`） | 一部 | 指示・設定・skill（管理する）と、会話の記録・取得物（管理しない）が同居 |
| `~/.claude.json` | しない | Claude Code の全体の状態と、**MCP サーバーの正本**。認証の値を含む |
| 各リポジトリの `CLAUDE.md`・`AGENTS.md`・`.claude/`・`.mcp.json` | リポジトリごと | そのリポジトリだけに効く指示と設定 |

効き方は種類で違う（Claude Code の公式の説明書 <https://code.claude.com/docs/en/settings>・<https://code.claude.com/docs/en/memory>）。

| 種類 | 効き方 |
| --- | --- |
| 指示（`CLAUDE.md`・`rules/`） | 全体と各リポジトリのものが**全部あわせて**読み込まれる。どちらかが勝つのではない |
| 設定（`settings.json` の項目） | 同じ項目は 手元（`.claude/settings.local.json`）＞ プロジェクト（`.claude/settings.json`）＞ 全体（`~/.claude/settings.json`）の順に勝つ。許可の一覧（`permissions.allow` など）のリストは足し合わされる（`fallbackModel`・`modelPicker` など一部の項目は別の決まり） |
| MCP サーバー | 各リポジトリの `.mcp.json` が全体（`~/.claude.json`）より優先される |

## git で管理するもの — dotfiles の .claude

`.gitignore` で「管理するものだけを列挙し、ほかは無視する」形にしてある。新しく管理したいものは `.gitignore` に足す。

| ファイル・フォルダ | 役割 | いつ読まれるか |
| --- | --- | --- |
| `CLAUDE.md` | 全プロジェクトに効く指示の入口（結論と索引） | **毎回** |
| `AGENTS.md` | `CLAUDE.md` へのリンク。Codex など `AGENTS.md` を読む道具のため | 道具による |
| `rules/` | 常に効く規則（委譲・作業の進め方・git・編集） | **毎回** |
| `docs/` | 根拠・実測・却下した案。エージェントが判断に迷ったときに開く | 必要なときだけ |
| `settings.json` | Claude Code の本体の設定（下表） | **毎回** |
| `hooks/` | `settings.json` の `hooks` から呼ばれるスクリプト（計画の書式の検査、文章の検査） | 該当の操作のたび |
| `agents/` | サブエージェントの定義（`researcher`・`implementer`・`reviewer`） | 呼び出したとき |
| `commands/` | スラッシュコマンド（`/git-commit`） | 呼び出したとき |
| `skills/` | 自作の skill。Codex からは `.codex/skills/<名前>` の相対リンクで同じものを使う | 依頼が合ったとき |

### settings.json の中身

| 項目 | 効くもの |
| --- | --- |
| `permissions` | 確認なしで許す操作（`allow`）と、禁じる操作（`deny`） |
| `hooks` | 決まった時点で自動で走る処理（会話の開始時の注意、ファイルを書いた後の検査、許可待ちと完了の通知） |
| `enabledPlugins`・`extraKnownMarketplaces` | 有効にするプラグインと、その配布元 |
| `env` | Claude Code に渡す環境変数 |
| `model`・`outputStyle`・`statusLine`・`tui`・`autoMode` など | 使うモデル、出力の書き方、状態の表示、画面、自動の許可の判断 |

**MCP サーバーはここに書かない。** `settings.json` の `mcpServers` は Claude Code に読まれない（[読まれない場所に書かない](#読まれない場所に書かない)）。

## git で管理しないもの — Claude Code が作る記録

Claude Code は、決まった置き場を `cleanupPeriodDays`（既定 30 日、`settings.json` では未設定）より古くなったら自動で消す
（<https://code.claude.com/docs/en/claude-directory#cleaned-up-automatically>）。

| ファイル・フォルダ | 中身 | 片付け |
| --- | --- | --- |
| `projects/<作業フォルダ>/*.jsonl` | 会話の記録 | 30 日で自動。ただし Claude Desktop・Cowork で始めた（最後に続けた）会話は既定で期限なし（`desktopSessionCleanupPeriodDays` で期限を付けられる） |
| `projects/<作業フォルダ>/<会話>/subagents/`・`tool-results/` | サブエージェントの記録・大きな取得物 | 30 日で自動（会話の記録と一緒に） |
| `plans/` | 計画のファイル | 30 日で自動 |
| `file-history/` | 編集前の退避（巻き戻し用） | 30 日で自動 |
| `tasks/`・`session-env/`・`shell-snapshots/`・`paste-cache/`・`debug/`・`usage-data/` | 作業の一覧・一時的な状態・大きな貼り付け・記録 | 30 日で自動 |
| `backups/` | `~/.claude.json` の書き換え前の写し | 新しい 5 つと、読めなかった版の写しを残して自動 |
| `projects/<作業フォルダ>/memory/` | 自動の記憶（`MEMORY.md` が索引。毎回先頭 200 行か 25 KB まで読まれる） | 自動では消えない（永続が目的） |
| `jobs/`・`daemon/` | バックグラウンドの会話の状態 | **消さない**（公式が残すよう指定） |
| `sessions/` | 動いている会話の目印 | 会話の終了時に自動 |
| `plugins/` | 取り込んだプラグイン | `claude plugin` に任せる。消さない |
| `history.jsonl`・`stats-cache.json` | 入力した依頼の履歴・使用量の集計 | 自動では消えない |
| `cache/`・`remote-settings*`・`policy-limits*` | Claude Code の内部の写し | 自動で取り直される。触らない |
| `settings.local.json` | 削除済み（中身は退避した `~/.mcp.json` の許可だけだった） | — |

会話の記録は暗号化されていない。道具が読んだ値（`.env` の中身など）もそのまま残る。

## ~/.claude.json — 全体の状態と MCP サーバー

dotfiles の外にある 1 つのファイル。Claude Code がほぼ毎回書き換える。

| 項目 | 中身 |
| --- | --- |
| `mcpServers` | **全体の MCP サーバーの正本**。どのフォルダで開いても効く |
| `projects` | 作業フォルダごとの状態（信頼の登録、そのフォルダだけの MCP サーバーなど） |
| そのほか | 初回の案内を見たか、自動の許可の通知の回数など、Claude Code の内部の状態 |

- **手で書き換えない。** MCP サーバーは `claude mcp add-json -s user <名前> '<JSON>'` と `claude mcp remove -s user <名前>` で足し引きする。動いている会話も同じファイルに書くため、手で書き換えると上書きされることがある
- 名前に `.` は使えない（使えるのは英数字・`-`・`_`）
- 認証の値はなるべく書かない。OAuth に対応したサーバーは OAuth にする（例: Stripe は `https://mcp.stripe.com` を足して `/mcp` からブラウザでログイン）。GitHub は `sh -c 'GITHUB_PERSONAL_ACCESS_TOKEN=$(gh auth token) exec docker run …'` で、`gh` のログインから起動のたびに取り出す
- git にも、macsetup の秘密を運ぶ仕組みにも入っていない。Mac を替えるときは別に運ぶ（課題 dotfiles #80）

## 各リポジトリ側のファイル

| ファイル | 役割 |
| --- | --- |
| `CLAUDE.md` | そのリポジトリの指示。全体の `CLAUDE.md` に重ねて読まれる |
| `AGENTS.md` | Codex など向けの同じ指示。`CLAUDE.md` と同じ中身にする（リンク、または `CLAUDE.md` から `@AGENTS.md` で読み込む） |
| `.claude/settings.json` | そのリポジトリだけの設定。git で共有する |
| `.claude/settings.local.json` | そのリポジトリの、この Mac だけの設定。git で管理しない |
| `.mcp.json` | そのリポジトリだけの MCP サーバー。全体の MCP サーバーより優先される |

**ホーム直下に `.mcp.json` を置かない。** ホームの下のすべての会話にプロジェクトの設定として効き、全体の MCP サーバーを上書きする。

## 何を直すときにどこを直すか

| 直したいこと | 直す場所 | 直し方 |
| --- | --- | --- |
| 全プロジェクトへの指示 | `CLAUDE.md`・`rules/` | dotfiles の PR |
| 許可・自動の処理・プラグイン・モデル | `settings.json` | dotfiles の PR |
| あるリポジトリで自分だけ変えたいこと | そのリポジトリの `.claude/settings.local.json` | 手で直す（git 管理外） |
| 全体の MCP サーバー | `~/.claude.json` | `claude mcp add-json -s user`／`claude mcp remove -s user` |
| あるリポジトリだけの MCP サーバー | そのリポジトリの `.mcp.json` | そのリポジトリの PR |
| skill | `skills/<名前>/`（Codex でも使うなら `.codex/skills/` にリンクを足す） | dotfiles の PR |

## 読まれない場所に書かない

書いても効かない場所に書くと、何も起きないので気づけない。直した後は、**実際に効いているか**を確かめる。

| 確かめたいこと | 確かめ方 |
| --- | --- |
| MCP サーバーがどこから読まれているか | `claude mcp get <名前>` の `Scope:` の行（`User config`＝全体、`Project config`＝`.mcp.json`） |
| 全体の設定だけで見えるか | ホームの外（例: `/private/tmp`）で `claude mcp get <名前>` |
| 一覧と接続の状態 | `claude mcp list` |

実例（2026-10-31）: `settings.json` に MCP サーバーを 20 個書いていたが、1 つも読まれていなかった。実際に効いていたのは、
dotfiles のリンクのはずがいつの間にか普通のファイルになっていた `~/.mcp.json` だった。全体の設定に集約した（dotfiles #88）。

## 片付け

| 対象 | 使うもの |
| --- | --- |
| 会話の記録・計画・退避・取得物など | 不要（30 日で自動。期間は `settings.json` の `cleanupPeriodDays`） |
| あるプロジェクトの記録をまとめて消す | `claude purge <作業フォルダ> --dry-run` で確かめてから `claude purge <作業フォルダ>` |
| uv・mise・npx・Xcode・runner・Docker の取り直せる置き場 | skill `prune-dev-caches` |

skill `prune-agent-storage` は、自動の片付けが取りこぼしたものだけを片付ける。会話の記録が無い会話の退避（`file-history/`）・サブエージェントの記録・取得物が対象で、続いている会話のものには触れない（巻き戻しに要る）。あわせて、`cleanupPeriodDays` より古い会話の記録が残っていれば、自動の片付けが止まっている合図として警告する（`/status` で確かめる）。
