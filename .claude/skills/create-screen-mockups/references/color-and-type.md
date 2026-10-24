# 色と書体の決め方

手順のステップ2・3で読む。`<skill>` はこのスキルのディレクトリを指す。

## ブランド色と色一式

```sh
python3 -I <skill>/scripts/brand-colors.py https://<client-site>/
```

既定は「有彩色で最も多く、ロゴの塗りと一致する色」。一致しない、サイトがない場合は、ロゴ画像の色か依頼者の指定を使う。決めた色を `<brand-hex>` とする。

```sh
<skill>/scripts/m3-palette.sh "<brand-hex>"
python3 -I <skill>/scripts/contrast.py "<on-primary>:<primary>" "<on-surface>:<surface>" "<on-surface-variant>:<surface>"
```

`<primary>` などは、直前の `m3-palette.sh` の出力にある同名の値（`--primary` など）を入れる。

出力の貼り方:

- CSS: 出力を控えておき、ひな形を複製した後の `src/styles.css` の `:root` のうち、色の宣言（`--primary` から `--brand` まで）だけを置き換える。角丸・書体・影の宣言は残す。
- YAML: DESIGN.md のフロントマターの `colors:` ブロック全体を出力で置き換える。

状態の色は新しく作らず、役割色（On Surface Variant・Tertiary・Primary など）に割り当てる。

## 書体

既定は **IBM Plex Sans JP** の 1 書体（人間的な形で業務用に落ち着く。英数字が同じ一族でそろう）。依頼者が書体に注文を付けたときだけ書体見本で比べる。

```sh
SAMPLE_HEAD="<実際の項目名>" SAMPLE_BODY="<実際の場所名>" \
  <skill>/scripts/font-specimen.sh /tmp/specimen.png "IBM Plex Sans JP" "Noto Sans JP" "BIZ UDPGothic" "M PLUS 2"
```

書体を変えたら、ひな形を複製した後の `src/font.conf` の `FONT`・`FONT_WEIGHTS` と、`src/styles.css` の `--font-plain` を揃える。
