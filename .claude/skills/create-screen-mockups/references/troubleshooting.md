# Troubleshooting

書き出し・フォント取得・照合・codex で止まったときに読む。

## Error: 画面のアイコンが `search` などの英単語で表示される

**Cause**: アイコンのフォントは使う名前だけを含む部分集合で、新しい名前が入っていない。
**Solution**: `<screens-dir>/src/fetch-assets.sh` を実行して書き出し直す。`Icon("name")`・`IconButton("name")`・`icon:`/`trailing:`/`leading:`/`nav:`（既定値の `nav = "name"` を含む）・`Fab("..", "name")`・`NAV` と `STATUS` の表の行（`["key", "ラベル", "name"]` / `["ラベル", "name"]`）以外の書き方で名前を渡していると拾われないので、その書き方に揃える。`NAV` の表のキーは英小文字だけにする（数字やハイフンを含むと拾われない）。

## Error: `capture.sh` が `failed: NN-name.png (data-render="error")` を出す

**Cause**: その画面の描画関数が例外を投げた。`font-error:<family>` ならフォントの読み込みに失敗した。
**Solution**: ブラウザで `src/index.html?screen=<id>` を開き、画面に出るエラー文とコンソールを見て原本を直す。`font-error` なら `fetch-assets.sh` を実行し直す。

## Error: `verify-screens.sh` が `registry != png` を出す

**Cause**: 画面の番号や名前を変えた後に古い PNG が残っている、または書き出しに失敗した画面がある。
**Solution**: `rm <screens-dir>/*.png` の後に `capture.sh` で全画面を書き出す。

## Error: `verify-screens.sh` が `requirements not mapped to any screen` を出す

**Cause**: README の画面一覧の「主な要件 No.」の欄に、その番号が書かれていない。区切りが「、」以外（`,`・`・`）、数字の番号が 3 桁でない（`7`）、`--ids` のファイルと README で番号の書き方が違う、のどれかが多い。
**Solution**: 本当に対応する画面がないなら、画面を足すか、要件書の範囲外であることを依頼者と確認する。書き方の違いなら、README を「、」区切り・要件書と同じ書き方にそろえる。

## Error: codex の結果が「No prompt provided」や「Not inside a trusted directory」

**Cause**: `-i` が依頼文を画像パスとして読んだ、または Git 管理外で実行した。どちらも終了コードは 0。
**Solution**: `-i a,b,c` を 1 回、依頼文は `- < file`、`--skip-git-repo-check` を付ける。

## Error: `fetch-assets.sh` が `got N of M weights` で止まる

**Cause**: `src/font.conf` の `FONT_WEIGHTS` に、その書体に無い太さがある。
**Solution**: Google Fonts の書体ページで太さを確かめ、`FONT_WEIGHTS` を合わせる。既存の `vendor/` は失敗時には置き換わらない。
