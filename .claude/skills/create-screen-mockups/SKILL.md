---
name: create-screen-mockups
description: 要件定義書・要件概要書から、モバイルアプリの画面例（モックアップ）を、編集できる HTML/CSS/JS の原本と PNG の一式で作る。A2UI の部品カタログと Material 3 に沿い、企業サイトから決めたブランド色で色一式を生成し、DESIGN.md、要求資料（提案書）にない要件・UI を足していないかの範囲の点検、画面一覧と未決の点の README、codex によるレビューの反映までを扱う。「要件から画面デザインのモックアップ画像を作って」「screens が AI くさいので作り直して」「画面例を codex にレビューさせて直して」「DESIGN.md を作って」の時に使う。Do NOT use for アプリ本体（Flutter など）の実装・修正、要件定義書そのものの作成、スライド作成、ロゴなど単発の画像生成、Figma の編集。
compatibility: macOS、Google Chrome（headless で PNG を書き出す）、coreutils の timeout、curl、python3、node と npm（色一式の生成、照合、markdownlint-cli2）。Google Fonts と npm registry へのネットワーク接続。codex CLI（ログイン済み）はレビュー工程だけで使い、無ければ自己点検に切り替える。
---

# 画面例の作成

要件定義書・要件概要書（以下、要件書）を関係者と擦り合わせるための画面例を、誰が作っても同じ品質になる手順で作る。以下、このスキルを使って画面例を頼む人を「依頼者」、完成するアプリを使う人を「アプリの利用者」、確認事項の回答がなく仮に描いたものを「未決の点」と呼ぶ。画面の中身を組む A2UI の要素を「部品」、全画面に共通するナビゲーションバー・アプリバー・CSS を「共通の枠」、4 画面ずつ並べた確認用の画像（`sheet-N.png`）を「一覧画像」、`src/app.js` の `SCREENS`（照合の出力では registry）を「登録表」、`assets/template/` の複製元を「ひな形」と呼ぶ。要件書の元になった提案書などを「要求資料」と呼ぶ。要件書の番号は「要件番号」（README の列名は「主な要件 No.」）、確認事項の番号は「確認事項の番号」（確認事項の表の列名は「確認番号」）と書く。見た目は独自に作らず、部品は A2UI v0.9.1 の基本カタログ、見た目は Material 3 に従う。原本は HTML/CSS/JS で残し、PNG はそこから書き出す。

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

- **要求資料と要件書が正。** 画面例はたたき台であり、要求資料にない機能・操作・表示項目・状態・数値を足さない。発信・地図・並び替え・期間の切り替えなど「便利そうな」要素も、根拠が無ければ置かない。要件の表示項目は欠かさない。
- **未決の点は画面で確定させない。** 仮に描いた形は README の「未決の点」に確認事項の番号付きで書く。「閉じても送信が続く」など未決の動きを文言で約束しない。
- **画面内に要件番号・内部の画面 ID を出さない。** 人名・住所・電話番号・金額は架空にする。
- **PNG は直接編集しない。** 原本を直して書き出す。共通の枠を変えたら全画面を書き出し直す。
- **書き出した画面は必ず目で見る。** 書き出しの成功は見た目の正しさを意味しない。

## ユースケース

| Use Case | Trigger | Steps | Result |
| --- | --- | --- | --- |
| 1. 要件書から一式を新規に作る | 要件書があり、画面例がまだない | 手順 1〜10 | DESIGN.md、原本、PNG、画面一覧と未決の点の README |
| 2. 既存の画面例を作り直す | 「AI くさい」「固い」「単調」などの指摘 | 規則と文字の階層に照らす → 色・書体・部品を直す → 全画面を書き出して点検 | 指摘ごとに何をどう直したかを示せる画面例 |
| 3. レビュー・範囲の指摘を反映する | 依頼者や codex からの指摘、過剰な UI の確認依頼 | 「直す・規則に書く・未決の点に書く・見送る」に仕分け → 直して書き出し → 照合 | 件数の内訳と見送った理由の表 |

## 成功基準

- **Quantitative**: `verify-screens.sh` が終了コード 0（登録表・PNG・README の件数が一致し、対象の要件番号がすべて画面に対応し、画面の文言に「要件 No」がない。数字だけの番号は点検表で目視する）。`capture.sh` が失敗 0 件。主要な文字色の組み合わせが `contrast.py` で全て PASS。markdownlint の警告 0。
- **Qualitative**: 追加の指示なしに、依頼者が「どの画面が、どの要件の、どの未決の点に関係するか」を README から読み取れる。同じ要件書から作り直しても、色・書体・部品の選び方が同じになる。

## 前提条件

| 必要なもの | 確認 | 無いとき |
| --- | --- | --- |
| Google Chrome | `ls "/Applications/Google Chrome.app"` | 別の Chromium 系を `CHROME=<path>` で指定 |
| timeout | `which timeout` | `brew install coreutils` |
| curl | `curl --version` | 書体とアイコンのフォントの取得で使う。OS の標準で入っている版でよい |
| node / npm | `node --version` | mise などで導入。色一式の生成・照合・markdownlint で使う |
| markdownlint-cli2 | `npx markdownlint-cli2 --help`（1 行目に版が出る） | npm があれば npx が取得する |
| python3 | `python3 --version` | 標準で入っている版でよい |
| codex CLI | `codex --version` と `codex login status` | レビュー工程を自己点検に切り替え、未実施と報告 |
| 要件書と確認事項 | 対象のパス | 無ければ作らずに依頼者へ確認 |

## Gotchas

特に外しやすい 4 件。全 14 件は `references/gotchas.md` にあり、この 4 件はその写し（直すときは両方を直す）。

| 落とし穴 | 起きること | 対処 |
| --- | --- | --- |
| ブランド色に白文字 | 企業のロゴ色は明るいことが多く、白文字で 4.5:1 に届かない（明度の高い水色・黄緑・橙などは 3:1 前後になりやすい） | ブランド色は種とロゴだけに使い、文字とボタンは生成された Primary |
| 一部だけ書き出す | 共通の枠の変更が他の PNG に反映されず、古い見た目が残る | 共通の枠を変えたら全画面を書き出す |
| codex の `-i` | `-i a -i b "依頼文"` と書くと依頼文まで画像パスとして読み、空振りする。終了コードは 0 | `-i a,b` を 1 回、依頼文は `- < file` |
| 便利機能の付け足し | 画面を「それらしく」するため、要求資料に無い発信・地図・並び替え・期間の切り替え・税の表示などを足してしまう | ステップ7で要素ごとに根拠を確かめ、無ければ消す |

## 手順

`<skill>` はこのスキルのディレクトリ、`<project-root>` は作業対象のリポジトリの直下、`<screens-dir>` は画面例の置き場所（既定は `<project-root>/docs/requirements/screens`）を指す。コマンドは `<project-root>` で実行する。

### ステップ1: 要件を画面に割り当てる

1. 要件書・確認事項・要求資料を読み、対象の要件番号の範囲（`<first-req>`〜`<last-req>`）を決める。
2. アプリの利用者の種類ごとに画面を洗い出し、各画面に主な要件番号を割り当てる。表示項目の表がある要件は、その項目を画面に全部置く。
3. 要件の作業（登録・送信・承認など）で処理中・失敗・破棄の確認が起こりうるなら、その画面を描く。要件に振る舞いの定めがなければ形を仮に描き、ステップ8で未決の点に書く（新しい機能は足さない）。
4. 未決の点に関係する画面を控えておく（ステップ8で README に書く）。

### ステップ2: ブランド色を決める

`references/color-and-type.md` を読み、製品を出す企業（発注者）のサイトから `brand-colors.py` で種の色（既定は、有彩色で最も多くロゴの塗りと一致する色）を決め、`m3-palette.sh` で色一式を生成し、`contrast.py` で読みやすさを確かめる。状態の色は新しく作らず、役割色に割り当てる。

### ステップ3: 書体を決める

既定は **IBM Plex Sans JP** の 1 書体。依頼者が書体に注文を付けたとき、またはアプリの雰囲気（くだけた一般向けなど）が落ち着いた既定の書体に合わないときだけ、同じ資料の手順と `font-specimen.sh` で書体見本を比べる。

### ステップ4: DESIGN.md を書く

`<project-root>/DESIGN.md` に作る。`references/design-md-template.md` を読んで埋める。色の由来（サイト URL・出現回数・ロゴとの一致・生成方法）、書体の選定理由、AI っぽく見せないための規則、追加カタログを必ず書く。対応端末と向きは要件定義で確定する旨を書き、確定するまで縦向きだけを作る。

### ステップ5: ひな形を複製して画面を組む

```sh
mkdir -p <screens-dir>
cp -R <skill>/assets/template/src <skill>/assets/template/README.md <screens-dir>/
```

1. `src/index.html` の `<title>` の `&lt;製品名&gt;` を製品名に書き換える。`src/app.js` の例の画面（`S.home` など）を消し、ステップ1の画面を 1 画面 1 関数で書く。
2. 画面の中身は部品の関数（`Text`・`List`・`ChoicePicker` など A2UI の部品名と同じ名前）だけで組む。`List` の項目を組む補助関数（`ListItem`・`KV`）はその内側でだけ使い、セクション見出しの `Subhead` は `List` の直前に置く。足りない部品は先に DESIGN.md の追加カタログに書いてから作る。
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

### ステップ7: 範囲を点検する

`references/scope-audit.md` を読み、全画面の要素を 1 つずつ要求資料・要件書に対応づける。対応しない要素は、便利そうでも消すか、未決の点に移す。消した数と内容を記録し、ステップ6の書き出しと点検に戻る。過剰が 0 になるまで繰り返す。

### ステップ8: README の初版を書く

README の画面一覧に全 PNG を主な要件番号付きで載せ（番号は要件書の書き方のまま。数字だけで 3 桁以内の番号なら照合のため `007` のように 3 桁にそろえ、それ以外の形はステップ10で `--ids` を使う。1 つの欄に複数書くときは「、」で区切る）、画面の流れと、未決の点（確認事項の番号付き）を書く。レビューはこの README を前提に読むので、ステップ9より前に済ませる。

### ステップ9: codex にレビューさせて反映する

`references/codex-review.md` を読み、全ての一覧画像と依頼文を渡す。指摘を 1 件ずつ根拠と照らして「直す・規則に書く・未決の点に書く・見送る」に振り、直したらステップ6の点検に戻る。codex が使えないときは、点検表での自己点検を 2 周目として行い、レビュー未実施と報告する。

### ステップ10: 照合する

```sh
# Numeric ids: pass the range from step 1, e.g. 1 6 (matched as 001-006).
<skill>/scripts/verify-screens.sh <screens-dir> <first-req> <last-req>
# Other formats (FR-01, 2.3.1): list the ids one per line, as the README writes them.
<skill>/scripts/verify-screens.sh <screens-dir> --ids <ids-file>
# Use the project's own markdownlint config if it has one; otherwise the bundled one (line length off).
npx markdownlint-cli2 --config <skill>/assets/.markdownlint.yaml <screens-dir>/README.md <project-root>/DESIGN.md
```

FAIL が出たら直してステップ6から流し直す。README の更新（画面の追加・未決の点の変化）もここで反映する。

## 完了チェック

- [ ] ブランド色の由来と、主要な色の組み合わせのコントラストを確認した
- [ ] DESIGN.md に、色の由来・書体の理由・AI っぽく見せないための規則・追加カタログがある
- [ ] `capture.sh` が失敗 0 件で全画面を書き出した
- [ ] 一覧画像で全画面を点検した（点検した画面数を報告できる）
- [ ] 共通の枠を変えた後に全画面を書き出し直した
- [ ] 全画面の要素を要求資料・要件書に対応づけ、過剰な要素が 0 になった
- [ ] README の初版を書いてから codex のレビューを仕分けて反映した（または未実施と記録した）
- [ ] `verify-screens.sh` が終了コード 0
- [ ] README に未決の点が確認事項の番号付きで書かれている
- [ ] markdownlint の警告が 0

## Troubleshooting

書き出し・フォント取得・照合・codex で止まったときは `references/troubleshooting.md` を読む（Error / Cause / Solution の形で 6 件）。

## 参照資料

| ファイル | 読むとき |
| --- | --- |
| `references/design-md-template.md` | DESIGN.md を新しく書く、または節を足すとき |
| `references/visual-qa.md` | 一覧画像を点検するとき |
| `references/color-and-type.md` | ステップ2・3 |
| `references/gotchas.md` | 想定と違う結果になったとき、初めて使うとき |
| `references/troubleshooting.md` | 書き出し・フォント取得・照合・codex でエラーが出たとき |
| `references/scope-audit.md` | ステップ7、または依頼者に過剰な要件や UI がないかを聞かれたとき |
| `references/codex-review.md` | codex にレビューさせる、または指摘を仕分けるとき |
| `references/evaluations.md` | このスキルを直したときや、起動条件・出力の品質を確かめるとき |
| `assets/template/` | ステップ5で複製する。中身を読む必要はない |
| `evals/fixtures/` | スキル自体の試験専用の架空の入力（要求資料・要件書・確認事項）。`references/evaluations.md` の評価でだけ使い、案件では使わない |
