#!/usr/bin/env python3
"""2 つの study 結果を突き合わせ、差分を表で出す。

比較が成立していることを先に確かめる。ある項目を全件で読めなければ、
「差が無い」ではなく **エラーで落ちる**。存在しない項目名を比べて
「全部同じ」と読むのが、この仕組みで最も起きやすい誤りだから。
"""
import json
import sys

# 技法ごとの結果で必ず読める項目。1 件でも欠ければ比較を中止する。
REQUIRED = ("verdict", "total_trades", "p_value", "q_value", "mean_effect")


def load(path, kind):
    """kind='technique' なら技法別、'confluence' なら合意レベル別の結果を返す。"""
    doc = json.load(open(path))
    if kind == "confluence":
        conf = doc.get("confluence")
        if not conf:
            sys.exit(f"{path}: 合意の結果がありません（-confluence-state を付けずに走らせた？）")
        rows = {f"k={lv['level']}": lv for lv in conf["levels"]}
        return rows, {"effect_monotonic": conf.get("effect_monotonic")}
    rows = {t["technique"]: t for t in doc.get("techniques", [])}
    if not rows:
        sys.exit(f"{path}: 技法別の結果がありません")
    return rows, {}


def check_fields(rows, path):
    """必要な項目が全件で読めることを確かめる。読めなければ落とす。"""
    for name, row in rows.items():
        missing = [f for f in REQUIRED if f not in row]
        if missing:
            sys.exit(
                f"{path}: {name} に項目 {missing} がありません。"
                f"読める項目は {sorted(row)}。"
                "\n比較を中止します（存在しない項目を比べると全件一致に見えるため）。"
            )


def fmt(v):
    if v is None:
        return "—"
    return f"{v:.4f}" if isinstance(v, float) else str(v)


def main():
    if len(sys.argv) != 4 or sys.argv[3] not in ("technique", "confluence"):
        sys.exit("usage: compare.py <前の結果.json> <後の結果.json> technique|confluence")
    before_path, after_path, kind = sys.argv[1:4]
    before, bmeta = load(before_path, kind)
    after, ameta = load(after_path, kind)
    check_fields(before, before_path)
    check_fields(after, after_path)

    keys = sorted(set(before) | set(after))
    print(f"比べた対象: {len(keys)} 件（前 {len(before)} / 後 {len(after)}）")
    for k, v in bmeta.items():
        print(f"  {k}: 前 {v} → 後 {ameta.get(k)}")

    # 合意レベルは、水準を上げると試行数が減らなければ関門が効いていない。
    if kind == "confluence":
        counts = [after[k]["total_trades"] for k in sorted(after, key=lambda x: int(x[2:]))]
        if len(set(counts)) == 1:
            print(
                f"\n⚠ 全水準で試行数が同じ（{counts[0]} 件）＝関門が何も絞っていない。"
                "\n  -levels をもっと高くして測り直すこと。この結果は読まない。"
            )

    changed = []
    print(f"\n{'対象':44}{'試行数':>16}{'p 値':>20}{'q 値':>20}  判定")
    for k in keys:
        b, a = before.get(k, {}), after.get(k, {})
        row = (
            f"{k[11:] if k.startswith('_technique-') else k:44}"
            f"{str(b.get('total_trades')) + '→' + str(a.get('total_trades')):>16}"
            f"{fmt(b.get('p_value')) + '→' + fmt(a.get('p_value')):>20}"
            f"{fmt(b.get('q_value')) + '→' + fmt(a.get('q_value')):>20}  "
            f"{b.get('verdict')} → {a.get('verdict')}"
        )
        if b.get("verdict") != a.get("verdict") or b.get("total_trades") != a.get("total_trades"):
            changed.append(row)
    if changed:
        print("\n".join(changed))
    else:
        print("  （試行数も判定も、1 件も変わっていない）")

    nv = sum(1 for k in keys if before.get(k, {}).get("verdict") != after.get(k, {}).get("verdict"))
    nt = sum(
        1
        for k in keys
        if before.get(k, {}).get("total_trades") != after.get(k, {}).get("total_trades")
    )
    print(f"\n試行数が変わった: {nt} 件 / 判定が変わった: {nv} 件")


if __name__ == "__main__":
    main()
