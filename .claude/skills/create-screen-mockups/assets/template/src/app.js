// Screen mockup source. Copy of the create-screen-mockups template.
//
// Content is composed only from helpers named after the A2UI v0.9.1 basic catalog
// (Text, Icon, Image, Row, Column, List, Card, Tabs, Modal, Divider, Button,
// TextField, CheckBox, ChoicePicker, DateTimeInput) plus the app extension catalog
// declared in DESIGN.md (StatusLabel, NoticeBanner, PhotoGrid, ...). The app shell
// (top app bar, navigation bar, FAB, sheets) uses Material 3 host components.
//
// `?screen=<id>` picks a screen; `&shot=1` hides the viewer navigation for capture.
// Every name, address, phone number and amount must be a fictional fixture.

const params = new URLSearchParams(location.search);
const shot = params.get("shot") === "1";

// ---------- A2UI basic catalog ----------
const Icon = (name, cls = "") => `<span class="i ${cls}">${name}</span>`;
const Text = (variant, content, cls = "") => {
  const map = { h1: "t-h1", h2: "t-h2", h3: "t-h3", h4: "t-h4", h5: "t-h5", body: "t-body", caption: "t-caption" };
  return `<div class="${map[variant] || "t-body"} ${cls}">${content}</div>`;
};
const Row = (inner, cls = "") => `<div class="row ${cls}">${inner}</div>`;
const Column = (inner, cls = "") => `<div class="${cls}">${inner}</div>`;
const Divider = () => `<div class="hairline"></div>`;
const Card = (inner, cls = "") => `<div class="card ${cls}">${inner}</div>`;
const Button = (label, { variant = "default", icon = "", cls = "" } = {}) => {
  const v = { primary: "btn primary", default: "btn tonal", borderless: "textbtn" }[variant];
  return `<button class="${v} ${cls}">${icon ? Icon(icon) : ""}${label}</button>`;
};
const IconButton = (name, cls = "") => `<button class="iconbtn ${cls}">${Icon(name)}</button>`;
const TextField = (label, value, { focus = false, placeholder = false, leading = "", trailing = "", help = "" } = {}) =>
  `<div class="tf-wrap"><div class="tf ${focus ? "focus" : ""} ${placeholder ? "ph-only" : ""}"><label>${label}</label>${leading ? Icon(leading) : ""}<span class="v">${value}</span>${focus ? '<span class="caret"></span>' : ""}${trailing ? Icon(trailing) : ""}</div>${help ? `<div class="tf-help">${help}</div>` : ""}</div>`;
const DateTimeInput = (label, value) => TextField(label, value, { trailing: "calendar_today" });
const CheckBox = (on) => `<span class="cb-hit"><span class="cb ${on ? "on" : ""}">${on ? Icon("check") : ""}</span></span>`;
// ChoicePicker takes only the official A2UI props (variant, displayStyle).
// Renderer mapping (DESIGN.md): multipleSelection+chips -> filter chips,
// multipleSelection+checkbox -> checkbox list, mutuallyExclusive+chips -> M3 segmented
// button, mutuallyExclusive+checkbox -> radio list.
const ChoicePicker = (options, { variant = "multipleSelection", displayStyle = "chips" } = {}) => {
  if (variant === "multipleSelection" && displayStyle === "checkbox")
    return options.map(([l, on]) => `<div class="opt">${CheckBox(on)}${l}</div>`).join("");
  if (variant === "multipleSelection")
    return `<div class="chips wrap">${options.map(([l, on]) => `<span class="chip ${on ? "on lead" : ""}">${on ? Icon("check") : ""}${l}</span>`).join("")}</div>`;
  if (displayStyle === "chips")
    return `<div class="seg">${options.map(([l, on, n]) => `<span class="${on ? "on" : ""}">${on ? Icon("check") : ""}${l}${n !== undefined ? ` <small>${n}</small>` : ""}</span>`).join("")}</div>`;
  return options.map(([l, on]) => `<div class="opt"><span class="radio ${on ? "on" : ""}"></span>${l}</div>`).join("");
};
const Segmented = (options) => ChoicePicker(options, { variant: "mutuallyExclusive", displayStyle: "chips" });
const Tabs = (labels, on) => `<div class="tabs">${labels.map((l) => `<span class="${l === on ? "on" : ""}"><b>${l}</b></span>`).join("")}</div>`;
const List = (items) => `<div class="list">${items.join("")}</div>`;
// Material 3 list item. `over` is an overline row, `sup`/`sup2` supporting lines.
const ListItem = ({ lead = "", over = "", head = "", sup = "", sup2 = "", trail = "", cls = "", headCls = "" }) =>
  `<div class="li ${cls}">${lead}<div class="main">${over ? `<div class="over">${over}</div>` : ""}<div class="head ${headCls}">${head}</div>${sup ? `<div class="sup">${sup}</div>` : ""}${sup2 ? `<div class="sup2">${sup2}</div>` : ""}</div>${trail ? `<div class="trail">${trail}</div>` : ""}</div>`;
const KV = (label, value, trail = "") => ListItem({ over: label, head: value, trail, cls: "kv" });
const Subhead = (t, aside = "") => `<div class="subhead"><span>${t}</span>${aside ? `<span class="aside">${aside}</span>` : ""}</div>`;

// ---------- App extension catalog ----------
const STATUS = {
  todo: ["未対応", "radio_button_unchecked"],
  doing: ["進行中", "timelapse"],
  done: ["完了", "check_circle"],
};
const StatusLabel = (k, lg = false) =>
  `<span class="st ${k} ${lg ? "lg" : ""}">${Icon(STATUS[k][1], `${lg ? "s18" : "s16"} ${k === "done" ? "fill" : ""}`)}${STATUS[k][0]}</span>`;
const NoticeBanner = (text, action = "表示", cls = "") =>
  `<div class="banner ${cls}">${Icon("warning", "fill")}<span class="main">${text}</span><button class="textbtn">${action}</button></div>`;

// Fictional room photos: one-point perspective with varied walls, floor, window and door.
const WALL = ["#ece7df", "#e4e6e3", "#efeae2", "#e2ddd3", "#e9e9e6", "#f0ebe3"];
const FLOOR = ["#b48a62", "#9c8670", "#c8b496", "#8a7765", "#d6cdbf", "#a68b6c"];
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return `rgb(${c.join(",")})`;
};
const room = (i) => {
  const w = WALL[i % WALL.length], f = FLOOR[(i * 5 + 1) % FLOOR.length];
  const x1 = 22 + ((i * 7) % 14), x2 = x1 + 42 + ((i * 3) % 12), y1 = 18 + ((i * 5) % 10), y2 = 58 + ((i * 3) % 10);
  const win = i % 3 !== 1
    ? `<rect x="${x1 + 8}" y="${y1 + 6}" width="${(x2 - x1) * 0.45}" height="${(y2 - y1) * 0.5}" fill="#dfeef3"/><rect x="${x1 + 8}" y="${y1 + 6}" width="${(x2 - x1) * 0.45}" height="${(y2 - y1) * 0.5}" fill="none" stroke="#fff" stroke-width="1.4"/><line x1="${x1 + 8 + (x2 - x1) * 0.225}" y1="${y1 + 6}" x2="${x1 + 8 + (x2 - x1) * 0.225}" y2="${y1 + 6 + (y2 - y1) * 0.5}" stroke="#fff" stroke-width="1"/>`
    : "";
  const door = i % 2 === 0
    ? `<polygon points="${x2 + 4},${y1 + 10} ${x2 + 14},${y1 + 4} ${x2 + 14},${y2 + 12} ${x2 + 4},${y2 + 3}" fill="${shade(w, 0.86)}" stroke="${shade(w, 0.75)}" stroke-width=".6"/>`
    : "";
  const fixture = i % 4 === 3
    ? `<rect x="${x1 + 4}" y="${y2 - 14}" width="${(x2 - x1) * 0.6}" height="14" fill="#f7f7f5"/><rect x="${x1 + 4}" y="${y2 - 15}" width="${(x2 - x1) * 0.6}" height="2" fill="#cfd2d0"/>`
    : "";
  return `<svg class="room" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
    <polygon points="0,0 100,0 ${x2},${y1} ${x1},${y1}" fill="${shade(w, 1.03)}"/>
    <polygon points="0,0 ${x1},${y1} ${x1},${y2} 0,100" fill="${shade(w, 0.9)}"/>
    <polygon points="100,0 ${x2},${y1} ${x2},${y2} 100,100" fill="${shade(w, 0.95)}"/>
    <rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="${w}"/>
    <polygon points="0,100 ${x1},${y2} ${x2},${y2} 100,100" fill="${f}"/>
    <polygon points="0,100 ${x1},${y2} ${x1 + 6},${y2} 18,100" fill="${shade(f, 1.06)}" opacity=".5"/>
    <line x1="${x1}" y1="${y2}" x2="${x2}" y2="${y2}" stroke="${shade(w, 0.8)}" stroke-width="1"/>
    ${win}${door}${fixture}
  </svg>`;
};
const Image = (i, cls = "", inner = "") => `<div class="ph ${cls}">${room(i)}${inner}</div>`;
const PhotoGrid = (n, { selected = null, start = 0 } = {}) =>
  `<div class="pgrid">${Array.from({ length: n }, (_, k) => {
    const i = k + start;
    if (!selected) return Image(i);
    const on = selected.includes(k);
    return Image(i, on ? "on" : "", `<span class="sel">${on ? Icon("check") : ""}</span>`);
  }).join("")}</div>`;
const SignaturePad = () => `<div class="sigpad">
  ${Button("書き直す", { variant: "borderless" })}
  <div class="base"></div><div class="lbl">署名</div>
  <svg viewBox="0 0 240 110" fill="none" stroke="#1f2a44" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 74c10-30 22-46 28-40s-14 46-6 48 22-40 30-38-6 30 2 32 14-24 22-22 0 22 8 22 18-30 26-30-8 32 2 32 20-26 30-26 4 22 14 22 18-12 26-14"/><path d="M58 44c22 2 42-2 58-7"/></svg>
</div>`;
const StageTrack = (steps) =>
  `<div class="track">${steps.map(([s, l, d]) => `<div class="stp ${s}"><div class="bar"></div><b>${l}</b>${d}</div>`).join("")}</div>`;
const Metric = (label, value, unit, cls = "") =>
  `<div class="metric ${cls}"><div class="lbl">${label}</div><div class="val">${value}<small>${unit}</small></div></div>`;

// ---------- Material 3 shell ----------
const statusbar = (cls = "") => `<div class="statusbar ${cls}"><span>9:41</span><span class="sys"><svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2" width="3" height="10" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg><span class="batt"><i></i></span></span></div>`;
const AppBar = (title, { nav = "arrow_back", acts = "", cls = "" } = {}) =>
  `<div class="appbar ${cls}">${nav ? IconButton(nav, "on-surface") : ""}<div class="title">${title}</div><div class="acts">${acts}</div></div>`;
const LargeAppBar = (title, { sub = "", acts = "" } = {}) =>
  `<div class="appbar-large"><div class="top" ${acts ? "" : 'style="height:16px"'}>${acts}</div><h1 class="t-display">${title}</h1>${sub ? `<div class="sub t-body-m var">${sub}</div>` : ""}</div>`;
const NAV = {
  sales: [["home", "ホーム", "home"], ["cases", "案件", "work"], ["settings", "設定", "settings"]],
  admin: [["dashboard", "集計", "dashboard"], ["cases", "案件", "work"], ["timeline", "タイムライン", "view_timeline"], ["master", "マスタ", "groups"], ["settings", "設定", "settings"]],
};
const NavBar = (role, on) =>
  `<nav class="navbar">${NAV[role].map(([k, l, i]) => `<a class="${k === on ? "on" : ""}"><span class="ind">${Icon(i)}</span>${l}</a>`).join("")}</nav>`;
const Fab = (label, icon) => `<div class="fab">${Icon(icon)}${label}</div>`;
const Scrim = () => `<div class="scrim"></div>`;
const Sheet = (title, body, foot) =>
  `<div class="sheet"><div class="handle"></div><div class="s-title t-h2">${title}</div><div class="s-body">${body}</div><div class="s-foot">${foot}</div><div class="homeind"></div></div>`;
const Dialog = (title, text, acts) => `<div class="dialog"><h3>${title}</h3><p>${text}</p><div class="acts">${acts}</div></div>`;

const screen = ({ top = "", body = "", bottom = "", over = "", homeCls = "", status = "" }) =>
  `<div class="phone">${statusbar(status)}<div class="body">${top}<div class="scroll">${body}</div>${bottom}</div><div class="homeind ${homeCls}"></div>${over}</div>`;

// ---------- Fixtures (replace with the project's fictional data) ----------
const ITEMS = [
  { st: "doing", time: "10:00", name: "項目名の例 A", sub: "場所の例 A", sub2: "市区町村 1 丁目" },
  { st: "todo", time: "13:30", name: "項目名の例 B", sub: "場所の例 B", sub2: "市区町村 2 丁目" },
  { st: "done", time: "16:00", name: "項目名の例 C", sub: "場所の例 C", sub2: "市区町村 3 丁目" },
];
const Item = (c) => ListItem({
  lead: `<span class="time">${c.time}</span>`,
  over: StatusLabel(c.st), head: c.name, sup: c.sub, sup2: c.sub2, cls: "top",
});

// ---------- Screens (one function per PNG) ----------
const S = {};

// Top-level tab screen: large title, list, slim notice after the main content.
S.home = () => screen({
  top: `<div style="padding:8px 16px 0"><div class="searchbar">${Icon("search")}<span class="hint">検索</span><span class="avatar">例</span></div></div>`,
  body: `${LargeAppBar("今日の予定", { sub: "10月24日（土）・3 件" })}
    ${List(ITEMS.map(Item))}
    <div class="mt8">${NoticeBanner("確認が必要な項目が<b>2</b>件", "表示", "slim")}</div>`,
  bottom: NavBar("sales", "home"),
  homeCls: "low",
});

// Detail screen: compact app bar, headline, primary tabs, label/value list.
S.detail = () => screen({
  top: `${AppBar("場所の例 A", { acts: IconButton("more_vert"), cls: "compact" })}
    <div style="padding:0 16px 12px">${Text("h1", ITEMS[0].name)}
      ${Row(`${StatusLabel("doing", true)}<span class="flex1"></span>${Button("ステータスを変更", { variant: "default", icon: "swap_horiz" })}`, "mt4")}</div>
    ${Tabs(["概要", "写真", "書類"], "概要")}`,
  body: `${Subhead("場所")}${List([KV("住所", "東京都〇〇区 1 丁目", IconButton("map"))])}
    ${Subhead("金額")}${List([KV("金額", '<span class="t-figure" style="font-size:20px"><span class="yen">¥</span>120,000</span>')])}`,
  bottom: NavBar("sales", "cases"),
  homeCls: "low",
});

// Exclusive choice in a bottom sheet (ChoicePicker mutuallyExclusive + checkbox -> radio list).
S["detail-sheet"] = () => S.detail().replace(/<\/div>$/, `${Scrim()}${Sheet("ステータスを変更",
  ChoicePicker([["未対応", false], ['進行中<span class="t-caption var" style="margin-left:8px">現在</span>', false], ["完了", true]], { variant: "mutuallyExclusive", displayStyle: "checkbox" }),
  `${Button("キャンセル", { variant: "borderless" })}${Button("完了に変更", { variant: "primary" })}`)}</div>`);

// Form: full-screen dialog with the confirm action at the top right.
S.form = () => screen({
  top: AppBar("新規登録", { nav: "close", acts: Button("登録", { variant: "borderless" }) }),
  body: `<div style="padding:16px 16px 0">
    ${TextField("名前", "入力中の値", { focus: true })}
    ${DateTimeInput("予定日", "10月24日（土）")}
    ${TextField("担当者", "担当者の例", { trailing: "arrow_drop_down" })}
  </div>`,
});

// ---------- Registry ----------
// [group, screen id, PNG file name, label]. capture.sh and verify-screens.sh read these lines.
const SCREENS = [
  ["例", "home", "01-home", "ホーム"],
  ["例", "detail", "02-detail", "詳細"],
  ["例", "detail-sheet", "03-detail-sheet", "ステータス変更"],
  ["例", "form", "04-form", "新規登録"],
];

// ---------- Boot ----------
// Unknown or missing ?screen= falls back to the first registered screen.
// body[data-render] tells capture.sh whether the screen really rendered:
// "ok" only after the screen function ran and every web font loaded.
const fallback = SCREENS.length ? SCREENS[0][1] : null;
const id = S[params.get("screen")] ? params.get("screen") : fallback;
if (shot) document.body.classList.add("shot");
const nav = SCREENS.reduce((acc, [g, sid, , label], i) => {
  const head = i === 0 || SCREENS[i - 1][0] !== g ? `<h2>${g}</h2>` : "";
  return acc + head + `<a class="${sid === id ? "on" : ""}" href="?screen=${sid}">${label}</a>`;
}, "");
try {
  if (!id || !S[id]) throw new Error("no screen registered in SCREENS, or its function S[id] is missing");
  document.getElementById("app").innerHTML = `<div class="viewer"><nav>${nav}</nav>${S[id]()}</div>`;
  document.fonts.ready.then(() => {
    // No @font-face at all means fetch-assets.sh never ran; treat it as a font error too.
    const broken = document.fonts.size === 0 ? ["none loaded"]
      : [...document.fonts].filter((f) => f.status === "error").map((f) => f.family);
    document.body.dataset.render = broken.length ? `font-error:${broken.join(",")}` : "ok";
  });
} catch (e) {
  document.body.dataset.render = "error";
  document.getElementById("app").innerHTML = `<pre style="padding:16px;color:#ba1a1a;white-space:pre-wrap">render error: ${e.message}</pre>`;
}
