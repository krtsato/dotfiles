# skill を複数のエージェントで共有する

`~/.claude/skills/` を**正本**とし、他のエージェントへは**相対 symlink** で見せる。
skill の本文は 1 つしか無い。エージェントごとの違いは、そのエージェントの
**常に読まれる指示ファイルに置いた読み替え表 1 枚**に閉じ込める。

## なぜ symlink か

| 方式 | エージェントが見るもの | 結果 |
| --- | --- | --- |
| **symlink** | 各 skill の説明文そのもの | 会話の内容から**自分で選べる** |
| 案内役の skill を 1 枚置く | 案内役の説明文だけ | **名前を言われないと辿り着けない** |
| 複製 | 同じ内容が 2 か所 | 片方だけ直って静かにずれる |

**相対で張る**（`../../.claude/skills/<名前>`）。絶対パスは別のマシンで壊れるが、
相対なら clone しただけで再現する。`~/.claude` と `~/.codex` は**同じリポジトリ**を指すので、
symlink はリポジトリの中で閉じる。

## 使い方

```sh
~/dev/me/dotfiles/agent-bridge/share-skills.sh --check   # ずれを報告するだけ
~/dev/me/dotfiles/agent-bridge/share-skills.sh           # 張る・張り直す
~/dev/me/dotfiles/agent-bridge/share-skills.sh <リポジトリ>  # project scope にも使える
```

project scope でも同じ形が効く。`<リポジトリ>/.codex/skills/<名前>` →
`../../.claude/skills/<名前>`。実測で、user scope と project scope の**どちらも読まれた**。

## エージェントを増やすとき

1. `agents.tsv` に 1 行足す（名前・skill の置き場所・frontmatter で許される項目）
2. `share-skills.sh` を走らせる
3. そのエージェントの**常に読まれる指示ファイル**に読み替え表を書く
   （Codex なら `.codex/AGENTS.md` の「共有 skill」節）

読み替え表を skill ごとに書かない。**エージェントごとに 1 枚**にする。
skill が増えても表は増えない。

## 守っていること

| | |
| --- | --- |
| **正本へは書き込まない** | `.claude/skills/` はこの仕組みから見て読み取り専用 |
| **追跡されていない skill は共有しない** | 別リポジトリを指す `mdreview` のような symlink や作業用が、誰も保守しない状態で他のエージェントの一覧に出てしまうため |
| **同じ名前の実体があれば触らない** | そのエージェント自身の skill を上書きしない |
| **正本が消えた symlink を報告する** | 消えたことに気づけないと、空振りが残る |

## 分かっている差

| | |
| --- | --- |
| `compatibility:` | Codex の項目一覧（`name` / `description` / `license` / `allowed-tools` / `metadata`）に無い。**実行時は素通りする**ことを確認済み。検査スクリプトだけが警告する |
| `allowed-tools:` の中身 | Claude の道具名で書かれている。読み替え表で吸収する |
| hooks | **共有できない**。Codex は `hooks.json`、Claude は `settings.json` で、対象の指定に使う道具名も違う（`apply_patch` と `Write\|Edit`）。**共有するのはスクリプトの側**で、呼び出しの設定は各自が持つ |
