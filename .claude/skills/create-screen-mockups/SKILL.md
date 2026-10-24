---
name: create-screen-mockups
description: 要件定義書・要件概要書から、モバイルアプリの画面例（モックアップ）を、編集できる HTML/CSS/JS の原本と PNG の一式で作る。A2UI の部品カタログと Material 3 に沿い、企業サイトから決めたブランド色で色一式を生成し、DESIGN.md、画面一覧と未決の点の README、codex によるレビューの反映までを扱う。「要件から画面デザインのモックアップ画像を作って」「screens が AI くさいので作り直して」「画面例を codex にレビューさせて直して」「DESIGN.md を作って」の時に使う。Do NOT use for アプリ本体（Flutter など）の実装・修正、要件定義書そのものの作成、スライド作成、ロゴなど単発の画像生成、Figma の編集。
compatibility: macOS、Google Chrome（headless で PNG を書き出す）、coreutils の timeout、curl、python3、node と npm（色一式の生成、markdownlint-cli2）。Google Fonts と npm registry へのネットワーク接続。codex CLI（ログイン済み）はレビュー工程だけで使い、無ければ自己点検に切り替える。
---

# 画面例の作成

要件定義書・要件概要書（以下、要件書）を関係者と擦り合わせるための画面例を、誰が作っても同じ品質になる手順で作る。以下、このスキルを使って画面例を頼む人を「依頼者」、完成するアプリを使う人を「アプリの利用者」、確認事項の回答がなく仮に描いたものを「未決の点」と呼ぶ。画面の中身を組む A2UI の要素を「部品」、全画面に共通するナビゲーションバー・アプリバー・CSS を「共通の枠」、4 画面ずつ並べた確認用の画像（`sheet-N.png`）を「一覧画像」、`src/app.js` の `SCREENS`（照合の出力では registry）を「登録表」、`assets/template/` の複製元を「ひな形」と呼ぶ。要件書の番号は「要件番号」（README の列名は「要件 No.」）、確認事項の番号は「確認事項の番号」（確認事項の表の列名は「確認番号」）と書く。見た目は独自に作らず、部品は A2UI v0.9.1 の基本カタログ、見た目は Material 3 に従う。原本は HTML/CSS/JS で残し、PNG はそこから書き出す。

## 目次

- [重要事項](#重要事項)
- [ユースケース](#ユースケース)
- [成功基準](#成功基準)
- [前提条件](#前提条件)
- [Gotchas](#gotchas)
- [手順](#手順)
- [完了チェック](#完了チェック)
- [Troubleshooting](#troubleshooting)
- [参照資料](#参照資料)

## 重要事項

- **要件書が正。** 画面例はたたき台であり、要件にない項目・状態・集計値・割合を足さない。要件の表示項目は欠かさない。
- **未決の点は画面で確定させない。** 仮に描いた形は README の「未決の点」に確認事項の番号付きで書く。「閉じても送信が続く」など未決の動きを文言で約束しない。
- **画面内に要件番号・内部の画面 ID を出さない。** 人名・住所・電話番号・金額は架空にする。
- **PNG は直接編集しない。** 原本を直して書き出す。共通の枠を変えたら全画面を書き出し直す。
- **書き出した画面は必ず目で見る。** 書き出しの成功は見た目の正しさを意味しない。

## ユースケース

### Use Case 1: 要件書から一式を新規に作る

- **Trigger**: 要件書があり、打ち合わせ用の画面例がまだない
- **Steps**: 要件を画面に割り当てる → ブランド色と書体を決める → DESIGN.md → ひな形を複製して画面を組む → 書き出して点検 → README の初版 → codex レビュー → 照合
- **Result**: DESIGN.md、`<screens-dir>/src/` の原本、PNG、画面一覧と未決の点の README

### Use Case 2: 既存の画面例を作り直す

- **Trigger**: 「AI くさい」「固い」「単調」などの指摘を受けた
- **Steps**: 指摘を「AI っぽく見せないための規則」と文字の階層に照らす → 色・書体・部品を直す → 全画面を書き出して点検
- **Result**: 指摘ごとに、何をどう直したかを示せる画面例

### Use Case 3: レビューの指摘を反映する

- **Trigger**: 依頼者や codex から画面への指摘を受けた
- **Steps**: 指摘を「直す・規則に書く・未決の点に書く・見送る」に仕分け → 直して書き出し → 照合
- **Result**: 件数の内訳と、見送った理由を示せる仕分け表

## 成功基準

- **Quantitative**: `verify-screens.sh` が終了コード 0（登録表・PNG・README の件数が一致し、対象の要件番号がすべて画面に対応し、画面の文言に「要件 No」がない。数字だけの番号は点検表で目視する）。`capture.sh` が失敗 0 件。主要な文字色の組み合わせが `contrast.py` で全て PASS。markdownlint の警告 0。
- **Qualitative**: 追加の指示なしに、依頼者が「どの画面が、どの要件の、どの未決の点に関係するか」を README から読み取れる。同じ要件書から作り直しても、色・書体・部品の選び方が同じになる。

## 前提条件

| 必要なもの | 確認 | 無いとき |
| --- | --- | --- |
| Google Chrome | `ls "/Applications/Google Chrome.app"` | 別の Chromium 系を `CHROME=<path>` で指定 |
| timeout | `which timeout` | `brew install coreutils` |
| node / npm | `node --version` | mise などで導入。色一式の生成と markdownlint で使う |
| markdownlint-cli2 | `npx markdownlint-cli2 --version` | npm があれば npx が取得する |
| python3 | `python3 --version` | 標準で入っている版でよい |
| codex CLI | `codex --version` と `codex login status` | レビュー工程を自己点検に切り替え、未実施と報告 |
| 要件書と確認事項 | 対象のパス | 無ければ作らずに依頼者へ確認 |

## Gotchas

| 落とし穴 | 起きること | 対処 |
| --- | --- | --- |
| ブランド色に白文字 | 企業のロゴ色は明るいことが多く、白文字で 4.5:1 に届かない（明るい青緑で 2.9 程度） | ブランド色は種とロゴだけに使い、文字とボタンは生成された Primary |
| システム書体の太さ 500 | Hiragino などでは本文と同じ太さに描かれ、階層が消えて「単調」に見える | 見出し 700、本文 400。500 は見出しに使わない |
| 丸ゴシック | 「人間らしく」を求められて選ぶと、業務アプリにはくだけすぎる | 既定は IBM Plex Sans JP。迷ったら書体見本で比べる |
| かなが小さい書体 | 14px 前後で字間が空いて見える（Zen Kaku Gothic New など） | 書体見本で 14px の行を比べる |
| 書体の太さ | 書体ごとに用意された太さが違う（BIZ UDPGothic は 400 と 700 だけ） | `src/font.conf` の `FONT_WEIGHTS` を書体に合わせる |
| フォントの部分集合 | 使う文字とアイコンだけを含めるため、文言やアイコンを足すと代替表示になる | 足したら `fetch-assets.sh` を実行してから書き出す |
| 一部だけ書き出す | 共通の枠の変更が他の PNG に反映されず、古い見た目が残る | 共通の枠を変えたら全画面を書き出す |
| 番号を振り直す | 古い名前の PNG が残り、件数が合わなくなる | PNG を消してから全画面を書き出す |
| クラス名の衝突 | 写真用の `.ph` などと同名のクラスを文字に使うと、正方形の背景付きで潰れる | 文字用のクラスは別名にする |
| ビューア用の `nav` | 画面内のナビゲーションバーまで隠れる | 指定を `.viewer > nav` に限定する |
| A2UI に無い属性値 | `displayStyle: "segmented"` などを作ると公式の値として移植できない | 公式の値だけを使い、見た目の対応は描画側の規則として DESIGN.md に書く |
| codex の `-i` | `-i a -i b "依頼文"` と書くと依頼文まで画像パスとして読み、空振りする。終了コードは 0 | `-i a,b` を 1 回、依頼文は `- < file` |
| Git 管理外で codex | `--skip-git-repo-check` がないと実行を拒否する。終了コードは 0 | 指定を付け、出力の本文を必ず確認する |
| zsh の `echo ===` | `=` で始まる語がコマンド展開され止まる | 区切りは引用符で囲んで `echo '==='` |

## 手順

`<skill>` はこのスキルのディレクトリ、`<project-root>` は作業対象のリポジトリの直下、`<screens-dir>` は画面例の置き場所（既定は `<project-root>/docs/requirements/screens`）を指す。コマンドは `<project-root>` で実行する。

### ステップ1: 要件を画面に割り当てる

1. 要件書・確認事項・提案書を読み、対象の要件番号の範囲（`<first-req>`〜`<last-req>`）を決める。
2. アプリの利用者の種類ごとに画面を洗い出し、各画面に主な要件番号を割り当てる。表示項目の表がある要件は、その項目を画面に全部置く。
3. 状態の画面（処理中・失敗・破棄の確認・シート）は、主要な作業（撮影・登録・署名など）について足す。
4. 未決の点に関係する画面を控えておく（ステップ7で README に書く）。

### ステップ2: ブランド色を決める

```sh
python3 -I <skill>/scripts/brand-colors.py https://<client-site>/
```

既定は「有彩色で最も多く、ロゴの塗りと一致する色」。一致しない、サイトがない場合は、ロゴ画像の色か依頼者の指定を使う。決めた色を `<brand-hex>` とする。

```sh
<skill>/scripts/m3-palette.sh "<brand-hex>"
python3 -I <skill>/scripts/contrast.py "#FFFFFF:<primary>" "<on-surface>:<surface>" "<on-surface-variant>:<surface>"
```

`<primary>` などは、直前の `m3-palette.sh` の出力にある同名の値（`--primary` など）を入れる。

出力の貼り方:

- CSS: 出力を控えておき、ステップ5で複製した `src/styles.css` の `:root` のうち、色の宣言（`--primary` から `--brand` まで）だけを置き換える。角丸・書体・影の宣言は残す。
- YAML: DESIGN.md のフロントマターの `colors:` ブロック全体を出力で置き換える。

状態の色は新しく作らず、役割色（On Surface Variant・Tertiary・Primary など）に割り当てる。

### ステップ3: 書体を決める

既定は **IBM Plex Sans JP** の 1 書体（人間的な形で業務用に落ち着く。英数字が同じ一族でそろう）。依頼者が書体に注文を付けたときだけ書体見本で比べる。

```sh
SAMPLE_HEAD="<実際の項目名>" SAMPLE_BODY="<実際の場所名>" \
  <skill>/scripts/font-specimen.sh /tmp/specimen.png "IBM Plex Sans JP" "Noto Sans JP" "BIZ UDPGothic" "M PLUS 2"
```

書体を変えたら、ステップ5で複製した `src/font.conf` の `FONT`・`FONT_WEIGHTS` と、`src/styles.css` の `--font-plain` を揃える。

### ステップ4: DESIGN.md を書く

`<project-root>/DESIGN.md` に作る。`references/design-md-template.md` を読んで埋める。色の由来（サイト URL・出現回数・ロゴとの一致・生成方法）、書体の選定理由、AI っぽく見せないための規則、追加カタログを必ず書く。対応端末と向きは要件定義で確定する旨を書き、確定するまで縦向きだけを作る。

### ステップ5: ひな形を複製して画面を組む

```sh
mkdir -p <screens-dir>
cp -R <skill>/assets/template/src <skill>/assets/template/README.md <screens-dir>/
```

1. `src/app.js` の例の画面（`S.home` など）を消し、ステップ1の画面を 1 画面 1 関数で書く。
2. 画面の中身は部品の関数（`Text`・`List`・`ChoicePicker` など A2UI の部品名と同じ名前）だけで組む。足りない部品は先に DESIGN.md の追加カタログに書いてから作る。
3. 登録表 `SCREENS` に `[グループ, 画面 ID, PNG 名, ラベル]` を 1 行ずつ足す。PNG 名は `NN-name`（2 桁の番号と小文字）。先頭の行が、クエリなしで開いたときの画面になる。
4. 配置の既定: 一覧の最上位は大きな見出し、詳細はアプリバーに識別名と見出しの下にタブ、作成は FAB、入力フォームは右上で確定、頻用の確定は下部バーの右端、選択はボトムシート。

### ステップ6: 書き出して点検する

```sh
<screens-dir>/src/fetch-assets.sh
<screens-dir>/src/capture.sh
<skill>/scripts/contact-sheet.sh <screens-dir> /tmp/sheets
```

`capture.sh` は画面ごとに描画の成否（例外・フォントの読み込み）を確かめ、失敗した画面は理由を出して PNG を消す。`failed:` が 0 件になるまで原本を直す。

一覧画像を全部読み、`references/visual-qa.md` の点検表を上から当てる。崩れを直したら、共通の枠に触れた場合は全画面、触れていない場合は該当画面だけを書き出し、一覧画像を作り直して再点検する。崩れが 0 になるまで繰り返す。

### ステップ7: README の初版を書く

README の画面一覧に全 PNG を主な要件番号付きで載せ、画面の流れと、未決の点（確認事項の番号付き）を書く。レビューはこの README を前提に読むので、ステップ8より前に済ませる。

### ステップ8: codex にレビューさせて反映する

`references/codex-review.md` を読み、全ての一覧画像と依頼文を渡す。指摘を 1 件ずつ根拠と照らして「直す・規則に書く・未決の点に書く・見送る」に振り、直したらステップ6の点検に戻る。codex が使えないときは、点検表での自己点検を 2 周目として行い、レビュー未実施と報告する。

### ステップ9: 照合する

```sh
# <first-req> <last-req>: the requirement number range from step 1, e.g. 7 34
<skill>/scripts/verify-screens.sh <screens-dir> <first-req> <last-req>
npx markdownlint-cli2 <screens-dir>/README.md <project-root>/DESIGN.md
```

FAIL が出たら直してステップ6から流し直す。README の更新（画面の追加・未決の点の変化）もここで反映する。

## 完了チェック

- [ ] ブランド色の由来と、主要な色の組み合わせのコントラストを確認した
- [ ] DESIGN.md に、色の由来・書体の理由・AI っぽく見せないための規則・追加カタログがある
- [ ] `capture.sh` が失敗 0 件で全画面を書き出した
- [ ] 一覧画像で全画面を点検した（点検した画面数を報告できる）
- [ ] 共通の枠を変えた後に全画面を書き出し直した
- [ ] README の初版を書いてから codex のレビューを仕分けて反映した（または未実施と記録した）
- [ ] `verify-screens.sh` が終了コード 0
- [ ] README に未決の点が確認事項の番号付きで書かれている
- [ ] markdownlint の警告が 0

## Troubleshooting

### Error: 画面のアイコンが `search` などの英単語で表示される

**Cause**: アイコンのフォントは使う名前だけを含む部分集合で、新しい名前が入っていない。
**Solution**: `<screens-dir>/src/fetch-assets.sh` を実行して書き出し直す。`Icon("name")`・`IconButton("name")`・`icon:`/`trailing:`/`leading:`/`nav:`（既定値の `nav = "name"` を含む）・`Fab("..", "name")` 以外の書き方で名前を渡していると拾われないので、その書き方に揃える。

### Error: `capture.sh` が `failed: NN-name.png (data-render="error")` を出す

**Cause**: その画面の描画関数が例外を投げた。`font-error:<family>` ならフォントの読み込みに失敗した。
**Solution**: ブラウザで `src/index.html?screen=<id>` を開き、画面に出るエラー文とコンソールを見て原本を直す。`font-error` なら `fetch-assets.sh` を実行し直す。

### Error: `verify-screens.sh` が `registry != png` を出す

**Cause**: 画面の番号や名前を変えた後に古い PNG が残っている、または書き出しに失敗した画面がある。
**Solution**: `rm <screens-dir>/*.png` の後に `capture.sh` で全画面を書き出す。

### Error: codex の結果が「No prompt provided」や「Not inside a trusted directory」

**Cause**: `-i` が依頼文を画像パスとして読んだ、または Git 管理外で実行した。どちらも終了コードは 0。
**Solution**: `-i a,b,c` を 1 回、依頼文は `- < file`、`--skip-git-repo-check` を付ける。

### Error: `fetch-assets.sh` が `got N of M weights` で止まる

**Cause**: `src/font.conf` の `FONT_WEIGHTS` に、その書体に無い太さがある。
**Solution**: Google Fonts の書体ページで太さを確かめ、`FONT_WEIGHTS` を合わせる。既存の `vendor/` は失敗時には置き換わらない。

## 参照資料

| ファイル | 読むとき |
| --- | --- |
| `references/design-md-template.md` | DESIGN.md を新しく書く、または節を足すとき |
| `references/visual-qa.md` | 一覧画像を点検するとき |
| `references/codex-review.md` | codex にレビューさせる、または指摘を仕分けるとき |
| `references/evaluations.md` | このスキルを直したときや、起動条件・出力の品質を確かめるとき |
| `assets/template/` | ステップ5で複製する。中身を読む必要はない |
| `assets/eval/` | `references/evaluations.md` の評価を実行するときの入力 |
