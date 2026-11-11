"use strict";
const view = document.getElementById("view");
const title = document.getElementById("title");
const sub = document.getElementById("sub");
const backBtn = document.getElementById("back");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const STATIC = !!window.UMA_STATIC;
const api = (p) => STATIC ? window.UMA_STATIC(p) : fetch(p).then((r) => {
  if (!r.ok) throw new Error(r.status);
  return r.json();
});
const busy = (m) => {
  view.innerHTML = `<div class="loading">${esc(m || "読み込み中…")}</div>`;
};
const fin = (f) => f === 1 ? '<span class="f1">1</span>' : f === 2 ? '<span class="f2">2</span>' : f === 3 ? '<span class="f3">3</span>' : f ?? "—";
let META = null;
let stack = [];
let ctl3d = null;
let crowd = null;
let hooves = null;
function go(fn, push = true) {
  if (ctl3d) {
    ctl3d.dispose();
    ctl3d = null;
  }
  if (crowd) {
    crowd.dispose();
    crowd = null;
  }
  if (hooves) {
    hooves.dispose();
    hooves = null;
  }
  hushVoice();
  if (typeof voteStop === "function") {
    voteStop();
    window.__voteRun = null;
  }
  if (push) stack.push(fn);
  backBtn.hidden = stack.length <= 1;
  window.scrollTo(0, 0);
  fn();
}
backBtn.onclick = () => {
  stack.pop();
  const f = stack[stack.length - 1];
  if (f) go(f, false);
};
document.querySelectorAll("#tabs button").forEach((b) => b.onclick = () => {
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
  stack = [];
  go({ races: viewRaces, horses: viewHorses, jockeys: viewJockeys, about: viewAbout }[b.dataset.tab]);
});
const head = (t, s) => {
  title.textContent = t;
  sub.textContent = s || "";
};
const cond = (r) => `${r.course}${r.turn} ${r.surface}${r.distance}m・${r.going}`;
let raceTab = "today";
async function viewRaces() {
  head("レース", "");
  busy();
  const seg = `<div class="card"><div class="seg">
      <button data-s="today" class="${raceTab === "today" ? "on" : ""}">開催予定</button>
      <button data-s="past" class="${raceTab === "past" ? "on" : ""}">過去のレース</button>
    </div></div>`;
  let body = "";
  if (raceTab === "today") {
    const d = await api("/api/races/today");
    head("レース", d.date ? `${d.date} の開催（架空）` : "");
    body = d.courses.map((c) => `<div class="card"><h2>${esc(c.course)}競馬場</h2><div class="rowlist">` + c.races.map((r) => `<button class="row" data-race="${r.id}">
        <div class="no">${r.race_no}R</div>
        <div class="main"><b>${esc(r.grade)}・${r.distance}m</b>
          <small>${esc(r.surface)}${esc(r.turn)}まわり・馬場${esc(r.going)}・${r.n}頭</small></div>
        <div class="chev">›</div></button>`).join("") + "</div></div>").join("");
  } else {
    const rs = await api("/api/races/past?limit=60");
    head("レース", "結果の出ている過去レース");
    body = `<div class="card"><div class="rowlist">` + rs.map((r) => `<button class="row" data-race="${r.id}">
        <div class="no">${r.race_no}R</div>
        <div class="main"><b>${esc(r.grade)}・${esc(r.course)}${esc(r.surface)}${r.distance}m</b>
          <small>${esc(r.date)}・馬場${esc(r.going)}・${r.n}頭</small></div>
        <div class="chev">›</div></button>`).join("") + "</div></div>";
  }
  view.innerHTML = seg + body;
  view.querySelectorAll("[data-s]").forEach((b) => b.onclick = () => {
    raceTab = b.dataset.s;
    viewRaces();
  });
  view.querySelectorAll("[data-race]").forEach((b) => b.onclick = () => go(() => viewRace(+b.dataset.race)));
}
async function viewRace(id) {
  busy();
  const d = await api("/api/race/" + id);
  const r = d.race;
  head(`${r.grade}・${r.race_no}R`, cond(r));
  const done = d.entries.some((e) => e.finish);
  const rows = (done ? [...d.entries].sort((a, b) => a.finish - b.finish) : d.entries).map((e) => `
    <tr><td class="num">${done ? fin(e.finish) : e.draw}</td>
      <td><button class="hlink" data-horse="${e.horse_id}"><b>${esc(e.name)}</b></button><br>
        <small style="color:var(--dim)">${esc(e.sex)}${e.age}・${esc(e.style)}・${esc(e.jockey)}</small></td>
      <td class="num">${e.weight}</td>
      <td class="num">${e.odds}<br><small style="color:var(--dim)">${e.pop}人気</small></td>
      <td class="num"><small style="color:var(--dim)">${(e.recent || []).join("-") || "初"}</small></td>
    </tr>`).join("");
  view.innerHTML = `
    <div class="card"><div class="pills">
      <span class="pill ${r.surface === "芝" ? "t" : "d"}">${esc(r.surface)}${r.distance}m</span>
      <span class="pill">${esc(r.course)}・${esc(r.turn)}まわり</span>
      <span class="pill">馬場 ${esc(r.going)}</span>
      <span class="pill">${r.n}頭</span><span class="pill">${esc(r.date)}</span>
    </div></div>
    ${r.is_today ? `<button class="btn" id="run">▶ シミュレーションを走らせる</button>` : `<button class="btn sec" id="run">このレースを予測して結果と見比べる</button>`}
    ${STATIC && !r.is_today ? "" : `<button class="btn sec" id="run3d">🏇 3Dで走らせる（中継・俯瞰）</button>
    <button class="btn sec" id="sheet">データ一覧（過去の成績・予測の数字）</button>`}
    <div class="card"><h2>${done ? "確定順位" : "出馬表"}</h2><div class="scroll"><table>
      <tr><th>${done ? "着" : "枠"}</th><th>馬</th><th>斤量</th><th>単勝</th><th>近5走</th></tr>
      ${rows}</table></div></div>`;
  view.querySelector("#run").onclick = () => go(() => viewSim(id));
  if (view.querySelector("#sheet")) view.querySelector("#sheet").onclick = () => go(() => viewSheet(id));
  if (view.querySelector("#run3d")) view.querySelector("#run3d").onclick = () => {
    unlockAudio();
    go(() => view3D(id));
  };
  view.querySelectorAll("[data-horse]").forEach((b) => b.onclick = () => go(() => viewHorse(+b.dataset.horse)));
}
const PP_ICON = (on) => on ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>' : '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>';
const SND_ICON = (on) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/>${on ? '<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>' : '<path d="M17 9l5 6M22 9l-5 6"/>'}</svg>`;
let actx = null;
let crowdOn = (() => {
  try {
    return localStorage.getItem("uma.crowd") !== "off";
  } catch {
    return true;
  }
})();
function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    if (!actx) actx = new AC();
    if (actx.state === "suspended") actx.resume();
  }
  if (window.speechSynthesis && !voiceUnlocked) {
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch {
    }
    voiceUnlocked = true;
  }
}
let voiceUnlocked = false, jaVoice = null, currentPack = null;
const SERVER_VOICE = false;
function pickVoice() {
  const vs = window.speechSynthesis && speechSynthesis.getVoices() || [];
  const ja = vs.filter((v) => /^ja/i.test(v.lang));
  jaMale = ja.find((v) => /Otoya|Hattori|Keita|Ichiro|male/i.test(v.name) && !/female/i.test(v.name)) || null;
  jaVoice = jaMale || ja.find((v) => /Google/.test(v.name)) || ja.find((v) => /Kyoko|O-ren/.test(v.name)) || ja.find((v) => /Nanami|Haruka|Ayumi/.test(v.name)) || ja[0] || null;
}
let jaMale = null;
if (window.speechSynthesis) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}
const RATE = { intro: 1.35, call: 1.55, drive: 1.85, goal: 1.8, result: 1.3, replay: 1.25, note: 1.2 };
let speaking = false, queued = null, voiceSrc = null;
const VOICE_BUF = /* @__PURE__ */ new Map();
let nextLineHook = null;
const spokenEarly = /* @__PURE__ */ new WeakSet();
function doneSpeaking() {
  speaking = false;
  voiceSrc = null;
  if (crowd) crowd.duck(false);
  if (!queued && nextLineHook) {
    const nx = nextLineHook();
    if (nx) {
      spokenEarly.add(nx);
      speakLine(nx, false);
      return;
    }
  }
  const q = queued;
  queued = null;
  if (q && performance.now() - q.at < (q.ln.at < 0 ? 4e3 : 1200)) speakLine(q.ln, true);
}
let speakAt = 0, curUtter = null, jaFailed = false;
function speakLine(ln, late) {
  if (!crowdOn) return;
  if (speaking && performance.now() - speakAt > 15e3) {
    speaking = false;
    queued = null;
  }
  speakAt = performance.now();
  if (speaking && ln.kind !== "goal") {
    queued = { ln, at: performance.now() };
    return;
  }
  if (voiceSrc) {
    try {
      voiceSrc.onended = null;
      voiceSrc.stop();
    } catch {
    }
    voiceSrc = null;
  }
  const buf = VOICE_BUF.get(ln);
  if (buf && actx) {
    if (window.speechSynthesis) speechSynthesis.cancel();
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (late ? 1.1 : 1) * (ln.kind === "drive" || ln.kind === "goal" ? 1.08 : 1);
    const g = actx.createGain();
    g.gain.value = 1.6;
    src.connect(g).connect(actx.destination);
    speaking = true;
    voiceSrc = src;
    if (crowd) crowd.duck(true);
    src.onended = doneSpeaking;
    src.start();
    return;
  }
  if (!window.speechSynthesis) return;
  const busy2 = speechSynthesis.speaking || speechSynthesis.pending;
  if (busy2) speechSynthesis.cancel();
  if (speechSynthesis.paused) speechSynthesis.resume();
  const yomi = ln.text.replace(/内/g, "うち").replace(/(\d+)頭/g, "$1とう").replace(/(\d+)番手/g, "$1ばんて").replace(/(\d+)馬身/g, "$1ばしん").replace(/1\/4/g, "4分の1").replace(/1\/2/g, "半").replace(/3\/4/g, "4分の3");
  const u = new SpeechSynthesisUtterance(yomi);
  u.lang = "ja-JP";
  if (jaVoice) u.voice = jaVoice;
  u.rate = (RATE[ln.kind] || 1.4) + (late ? 0.15 : 0);
  u.pitch = (jaMale ? 1 : 0.72) + (ln.kind === "goal" || ln.kind === "drive" ? 0.1 : 0);
  u.volume = 1;
  speaking = true;
  u.onstart = () => {
    if (crowd) crowd.duck(true);
  };
  u.onend = () => {
    if (curUtter === u) doneSpeaking();
  };
  u.onerror = (ev) => {
    if (curUtter !== u) return;
    console.warn("読み上げに失敗", ev && ev.error, u.voice && u.voice.name);
    if (u.voice && !u.__retry && ev && ev.error !== "interrupted" && ev.error !== "canceled") {
      const v = new SpeechSynthesisUtterance(u.text);
      v.lang = "ja-JP";
      v.rate = u.rate;
      v.pitch = u.pitch;
      v.__retry = true;
      v.onend = v.onerror = () => {
        if (curUtter === v) doneSpeaking();
      };
      curUtter = v;
      jaVoice = null;
      jaFailed = true;
      speechSynthesis.speak(v);
    } else doneSpeaking();
  };
  curUtter = u;
  if (!jaVoice && !jaFailed) pickVoice();
  if (jaVoice) u.voice = jaVoice;
  setTimeout(() => speechSynthesis.speak(u), busy2 ? 80 : 0);
}
function hushVoice() {
  queued = null;
  speaking = false;
  if (voiceSrc) {
    try {
      voiceSrc.onended = null;
      voiceSrc.stop();
    } catch {
    }
    voiceSrc = null;
  }
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (crowd) crowd.duck(false);
}
function makeCrowd() {
  if (!actx) return null;
  const src = actx.createBufferSource();
  src.loop = true;
  fetch(STATIC ? "static/assets/sound/crowd_cc0.mp3?v=1" : "static/assets/sound/crowd_h3.mp3?v=1").then((r) => r.arrayBuffer()).then((b) => new Promise((ok, ng) => actx.decodeAudioData(b, ok, ng))).then((buf) => {
    src.buffer = buf;
    src.start(0, Math.random() * buf.duration);
  }).catch(() => {
  });
  const bp = actx.createBiquadFilter();
  bp.type = "highpass";
  bp.frequency.value = 60;
  const lp = actx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3e3;
  const swell = actx.createGain();
  swell.gain.value = 0.8;
  const lfo = actx.createOscillator();
  lfo.frequency.value = 0.23;
  const lfoG = actx.createGain();
  lfoG.gain.value = 0.18;
  lfo.connect(lfoG).connect(swell.gain);
  const out = actx.createGain();
  out.gain.value = 0;
  src.connect(bp).connect(lp).connect(swell).connect(out).connect(actx.destination);
  lfo.start();
  let cur = -1, ducked = false;
  return {
    duck(on) {
      if (ducked !== on) {
        ducked = on;
        this.refresh();
      }
    },
    set(lv) {
      lv = Math.max(0, Math.min(1, lv));
      if (Math.abs(lv - cur) < 0.01) return;
      cur = lv;
      const t = actx.currentTime;
      out.gain.setTargetAtTime(crowdOn && lv > 0 ? (0.09 + 0.85 * lv * lv) * (ducked ? 0.55 : 1) : 0, t, 0.25);
      lp.frequency.setTargetAtTime(2200 + 9e3 * lv, t, 0.4);
    },
    refresh() {
      const v = cur;
      cur = -1;
      this.set(v);
    },
    dispose() {
      out.gain.setTargetAtTime(0, actx.currentTime, 0.08);
      setTimeout(() => {
        try {
          src.stop();
          lfo.stop();
          out.disconnect();
        } catch {
        }
      }, 400);
    }
  };
}
const HOOF_SRC = { herd: ["gallop_herd.mp3", 0.4], single: ["gallop_single.mp3", 0.41] };
const HOOF_BUF = {};
function hoofBuf(k) {
  if (!HOOF_BUF[k]) HOOF_BUF[k] = fetch("static/assets/sound/" + HOOF_SRC[k][0] + "?v=1").then((r) => r.arrayBuffer()).then((b) => new Promise((ok, ng) => actx.decodeAudioData(b, ok, ng)));
  return HOOF_BUF[k];
}
function makeHooves(surface) {
  if (!actx) return null;
  const turf = surface === "芝";
  const lp = actx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = turf ? 2200 : 6e3;
  lp.connect(actx.destination);
  const L = {};
  for (const k of Object.keys(HOOF_SRC)) {
    const g = actx.createGain();
    g.gain.value = 0;
    g.connect(lp);
    L[k] = { g, src: null };
    hoofBuf(k).then((buf) => {
      if (!L[k]) return;
      const src = actx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = 0.05;
      src.loopEnd = buf.duration - 0.03;
      src.connect(g);
      src.start(0, Math.random() * buf.duration * 0.5);
      L[k].src = src;
    }).catch(() => {
    });
  }
  const set = (k, vol, rate) => {
    const t = actx.currentTime, x = L[k];
    x.g.gain.setTargetAtTime(vol, t, 0.12);
    if (x.src && rate) x.src.playbackRate.setTargetAtTime(rate, t, 0.3);
  };
  return {
    update(s, ci, playing, speed) {
      if (!playing || !crowdOn || speed > 2.5) {
        set("herd", 0);
        set("single", 0);
        return;
      }
      const zoom = Math.max(ci.fov, 2) / 40;
      let dmin = 1e9, vNear = 0, vSum = 0, nRun = 0;
      s.forEach((q) => {
        const dd = Math.hypot(q.x - ci.x, q.y - ci.z, ci.y) * zoom;
        if (dd < dmin) {
          dmin = dd;
          vNear = q.v;
        }
        if (q.v > 2) {
          vSum += q.v;
          nRun++;
        }
      });
      if (!nRun) {
        set("herd", 0);
        set("single", 0);
        return;
      }
      const vAvg = vSum / nRun;
      const rate = (v) => Math.min(1.3, Math.max(0.6, HOOF_SRC.herd[1] / (7.2 / Math.max(v, 4))));
      const near = Math.min(1, 40 / (dmin + 25));
      set("herd", Math.min(0.8, nRun / s.length * (0.18 + 0.7 * near)), rate(vAvg));
      set("single", Math.min(0.9, near * near * 0.9 * Math.min(vNear / 12, 1)), rate(vNear));
    },
    dispose() {
      for (const k of Object.keys(L)) {
        try {
          if (L[k].src) L[k].src.stop();
          L[k].g.disconnect();
        } catch {
        }
      }
      for (const k of Object.keys(L)) delete L[k];
    }
  };
}
function crowdLevel(pack, S, mt, dMax) {
  const L = pack.race.distance;
  const tWin = Math.min(...pack.horses.map((h) => h.time_sec));
  const rem = L - dMax;
  let lv = 0.22 + 0.13 * Math.min(Math.max(mt / 20, 0), 1);
  lv += 0.6 * Math.min(Math.max((450 - rem) / 450, 0), 1) ** 2;
  if (mt > tWin) lv *= Math.max(0.45, 1 - (mt - tWin) / 7);
  if (S.key === "replay") lv = Math.min(lv, 0.4);
  return lv;
}
let scenery = "shimotori";
async function view3D(id, seed, vote) {
  busy("コースを組み立てています…");
  const q = new URLSearchParams();
  if (seed) q.set("seed", seed);
  if (vote) q.set("vote", vote);
  if (scenery) q.set("scenery", scenery);
  const pack = vote ? await vapi(`/api/race/${id}/scene?` + q, { headers: { "X-Admin": hostKey() } }) : await api(`/api/race/${id}/scene?` + q);
  const r = pack.race, pr = pack.presentation || {};
  head("3Dで走らせる", `${pr.venue_name || r.course}${r.race_no}R・${r.surface}${r.distance}m・${r.n}頭`);
  view.innerHTML = `
    <div id="stage">
      <div class="ov tl"><div class="ord" id="ovord"></div></div>
      <div class="ov tc"><div class="lineup" id="lineup" aria-label="隊列（先頭が左）"></div></div>
      <div class="ov tr"><div class="rem"><span class="cut" id="ovcut">—</span><small>残り</small><b id="ovrem">—</b>
        <i id="ovclk">0.0</i></div></div>
      <div class="board" id="bStart" hidden></div>
      <div class="board" id="bEnd" hidden></div>
      <div class="ov bot"><div class="subs" id="subs" aria-live="polite"><span id="subt"></span></div></div>
      <!-- ⭐ 再生の操作は YouTube のように画面の下に重ねる。触れると出て、しばらくすると消える -->
      <div class="ctl" id="ctl">
        <div class="ctlrow">
          <button class="pp" id="pp" aria-label="再生・一時停止">${PP_ICON(true)}</button>
          <span class="tm" id="tm">0:00</span>
          <span class="sp0"></span>
          <button class="sp" id="sp" aria-label="速さ">×1</button>
          <button class="snd" id="snd" aria-label="音（歓声と実況）">${SND_ICON(crowdOn)}</button>
        </div>
      </div>
      <input type="range" class="prog" id="seek" min="0" max="1000" value="0" aria-label="再生位置">
    </div>
    <div class="warnslim">⚠️ <b>合成（架空）データ</b>です。1回ぶん走らせたもので、
      <b>予測は外れます</b>。馬券の購入を勧めるものではありません</div>
    <div class="credit" id="credit" hidden></div>
    <button class="btn sec" id="again">もう一度走らせる（別の走り）</button>
    <div class="card"><div class="note">
      カメラはテレビの中継と同じ切り替えです（道中は内馬場から望遠で真横に追います）。
      下の<b>隊列図</b>は丸が馬番で、<b>左が先頭</b>、間隔は実際の差、上下は内・外です。<br>
      ${pack.scenery ? `背景は<b>${esc(pack.scenery.venue_label)}</b>の見立てです。
        ${esc(pack.scenery.note)}` : ""}
    </div></div>`;
  const stage = view.querySelector("#stage");
  const elCut = view.querySelector("#ovcut"), elRem = view.querySelector("#ovrem");
  const elClk = view.querySelector("#ovclk"), elOrd = view.querySelector("#ovord");
  const seek = view.querySelector("#seek");
  const elSub = view.querySelector("#subt"), elTm = view.querySelector("#tm");
  const bStart = view.querySelector("#bStart"), bEnd = view.querySelector("#bEnd");
  const wk = (h) => `<span class="wk" style="background:${h.waku_color.bg};color:${h.waku_color.fg}">${h.draw}</span>`;
  bStart.innerHTML = `<h3>${esc((pack.presentation || {}).venue_name || pack.race.course)}${pack.race.race_no}R 出走表
      <small>${esc(pack.race.surface)}${pack.race.distance}m・${pack.race.n}頭</small></h3>
    <div class="cols">${(() => {
    const hsSorted = [...pack.horses].sort((a, b) => a.draw - b.draw);
    const half = hsSorted.length > 10 ? Math.ceil(hsSorted.length / 2) : hsSorted.length;
    const tbl = (list) => `<table><tr><th>番</th><th>馬名</th><th>騎手</th><th>単勝</th><th>人気</th></tr>
        ${list.map((h) => `<tr data-d="${h.draw}"><td>${wk(h)}</td><td>${esc(h.name)}</td><td>${esc(h.jockey)}</td>
        <td class="n">${h.odds}</td><td class="n">${h.pop}</td></tr>`).join("")}</table>`;
    return tbl(hsSorted.slice(0, half)) + (half < hsSorted.length ? tbl(hsSorted.slice(half)) : "");
  })()}</div>
    <p>オッズ・人気は合成（架空）です</p>`;
  bEnd.innerHTML = `<h3>結果 <small>勝ちタイム ${esc(pack.result[0].time_str)}</small></h3>
    <div class="cols">${(() => {
    const rs = pack.result, half = rs.length > 10 ? Math.ceil(rs.length / 2) : rs.length;
    const tbl = (list) => `<table><tr><th>着</th><th>番</th><th>馬名</th><th>着差</th><th>人気</th><th>予測勝率</th></tr>
        ${list.map((x) => {
      const h = pack.horses.find((y) => y.draw === x.draw);
      return `<tr class="${x.finish <= 3 ? "p" + x.finish : ""}"><td class="n">${x.finish}</td><td>${wk(h)}</td><td>${esc(x.name)}</td>
            <td>${esc(x.margin)}</td><td class="n">${x.pop}</td><td class="n">${x.win_pct}%</td></tr>`;
    }).join("")}</table>`;
    return tbl(rs.slice(0, half)) + (half < rs.length ? tbl(rs.slice(half)) : "");
  })()}</div>
    <p>合成（架空）データです。予測は外れます</p>`;
  let fanBuf = null, fanDone = false, fanSrc = null;
  if (actx) fetch("static/assets/sound/fanfare.mp3?v=1").then((r2) => r2.arrayBuffer()).then((b) => new Promise((ok, ng) => actx.decodeAudioData(b, ok, ng))).then((b) => {
    fanBuf = b;
  }).catch(() => {
  });
  const lines = pack.commentary || [];
  let voiceReady = null, voiceReadyOk = null;
  const credits = { bg: "", horse: "", voice: "" };
  const showCredit = () => {
    const el = view.querySelector("#credit");
    el.hidden = false;
    el.textContent = [credits.bg, credits.horse, credits.voice].filter(Boolean).join("／");
  };
  VOICE_BUF.clear();
  if (window.speechSynthesis) pickVoice();
  if ((SERVER_VOICE || !jaMale) && pack.voice_token) {
    const myPack = pack;
    fetch("/api/voice/" + pack.voice_token, { method: "POST" }).then((r2) => r2.ok ? r2.json() : null).then(async (d) => {
      if (!d || !actx) return;
      credits.voice = d.credit || "";
      showCredit();
      voiceReady = new Promise((ok) => {
        voiceReadyOk = ok;
        setTimeout(ok, 5e3);
      });
      for (let i = 0; i < d.keys.length; i++) {
        if (i === 1 && voiceReadyOk) voiceReadyOk();
        for (let tries = 0; tries < 60; tries++) {
          if (currentPack !== myPack) return;
          const r2 = await fetch("/api/tts/" + d.keys[i] + ".wav");
          if (r2.ok) {
            const ab = await r2.arrayBuffer();
            try {
              VOICE_BUF.set(lines[i], await new Promise((ok, ng) => actx.decodeAudioData(ab, ok, ng)));
            } catch {
            }
            break;
          }
          await new Promise((res) => setTimeout(res, 400));
        }
      }
    }).catch(() => {
    });
  }
  currentPack = pack;
  let subNow = null, hlNow = "", seekJump = false, curSpeed = 1, lineupK = 0;
  nextLineHook = () => {
    if (!ctl3d || !ctl3d.isPlaying()) return null;
    const now = ctl3d.getTime();
    const nx = lines.find((x) => x.at > now && !spokenEarly.has(x));
    return nx && nx.at - now < 1.2 && nx.kind !== "goal" && !(nx.at >= 0 && nx.at < 1) ? nx : null;
  };
  const elLine = view.querySelector("#lineup");
  elLine.innerHTML = pack.horses.map((h) => `<i style="background:${h.waku_color.bg};color:${h.waku_color.fg}">${h.draw}</i>`).join("") + '<b class="arrow">◀</b>';
  const dots = [...elLine.querySelectorAll("i")];
  const lanes = pack.horses.map((h) => h.lane_m);
  const dotPos = (s0) => s0.map(() => null);
  let dp = null, spanS = null;
  function drawLineup(s, mt) {
    const W = elLine.clientWidth, H = elLine.clientHeight, R = (dots[0].offsetWidth || 22) / 2;
    const dMax = Math.max(...s.map((q2) => q2.d)), dMin = Math.min(...s.map((q2) => q2.d));
    const span0 = Math.min(Math.max(dMax - dMin, 12), 60);
    spanS = spanS == null ? span0 : spanS + (span0 - spanS) * 0.25;
    const fi = Math.min(Math.floor(mt / pack.timing.dt_sec), pack.timing.frames - 1);
    const ln = s.map((_, i) => lanes[i][fi]), lo = Math.min(...ln), hi = Math.max(...ln), rg = Math.max(hi - lo, 4);
    if (!dp) dp = dotPos(s);
    const pre = dMax - dMin < 3;
    s.forEach((q2, i) => {
      const x = pre ? 6 + R + (pack.horses[i].draw - 1) / Math.max(s.length - 1, 1) * (W - 12 - 2 * R) : 6 + R + Math.min(dMax - q2.d, spanS) / spanS * (W - 12 - 2 * R);
      const y = R + 2 + (ln[i] - lo) / rg * (H - 2 * R - 4);
      const o = dp[i];
      dp[i] = o ? [o[0] + (x - o[0]) * 0.5, o[1] + (y - o[1]) * 0.35] : [x, y];
      dots[i].style.transform = `translate(${dp[i][0] - R}px, ${dp[i][1] - R}px)`;
      dots[i].style.zIndex = String(100 - Math.round(dMax - q2.d));
    });
  }
  let ctlTimer = 0;
  const showCtl = () => {
    stage.classList.add("show-ctl");
    clearTimeout(ctlTimer);
    ctlTimer = setTimeout(() => {
      if (ctl3d && ctl3d.isPlaying() && !dragging) stage.classList.remove("show-ctl");
    }, 2500);
  };
  stage.addEventListener("pointermove", showCtl);
  stage.addEventListener("pointerdown", showCtl);
  showCtl();
  let dragging = false;
  seek.addEventListener("pointerdown", () => {
    dragging = true;
  });
  seek.addEventListener("pointerup", () => {
    dragging = false;
  });
  const mod = await import("./scene.js?v=" + (window.UMA_V || ""));
  if (ctl3d) {
    ctl3d.dispose();
    ctl3d = null;
  }
  if (crowd) {
    crowd.dispose();
    crowd = null;
  }
  crowd = makeCrowd();
  if (hooves) {
    hooves.dispose();
    hooves = null;
  }
  hooves = makeHooves(pack.race.surface);
  const cuts3d = pack.scenes.filter((x) => x.camera !== "data_pages");
  let dur3d = cuts3d[cuts3d.length - 1].to_sec;
  ctl3d = mod.openScene(stage, pack, (S, mt, s, dMax, now) => {
    elCut.textContent = S.label;
    const ln = lines.find((x) => x.at <= now && now < x.until) || null;
    const jumped = seekJump;
    seekJump = false;
    if (ln !== subNow) {
      if (ln && !jumped && ctl3d && ctl3d.isPlaying() && curSpeed <= 1 && !spokenEarly.has(ln)) speakLine(ln);
      else if (curSpeed > 1) hushVoice();
      else if (!ln || jumped) hushVoice();
      subNow = ln;
      elSub.textContent = ln ? ln.text : "";
      elSub.parentNode.hidden = !ln;
      elSub.className = ln ? "k-" + ln.kind : "";
    }
    elRem.textContent = Math.max(0, r.distance - dMax).toFixed(0) + " m";
    {
      const f = (v) => {
        v = Math.max(0, v);
        return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, "0")}`;
      };
      const t02 = ctl3d ? ctl3d.start : 0;
      elTm.textContent = `${f(now - t02)} / ${f(dur3d - t02)}`;
    }
    elClk.textContent = mt < 60 ? mt.toFixed(1) : `${Math.floor(mt / 60)}:${(mt % 60).toFixed(1).padStart(4, "0")}`;
    elLine.parentNode.style.visibility = now < 0 ? "hidden" : "";
    if (lineupK++ % 3 === 0) drawLineup(s, mt);
    const ord = s.map((q2, i) => [q2.d, pack.horses[i]]).sort((a, b) => b[0] - a[0]).slice(0, 6);
    elOrd.innerHTML = ord.map(([, h]) => {
      const c = h.waku_color;
      return `<div><span style="background:${c.bg};color:${c.fg}">${h.draw}</span>${esc(h.name)}</div>`;
    }).join("");
    const t0 = ctl3d ? ctl3d.start : 0;
    if (!dragging && dur3d) seek.value = Math.round((now - t0) / (dur3d - t0) * 1e3);
    seek.style.setProperty("--p", seek.value / 10 + "%");
    const t0b = ctl3d ? ctl3d.start : -16;
    bStart.hidden = !(ctl3d && now < ctl3d.cardEnd);
    {
      const hk = ln && ln.hl ? ln.hl.join(",") : "";
      if (hk !== hlNow) {
        hlNow = hk;
        bStart.querySelectorAll("tr[data-d]").forEach((tr) => tr.classList.toggle("hl", !!ln && !!ln.hl && ln.hl.includes(+tr.dataset.d)));
      }
    }
    bEnd.hidden = !(ctl3d && now >= ctl3d.raceEnd + 0.5);
    if (!fanDone && fanBuf && crowdOn && ctl3d && ctl3d.isPlaying() && now > -12.5 && now < -9) {
      fanDone = true;
      fanSrc = actx.createBufferSource();
      fanSrc.buffer = fanBuf;
      const g = actx.createGain();
      g.gain.value = 0.8;
      fanSrc.connect(g).connect(actx.destination);
      fanSrc.start();
      if (crowd) crowd.duck(true);
      setTimeout(() => {
        if (crowd) crowd.duck(false);
      }, fanBuf.duration * 1e3);
    }
    if (now < -13) fanDone = false;
    if (crowd) crowd.set(ctl3d && ctl3d.isPlaying() && !ctl3d.atEnd() ? crowdLevel(pack, S, mt, dMax) : 0);
    if (hooves && ctl3d) hooves.update(s, ctl3d.camInfo(), ctl3d.isPlaying() && !ctl3d.atEnd() && S.key !== "replay", curSpeed);
  }, (credit) => {
    credits.bg = "コースは架空です（熊本の実景に重ねた見立て）。" + credit;
    showCredit();
  });
  dur3d = ctl3d.duration;
  credits.horse = mod.CREDIT_REAL + "／" + mod.CREDIT_RIDER + (STATIC ? "／歓声：Crowd Cheer, FoolBoyMedia（Freesound、CC0）" : "／遠景（山並み・街並み・城）の絵：MiniMax H3 で生成");
  showCredit();
  const pp = view.querySelector("#pp");
  pp.onclick = () => {
    const on = ctl3d.toggle();
    pp.innerHTML = PP_ICON(on);
    if (!on) hushVoice();
    showCtl();
  };
  if (voiceReady) {
    ctl3d.toggle();
    pp.innerHTML = PP_ICON(false);
    voiceReady.then(() => {
      if (ctl3d && !ctl3d.isPlaying() && ctl3d.getTime() <= ctl3d.start + 0.1) {
        ctl3d.toggle();
        pp.innerHTML = PP_ICON(true);
      }
    });
  }
  const speeds = [1, 2, 4, 0.35];
  let si = 0;
  const sp = view.querySelector("#sp");
  sp.onclick = () => {
    si = (si + 1) % speeds.length;
    ctl3d.setSpeed(speeds[si]);
    curSpeed = speeds[si];
    sp.textContent = "×" + speeds[si];
  };
  seek.oninput = () => (seekJump = true) && ctl3d.setTime(ctl3d.start + seek.value / 1e3 * (ctl3d.duration - ctl3d.start));
  view.querySelector("#again").onclick = () => {
    unlockAudio();
    view3D(id, Math.floor(Math.random() * 1e9));
  };
  pp.innerHTML = PP_ICON(true);
  const snd = view.querySelector("#snd");
  snd.onclick = () => {
    unlockAudio();
    if (!crowd) crowd = makeCrowd();
    crowdOn = !crowdOn;
    try {
      localStorage.setItem("uma.crowd", crowdOn ? "on" : "off");
    } catch {
    }
    snd.innerHTML = SND_ICON(crowdOn);
    if (!crowdOn) hushVoice();
    if (crowd) crowd.refresh();
  };
}
let nSims = 5e3;
async function viewSim(id) {
  busy(`${nSims.toLocaleString()} 回ぶん走らせています…`);
  const d = await api(`/api/race/${id}/simulate?n=${nSims}`);
  const r = d.race;
  head("シミュレーション結果", `${r.course}${r.race_no}R・${d.n_sims.toLocaleString()}回試走`);
  const done = d.results.some((x) => x.finish);
  const max = Math.max(...d.results.map((x) => x.win), 1);
  const cards = d.results.map((x, i) => {
    const dist = x.dist.slice(0, 12);
    const dmax = Math.max(...dist, 1);
    return `<div class="res ${i < 3 ? "top" + (i + 1) : ""}">
      <div class="hd"><div class="rk">${i + 1}</div>
        <div class="nm"><button class="hlink" data-horse="${x.horse_id}">${esc(x.name)}</button></div>
        <div class="pct">${x.win}%</div></div>
      <div class="bar"><i style="width:${(x.win / max * 100).toFixed(1)}%"></i></div>
      <div class="meta"><span>${x.draw}番</span><span>${esc(x.jockey)}</span>
        <span>単勝 ${x.odds}（${x.pop}人気）</span>
        <span>期待値 ${x.ev != null ? x.ev.toFixed(2) : "—"}</span>
        ${done ? `<span>結果 ${fin(x.finish)}着</span>` : ""}</div>
      <div class="sub3"><span>連対 ${x.top2}%</span><span>複勝 ${x.top3}%</span>
        <span>平均着順 ${x.mean_pos}</span><span>実績 ${x.n_past}走</span></div>
      <div class="distwrap"><div class="dist">${dist.map((v, k) => `<i style="height:${Math.max(1.5, v / dmax * 34).toFixed(1)}px" title="${k + 1}着 ${v}%"></i>`).join("")}</div>
        <div class="distax"><span>1着 ${x.dist[0]}%</span><span>着順の出やすさ</span><span>${dist.length}着</span></div></div>
      <button class="tog" data-w="${i}">予測の内訳をみる ▾</button>
      <div class="why" id="why${i}">${x.why.map(
      (w) => `<div><span>${esc(w.k)}</span><b class="${w.v >= 0 ? "p" : "m"}">${w.v >= 0 ? "+" : ""}${w.v.toFixed(2)}</b></div>`
    ).join("")}<div><span>実力の推定値／当日のブレ幅</span><b>${x.rating} / ±${x.sigma}</b></div></div>
    </div>`;
  }).join("");
  view.innerHTML = `
    <div class="warnbox"><b>予測は外れます。</b>下の確率はこの合成データ上での試算で、
      いちばん上の馬が来ない回のほうが多いです。馬券の購入を勧めるものではありません。</div>
    <div class="card"><div class="seg">
      ${(STATIC ? [5e3] : [1e3, 5e3, 2e4]).map((n) => `<button data-n="${n}" class="${n === nSims ? "on" : ""}">${n.toLocaleString()}回</button>`).join("")}
    </div></div>
    ${STATIC && !d.race.is_today ? "" : '<button class="btn sec" id="to3d">🏇 この予測で1回走らせて見る（3D）</button>'}
    <div class="card">${cards}</div>
    <div class="card"><div class="note">
      各馬の「実力の推定値」に当日のブレを足して<b>${d.n_sims.toLocaleString()}回</b>走らせ、
      着順を数えたものです。棒グラフは1着〜12着の出やすさ。
      実力は<b>過去の出走記録だけ</b>から推定していて、オッズは見ていません
      （期待値の計算にだけ使っています）。
    </div></div>`;
  if (view.querySelector("#to3d")) view.querySelector("#to3d").onclick = () => {
    unlockAudio();
    go(() => view3D(id));
  };
  view.querySelectorAll("[data-n]").forEach((b) => b.onclick = () => {
    nSims = +b.dataset.n;
    viewSim(id);
  });
  view.querySelectorAll("[data-w]").forEach((b) => b.onclick = () => {
    const el = view.querySelector("#why" + b.dataset.w);
    el.classList.toggle("on");
    b.textContent = el.classList.contains("on") ? "内訳を閉じる ▴" : "予測の内訳をみる ▾";
  });
  view.querySelectorAll("[data-horse]").forEach((b) => b.onclick = () => go(() => viewHorse(+b.dataset.horse)));
}
let hq = "", hsort = "wins";
async function viewHorses() {
  head("馬", "合成データ上の登録馬");
  const draw = async () => {
    const list = view.querySelector("#hl");
    list.innerHTML = '<div class="loading">検索中…</div>';
    const hs = await api(`/api/horses?q=${encodeURIComponent(hq)}&sort=${hsort}&limit=60`);
    list.innerHTML = hs.length ? `<div class="card"><div class="rowlist">` + hs.map((h) => `
      <button class="row" data-horse="${h.id}">
        <div class="main"><b>${esc(h.name)}</b>
          <small>${esc(h.sex)}${h.age}・${esc(h.style)}・${esc(h.trainer || "")}</small></div>
        <div class="right">${h.starts}戦${h.wins}勝<br><small>勝率 ${h.win_rate ?? 0}%</small></div>
        <div class="chev">›</div></button>`).join("") + "</div></div>" : '<div class="empty">見つかりませんでした</div>';
    list.querySelectorAll("[data-horse]").forEach((b) => b.onclick = () => go(() => viewHorse(+b.dataset.horse)));
  };
  view.innerHTML = `
    <input type="search" id="q" placeholder="馬名で検索（例: サクラ）" value="${esc(hq)}">
    <div class="card"><div class="seg">
      ${[["wins", "勝ち数"], ["rate", "勝率"], ["starts", "出走数"], ["name", "名前"]].map(([k, v]) => `<button data-sort="${k}" class="${k === hsort ? "on" : ""}">${v}</button>`).join("")}
    </div></div><div id="hl"></div>`;
  let t;
  view.querySelector("#q").oninput = (e) => {
    hq = e.target.value;
    clearTimeout(t);
    t = setTimeout(draw, 250);
  };
  view.querySelectorAll("[data-sort]").forEach((b) => b.onclick = () => {
    hsort = b.dataset.sort;
    view.querySelectorAll("[data-sort]").forEach((x) => x.classList.toggle("on", x === b));
    draw();
  });
  draw();
}
async function viewHorse(id) {
  busy();
  const d = await api("/api/horse/" + id);
  const h = d.horse, a = d.agg;
  head(h.name, `${h.sex}${h.age}・${h.style}・${h.trainer || ""}`);
  const grp = (t, rows) => `<div class="card"><h2>${t}</h2><div class="scroll"><table>
    <tr><th>区分</th><th>出走</th><th>勝</th><th>複勝</th><th>勝率</th></tr>
    ${rows.map((g) => `<tr><td>${esc(g.k)}</td><td class="num">${g.starts}</td>
      <td class="num">${g.wins}</td><td class="num">${g.top3}</td>
      <td class="num">${g.starts ? (100 * g.wins / g.starts).toFixed(0) : 0}%</td></tr>`).join("")}
    </table></div></div>`;
  view.innerHTML = `
    <div class="card"><div class="stat4">
      <div><b>${a.starts}</b><small>出走</small></div>
      <div><b class="f1">${a.wins}</b><small>1着</small></div>
      <div><b>${a.win_rate}%</b><small>勝率</small></div>
      <div><b>${a.top3_rate}%</b><small>複勝率</small></div>
    </div><dl class="kv">
      <dt>生年</dt><dd>${h.birth_year}年</dd>
      <dt>脚質</dt><dd>${esc(h.style)}</dd>
      <dt>着度数</dt><dd>${a.wins}-${a.second}-${a.third}-${a.starts - a.wins - a.second - a.third}</dd>
    </dl></div>
    ${grp("馬場別", d.by_surface)}
    ${grp("距離別", d.by_distance.map((x) => ({ ...x, k: x.k + "m" })))}
    ${grp("競馬場別", d.by_course.slice(0, 8))}
    <div class="card"><h2>出走履歴（${d.runs.length}走）</h2><div class="scroll"><table>
      <tr><th>日付</th><th>レース</th><th>着</th><th>人気</th><th>単勝</th><th>騎手</th><th>タイム</th></tr>
      ${d.runs.map((x) => `<tr>
        <td><button class="hlink" data-race="${x.race_id}">${esc(x.date)}</button></td>
        <td>${esc(x.course)}${esc(x.surface)}${x.distance}<br><small style="color:var(--dim)">${esc(x.grade)}・${x.n}頭</small></td>
        <td class="num">${x.is_today ? '<span style="color:var(--accent2)">出走予定</span>' : fin(x.finish)}</td>
        <td class="num">${x.pop}</td><td class="num">${x.odds}</td>
        <td>${esc(x.jockey || "")}</td><td class="num">${x.time ?? "—"}</td></tr>`).join("")}
      </table></div></div>`;
  view.querySelectorAll("[data-race]").forEach((b) => b.onclick = () => go(() => viewRace(+b.dataset.race)));
}
async function viewJockeys() {
  head("騎手", "合成データ上の勝率順");
  busy();
  const js = await api("/api/jockeys?limit=40");
  view.innerHTML = `<div class="card"><div class="scroll"><table>
    <tr><th>#</th><th>騎手</th><th>騎乗</th><th>勝</th><th>複勝</th><th>勝率</th></tr>
    ${js.map((j, i) => `<tr><td class="num">${i + 1}</td><td>${esc(j.name)}</td>
      <td class="num">${j.starts}</td><td class="num">${j.wins}</td>
      <td class="num">${j.top3}</td><td class="num"><b>${j.win_rate ?? 0}%</b></td></tr>`).join("")}
    </table></div></div>
    <div class="card"><div class="note">予測では、この勝率を全体平均に寄せて（少ない騎乗数で
      極端な数字が出ないように）使っています。</div></div>`;
}
async function viewAbout() {
  head("情報", "このアプリについて");
  busy();
  const m = META || (META = await api("/api/meta"));
  const b = m.backtest;
  view.innerHTML = `
    <div class="warnbox"><b>データはすべて架空です。</b><br>
      馬名・騎手名・競馬場名・レース結果・オッズのいずれも、プログラムで作った合成データです。
      実在の競走馬、JRA・地方競馬のレースとは一切関係がありません。<br><br>
      <b>予測は外れます。</b>馬券の購入を勧めるものではありません。</div>
    <div class="card"><h2>いま入っているデータ</h2><dl class="kv">
      <dt>登録馬</dt><dd>${m.counts.horses.toLocaleString()} 頭</dd>
      <dt>騎手</dt><dd>${m.counts.jockeys} 人</dd>
      <dt>過去レース</dt><dd>${m.counts.races.toLocaleString()} 鞍</dd>
      <dt>出走記録</dt><dd>${m.counts.runs.toLocaleString()} 件</dd>
      <dt>期間</dt><dd>${esc(m.period.f)} 〜 ${esc(m.period.t)}</dd>
      <dt>開催予定</dt><dd>${m.counts.today} 鞍</dd>
    </dl></div>
    ${b ? `<div class="card"><h2>この予測はどのくらい当たるのか</h2><dl class="kv">
      <dt>検証したレース</dt><dd>${b.races} 鞍</dd>
      <dt>本命（勝率1位）の的中率</dt><dd><b>${b.top_pick_hit}%</b></dd>
      <dt>勝ち馬が予測上位3頭に入った率</dt><dd>${b.winner_in_top3}%</dd>
      <dt>参考：1番人気の的中率</dt><dd>${b.market_fav_hit}%</dd>
      <dt>本命を単勝で買い続けた回収率</dt><dd>${b.win_payout_rate}%</dd>
    </dl><div class="note">
      本命の的中率は<b>1番人気より低い</b>のが現状です。つまり、この予測は
      オッズを見るより当たっていません。<b>5回に4回は本命が来ません。</b>
    </div></div>` : ""}
    <div class="card"><h2>どう予測しているか</h2><div class="note">
      ① 各馬の過去の着順を、頭数・距離の近さ・馬場・レースの格・新しさで重み付けして
      「実力の推定値」を出します。騎手の勝率、斤量、枠順、脚質と距離の相性、出走間隔も足します。<br>
      ② 実績の少ない馬は平均に寄せ、成績のばらつきが大きい馬は「当日のブレ幅」を大きくします。<br>
      ③ その実力にブレを足して<b>何千回もレースを走らせ</b>、着順を数えたものが確率です。<br><br>
      オッズは予測には使っていません（期待値を出すときだけ使います）。
      いまはヒューリスティック（手で決めた重み）で、機械学習に差し替えられる作りにしてあります。
    </div></div>
    <div class="card"><h2>3D の背景と素材</h2><div class="note">
      3D の競馬場は<b>架空</b>です。熊本の実景（地形・航空写真・建物）に重ねた見立てで、
      コースから熊本城が見えるよう、間の建物を取り除き、向きも合わせています（実際の街からは天守は見えません）。<br><br>
      航空写真・標高：地理院タイル（全国最新写真（シームレス）・標高タイル）を加工して作成（国土地理院）<br>
      建物：3D都市モデル（Project PLATEAU）熊本市（2022年度）（国土交通省）を加工して作成<br>
      空・芝・砂・コンクリートの写真：Poly Haven、ambientCG（CC0）<br>
      ${STATIC ? "実況の声：お使いの端末の読み上げ機能<br>歓声：「Crowd Cheer」FoolBoyMedia（Freesound、CC0）<br>" : "実況の声：お使いの端末の読み上げ機能。日本語の男性の声が無い端末では Style-Bert-VITS2／JVNV コーパスで学習したモデル jvnv-M2-jp（CC BY-SA 4.0）<br>"}
      騎手の3Dモデル：「Nathan Animated 003」Renderpeople（Sketchfab、CC BY 4.0）を加工<br>
      馬の3Dモデル：「Horse」MAXDESIGN-3D（Sketchfab、CC BY 4.0、https://sketchfab.com/3d-models/horse-6d0f9c1ce82f41048a282b6c47a50684）を加工
    </div></div>
    <div class="card"><h2>実データについて</h2><div class="note">
      JRA・netkeiba などは利用規約で機械での自動取得を認めていません。
      このアプリは<b>合成データだけ</b>で動いていて、実データの取得は行っていません。
      提供元が決まれば、データ層を差し替えるだけで同じ画面が使えます。
    </div></div>`;
}
api("/api/meta").then((m) => {
  META = m;
}).catch(() => {
});
{
  const P = new URLSearchParams(location.search), ev = P.get("ev");
  if (typeof viewVote === "function" && ev && /^[A-Za-z0-9]{4,12}$/.test(ev)) go(() => viewVote(ev));
  else if (typeof viewHost === "function" && P.has("host")) go(viewHost);
  else go(viewRaces);
}
