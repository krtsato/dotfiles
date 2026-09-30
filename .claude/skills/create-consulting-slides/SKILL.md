---
name: create-consulting-slides
description: >-
  Create or revise evidence-based management-consulting slide decks for Google Slides and
  `.pptx`, from source synthesis through storyboard, native authoring, and full-deck visual QA.
  Use for requests such as "turn research into an executive deck", "restructure a deck whose
  narrative jumps", or "make slides concrete with 5W1H". Do NOT use for a single standalone
  image, raw document summarization without slides, or cosmetic-only edits where narrative and
  evidence are explicitly out of scope.
compatibility: >-
  Requires a presentation-authoring capability for the requested Google Slides or `.pptx`
  format. Full validation requires PDF export, a page renderer such as Poppler, and image
  inspection. Markdown storyboard linting uses Node.js with `markdownlint-cli2`. Web access is
  required only when the user requests current or external evidence.
allowed-tools:
  - Read
  - Glob
  - Grep
  - Write
  - Edit
  - Agent
  - AskUserQuestion
  - WebSearch
  - WebFetch
  - Skill
  - Bash(npx markdownlint-cli2 *)
  - Bash(pdftoppm *)
---

# create-consulting-slides

## Important

CRITICAL: Do not start visual authoring until the decision objective, evidence map, and
storyboard are coherent.

CRITICAL: Preserve the user's facts and approved structure. Label estimates, assumptions, and
unknowns; never turn them into sourced facts.

CRITICAL: Do not report completion until every slide has been exported, rendered, and visually
inspected. A successful API call or file save is not visual proof.

CRITICAL: Use native editable text, shapes, tables, and charts for business content. Use raster
images only when the source itself is photographic or illustrative.

## 目次

- [目的](#目的)
- [想定ユースケース](#想定ユースケース)
- [前提条件](#前提条件)
- [手順](#手順)
- [実行チェックリスト](#実行チェックリスト)
- [完了基準](#完了基準)
- [成功基準](#成功基準)
- [使用例](#使用例)
- [Troubleshooting](#troubleshooting)

## 目的

調査・分析・計画を、初見の意思決定者が順を追って理解し、次の行動を選べる資料へ
変換する。情報量を単に減らすのではなく、**結論、根拠、判断、行動**の関係を可視化
する。確認には、実行環境が提供する場合は`AskUserQuestion`を使い、通常の説明だけを
ユーザー確認として残さない。

このスキルは物語と品質管理を担当する。実装前に、次の優先順でauthoring routeを
解決し、選んだskillの制約と検証手順にも従う。

| 対象 | authoring route |
| --- | --- |
| 既存のnative Google Slidesを編集・踏襲 | `$google-drive:google-slides`、続いて`$presentations:Presentations` |
| 新規Google Slidesを作成 | `$presentations:Presentations` |
| `.pptx`を作成・編集 | `$pptx`。無ければ`$presentations:Presentations` |

実行環境に該当skillまたは同等のnative authoring capabilityが無い場合は、視覚設計や
ファイル変更へ進まない。「必要なauthoring capabilityが未導入」とunsupportedを明示し、
利用できる形式だけを勝手に代替しない。

## 想定ユースケース

| Trigger | Steps | Result |
| --- | --- | --- |
| 調査資料を経営会議向けにまとめたい | 論点、証拠、未確認事項を整理し、意思決定の物語とスライドへ変換する | 根拠から推奨案まで追跡できる経営資料 |
| 既存デッキの話が飛び、初見では理解できない | 調査理由、アジェンダ、中扉、遷移、5W1Hを補い、並びを再設計する | 各章の問いと結論が連続する改訂版 |
| 抽象的な説明を実行計画へ落としたい | 主語、術語、数値、担当、期限、判定条件を追加する | 誰がいつ何を決めるか明確な実行デッキ |

## 前提条件

- 読み手、利用場面、資料で決めたいことが特定できること
- ユーザー提供資料または利用可能な根拠へアクセスできること
- 対象形式のauthoring skillと編集権限が利用できること
- Google Slidesでは対象URL、`.pptx`では出力パスが明確であること
- 外部情報を追加する場合は、引用可能な一次情報または信頼できる公開情報を使うこと

## 手順

### 1. 意思決定の入口を固定する

次の五点を一文ずつ定義する。不明点が最終構成を変える場合だけ、着手前に一度確認
する。

1. **Audience**：誰が読むか
2. **Occasion**：いつ、どこで使うか
3. **Decision**：読み終えた人が何を決めるか
4. **Evidence**：判断に使える資料と調査基準日
5. **Constraints**：枚数、ブランド、期限、公開範囲、編集可能性

### 2. 証拠マップを作る

主張ごとに「根拠」「定義」「留保」「出典」を対応させる。売上と利益、事実と仮定、
相関と因果など、混同しやすい術語を先に定義する。大量の資料や独立した論点がある
場合は、読み取り専用のサブエージェントへ論点別に委譲し、結論・根拠・未確定事項
だけを返させる。

具体化の規則と証拠表現は
[references/narrative-and-content.md](references/narrative-and-content.md)を読む。

### 3. 物語の背骨を設計する

ユーザーが承認済みの構成を優先する。新規構成では、次を既定の順序として必要な章
だけ残す。

1. **Why**：なぜこの調査・提案が必要か
2. **How**：何を、どの範囲・方法・基準で調べたか
3. **What**：何が分かったか
4. **So what**：その事実が何を意味するか
5. **Which**：何を選び、何を選ばないか
6. **Execution**：誰が、いつ、何をするか
7. **Decision**：継続・修正・停止を何で判定するか

表紙の後にアジェンダを置く。長い資料は各章の前に中扉を置き、章が答える問いと
結論を一文ずつ示す。隣接スライド間には「前ページの結論が、次ページの問いを生む」
接続を作る。

### 4. ストーリーボードを先に完成させる

各スライドへ次を定義する。

- **Title**：名詞ではなく、そのページの結論
- **Lead**：結論の理由または読み方
- **Body**：表、図、数値、具体例、手順のいずれか
- **Source**：出典、基準日、仮定ラベル
- **Transition**：次ページで答える問い

一枚一メッセージとする。情報が入らない場合は文字を縮小せず、ページを分ける。

### 5. 視覚システムを定義する

最初にグレースケールで情報階層を作り、最後に意味のある強調色だけを加える。採用、
行動、リスクなど、同じ意味には同じ色を使う。余白、整列、文字サイズ、表の列幅を
全ページで統一する。

レイアウトの選択と視覚ルールは
[references/visual-system.md](references/visual-system.md)を読む。

### 6. 編集可能な形式で実装する

「目的」で確定したauthoring routeを使い、テキスト、図形、表、チャートをネイティブ
要素で作る。既存デッキではテーマ、マスター、ページサイズ、フォント、余白、ページ
番号を読み取ってから編集する。全体の並びを変更した場合は、ページ番号とアジェンダも
同時に更新する。routeを解決できていない状態では実装へ進まない。

### 7. 構造と見た目を二段階で検証する

1. **構造検証**：スライド数、順序、見出し、出典、ページ番号、空白ページ、欠落要素、
   オーバーフローを機械的に確認する。
2. **視覚検証**：PDFへ書き出し、全ページを画像化し、連続したcontact sheetと高密度
   ページの原寸画像を確認する。

PDFをPNGへ展開する標準例。`120` DPIは、全体確認の速度と小さな文字の判読性を
両立する検査用の既定値であり、判読できない場合は高解像度で対象ページを再確認する。

```bash
pdftoppm -png -r 120 deck.pdf slide
```

次を一件ずつ記録して修正する: 文字切れ、重なり、過密、過剰な余白、色の意味ずれ、
低コントラスト、表の比較軸不一致、章間の唐突な遷移。修正後は差分ページだけでなく
全ページを再出力する。同じ表層修正を反復しないため、二回の修正で解消しない場合は、
原因と未解決ページを明示して構造変更へ戻る。**Solve, don't punt**を原則とし、黙って
縮小、スキップ、無視をしない。

### 8. 成果物を引き渡す

最終リンクまたはファイル、ページ数、変更要旨、検証結果、残る仮定を報告する。
ストーリーボードをMarkdownで保存した場合は次を実行する。

```bash
npx markdownlint-cli2 --config .markdownlint.yaml storyboard.md
```

## 実行チェックリスト

- [ ] 読み手、利用場面、意思決定、根拠、制約を定義した
- [ ] 主張ごとに根拠、定義、留保、出典を対応させた
- [ ] アジェンダと章の中扉が、全体の現在地を示している
- [ ] 各ページのTitle、Lead、Body、Source、Transitionを定義した
- [ ] 抽象的な主張を5W1H、数値、具体例、判定条件へ落とした
- [ ] 表とチャートの比較軸、単位、期間、母数を明示した
- [ ] ページ番号とアジェンダを最終順序へ同期した
- [ ] 全ページをPDFと画像へ出力した
- [ ] contact sheetと高密度ページを目視確認した
- [ ] 修正後に全ページを再出力し、重大な表示問題が0件になった

## 完了基準

- 全ページが対象形式で開き、編集可能である
- 構造検証で空白ページ、欠落、ページ番号不整合、オーバーフローが0件である
- 100%のページを画像で目視確認し、文字切れと重なりが0件である
- 主要な主張から出典または明示された仮定へ追跡できる
- 最終ページに次の意思決定、担当、期限、判定条件がある

## 成功基準

| 種別 | 基準 |
| --- | --- |
| 定量 | 全ページ検査率100%、重大な構造・表示問題0件、ページ番号不整合0件 |
| 定量 | 根拠が必要な主要主張の出典または仮定ラベル付与率100% |
| 定性 | 初見の読み手が「なぜ、何が分かり、何を選び、次に何をするか」を順番に説明できる |
| 定性 | 色や装飾を外しても、タイトルと配置だけで情報の優先順位が伝わる |

## 使用例

| 入力 | 期待出力 |
| --- | --- |
| 「この市場調査を役員向け15枚にして」 | 調査理由、方法、結果、示唆、選択肢、推奨、次の決定を含む15枚と全ページ検証結果 |
| 「既存Google Slidesは話が飛ぶ。見出しと5W1Hを追加して」 | アジェンダと中扉を追加し、抽象ページを具体化した編集可能な改訂版 |
| 「この計画書から投資判断用`.pptx`を作って」 | 仮定と事実を分け、費用・効果・リスク・ゲートを比較できる`.pptx` |

評価シナリオと非トリガー例は
[references/evaluations.md](references/evaluations.md)を読む。

## Troubleshooting

| Error | Cause | Solution |
| --- | --- | --- |
| ページは整っているが話が飛ぶ | 章の問い、前ページからの遷移、調査理由がない | 視覚修正を止め、物語の背骨とストーリーボードへ戻る |
| 文字が小さく長文になる | 一枚に複数メッセージまたは詳細を詰めている | 主張単位で分割し、詳細は付録へ移す。文字縮小で回避しない |
| 数字は多いが判断できない | 指標定義、比較軸、期間、母数、費用控除がない | 用語を定義し、同じ比較軸へ揃え、留保をページ内へ明記する |
| 編集APIは成功したが表示が崩れる | 構造応答だけを完成判定に使っている | PDF書き出し、全ページ画像化、目視確認を実施する |
| 二回修正しても過密が残る | レイアウトではなく物語またはページ分割の問題 | 未解決ページを報告し、スライド数と章構成を再設計する |
