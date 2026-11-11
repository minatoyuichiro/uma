"use strict";
const WAKU_C = {
  1: ["#FFFFFF", "#111"],
  2: ["#1A1A1A", "#fff"],
  3: ["#E03131", "#fff"],
  4: ["#1971C2", "#fff"],
  5: ["#F2CC0C", "#111"],
  6: ["#2F9E44", "#fff"],
  7: ["#F76707", "#fff"],
  8: ["#F783AC", "#111"]
};
const wkBadge = (h) => `<span class="wk" style="background:${WAKU_C[h.waku][0]};color:${WAKU_C[h.waku][1]}">${h.draw}</span>`;
const recTxt = (c) => c.runs ? `${c.win}-${c.top3 - c.win}-${c.runs - c.top3}` : "—";
const recPct = (c) => c.runs ? Math.round(c.top3 / c.runs * 100) : -1;
async function viewSheet(id) {
  busy("データを集めています…");
  const d = await api(`/api/race/${id}/sheet`);
  const r = d.race;
  head("データ一覧", `${r.course}${r.race_no}R・${r.surface}${r.distance}m・${r.n}頭`);
  const COLS = [
    ["番", (h) => h.draw, (h) => wkBadge(h)],
    ["馬名", (h) => h.name, (h) => `<b>${esc(h.name)}</b><small>${esc(h.sex)}${h.age}・${esc(h.style)}</small>`],
    ["単勝", (h) => h.odds, (h) => `${h.odds}<small>${h.pop}人気</small>`],
    ["予測勝率", (h) => -h.pred.win, (h) => `${h.pred.win}%`],
    ["3着内", (h) => -h.pred.top3, (h) => `${h.pred.top3}%`],
    ["強さ", (h) => -h.pred.rating, (h) => `${h.pred.rating}<small>±${h.pred.sigma}</small>`],
    [
      "近5走",
      (h) => h.recent.slice(0, 5).reduce((a, x) => a + x.finish, 0) / Math.max(1, Math.min(5, h.recent.length)),
      (h) => h.recent.slice(0, 5).map((x) => x.finish).join("-") || "初"
    ],
    ["通算", (h) => -recPct(h.rec.all), (h) => recTxt(h.rec.all)],
    [r.surface, (h) => -recPct(h.rec.surface), (h) => recTxt(h.rec.surface)],
    ["距離±200", (h) => -recPct(h.rec.dist), (h) => recTxt(h.rec.dist)],
    [r.course, (h) => -recPct(h.rec.course), (h) => recTxt(h.rec.course)],
    [
      "騎手",
      (h) => -(h.jockey_rec.runs ? h.jockey_rec.win / h.jockey_rec.runs : 0),
      (h) => `${esc(h.jockey)}<small>勝率${h.jockey_rec.runs ? Math.round(h.jockey_rec.win / h.jockey_rec.runs * 100) : 0}%</small>`
    ],
    ["斤量", (h) => h.weight, (h) => h.weight],
    ["間隔", (h) => h.gap_days ?? 9999, (h) => h.gap_days == null ? "初" : `${h.gap_days}日`]
  ];
  let sortK = 0, open = null;
  const draw = () => {
    const hs = [...d.horses].sort((a, b) => {
      const x = COLS[sortK][1](a), y = COLS[sortK][1](b);
      return x < y ? -1 : x > y ? 1 : a.draw - b.draw;
    });
    view.innerHTML = `
      <div class="card"><div class="note">見出しを押すと並べ替え、馬を押すと近走と予測の内訳が開きます。<br>
        成績は「1着-2・3着-4着以下」。予測は過去のレースから推した強さで 5000 回走らせた割合です（外れます。当たり具合は「情報」タブ）。<br>
        <span class="vwarn">${esc(d.note)}</span></div>
        <a class="btn sec" href="data/sheet/${id}.csv" download>表計算ソフト用に落とす（CSV）</a></div>
      <div class="card"><div class="scroll"><table class="sheet">
        <tr>${COLS.map((c, i) => `<th data-k="${i}" class="${i === sortK ? "on" : ""}">${esc(c[0])}${i === sortK ? " ▾" : ""}</th>`).join("")}</tr>
        ${hs.map((h) => `<tr class="hrow ${open === h.draw ? "open" : ""}" data-d="${h.draw}">${COLS.map((c) => `<td>${c[2](h)}</td>`).join("")}</tr>
          ${open === h.draw ? `<tr class="hdet"><td colspan="${COLS.length}">${detail(h)}</td></tr>` : ""}`).join("")}
      </table></div></div>`;
    view.querySelectorAll("th[data-k]").forEach((t) => t.onclick = () => {
      sortK = +t.dataset.k;
      draw();
    });
    view.querySelectorAll("tr.hrow").forEach((t) => t.onclick = () => {
      open = open === +t.dataset.d ? null : +t.dataset.d;
      draw();
    });
  };
  const detail = (h) => `<div class="hd">
      <div class="hd-why"><b>予測の内訳</b>（強さ ${h.pred.rating}・ブレ ±${h.pred.sigma}・平均 ${h.pred.mean_pos} 着）
        ${h.pred.why.map((w) => `<div class="why1"><span>${esc(w.k)}</span><i class="${w.v >= 0 ? "p" : "m"}">${w.v >= 0 ? "+" : ""}${w.v}</i></div>`).join("")}
        <div class="note">厩舎 ${esc(h.trainer)}・騎手 ${esc(h.jockey)}（${h.jockey_rec.runs}走 ${h.jockey_rec.win}勝・3着内 ${h.jockey_rec.top3}）</div></div>
      <b>近走</b><table class="hd-run"><tr><th>日付</th><th>場・条件</th><th>着</th><th>人気</th></tr>
        ${h.recent.map((x) => `<tr><td>${esc(x.date.slice(5))}</td><td>${esc(x.course)} ${esc(x.surface)}${x.distance}・${esc(x.going)}<small>${esc(x.grade)}・${x.time}秒</small></td>
          <td class="num">${x.finish}<small>/${x.n}頭</small></td><td class="num">${x.pop}</td></tr>`).join("") || '<tr><td colspan="4">初出走</td></tr>'}</table></div>`;
  draw();
}
