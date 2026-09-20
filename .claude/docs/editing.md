# 編集と検査

## Markdown

編集した後は必ず検査する。

```sh
npx markdownlint-cli2 --config ~/dev/me/dotfiles/.markdownlint.yaml <file>
```

警告が出たら直す。

## 文字の間隔

**半角の英数字の前後に半角スペースを入れる。**

| | |
| --- | --- |
| 良い | `push 前に`、`1 つ`、`Conventional Commits 形式` |
| 悪い | `push前に`、`1つ`、`Conventional Commits形式` |

句読点や括弧に接する側にはスペースを入れない。

## Bash

`echo "---"` のようにダッシュで始まる引用文字列を避け、`echo ===` や `echo ~~~` を使う
（許可の確認が出るのを避けるため）。
