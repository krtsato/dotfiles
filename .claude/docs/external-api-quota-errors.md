# 外部 API の上限超過エラー — 原因の持ち主を決める前に確かめること

**エラーの文言だけで「こちらが上限を超えた」と書かない。** 呼び出した側の利用記録と突き合わせてから書く。

Google の API は、利用枠の超過にも、提供側の一時的な混雑にも、同じ `RESOURCE_EXHAUSTED`
（HTTP 429・`Resource has been exhausted (e.g. check quota).`）を返すことがある。
文言の「check quota」は「枠を確認せよ」という定型句で、こちらの枠を使い切った証拠ではない。

## 読み違えた実例

ある本番障害で、画像の安全確認に使う Google Cloud Vision がこのエラーを約 180 件返した。
報告文の原因の書き方は、確かめるたびに次のように変わった。

| 段階 | 書いた原因 | 何が足りなかったか |
| --- | --- | --- |
| 1 | 自社サーバーの障害 | 外部 API の失敗を、自社の故障と書いた |
| 2 | 自社の利用上限の超過 | 文言だけで判断した |
| 3 | 自社からのアクセス集中 | 呼び出し回数を見ていなかった |
| 4 | **提供側の一時的な混雑の可能性が高い** | 利用記録で、呼び出しは平常以下・上限超過の記録なしと確かめた。除外できたのは自社起因の 2 つの仮説だけで、提供側の原因は未確定 |

1〜3 はどれも、**原因側の記録を見ずに文言から推測した**結果だった。
利用者向けの文に誤った原因が載ると、「普段から上限で失敗するサービス」と受け取られる。

## 確かめる順番

| 順 | 確かめること | 見るもの | 判断 |
| --- | --- | --- | --- |
| 1 | 呼び出しが増えたか | 呼び出し回数の時系列。平常の同じ時間帯と比べる | 増えていなければ「アクセス集中」とは書けない |
| 2 | 枠を使い切ったか | 提供側の上限超過の記録 | 0 件なら「こちらの上限超過」とは書けない |
| 3 | 呼び出し元は誰か | 認証情報ごとの内訳 | 想定外の呼び出し元が枠を食っていないか |
| 4 | 失敗の散らばり方 | 失敗を利用者ごとに数える | 少数への一点集中ならボットや不具合、広く散らばっていれば巻き込まれた側 |

1 と 2 で否定できるのは、**「自社からのアクセス集中」と「記録に残る自社の枠の超過」の 2 つだけ**。
提供側の混雑、記録に残らない別の制限、記録の取り違えは、これだけでは除外できない。
したがって「こちらの原因ではない」とは書かず、**除外できた仮説を名指しして書く**。
片方だけでは、呼び出しが少なくても枠が小さかった可能性や、数え方が違う可能性も残る。

## Google Cloud での引き方

Cloud Monitoring の API を、ログイン済みの gcloud のトークンで直接叩く。読み取りのみ。

```sh
curl -s -G -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://monitoring.googleapis.com/v3/projects/<PROJECT>/timeSeries" \
  --data-urlencode 'filter=metric.type="serviceruntime.googleapis.com/api/request_count" AND resource.type="consumed_api" AND resource.labels.service="<SERVICE>.googleapis.com"' \
  --data-urlencode 'interval.startTime=<UTC>' --data-urlencode 'interval.endTime=<UTC>' \
  --data-urlencode 'aggregation.alignmentPeriod=3600s' \
  --data-urlencode 'aggregation.perSeriesAligner=ALIGN_SUM' \
  --data-urlencode 'aggregation.crossSeriesReducer=REDUCE_SUM' \
  --data-urlencode 'aggregation.groupByFields=resource.labels.credential_id' \
  --data-urlencode 'aggregation.groupByFields=metric.labels.response_code'
```

| 指標 | 分かること |
| --- | --- |
| `serviceruntime.googleapis.com/api/request_count` | 呼び出し回数。`response_code` で 200 と 429 を分ける。`credential_id` で呼び出し元を分ける |
| `serviceruntime.googleapis.com/quota/exceeded` | 枠を超えた記録 |

**空の応答は 0 件の証拠ではない。** 期間・フィルター・権限・プロジェクトのどれかが誤っていても空になる。
同じプロジェクト・同じ期間・同じサービスの `request_count` が値を返すことを先に確かめ、
取得条件が正しいと分かってから「記録なし」と扱う。

`credential_id` は `serviceaccount:<uniqueId>` の形で返る。
`gcloud iam service-accounts list --format='value(email,uniqueId)'` で名前に引き直す。

**断られた呼び出しの記録のされ方は、サービスや断られ方によって違う。**
429 として残るもの、別の応答コードや gRPC の状態で残るもの、記録されないものがある。
自社のログの失敗と `request_count` が合わないときは、まず対象サービスでの記録の形を確かめる。
確かめられなければ、原因は「不明」として扱い、提供側の原因とも断定しない。

## 書き方

原因が提供側で、かつ確定できないときは、利用者向けには次の形にする。

> 外部サービス側で一時的に処理が混み合い、受け付けられない状態になっていた

自社の故障とも、提供側の障害とも断定しない。
社内向けの文書には、根拠の数字（呼び出し回数・上限超過の件数）を添える。
