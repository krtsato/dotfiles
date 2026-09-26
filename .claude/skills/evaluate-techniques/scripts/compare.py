#!/usr/bin/env python3
"""2 つの study 結果を突き合わせ、差分を表で出す。

読めない項目・揃っていない対象・効いていない関門は **エラーで落とす**。
「差が無い」と「測れていない」を同じ顔で出さないため。

終了コード: 0 = 比較できた / 1 = 比較が成立しない（結果を読まない）
"""
import json
import sys

# 技法ごと・水準ごとの結果で必ず読める項目。1 件でも欠ければ比較を中止する。
REQUIRED = ("verdict", "total_trades", "p_value", "q_value", "mean_effect")
VERDICTS = (
    "outperformed_matched_null",
    "not_significant",
    "insufficient_power",
    "not_evaluable",
)


def die(msg):
    print(f"エラー: {msg}", file=sys.stderr)
    sys.exit(1)


def load(path, kind):
    """kind='technique' なら技法別、'confluence' なら合意水準別の結果を返す。"""
    try:
        doc = json.load(open(path))
    except OSError as e:
        die(f"{path} を開けません: {e}")
    if kind == "confluence":
        conf = doc.get("confluence")
        if not conf:
            die(f"{path}: 合意の結果がありません（-confluence-state を付けずに走らせた？）")
        rows = {f"k={lv['level']}": lv for lv in conf["levels"]}
        return rows, {"effect_monotonic": conf.get("effect_monotonic")}
    rows = {t["technique"]: t for t in doc.get("techniques", [])}
    if not rows:
        die(f"{path}: 技法別の結果がありません")
    return rows, {}


def check_fields(rows, path):
    for name, row in rows.items():
        missing = [f for f in REQUIRED if f not in row]
        if missing:
            die(
                f"{path}: {name} に項目 {missing} がありません。"
                f"読める項目は {sorted(row)}。"
                " 存在しない項目を比べると全件一致に見えるため、比較を中止します。"
            )


def check_same_population(before, after):
    """片側にしかない対象があれば落とす。比較は同じ母集団どうしでしか意味がない。"""
    only_b, only_a = sorted(set(before) - set(after)), sorted(set(after) - set(before))
    if only_b or only_a:
        die(
            f"比べる対象が揃っていません。前だけ: {only_b or 'なし'} / 後だけ: {only_a or 'なし'}。"
            " 同じ universe・同じノート・同じ水準で走らせ直してください。"
        )


def check_levels_bite(rows, label):
    """水準を上げたら試行数が減ることを確かめる。減らない関門は絞っていない。"""
    ks = sorted(rows, key=lambda x: int(x[2:]))
    counts = [rows[k]["total_trades"] for k in ks]
    flat = [
        f"{ks[i]}({counts[i]}) = {ks[i + 1]}({counts[i + 1]})"
        for i in range(len(counts) - 1)
        if counts[i] == counts[i + 1]
    ]
    if flat:
        die(
            f"{label}: 水準を上げても試行数が減っていません — {', '.join(flat)}。"
            " 関門が絞っていないので、この結果は読めません。-levels を上げて測り直してください。"
        )


def fmt(v):
    if v is None:
        return "—"
    return f"{v:.4f}" if isinstance(v, float) else str(v)


def counts_by_verdict(rows):
    c = {v: 0 for v in VERDICTS}
    for r in rows.values():
        c[r["verdict"]] = c.get(r["verdict"], 0) + 1
    return c


def main():
    if len(sys.argv) != 4 or sys.argv[3] not in ("technique", "confluence"):
        die("usage: compare.py <前の結果.json> <後の結果.json> technique|confluence")
    before_path, after_path, kind = sys.argv[1:4]
    before, bmeta = load(before_path, kind)
    after, ameta = load(after_path, kind)
    check_fields(before, before_path)
    check_fields(after, after_path)
    check_same_population(before, after)
    if kind == "confluence":
        check_levels_bite(before, "前の結果")
        check_levels_bite(after, "後の結果")

    keys = sorted(before, key=lambda x: int(x[2:])) if kind == "confluence" else sorted(before)
    print(f"比べた対象: {len(keys)} 件")
    for k, v in bmeta.items():
        print(f"  {k}: 前 {v} → 後 {ameta.get(k)}")

    print("\n■ 判定の内訳")
    cb, ca = counts_by_verdict(before), counts_by_verdict(after)
    for v in VERDICTS:
        mark = "  ←変化" if cb[v] != ca[v] else ""
        print(f"   {v:28} 前 {cb[v]:3} → 後 {ca[v]:3}{mark}")

    print(f"\n■ 変化した対象\n{'対象':44}{'試行数':>16}{'p 値':>20}{'q 値':>20}  判定")
    changed = 0
    for k in keys:
        b, a = before[k], after[k]
        if b["verdict"] == a["verdict"] and b["total_trades"] == a["total_trades"]:
            continue
        changed += 1
        name = k[11:] if k.startswith("_technique-") else k
        print(
            f"{name:44}"
            f"{str(b['total_trades']) + '→' + str(a['total_trades']):>16}"
            f"{fmt(b['p_value']) + '→' + fmt(a['p_value']):>20}"
            f"{fmt(b['q_value']) + '→' + fmt(a['q_value']):>20}  "
            f"{b['verdict']} → {a['verdict']}"
        )
    if not changed:
        print("   （試行数も判定も、1 件も変わっていない）")

    nt = sum(1 for k in keys if before[k]["total_trades"] != after[k]["total_trades"])
    nv = sum(1 for k in keys if before[k]["verdict"] != after[k]["verdict"])
    print(f"\n試行数が変わった: {nt} 件 / 判定が変わった: {nv} 件")


if __name__ == "__main__":
    main()
