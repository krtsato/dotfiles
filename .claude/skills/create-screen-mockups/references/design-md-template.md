# DESIGN.md の書式

DESIGN.md を新しく書くときに読む。`<...>` を埋め、案件に関係しない節は消す。
色はパレット生成の YAML 出力で `colors:` ブロック全体を置き換える。

````markdown
---
version: beta
name: <Product Name>
description: <誰の何のためのアプリか 1 文>。A2UI の部品カタログと Material 3 に従う
framework:
  components: A2UI v0.9.1 basic catalog
  visual: Material 3
  seed: "<#RRGGBB>"
colors:
  <パレット生成の YAML を貼る>
typography:
  font-family: <Font>, Hiragino Sans, Noto Sans JP, sans-serif
  weights: [400, 500, 700]
  features: palt
rounded: { extra-small: 4px, small: 8px, medium: 12px, large: 16px, extra-large: 28px, full: 9999px }
spacing: { base: 4px, margin: 16px, gutter: 8px }
---

# DESIGN.md

| 層 | 従う枠組み | 決めること |
| --- | --- | --- |
| 部品 | A2UI v0.9.1 の基本カタログ | 画面に置いてよい部品の種類と属性 |
| 見た目 | Material 3 | 色の役割、文字の階層、角丸、余白、画面の枠 |

## 正本

| 優先 | 情報源 | 扱い |
| --- | --- | --- |
| 1 | <要件書> | 機能、対象範囲、確認事項 |
| 2 | DESIGN.md | UI/UX の規則とトークン |
| 3 | <screens-dir> | 画面例。擦り合わせ用のたたき台 |

## Overview

| 属性 | 方針 |
| --- | --- |
| アプリの利用者 | <誰が> |
| 利用環境 | <どこで、どんな姿勢・条件で> |
| ムード | <3〜4 語> |
| 基準画面 | スマートフォン縦向き 390×844 |

対応端末と向き（タブレット、横向き）は要件定義で確定する。確定するまで縦向きだけを作る。

## UX 原則

1. **<最初に見せるもの>を最初に見せる。**
2. **その場の操作は、その場に置く。**
3. **状態は文字で伝える。** 色とアイコンは補助。
4. **要件にない情報を増やさない。** 独自の状態、集計値、割合を足さない。
5. **権限で見えない情報は、場所ごと出さない。**

## AI っぽく見せないための規則

| しない | 代わりにする |
| --- | --- |
| すべての情報を枠線付きカードに入れる | Material 3 のリスト項目と区切り線。カードは独立した塊だけ |
| ラベルを何でも丸いバッジにする | 状態は小さなアイコンと文字だけ |
| 見出しごとにアイコン | アイコンは操作と種類の識別だけ |
| 強調色を何色も使う | 強調は Primary 1 色。状態は役割色で区別 |
| グラデーション、光彩、絵文字、装飾図形 | 使わない |
| 全幅の大きなボタンを下に並べる | FAB、フルスクリーンダイアログの右上、シートの下端、下部バーの右端 |
| 説明文を画面に書き足す | 項目名と値で伝える |
| 検索結果の一致部分を太字にする | 何に一致したかはセクション見出しで示す |

## Colors

由来: <企業サイト URL> の CSS で最多の有彩色 `<#RRGGBB>`（ロゴの塗りと一致）を種にし、
`@material/material-color-utilities` 0.4.0（Tonal Spot）で生成した。Caution は `#E8A33D` を種に調和させた。

| トークン | 用途 |
| --- | --- |
| Primary | 主要操作、FAB の文字、選択中のタブ |
| Primary Container | FAB の面 |
| Secondary Container | ナビゲーションバーの選択中、選択中のチップ・区切りボタン |
| Tertiary | 進行中など中間の状態 |
| Error / Error Container | 入力エラー、登録失敗、取り消しにくい操作 |
| Caution / Caution Container | 通知・遅延 |
| Surface / Surface Container 各段 | 背景と重なり（影の代わり） |
| On Surface / On Surface Variant | 本文 / 項目名・補足 |
| Outline / Outline Variant | 入力欄の枠・意味のある図形 / 区切り線だけ |

状態の表示: <状態名> → <アイコン>・<役割色>。状態名は必ず文字で出す。

## Typography

本文から見出し・数字まで <Font> の 1 書体。強弱はサイズ・太さ・色で付ける。見出し 700、本文 400。500 は見出しに使わない。サイズと行の高さは Material 3 の文字の階層を、日本語の字面に合わせて 1〜2px 調整した値。

| A2UI | 役割 | サイズ / 行の高さ | 太さ | 用途 |
| --- | --- | --- | --- | --- |
| — | Display | 32 / 40 | 700 | タブ最上位の見出し |
| — | Figure | 20〜40（一覧の金額 20、詳細の主役 40） | 700 | 金額・指標。通貨記号と単位は 55%・500（数字を主役にし、記号を 1 段下げて見せる比） |
| `h1` | Headline | 24 / 32 | 700 | 詳細の主題 |
| `h2` | Title | 20 / 28 | 700 | アプリバー、シート・ダイアログ |
| `h3` | Item | 17 / 24 | 700 | リスト項目の見出し |
| `h4` | Section | 13 / 18 | 700 | セクション見出し、項目名（On Surface Variant） |
| `h5` | Label | 12 / 16 | 700 | 状態の表示、チップ |
| `body` | Body | 16 / 26、14 / 22 | 400 | 値、本文 |
| `caption` | Caption | 13 / 20、12 / 18 | 400 | 住所、日付、補足 |

## Shape と Layout

角丸・余白・高さは Material 3 の既定値をそのまま使う。角丸 4 / 8 / 12 / 16 / 28 / 全丸。影は FAB とメニューだけ。左右余白 16、アプリバー 64、ナビゲーションバー 80、
リスト項目 56 / 72 / 88。タップ領域は見た目に関わらず 48×48 以上（Material 3 と Android の最小タップ領域）。

## Components

### A2UI の基本カタログ

| 部品 | 本アプリでの規則 |
| --- | --- |
| `Text` | `variant` は文字の階層の表に従う |
| `Icon` | 原本では Material Symbols Rounded の名前（`arrow_back`）で描く。実装では A2UI の公式名（`arrowBack`）に対応づけ、公式の列挙に無いものは追加カタログに載せる。塗りは選択中だけ |
| `List` | Material 3 のリスト項目。区切り線は左余白から |
| `Card` | 枠線なし、Surface Container Lowest の面 |
| `Tabs` | Primary タブ |
| `Button` | `primary` 塗り / `default` トーン / `borderless` 文字。ほかの値を作らない |
| `TextField` | 枠線付き、ラベルは枠の上 |
| `ChoicePicker` | `multipleSelection` → フィルタチップ、`mutuallyExclusive`+`chips` → 区切りボタン、`mutuallyExclusive`+`checkbox` → ラジオの一覧 |

### 追加カタログ

| 部品 | 中身 | 理由 |
| --- | --- | --- |
| `StatusLabel` | 状態のアイコンと文字 | 全画面で表現を揃える |
| `NoticeBanner` | 理由と件数、遷移の文字ボタン | 判定ルールが未確定でも文言を差し替えやすい |
| <必要な分だけ> | | |

## Interaction States

| 状態 | 表示 |
| --- | --- |
| 処理中 | 上端の線の進捗と、項目ごとの進捗 |
| エラー | 項目ごとに成功・失敗を示し、失敗だけを再試行 |
| 破棄の確認 | 未確定の内容がある画面を閉じるときだけ、失うものを示す |
| 空 | 何がないかと次の操作 |

## Accessibility

- 文字 4.5:1、意味のある図形 3:1 以上。計算で確認する。
- 文字サイズ 200% でも主要操作・金額が欠けない（WCAG の文字拡大の基準）。2 列は 1 列に組み替える。
- チップの列は横スクロール、キーボード表示時は入力中の欄を隠さない。
````
