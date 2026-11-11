import * as THREE from "./vendor/three.module.min.js";
import { loadKumamoto } from "./kumamoto.js?v=9";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import * as SkeletonUtils from "./vendor/SkeletonUtils.js";
import { makeRider, CREDIT_RIDER } from "./jockey.js?v=23";
export { CREDIT_RIDER };
const HMODELS = {
  real: {
    file: "horse_real.glb",
    foot: /FingerBaseTip|FootHoof_Tip/,
    back: /^Spine1_03$/,
    head: /^Head_010$/,
    tail: /^Tail_043$/,
    tint: "mul"
  }
};
export const CREDIT_REAL = "馬の3Dモデル：「Horse」MAXDESIGN-3D（Sketchfab、CC BY 4.0）を加工";
const HCACHE = {};
function loadHorse(key) {
  if (!HCACHE[key]) HCACHE[key] = new GLTFLoader().loadAsync("static/assets/horse/" + HMODELS[key].file + "?v=3");
  return HCACHE[key];
}
const COAT_MODEL = [5911072, 3809814, 8012836, 1972242, 9210502, 4860442];
const COAT_MUL = [[1, 1, 1], [0.62, 0.58, 0.56], [1.18, 0.92, 0.72], [0.34, 0.32, 0.32], [0.95, 0.95, 0.97], [0.8, 0.72, 0.66]];
const RAD = Math.PI / 180;
const hex = (s) => parseInt(s.slice(1), 16);
const med = (a) => {
  const b = [...a].sort((x, y) => x - y);
  return b[b.length >> 1];
};
class Course {
  constructor(geo) {
    const c = geo.centerline;
    this.pts = c.points;
    this.step = c.step_m;
    this.C = geo.circuit_m;
    this.halfW = geo.lane_width_m;
  }
  at(p, off = 0) {
    const C = this.C;
    p = (p % C + C) % C;
    const f = p / this.step;
    let i = Math.min(Math.floor(f), this.pts.length - 2);
    const a = f - i, A = this.pts[i], B = this.pts[i + 1];
    return [
      A[0] + (B[0] - A[0]) * a + (A[4] + (B[4] - A[4]) * a) * off,
      A[1] + (B[1] - A[1]) * a + (A[5] + (B[5] - A[5]) * a) * off
    ];
  }
  v3(p, off = 0, h = 0) {
    const [x, y] = this.at(p, off);
    return new THREE.Vector3(x, h, y);
  }
}
function ribbon(course, inner, outer, step, mat, uScale, from, to, yIn, yOut) {
  const pos = [], uv = [], idx = [];
  const a0 = from == null ? 0 : from, a1 = to == null ? course.C : to;
  const n = Math.max(2, Math.ceil((a1 - a0) / step));
  for (let i = 0; i <= n; i++) {
    const p = a0 + (a1 - a0) * i / n;
    const [ix, iy] = course.at(p, inner), [ox, oy] = course.at(p, outer);
    pos.push(ix, yIn || 0, iy, ox, yOut == null ? yIn || 0 : yOut, oy);
    uv.push(p / (uScale || 40), 0, p / (uScale || 40), 1);
    if (i < n) {
      const b = i * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}
const TEXL = new THREE.TextureLoader();
const TEXC = {};
function photoTex(name, rep, srgb = true) {
  const key = name + rep;
  if (TEXC[key]) return TEXC[key];
  const t = TEXL.load("static/assets/tex/" + name + ".jpg?v=1");
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (rep) t.repeat.set(rep[0], rep[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return TEXC[key] = t;
}
function photoMat(kind, rep, tint, extra) {
  const m = new THREE.MeshStandardMaterial(Object.assign({
    map: photoTex(kind + "_diff", rep),
    normalMap: photoTex(kind + "_nor", rep, false),
    normalScale: new THREE.Vector2(0.8, 0.8),
    color: tint,
    roughness: 0.95,
    metalness: 0
  }, extra || {}));
  const stripes = kind === "grass" ? 1 : 0;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;").replace(
      "#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;"
    );
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
varying vec3 vWP;
float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y); }`).replace("#include <map_fragment>", `#include <map_fragment>
${kind === "sand" ? `
{ vec2 x = vWP.xz / 6.0;
  float k = vn(vWP.xz / 17.0) * 8.0, ki = floor(k), kf = fract(k);
  vec2 oa = sin(vec2(3.0, 7.0) * (ki + 0.0)), ob = sin(vec2(3.0, 7.0) * (ki + 1.0));
  vec4 ca = texture2D(map, x + oa), cb = texture2D(map, x + ob);
  float bl = smoothstep(0.2, 0.8, kf - 0.1 * dot(ca.rgb - cb.rgb, vec3(1.0)));
  vec3 base = mix(ca.rgb, cb.rgb, bl);
  diffuseColor.rgb = base * diffuse;
  float d = vn(vWP.xz / 3.1) * 0.5 + vn(vWP.xz / 1.3) * 0.5;
  diffuseColor.rgb *= 0.92 + 0.16 * d; }` : ""}
{ float n = vn(vWP.xz / 38.0) * 0.6 + vn(vWP.xz / 9.0) * 0.4;
  diffuseColor.rgb *= 0.84 + 0.30 * n;
  ${stripes ? "float s = step(0.5, fract((vWP.x * 0.8 + vWP.z * 0.6) / 18.0)); diffuseColor.rgb *= 0.94 + 0.10 * s;" : ""} }`);
  };
  m.customProgramCacheKey = () => "photo-" + kind;
  return m;
}
function crowdTex() {
  const W = 1024, H = 512, ROWS = 20, c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d");
  const CLOTH = [
    "#1f2a44",
    "#e9e7e1",
    "#6b6f76",
    "#c9b99a",
    "#22252a",
    "#3f5f7f",
    "#8a8f96",
    "#5a4636",
    "#b33a3a",
    "#d6b33f",
    "#2f6b4f",
    "#f2f2f2"
  ];
  const SKIN = ["#e0bb98", "#d2a57f", "#c08f6a"], HAIR = ["#1d1a18", "#2a2420", "#4a3a2c", "#8a8a8a"];
  x.fillStyle = "#6d737b";
  x.fillRect(0, 0, W, H);
  const rh = H / ROWS;
  for (let r = 0; r < ROWS; r++) {
    const y0 = r * rh;
    x.fillStyle = "#2f5f9e";
    x.fillRect(0, y0 + rh * 0.55, W, rh * 0.3);
    x.fillStyle = "rgba(0,0,0,.25)";
    x.fillRect(0, y0 + rh * 0.92, W, rh * 0.08);
    for (let px = Math.random() * 6; px < W; px += 9 + Math.random() * 5) {
      if (Math.random() < 0.12) continue;
      const rr = Math.random(), bw = 7 + Math.random() * 3;
      x.fillStyle = CLOTH[Math.floor(rr * rr * CLOTH.length)];
      x.beginPath();
      x.ellipse(px, y0 + rh * 0.62, bw / 2, rh * 0.3, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = Math.random() < 0.3 ? HAIR[Math.floor(Math.random() * HAIR.length)] : SKIN[Math.floor(Math.random() * 3)];
      x.beginPath();
      x.arc(px, y0 + rh * 0.3, rh * 0.16, 0, Math.PI * 2);
      x.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const HG = {};
function horseGeo() {
  if (HG.body) return HG;
  HG.body = new THREE.CapsuleGeometry(0.4, 1.28, 6, 14);
  HG.body.rotateZ(Math.PI / 2);
  HG.body.scale(1, 1.02, 0.8);
  HG.chest = new THREE.SphereGeometry(0.4, 14, 10);
  HG.chest.scale(0.9, 1, 0.82);
  HG.rump = new THREE.SphereGeometry(0.44, 14, 10);
  HG.rump.scale(0.95, 1, 0.86);
  HG.neck = new THREE.CylinderGeometry(0.17, 0.3, 0.78, 12);
  HG.head = new THREE.CapsuleGeometry(0.135, 0.3, 4, 10);
  HG.head.rotateZ(Math.PI / 2);
  HG.muzzle = new THREE.SphereGeometry(0.115, 10, 8);
  HG.ear = new THREE.ConeGeometry(0.045, 0.14, 6);
  HG.upper = new THREE.CylinderGeometry(0.095, 0.07, 0.56, 8);
  HG.lower = new THREE.CylinderGeometry(0.058, 0.042, 0.54, 7);
  HG.hoof = new THREE.CylinderGeometry(0.062, 0.07, 0.11, 8);
  HG.tail = new THREE.CylinderGeometry(0.075, 0.02, 0.72, 7);
  HG.torso = new THREE.CapsuleGeometry(0.17, 0.26, 4, 10);
  HG.helm = new THREE.SphereGeometry(0.125, 12, 10);
  HG.limb = new THREE.CylinderGeometry(0.052, 0.045, 0.42, 6);
  HG.cloth = new THREE.PlaneGeometry(0.44, 0.34);
  return HG;
}
function clothTex(bg, fg, num) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 96;
  const x = c.getContext("2d");
  x.fillStyle = bg;
  x.fillRect(0, 0, 128, 96);
  x.fillStyle = fg;
  x.font = "bold 74px system-ui,sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(String(num), 64, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const COATS = [4862242, 3548186, 6045736, 2760473, 7031342, 9079434];
function horseMesh(col, num, fg, seed) {
  const G = horseGeo(), g = new THREE.Group();
  const coat = COATS[seed % COATS.length];
  const mCoat = new THREE.MeshStandardMaterial({ color: coat, roughness: 0.82, metalness: 0.02 });
  const mDark = new THREE.MeshStandardMaterial({ color: 1511693, roughness: 0.9 });
  const mSilk = new THREE.MeshStandardMaterial({ color: col, roughness: 0.62 });
  const mSkin = new THREE.MeshStandardMaterial({ color: 14201998, roughness: 0.75 });
  g.bodyParts = [];
  const put = (geo, m, x, y, z, rx, ry, rz, p) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    if (rx || ry || rz) o.rotation.set(rx || 0, ry || 0, rz || 0);
    o.castShadow = true;
    (p || g).add(o);
    if (m === mCoat || m === mDark) g.bodyParts.push(o);
    return o;
  };
  const trunk = new THREE.Group();
  g.add(trunk);
  g.trunk = trunk;
  put(G.body, mCoat, -0.05, 1.16, 0, 0, 0, 0, trunk);
  put(G.chest, mCoat, 0.72, 1.18, 0, 0, 0, 0, trunk);
  put(G.rump, mCoat, -0.8, 1.16, 0, 0, 0, 0, trunk);
  const neck = new THREE.Group();
  neck.position.set(0.86, 1.34, 0);
  trunk.add(neck);
  neck.rotation.z = -0.62;
  put(G.neck, mCoat, 0, 0.36, 0, 0, 0, 0, neck);
  const head = new THREE.Group();
  head.position.set(0, 0.74, 0);
  neck.add(head);
  head.rotation.z = 0.95;
  put(G.head, mCoat, 0.16, 0, 0, 0, 0, 0, head);
  put(G.muzzle, mDark, 0.35, -0.02, 0, 0, 0, 0, head);
  put(G.ear, mCoat, -0.05, 0.14, 0.07, 0.25, 0, -0.1, head);
  put(G.ear, mCoat, -0.05, 0.14, -0.07, -0.25, 0, -0.1, head);
  for (let i = 0; i < 5; i++)
    put(new THREE.BoxGeometry(0.05, 0.16, 0.06), mDark, 0, 0.13 + i * 0.14, 0, 0, 0, 0.2, neck);
  g.legs = [];
  const mount = [[0.66, -0.24, 1], [0.66, 0.24, 1], [-0.76, -0.25, 0], [-0.76, 0.25, 0]];
  mount.forEach(([x, z, front]) => {
    const hip = new THREE.Group();
    hip.position.set(x, 1, z);
    trunk.add(hip);
    put(G.upper, mCoat, 0, -0.28, 0, 0, 0, 0, hip);
    const knee = new THREE.Group();
    knee.position.set(0, -0.56, 0);
    hip.add(knee);
    put(G.lower, mCoat, 0, -0.27, 0, 0, 0, 0, knee);
    const hoof = new THREE.Group();
    hoof.position.set(0, -0.54, 0);
    knee.add(hoof);
    put(G.hoof, mDark, 0, -0.05, 0, 0, 0, 0, hoof);
    g.legs.push({ hip, knee, front });
  });
  const tail = new THREE.Group();
  tail.position.set(-1.12, 1.3, 0);
  trunk.add(tail);
  tail.rotation.z = 1.05;
  put(G.tail, mDark, 0, -0.34, 0, 0, 0, 0, tail);
  g.tail = tail;
  const j = new THREE.Group();
  j.position.set(-0.06, 1.56, 0);
  trunk.add(j);
  g.jockey = j;
  const torso = put(G.torso, mSilk, 0, 0.16, 0, 0, 0, -0.55, j);
  put(G.helm, mSilk, 0.3, 0.4, 0, 0, 0, 0, j);
  put(new THREE.BoxGeometry(0.16, 0.03, 0.2), mSilk, 0.4, 0.37, 0, 0, 0, 0.1, j);
  put(G.limb, mSkin, 0.3, 0.16, 0.14, 0, 0, -1.15, j);
  put(G.limb, mSkin, 0.3, 0.16, -0.14, 0, 0, -1.15, j);
  put(G.limb, mSilk, -0.16, -0.02, 0.18, 0, 0, 0.5, j);
  put(G.limb, mSilk, -0.16, -0.02, -0.18, 0, 0, 0.5, j);
  const tex = clothTex("#f4f4f2", "#141414", num);
  const mCl = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide });
  g.cloths = [
    put(G.cloth, mCl, -0.34, 1.2, 0.345, 0, 0, 0, trunk),
    put(G.cloth, mCl, -0.34, 1.2, -0.345, 0, Math.PI, 0, trunk)
  ];
  return g;
}
const STRIDE = 7.2;
const LEGLEN = 1.15;
const REACH = 0.88;
const ST = 2 * REACH / STRIDE;
const KSW = REACH / LEGLEN;
const GAIT = [
  { off: 0, knee: 1.05 },
  { off: 0.12, knee: 1.05 },
  { off: 0.48, knee: 1.3 },
  { off: 0.6, knee: 1.3 }
];
function gait(g, phase, bank, amp = 1, idle = 0) {
  g.legs.forEach((L, i) => {
    const G2 = GAIT[i === 0 ? 2 : i === 1 ? 3 : i === 2 ? 0 : 1];
    const u = ((phase + G2.off) % 1 + 1) % 1;
    let hip, knee;
    if (u < ST) {
      const s = u / ST;
      hip = Math.asin(KSW * (1 - 2 * s));
      knee = -0.05;
    } else {
      const s = (u - ST) / (1 - ST);
      const e = s * s * (3 - 2 * s);
      hip = Math.asin(KSW * (2 * e - 1));
      knee = -Math.sin(Math.PI * s) * G2.knee;
    }
    L.hip.rotation.z = hip * amp;
    L.knee.rotation.z = knee * amp;
  });
  const t = g.trunk;
  t.position.y = Math.sin((phase + 0.4) * 2 * Math.PI) * 0.1 * amp;
  t.rotation.z = Math.sin((phase + 0.62) * 2 * Math.PI) * 0.075 * amp;
  t.rotation.x = bank;
  g.tail.rotation.x = Math.sin(phase * 2 * Math.PI) * 0.22 * amp + Math.sin(idle * 2.3) * 0.18 * (1 - amp);
  g.trunk.children[3] && (g.trunk.children[3].rotation.z = -0.62 + Math.sin(idle * 1.1) * 0.05 * (1 - amp));
  g.jockey.position.y = 1.56 + Math.sin((phase + 0.52) * 2 * Math.PI) * 0.03 * amp;
}
function startGate(course, hs, startP, laneW) {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 3112271, roughness: 0.6, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 14278114, roughness: 0.45, metalness: 0.6 });
  const pad = new THREE.MeshStandardMaterial({ color: 1989178, roughness: 0.8 });
  const offs = hs.map((h) => h.gate_offset_m).sort((a, b) => a - b);
  const lo = offs[0] - laneW / 2, hi = offs[offs.length - 1] + laneW / 2;
  const FRONT = 1.7, BACK = -1.7, H = 2.7;
  const at = (dd, off, y) => course.v3(startP + dd, off, y);
  const hd = (() => {
    const a = course.v3(startP, 0), b = course.v3(startP + 1, 0);
    return Math.atan2(-(b.z - a.z), b.x - a.x);
  })();
  const box = (w, h, d, m, p) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.copy(p);
    o.rotation.y = hd;
    o.castShadow = true;
    g.add(o);
    return o;
  };
  for (let k = 0; k <= offs.length; k++) {
    const off = k === 0 ? lo : k === offs.length ? hi : (offs[k - 1] + offs[k]) / 2;
    box(FRONT - BACK, 1.5, 0.08, pad, at(0, off, 0.95));
    for (const dd of [FRONT, BACK]) box(0.14, H, 0.14, frame, at(dd, off, H / 2));
  }
  const span = hi - lo, mid = (hi + lo) / 2;
  for (const dd of [FRONT, BACK]) box(0.22, 0.34, span + 0.3, frame, at(dd, mid, H));
  box(FRONT - BACK + 0.4, 0.08, span + 0.3, frame, at(0, mid, H + 0.2));
  const doors = [];
  for (const off of offs) {
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.copy(at(FRONT + 0.05, off + side * laneW / 2, 0.35));
      hinge.rotation.y = hd;
      g.add(hinge);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.5, laneW / 2 - 0.04), steel);
      leaf.position.set(0, 0.75, -side * (laneW / 4));
      leaf.castShadow = true;
      hinge.add(leaf);
      doors.push({ hinge, side, base: hd });
    }
  }
  g.open = (f) => {
    for (const d of doors) d.hinge.rotation.y = d.base - d.side * f * 1.45;
  };
  g.open(0);
  return g;
}
function castle(item) {
  const g = new THREE.Group();
  const [x, y, z0] = item.at, [w, , h] = item.size;
  const roof = new THREE.MeshLambertMaterial({ color: 3817030 });
  const white = new THREE.MeshLambertMaterial({ color: 15658212 });
  const dark = new THREE.MeshLambertMaterial({ color: 2894380 });
  const stone = new THREE.MeshLambertMaterial({ color: 8420468 });
  const add = (ww, hh, yy, m) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, ww), m);
    b.position.set(0, yy, 0);
    g.add(b);
  };
  add(w * 1.3, h * 0.27, h * 0.135, stone);
  const tiers = [[0.27, 0.49, 0.8], [0.49, 0.7, 0.64], [0.7, 0.88, 0.48]];
  for (const [lo, hi, fw] of tiers) {
    const wallTop = hi - (hi - lo) * 0.22;
    add(w * fw, h * (wallTop - lo) * 0.52, h * (lo + (wallTop - lo) * 0.26), dark);
    add(w * fw, h * (wallTop - lo) * 0.48, h * (lo + (wallTop - lo) * 0.76), white);
    add(w * fw * 1.42, h * 0.035, h * (wallTop + (hi - wallTop) * 0.5), roof);
  }
  add(w * 0.34, h * 0.075, h * 0.918, white);
  add(w * 0.62, h * 0.03, h * 0.962, roof);
  g.position.set(x, z0, y);
  return g;
}
export function openScene(host, pack, hud, onCredit) {
  const geo = pack.geometry, hs = pack.horses, n = hs.length;
  const course = new Course(geo);
  const halfW = (n + 1) / 2 * geo.lane_width_m;
  const L = pack.race.distance, startP = pack.start_p, goalP = startP + L;
  const dt = pack.timing.dt_sec, frames = pack.timing.frames;
  const dur = pack.timing.duration_sec;
  const total = pack.timing.total_sec || dur;
  const cuts = pack.scenes.filter((s) => s.camera !== "data_pages");
  const endT = cuts[cuts.length - 1].to_sec + 8;
  const KUMA = !!(pack.scenery && pack.scenery.preset === "kumamoto");
  const castleIt = KUMA ? pack.scenery.items.find((i) => i.kind === "castle_main") : null;
  const AER = KUMA ? 6 : 0;
  const CLIP_PRE = 0;
  const CARD = 14, POST = 8;
  const A0 = -(10 + AER + CLIP_PRE);
  const PRE = -A0 + CARD;
  const preCut = { key: "prestart", label: "発走前", camera: "gate_wait", from_sec: -PRE, to_sec: 0 };
  const gateCut = { ...preCut, key: "gate", label: "発走", from_sec: 0, to_sec: 1.6 };
  const tLast = Math.max(...hs.map((h) => h.time_sec));
  let wireFov = 0;
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
    logarithmicDepthBuffer: KUMA
  });
  const pr = Math.min(devicePixelRatio, 1.75);
  renderer.setPixelRatio(pr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  const DOF_ON = false;
  const dof = KUMA && DOF_ON ? (() => {
    const rt = new THREE.WebGLRenderTarget(2, 2, { samples: 4, type: THREE.HalfFloatType });
    rt.depthTexture = new THREE.DepthTexture(2, 2);
    rt.depthTexture.type = THREE.UnsignedIntType;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tCol: { value: rt.texture },
        tDep: { value: rt.depthTexture },
        px: { value: new THREE.Vector2(0.5, 0.5) },
        focus: { value: 50 },
        amt: { value: 0 },
        logF: { value: 1 },
        maxPx: { value: 8 }
      },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: `uniform sampler2D tCol, tDep; uniform vec2 px; uniform float focus, amt, logF, maxPx; varying vec2 vUv;
        float coc(vec2 uv){ float z = exp2(texture2D(tDep, uv).x * logF) - 1.0; return clamp((z - focus) / z * 1.6, 0.0, 1.0) * amt; }
        void main(){
          vec4 c = texture2D(tCol, vUv); float r0 = coc(vUv);
          if (r0 > 0.03) {
            vec4 acc = c; float ws = 1.0;
            for (int i = 0; i < 20; i++) {
              float fi = float(i), rr = sqrt((fi + 0.5) / 20.0), a = fi * 2.39996;
              vec2 uv = vUv + vec2(cos(a), sin(a)) * rr * r0 * maxPx * px;
              float w = smoothstep(0.0, 0.15, coc(uv));          // 手前（ピントの合った馬）の色は混ぜない
              acc += texture2D(tCol, uv) * w; ws += w;
            }
            c = acc / ws;
          }
          gl_FragColor = c;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    const qs = new THREE.Scene();
    qs.add(quad);
    const qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return {
      setSize(w, h) {
        rt.setSize(w, h);
        mat.uniforms.px.value.set(1 / w, 1 / h);
        mat.uniforms.maxPx.value = 3 * pr;
      },
      render(cam2, focus, amt) {
        const U = mat.uniforms;
        U.focus.value = focus;
        U.amt.value = amt;
        U.logF.value = Math.log2(cam2.far + 1);
        renderer.setRenderTarget(rt);
        renderer.render(scene, cam2);
        renderer.setRenderTarget(null);
        renderer.render(qs, qc);
      }
    };
  })() : null;
  let focusD = 60;
  function draw() {
    const amt = dof && mode === "broadcast" && cam.isPerspectiveCamera && cam.position.y < 40 ? Math.min(1, Math.max(0, (24 - cam.fov) / 18)) : 0;
    if (amt > 0.02) dof.render(cam, focusD, amt);
    else renderer.render(scene, cam);
  }
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
  const scene = new THREE.Scene();
  const skyTex = TEXL.load("static/assets/tex/sky.jpg?v=1", (t2) => {
    const pm = new THREE.PMREMGenerator(renderer);
    const eq = t2.clone();
    eq.mapping = THREE.EquirectangularReflectionMapping;
    eq.repeat.x = 1;
    eq.needsUpdate = true;
    scene.environment = pm.fromEquirectangular(eq).texture;
    scene.environmentIntensity = 0.55;
    hemi.intensity = 0.45;
    pm.dispose();
  });
  skyTex.colorSpace = THREE.SRGBColorSpace;
  skyTex.wrapS = THREE.RepeatWrapping;
  skyTex.repeat.x = -1;
  const skyPhoto = new THREE.Mesh(
    new THREE.SphereGeometry(KUMA ? 18e3 : 4e3, 48, 24),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  skyPhoto.rotation.y = -112.5 * RAD;
  skyPhoto.renderOrder = -1;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(KUMA ? 18500 : 4200, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(3108800) },
        mid: { value: new THREE.Color(10405096) },
        bot: { value: new THREE.Color(14213864) }
      },
      vertexShader: "varying float h;void main(){h=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: "varying float h;uniform vec3 top,mid,bot;void main(){float y=clamp(h,-1.0,1.0);vec3 c=y>0.0?mix(mid,top,pow(y,0.65)):mix(mid,bot,pow(-y,0.4));gl_FragColor=vec4(c,1.0);}"
    })
  );
  sky.renderOrder = -2;
  scene.add(sky);
  scene.add(skyPhoto);
  scene.fog = KUMA ? new THREE.Fog(10133166, 2200, 15e3) : new THREE.Fog(10133166, 900, 3600);
  const hemi = new THREE.HemisphereLight(13624053, 4877127, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(16773336, 2.4);
  sun.position.set(-620, 640, 380);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -12e-4;
  const sc0 = sun.shadow.camera;
  sc0.left = -70;
  sc0.right = 70;
  sc0.top = 70;
  sc0.bottom = -70;
  sc0.near = 1;
  sc0.far = 1400;
  scene.add(sun);
  scene.add(sun.target);
  const fillL = new THREE.DirectionalLight(14412022, 0.5);
  fillL.position.set(520, 380, -340);
  scene.add(fillL);
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(9e3, 9e3),
    photoMat("grass", [9e3 / 8, 9e3 / 8], new THREE.Color(0.62, 0.78, 1.25))
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.06;
  grass.receiveShadow = true;
  if (!KUMA) scene.add(grass);
  else {
    const R0 = geo.turn_radius_m, outer = halfW + 95;
    const gm = photoMat("grass", [1, (R0 + outer) / 8], new THREE.Color(0.62, 0.78, 1.25));
    const gr = ribbon(course, -R0 + 0.01, outer, 6, gm, 8);
    gr.position.y = -0.04;
    scene.add(gr);
  }
  const trackW = halfW * 2 + 5;
  const surfM = pack.race.surface === "芝" ? photoMat("grass", [1, trackW / 6], new THREE.Color(0.8, 0.98, 1.05)) : photoMat("sand", [1, trackW / 6], new THREE.Color(0.92, 0.84, 0.82));
  scene.add(ribbon(course, -halfW - 2.5, halfW + 2.5, 5, surfM, 6));
  const railM = new THREE.MeshStandardMaterial({ color: 16054008, roughness: 0.35, metalness: 0.05 });
  const tubeAlong = (off, y, r, from = 0, to = course.C, step = 6) => {
    const pts = [];
    for (let p = from; p <= to + 1e-6; p += step) pts.push(course.v3(p, off, y));
    const closed = to - from >= course.C - 1e-6;
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), pts.length * 2, r, 8, closed), railM);
    tube.castShadow = true;
    scene.add(tube);
    return tube;
  };
  for (const [off, inner] of [[-halfW - 2.5, true], [halfW + 2.5, false]]) {
    const cnt = Math.ceil(course.C / 4);
    const sgn = inner ? 1 : -1;
    const postG = new THREE.CylinderGeometry(0.045, 0.055, 1.2, 8);
    const posts = new THREE.InstancedMesh(postG, railM, cnt);
    const arms = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 6), railM, cnt);
    posts.castShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < cnt; i++) {
      const p = i * 4, v = course.v3(p, off - sgn * 0.18, 0.6);
      posts.setMatrixAt(i, m4.compose(v, q, one));
      const a = course.v3(p, off - sgn * 0.18, 1.12), b = course.v3(p, off, 1.24);
      const mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a).normalize();
      arms.setMatrixAt(i, m4.compose(mid, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), one));
    }
    scene.add(posts, arms);
    tubeAlong(off, 1.24, 0.065);
    if (!inner) tubeAlong(off - 0.18, 0.62, 0.03);
  }
  if (KUMA) {
    const tTex = TEXL.load("static/assets/tree/tree_b.webp?v=1");
    tTex.colorSpace = THREE.SRGBColorSpace;
    tTex.anisotropy = 4;
    const card = new THREE.BufferGeometry();
    {
      const P = [], U = [], I = [];
      const quad = (ax, az, u0) => {
        const b = P.length / 3;
        P.push(-0.5 * ax, 0, -0.5 * az, 0.5 * ax, 0, 0.5 * az, 0.5 * ax, 1, 0.5 * az, -0.5 * ax, 1, -0.5 * az);
        U.push(u0, 0, u0 + 0.25, 0, u0 + 0.25, 1, u0, 1);
        I.push(b, b + 1, b + 2, b, b + 2, b + 3);
      };
      quad(1, 0, 0);
      quad(0, 1, 0.5);
      card.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
      card.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
      card.setIndex(I);
    }
    const mat = new THREE.MeshBasicMaterial({ map: tTex, alphaTest: 0.45, side: THREE.DoubleSide, color: 15266016 });
    const spots = [];
    let seed = 7;
    const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    const sA = goalP - 330, sB = goalP + 70;
    const inStand = (p) => {
      const u = ((p - sA) % course.C + course.C) % course.C;
      return u < sB - sA;
    };
    for (let p = 0; p < course.C; p += 2.5 + rnd() * 2.5) {
      if (inStand(p)) continue;
      for (let k = 0; k < 2; k++) {
        const tree = rnd() < 0.5;
        const off = tree ? halfW + 74 + rnd() * 18 : halfW + 68 + rnd() * 24;
        const [x, y] = course.at(p + (rnd() - 0.5) * 3, off);
        spots.push([x, y, tree ? 7 + rnd() * 7 : 1.4 + rnd() * 0.9, tree ? 1 : 2.3]);
      }
    }
    const sTex = TEXL.load("static/assets/tree/shrub.webp?v=1");
    sTex.colorSpace = THREE.SRGBColorSpace;
    sTex.anisotropy = 4;
    const sMat = new THREE.MeshBasicMaterial({ map: sTex, alphaTest: 0.4, side: THREE.DoubleSide, color: 15002844 });
    const bush = [];
    for (const sp of spots) {
      const [x, z, h] = sp;
      if (h < 3) {
        bush.push([x, z, h, 1.6]);
        sp.length = 0;
        continue;
      }
      const nB = 2 + (rnd() < 0.5 ? 1 : 0);
      for (let k = 0; k < nB; k++) {
        const a = rnd() * Math.PI * 2, r = h * (0.08 + rnd() * 0.12);
        bush.push([x + Math.cos(a) * r, z + Math.sin(a) * r, 1.1 + rnd() * 0.8, 1.3]);
      }
    }
    for (let i = spots.length - 1; i >= 0; i--) if (!spots[i].length) spots.splice(i, 1);
    {
      const bi = new THREE.InstancedMesh(card, sMat, bush.length);
      const m4b = new THREE.Matrix4(), qb = new THREE.Quaternion(), upb = new THREE.Vector3(0, 1, 0);
      bush.forEach(([x, z, h, w], i) => {
        qb.setFromAxisAngle(upb, rnd() * Math.PI);
        const H = h / 0.45;
        bi.setMatrixAt(i, m4b.compose(new THREE.Vector3(x, -0.1, z), qb, new THREE.Vector3(H * w, H, H * w)));
      });
      scene.add(bi);
    }
    const inst = new THREE.InstancedMesh(card, mat, spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    spots.forEach(([x, z, h, w], i) => {
      q.setFromAxisAngle(up, rnd() * Math.PI);
      inst.setMatrixAt(i, m4.compose(new THREE.Vector3(x, -0.2, z), q, new THREE.Vector3(h * 1.05 * w, h, h * 1.05 * w)));
    });
    scene.add(inst);
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const cx = c.getContext("2d"), gr = cx.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, "rgba(0,0,0,0.5)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = gr;
    cx.fillRect(0, 0, 64, 64);
    const blob = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
      spots.length
    );
    spots.forEach(([x, z, h, w], i) => blob.setMatrixAt(i, m4.compose(
      new THREE.Vector3(x, 0.05, z),
      q.identity(),
      new THREE.Vector3(h * 0.8 * w, 1, h * 0.8 * w)
    )));
    blob.renderOrder = 1;
    scene.add(blob);
  }
  for (const off of [-halfW - 4, halfW + 4]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.2, 0.4), railM);
    p.position.copy(course.v3(goalP, off, 2.6));
    p.castShadow = true;
    scene.add(p);
  }
  {
    const a = course.v3(goalP, -halfW - 4, 5.2), b = course.v3(goalP, halfW + 4, 5.2);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(a.distanceTo(b), 0.5, 0.5), railM);
    bar.position.copy(a.clone().add(b).multiplyScalar(0.5));
    bar.lookAt(b);
    bar.rotateY(Math.PI / 2);
    scene.add(bar);
  }
  const poleM = new THREE.MeshStandardMaterial({ color: 15330802, roughness: 0.6 });
  for (let rem = 200; rem <= L; rem += 200) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), poleM);
    p.position.copy(course.v3(startP + (L - rem), -halfW - 5, 1.1));
    scene.add(p);
  }
  {
    const st = new THREE.Group();
    scene.add(st);
    const conc = photoMat(
      "concrete",
      [1, 3],
      new THREE.Color(0.95, 0.96, 1),
      { side: THREE.DoubleSide }
    );
    const a0 = goalP - 320, a1 = goalP + 60;
    const oIn = halfW + 24, oOut = halfW + 58, yIn = 3.2, yOut = 17.5;
    const ramp = ribbon(course, oIn, oOut, 8, conc, 26, a0, a1, yIn, yOut);
    ramp.receiveShadow = true;
    st.add(ramp);
    const front = ribbon(course, oIn - 0.1, oIn, 8, conc, 26, a0, a1, 0, yIn);
    st.add(front);
    const back = ribbon(
      course,
      oOut,
      oOut + 0.2,
      8,
      new THREE.MeshStandardMaterial({
        color: 9344414,
        roughness: 0.9,
        side: THREE.DoubleSide
      }),
      26,
      a0,
      a1,
      yOut,
      yOut + 5
    );
    st.add(back);
    const roofM = new THREE.MeshStandardMaterial({ color: 6120557, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide });
    st.add(ribbon(course, halfW + 16, oOut + 1, 10, roofM, 26, a0, a1, 25.2, 26.4));
    st.add(ribbon(course, halfW + 16, oOut + 1, 10, roofM, 26, a0, a1, 24.4, 25.4));
    const fasciaM = new THREE.MeshStandardMaterial({ color: 15856629, roughness: 0.4, side: THREE.DoubleSide });
    st.add(ribbon(course, halfW + 15.9, halfW + 16, 10, fasciaM, 26, a0, a1, 24.2, 26.6));
    const steel = new THREE.MeshStandardMaterial({ color: 14146528, roughness: 0.5, metalness: 0.4 });
    for (let i = 0; i <= 16; i++) {
      const p = a0 + (a1 - a0) * i / 16;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 24.4, 10), steel);
      c.position.copy(course.v3(p, oOut - 0.5, 12.2));
      c.castShadow = true;
      st.add(c);
      const A = course.v3(p, oOut - 0.5, 24.4), B = course.v3(p, halfW + 16.2, 24.4);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, A.distanceTo(B)), steel);
      beam.position.copy(A.clone().add(B).multiplyScalar(0.5));
      beam.lookAt(B);
      st.add(beam);
      const C = course.v3(p, oOut - 0.5, 15.5), D = course.v3(p, halfW + 26, 24.2);
      const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, C.distanceTo(D), 6), steel);
      brace.position.copy(C.clone().add(D).multiplyScalar(0.5));
      brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), D.clone().sub(C).normalize());
      st.add(brace);
    }
    const rail2 = new THREE.MeshStandardMaterial({ color: 16777215, roughness: 0.4 });
    st.add(ribbon(course, oIn + 0.3, oIn + 0.36, 8, rail2, 26, a0, a1, yIn + 1.1, yIn + 1.1));
    const glass = new THREE.MeshStandardMaterial({ color: 3359055, roughness: 0.15, metalness: 0.6, side: THREE.DoubleSide });
    st.add(ribbon(course, oIn - 0.12, oIn - 0.11, 8, glass, 26, a0, a1, 0.4, yIn - 0.4));
    const aisleM = new THREE.MeshStandardMaterial({ color: 9080985, roughness: 0.9, side: THREE.DoubleSide });
    for (let p = a0 + 20; p < a1 - 5; p += 20) {
      const g = ribbon(course, oIn, oOut, 8, aisleM, 26, p, p + 1.4, yIn + 0.05, yOut + 0.05);
      st.add(g);
    }
    ramp.material = new THREE.MeshStandardMaterial({ map: crowdTex(), roughness: 0.95, side: THREE.DoubleSide });
    ramp.material.map.repeat.set(1, 1);
  }
  let castleObj = [], castleBoard = null, castleTexA = null, castleTexB = null;
  let castleTop = 64;
  if (pack.scenery) {
    for (const it of pack.scenery.items) {
      if (KUMA && it.kind !== "castle_main" && it.kind !== "castle_small") continue;
      const [x, y, z0] = it.at, [w, d, h] = it.size;
      if (it.kind === "hill") {
        const m = new THREE.Mesh(
          new THREE.CylinderGeometry(w / 2, w / 2 * 1.25, h, 24),
          new THREE.MeshLambertMaterial({ color: 2902576 })
        );
        m.position.set(x, h / 2, y);
        scene.add(m);
      } else if (it.kind === "arcade") {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ color: 6251372 })
        );
        m.position.set(x, h / 2, y);
        scene.add(m);
      } else {
        const c = castle(it);
        scene.add(c);
        castleObj.push([c, it]);
      }
    }
  }
  let credit = "";
  if (KUMA) {
    const gp = course.at(goalP, 0);
    loadKumamoto(geo, [castleIt.at[0], castleIt.at[1]], halfW, gp, TEXL).then((K) => {
      scene.add(K.group);
      for (const [c, it] of castleObj) c.position.y = K.castleY;
      if (castleBoard) castleBoard.position.y = K.castleY - 10 + castleBoard.geometry.parameters.height / 2;
      castleTop = K.castleY + 40;
      credit = K.credit;
      if (onCredit) onCredit(credit);
    }).catch((e) => console.warn("熊本の背景を読めませんでした", e));
  }
  if (KUMA && !window.UMA_NO_H3) {
    const layer = (file, radius, height, bottom, rep, fogMix) => {
      const tex = TEXL.load("static/assets/layers/" + file + "?v=1");
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.x = rep;
      tex.anisotropy = 8;
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, height, 96, 1, true),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          side: THREE.BackSide,
          depthWrite: false,
          fog: false,
          color: new THREE.Color(1, 1, 1).lerp(new THREE.Color(10133166), fogMix)
        })
      );
      m.position.y = bottom + height / 2;
      m.renderOrder = -1;
      scene.add(m);
      return m;
    };
    layer("mountains_alpha_ring.webp", 7e3, 1100, -420, 2, 0.3);
    layer("city_alpha_ring.webp", 2600, 300, -120, 3, 0.12);
    TEXL.load("static/assets/layers/castle_alpha.webp?v=1", (tex) => {
      if (!castleIt) return;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      castleTexA = tex;
      TEXL.load("static/assets/layers/castle_alpha_b.webp?v=1", (tb) => {
        tb.colorSpace = THREE.SRGBColorSpace;
        tb.anisotropy = 8;
        castleTexB = tb;
      });
      const Hc = 128, Wc = Hc * 1024 / 576;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(Wc, Hc),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          alphaTest: 0.1,
          side: THREE.DoubleSide,
          color: 15921906
        })
      );
      const [kx, ky] = castleIt.at;
      m.position.set(kx, castleTop - 40 - 10 + Hc / 2, ky);
      m.lookAt(0, m.position.y, 0);
      m.userData.castleBoard = true;
      scene.add(m);
      castleBoard = m;
      for (const [o] of castleObj) o.visible = false;
      if (castleTop !== 64) m.position.y = castleTop - 40 - 10 + Hc / 2;
    });
  }
  const gate = startGate(course, hs, startP, geo.lane_width_m);
  scene.add(gate);
  const groups = hs.map((h, i) => {
    const g = horseMesh(hex(h.waku_color.bg), h.draw, h.waku_color.fg, i);
    scene.add(g);
    return g;
  });
  const prevHd = new Float32Array(n);
  let horseStyle = "real";
  const curModel = (g) => g.models && g.models[horseStyle] || null;
  function applyStyle() {
    groups.forEach((g) => {
      const cur = curModel(g);
      for (const [k, M] of Object.entries(g.models || {})) M.pivot.visible = k === horseStyle;
      g.bodyParts.forEach((o) => {
        o.visible = !cur;
      });
      g.cloths.forEach((c, j) => {
        c.position.copy(cur ? cur.cloth[j].p : g.clothOld[j]);
        c.rotation.x = cur ? cur.cloth[j].tilt : 0;
        c.scale.setScalar(cur ? 1.15 : 1);
      });
    });
  }
  const BACK_H = 1.17;
  function clothAt(m, g, cx, cy) {
    g.updateMatrixWorld(true);
    const inv = g.matrixWorld.clone().invert(), v = new THREE.Vector3();
    let half = 0.36;
    m.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position, M = o.matrixWorld.clone().premultiply(inv);
      let w = 0;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(M);
        if (Math.abs(v.x - cx) < 0.22 && Math.abs(v.y - cy) < 0.2) w = Math.max(w, Math.abs(v.z));
      }
      if (w > 0) half = w;
    });
    return [0, 1].map((j) => ({ p: new THREE.Vector3(cx, cy, (j ? -1 : 1) * (half + 0.03)), tilt: (j ? -1 : 1) * 0.12 }));
  }
  function attachModel(key, gltf) {
    const cfg = HMODELS[key];
    const clipG = THREE.AnimationClip.findByName(gltf.animations, "Gallop");
    const clipI = THREE.AnimationClip.findByName(gltf.animations, "Idle");
    groups.forEach((g, i) => {
      const m = SkeletonUtils.clone(gltf.scene);
      const ci = (i * 5 + 3) % COAT_MODEL.length;
      m.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.frustumCulled = false;
        o.material = o.material.clone();
        const nm = o.material.name;
        if (cfg.tint === "coat") {
          const coat = new THREE.Color(COAT_MODEL[ci]);
          if (nm === "Main") o.material.color.copy(coat);
          else if (nm === "Main_Light") o.material.color.copy(coat).multiplyScalar(1.35);
          else if (nm === "Main_Dark") o.material.color.copy(coat).multiplyScalar(0.6);
          else if (nm === "Hair") o.material.color.setHex(1446157);
          o.material.roughness = 0.62;
        } else {
          const [r, gg, b] = COAT_MUL[ci];
          o.material.color.setRGB(r, gg, b);
          if (/Hair/i.test(nm)) o.material.color.multiplyScalar(0.7);
        }
      });
      const pivot = new THREE.Group();
      g.add(pivot);
      pivot.add(m);
      const bonesAt = () => {
        g.updateMatrixWorld(true);
        const w = new THREE.Vector3(), inv = g.matrixWorld.clone().invert(), r = { foot: Infinity };
        m.traverse((o) => {
          if (!o.isBone) return;
          o.getWorldPosition(w).applyMatrix4(inv);
          if (cfg.foot.test(o.name)) r.foot = Math.min(r.foot, w.y);
          if (cfg.back.test(o.name)) r.back = w.clone();
          if (cfg.head.test(o.name)) r.head = w.clone();
          if (cfg.tail.test(o.name)) r.tail = w.clone();
        });
        return r;
      };
      let B = bonesAt();
      const k = B.back && isFinite(B.foot) ? BACK_H / Math.max(B.back.y - B.foot, 1e-6) : 1;
      m.scale.multiplyScalar(k);
      B = bonesAt();
      if (B.head && B.tail) m.rotation.y = Math.atan2(B.head.z - B.tail.z, B.head.x - B.tail.x);
      B = bonesAt();
      m.position.y = -(isFinite(B.foot) ? B.foot : 0);
      B = bonesAt();
      const back = B.back ? B.back.y : BACK_H;
      const mixer = new THREE.AnimationMixer(m);
      const aG = mixer.clipAction(clipG), aI = clipI ? mixer.clipAction(clipI) : null;
      aG.play();
      if (aI) aI.play();
      const lowest = (act, other, D) => {
        let lo = Infinity;
        act.weight = 1;
        if (other) other.weight = 0;
        for (let k2 = 0; k2 < 12; k2++) {
          act.time = D * k2 / 12;
          mixer.update(0);
          lo = Math.min(lo, bonesAt().foot);
        }
        return lo;
      };
      const base = m.position.y;
      const footG = lowest(aG, aI, clipG.duration) - base;
      const footI = aI ? lowest(aI, aG, clipI.duration) - base : footG;
      g.models = g.models || {};
      g.models[key] = {
        pivot,
        anim: { mixer, aG, aI, dur: clipG.duration },
        base,
        footG,
        footI,
        jockeyY: back + 0.3,
        jockeyX: B.back ? B.back.x - 0.05 : -0.06,
        cloth: clothAt(m, g, (B.back ? B.back.x : 0) - 0.25, back + 0.06)
      };
      if (!g.clothOld) g.clothOld = g.cloths.map((c) => c.position.clone());
    });
    applyStyle();
  }
  groups.forEach((g, i) => {
    g.jockeyParts = [...g.jockey.children];
    makeRider(g.jockey, hs[i].waku_color.bg).then((r) => {
      g.rider = r;
      r.visible = false;
    }).catch((e) => {
      if (i === 0) console.warn("騎手のモデルを読めませんでした", e);
    });
  });
  for (const key of ["real"]) {
    loadHorse(key).then((gl) => attachModel(key, gl)).catch((e) => console.warn("馬のモデルを読めませんでした", key, e));
  }
  const DUST = 14, dustPos = new Float32Array(n * DUST * 3), dustAge = new Float32Array(n * DUST);
  const dustG = new THREE.BufferGeometry();
  dustG.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustG, new THREE.PointsMaterial({
    color: pack.race.surface === "芝" ? 7305813 : 12626050,
    size: 0.75,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    sizeAttenuation: true
  }));
  scene.add(dust);
  let dustK = 0;
  const trails = hs.map((h) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(frames * 3), 3));
    g.setDrawRange(0, 0);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: hex(h.waku_color.bg) }));
    l.visible = false;
    scene.add(l);
    return l;
  });
  const camP = new THREE.PerspectiveCamera(20, 1, 0.5, KUMA ? 4e4 : 9e3);
  const camO = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, KUMA ? 4e4 : 9e3);
  let mode = "broadcast", cam = camP;
  function resize() {
    const w = host.clientWidth, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    if (dof) dof.setSize(w * pr, h * pr);
    camP.aspect = w / h;
    camP.updateProjectionMatrix();
    const pad = 70, sx = course.C / 2 * 0.33 + pad;
    const half = Math.max(sx, sx * h / w);
    camO.left = -half * w / h;
    camO.right = half * w / h;
    camO.top = half;
    camO.bottom = -half;
    camO.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();
  const orbit = { yaw: 0.6, pitch: 0.42, dist: 420 };
  let drag = null;
  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY };
  });
  el.addEventListener("pointermove", (e) => {
    if (!drag || mode !== "free") return;
    orbit.yaw -= (e.clientX - drag.x) * 6e-3;
    orbit.pitch = Math.max(0.08, Math.min(1.45, orbit.pitch + (e.clientY - drag.y) * 5e-3));
    drag = { x: e.clientX, y: e.clientY };
  });
  el.addEventListener("pointerup", () => {
    drag = null;
  });
  el.addEventListener("wheel", (e) => {
    if (mode === "free") {
      orbit.dist = Math.max(60, Math.min(1800, orbit.dist * (1 + e.deltaY * 1e-3)));
      e.preventDefault();
    }
  }, { passive: false });
  function sample(t2) {
    const u = Math.max(0, Math.min(t2 / dt, frames - 1.0001));
    const i = Math.floor(u), a = u - i;
    return hs.map((h) => {
      const A = h.track_xyh[i], B = h.track_xyh[i + 1], D = h.distance_m;
      let dh = ((B[2] - A[2] + 180) % 360 + 360) % 360 - 180;
      return {
        x: A[0] + (B[0] - A[0]) * a,
        y: A[1] + (B[1] - A[1]) * a,
        hd: A[2] + dh * a,
        d: D[i] + (D[i + 1] - D[i]) * a,
        v: t2 <= 0 ? 0 : (D[i + 1] - D[i]) / dt
      };
    });
  }
  function castleShot(P, D, H, side, wP = 0.58) {
    const [kx, ky] = castleIt ? castleIt.at : [P.x, P.z - 600];
    const C = new THREE.Vector3(kx, castleTop, ky);
    const hx = P.x - kx, hz = P.z - ky, hl = Math.hypot(hx, hz) || 1;
    const ax = hx / hl, az = hz / hl, bx = -az * side, bz = ax * side;
    const eye = new THREE.Vector3(P.x + ax * D + bx * D * 0.22, H, P.z + az * D + bz * D * 0.22);
    const pitch = (v) => Math.atan2(v.y - eye.y, Math.hypot(v.x - eye.x, v.z - eye.z));
    const aP = pitch(P), aC = pitch(C);
    const mid = aP * wP + aC * (1 - wP);
    const yaw = new THREE.Vector3(P.x * 0.75 + C.x * 0.25 - eye.x, 0, P.z * 0.75 + C.z * 0.25 - eye.z).normalize();
    const tgt = eye.clone().add(new THREE.Vector3(yaw.x * Math.cos(mid), Math.sin(mid), yaw.z * Math.cos(mid)));
    const fov = Math.min(Math.max(Math.abs(aC - aP) / RAD * 1.45 + 4, 18), 55);
    return { eye, tgt, fov };
  }
  function aerialPose(t2) {
    const a = Math.min(Math.max((t2 - A0) / AER, 0), 1), e = a * a * (3 - 2 * a);
    return castleShot(course.v3(startP + 4, 0, 1.5), 300 - 70 * e, 170 - 45 * e, 1, 0.4);
  }
  const aerCut = { key: "aerial", label: "上空から", camera: "aerial", from_sec: A0, to_sec: A0 + AER };
  const SUB = {
    backstretch: KUMA ? ["side_tele", "sweep_back", "castle_oblique", "aerial_live"] : ["side_tele", "sweep_back", "aerial_live"],
    corner: ["track_high", "aerial_live", "side_tele"],
    stretch: ["side_tele", "stretch_headon", "side_tele", "aerial_live", "side_tele"]
  };
  const subCache = /* @__PURE__ */ new Map();
  function subCut(c, t2) {
    const list = SUB[c.key];
    if (!list || c.to_sec - c.from_sec < 9) return c;
    const len = c.key === "stretch" ? 6 : 6.5;
    const nSeg = Math.max(1, Math.round((c.to_sec - c.from_sec) / len));
    const k = Math.min(Math.floor((t2 - c.from_sec) / ((c.to_sec - c.from_sec) / nSeg)), nSeg - 1);
    const key = c.key + k;
    if (!subCache.has(key)) subCache.set(key, { ...c, camera: list[k % list.length] });
    return subCache.get(key);
  }
  const FIXED = {
    fixed_gate: { eye: course.v3(startP - 52, 0, 4.6), tgt: course.v3(startP + 8, 0, 1.7), fov: 22 },
    fixed_stretch: { eye: course.v3(goalP - 230, -halfW - 48, 5), tgt: course.v3(goalP - 230, halfW + 20, 3), fov: 34, win: [300, 165] },
    fixed_drive: { eye: course.v3(goalP - 55, halfW + 26, 4.2), tgt: course.v3(goalP - 55, -halfW, 5.1), fov: 38, win: [110, -8] }
  };
  function fixedFor(t2, dLead) {
    if (t2 <= 0 || camOverride) return null;
    const rem = L - dLead;
    for (const [k, F] of Object.entries(FIXED)) if (F.win && bgs[k] && rem <= F.win[0] && rem >= F.win[1]) return k;
    return null;
  }
  function sceneAt(t2) {
    if (t2 < A0 + AER) return aerCut;
    if (t2 < 0) return preCut;
    if (t2 < 1.6) return gateCut;
    for (const s of cuts) if (t2 >= s.from_sec && t2 < s.to_sec) return subCut(s, t2);
    return cuts[cuts.length - 1];
  }
  function modelTime(s, t2) {
    const tm = s.time_map;
    if (!tm) return t2;
    const a = (t2 - s.from_sec) / Math.max(s.to_sec - s.from_sec, 1e-6);
    return tm.model_from + (tm.model_to - tm.model_from) * Math.max(0, Math.min(1, a));
  }
  function fit(c, pts, fill, lo, hi) {
    const fwd = new THREE.Vector3();
    c.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, c.up).normalize();
    let a = 1e9, b = -1e9;
    const dep = [];
    for (const p of pts) {
      const v2 = p.clone().sub(c.position);
      const l = v2.dot(right);
      a = Math.min(a, l);
      b = Math.max(b, l);
      dep.push(Math.max(v2.dot(fwd), 1));
    }
    const span = b - a + 5;
    const hfov = 2 * Math.atan(span / 2 / med(dep) / Math.max(fill, 0.1));
    let v = 2 * Math.atan(Math.tan(hfov / 2) / c.aspect) / RAD;
    c.fov = Math.max(lo * 0.8, Math.min(hi * 0.75, v));
    c.updateProjectionMatrix();
  }
  function place(t2) {
    let S = sceneAt(t2);
    const mt = Math.max(0, Math.min(modelTime(S, t2), total));
    const s = sample(mt);
    plateOn = S.camera === "aerial_live" && mode !== "overhead" && plateVisible();
    const pts = s.map((q) => new THREE.Vector3(q.x, 1.5, q.y));
    const lead = s.map((q, i) => [q.d, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => pts[i]);
    const top = (k) => lead.slice(0, k);
    const dAvg = s.reduce((k, q) => k + q.d, 0) / n, dMax = Math.max(...s.map((q) => q.d));
    const pPack = startP + dAvg, pLead = startP + dMax;
    camSel: {
      const fx = fixedFor(t2, dMax);
      if (fx) {
        S = { ...S, camera: fx };
        plateOn = false;
      }
      {
        const rem = L - dMax, sIn = geo.straight_m, s0 = geo.straight_m * 0.8 + 230;
        if (!fx && mode === "broadcast" && t2 > 0 && rem > sIn && rem < s0) {
          S = { ...S, camera: "turn_headon" };
          plateOn = false;
        }
      }
      if (mode === "overhead") {
        camO.position.set(0, 1200, 0);
        camO.up.set(0, 0, -1);
        camO.lookAt(0, 0, 0);
        cam = camO;
      } else if (mode === "free") {
        const c = course.v3(pPack, 0, 0);
        camP.position.set(
          c.x + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist,
          Math.sin(orbit.pitch) * orbit.dist,
          c.z + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist
        );
        camP.up.set(0, 1, 0);
        camP.lookAt(c.x, 2, c.z);
        camP.fov = 40;
        camP.updateProjectionMatrix();
        cam = camP;
      } else {
        const k = mode === "track" ? "track_side" : S.camera;
        let eye, tgt, fill = 0.6, lo = 5, hi = 30, sub = 0;
        const sc = !!pack.scenery;
        if (k === "locked_side") {
          const l5 = top(5);
          const cg = l5.reduce((a, p) => a.add(p.clone()), new THREE.Vector3()).multiplyScalar(1 / l5.length);
          camP.up.set(0, 1, 0);
          camP.position.copy(course.v3(goalP - 42, halfW + 20, 5.6));
          camP.lookAt(new THREE.Vector3(cg.x, 1.85, cg.z));
          camP.fov = 27;
          camP.updateProjectionMatrix();
          cam = camP;
          break camSel;
        } else if (k === "track_high" || k === "aerial_live") {
          const ps = ((pPack - (goalP - 330)) % course.C + course.C) % course.C;
          eye = course.v3(pPack - 8, ps < 400 ? -halfW - 95 : halfW + 95, 27);
          tgt = course.v3(pPack + 2, 0, 1.6);
          fill = 0.86;
          lo = 7;
          hi = 20;
          sub = 9;
        } else if (k === "winner_low") {
          const wi = hs.reduce((a, h, j) => hs[a].finish <= h.finish ? a : j, 0);
          const q = s[wi];
          const lw = hs[wi].lane_m[Math.min(Math.floor(mt / dt), frames - 1)];
          eye = course.v3(startP + q.d + 7, lw - 15, 0.95);
          camP.up.set(0, 1, 0);
          camP.position.copy(eye);
          camP.lookAt(new THREE.Vector3(q.x, 1.65, q.y));
          camP.fov = 24;
          camP.updateProjectionMatrix();
          cam = camP;
          break camSel;
        } else if (k === "track_side") {
          eye = course.v3(pLead - 11, -halfW - 20, 3.8);
          tgt = course.v3(pLead - 5, 0, 1.7);
          fill = 0.95;
          lo = 14;
          hi = 60;
          sub = 4;
        } else if (k === "gate_wait") {
          const G = -A0 - AER;
          const a = Math.min(Math.max((t2 + G) / G, 0), 1), e = a * a * (3 - 2 * a);
          eye = course.v3(startP + 62 - 36 * e, -halfW - 26 + 16 * e, 7.5 - 4.6 * e);
          tgt = course.v3(startP + 1 + Math.max(t2, 0) * 3, 0, 1.4);
          fill = 0.86;
          lo = 12;
          hi = 45;
          if (false) {
            const b = Math.min(Math.max((t2 + G) / 2.2, 0), 1), w2 = b * b * (3 - 2 * b);
            const A = aerialPose(-G);
            camP.up.set(0, 1, 0);
            camP.position.copy(A.eye.clone().lerp(eye, w2));
            camP.lookAt(A.tgt.clone().lerp(tgt, w2));
            camP.fov = A.fov + (24 - A.fov) * w2;
            camP.updateProjectionMatrix();
            cam = camP;
            break camSel;
          }
        } else if (k === "aerial") {
          const A = aerialPose(t2);
          camP.up.set(0, 1, 0);
          camP.position.copy(A.eye);
          camP.lookAt(A.tgt);
          camP.fov = A.fov;
          camP.updateProjectionMatrix();
          cam = camP;
          break camSel;
        } else if (FIXED[k]) {
          const F = FIXED[k];
          camP.up.set(0, 1, 0);
          camP.position.copy(F.eye);
          camP.lookAt(F.tgt);
          camP.fov = F.fov;
          camP.updateProjectionMatrix();
          cam = camP;
          break camSel;
        } else if (k === "gate_headon") {
          eye = course.v3(startP - 52, 0, 4.6);
          tgt = course.v3(startP + 8, 0, 1.7);
          fill = 0.72;
        } else if (k === "pan_low") {
          eye = course.v3(startP + 150, -halfW - 56, 2);
          tgt = course.v3(pPack + (pLead - pPack) * 0.45, 0, 1.6);
          fill = 0.74;
          lo = 9;
          hi = 40;
          sub = 5;
        } else if (k === "turn_headon") {
          const eyeF = course.v3(goalP - geo.straight_m * 0.45, halfW * 0.35, 1.8);
          const l8 = top(8), cg = l8.reduce((a, p) => a.add(p.clone()), new THREE.Vector3()).multiplyScalar(1 / l8.length);
          camP.up.set(0, 1, 0);
          camP.position.copy(eyeF);
          camP.lookAt(new THREE.Vector3(cg.x, 2.2, cg.z));
          fit(camP, l8, 0.95, 2, 11);
          camP.rotateX(-camP.fov * RAD * 0.06);
          cam = camP;
          break camSel;
        } else if (k === "sweep_back") {
          const u = Math.min(Math.max((t2 - S.from_sec) / Math.max(S.to_sec - S.from_sec, 1), 0), 1);
          const e2 = u * u * (3 - 2 * u), pTail = startP + Math.min(...s.map((q) => q.d));
          const pf = pLead + (pTail - pLead) * e2;
          eye = course.v3(pf + 4, -halfW - 30, 4.5);
          tgt = course.v3(pf, 0, 1.5);
          fill = 0.9;
          lo = 7;
          hi = 16;
          camP.up.set(0, 1, 0);
          camP.position.copy(eye);
          camP.lookAt(tgt);
          camP.fov = 12;
          camP.rotateX(12 * RAD * 0.16);
          camP.updateProjectionMatrix();
          cam = camP;
          break camSel;
        } else if (k === "side_tele") {
          eye = course.v3(pLead - 6, -halfW - 70, 4.2);
          tgt = course.v3(pLead - 5, 0, 1.6);
          fill = 0.9;
          lo = 3;
          hi = 16;
          sub = 5;
        } else if (k === "chase_high") {
          eye = course.v3(pPack - 70, -4, 34);
          tgt = course.v3(pLead + 8, 0, 0);
          fill = 0.9;
          lo = 20;
          hi = 55;
        } else if ((k === "heli_outside" || k === "castle_oblique") && KUMA) {
          const cg = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
          const A = castleShot(cg, 105, 44, 1);
          camP.up.set(0, 1, 0);
          camP.position.copy(A.eye);
          camP.lookAt(A.tgt);
          camP.fov = A.fov;
          camP.updateProjectionMatrix();
          cam = camP;
          break camSel;
        } else if (k === "heli_outside") {
          eye = course.v3(pPack + 40, halfW + 120, 74);
          tgt = course.v3(pPack, 0, 0);
          fill = 0.52;
          lo = 8;
        } else if (k === "wire_side") {
          eye = course.v3(goalP - 2, -halfW - 58, 4.6);
          if (mt <= tLast) {
            tgt = course.v3(pLead, 0, 1.6);
            fill = 0.66;
            lo = 8;
            hi = 38;
            sub = 6;
          } else {
            camP.up.set(0, 1, 0);
            camP.position.copy(eye);
            camP.lookAt(course.v3(goalP + 10, 0, 1.6));
            if (wireFov) {
              camP.fov = wireFov;
              camP.updateProjectionMatrix();
            }
            cam = camP;
            break camSel;
          }
        } else if (k === "replay_slow") {
          eye = course.v3(goalP - 26, -halfW - 34, 2.2);
          tgt = course.v3(pLead - 4, 0, 1.5);
          fill = 0.7;
          lo = 8;
          hi = 44;
          sub = 4;
        } else if (k === "head_on") {
          eye = course.v3(goalP + 34, halfW + 11, 8);
          tgt = course.v3(pLead - 7, 0, sc ? 9 : 3.2);
          fill = sc ? 0.52 : 0.68;
          lo = 6;
          hi = 28;
        } else if (k === "stretch_headon") {
          eye = course.v3(goalP + 34, halfW + 8, 10);
          const cg = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
          tgt = new THREE.Vector3(cg.x, 2.4, cg.z);
          fill = 0.8;
          lo = 2;
          hi = 22;
          if (KUMA && castleIt) {
            const C = new THREE.Vector3(castleIt.at[0], castleTop, castleIt.at[1]);
            const pitch = (v) => Math.atan2(v.y - eye.y, Math.hypot(v.x - eye.x, v.z - eye.z));
            const aP = pitch(new THREE.Vector3(cg.x, 0.5, cg.z)), aC = pitch(C);
            const fovK = Math.min(Math.max((aC - aP) / RAD * 1.25, 5), 16);
            const yaw = new THREE.Vector3(cg.x * 0.8 + C.x * 0.2 - eye.x, 0, cg.z * 0.8 + C.z * 0.2 - eye.z).normalize();
            const mid = (aP + aC) / 2;
            camP.up.set(0, 1, 0);
            camP.position.copy(eye);
            camP.lookAt(eye.clone().add(new THREE.Vector3(yaw.x * Math.cos(mid), Math.sin(mid), yaw.z * Math.cos(mid))));
            camP.fov = fovK;
            camP.updateProjectionMatrix();
            cam = camP;
            break camSel;
          }
        } else {
          eye = course.v3(pPack - 30, -halfW - 155, 26);
          tgt = course.v3(pPack + (pLead - pPack) * 0.45, 0, 1.6);
          fill = 0.6;
          lo = 6;
          hi = 20;
        }
        camP.up.set(0, 1, 0);
        camP.position.copy(eye);
        camP.lookAt(tgt);
        const w = performance.now() / 1e3;
        camP.rotation.x += Math.sin(w * 1.7) * 11e-4 + Math.sin(w * 0.43) * 18e-4;
        camP.rotation.y += Math.sin(w * 1.3 + 2) * 13e-4 + Math.sin(w * 0.31) * 21e-4;
        fit(camP, sub ? top(sub) : pts, fill, lo, hi);
        if (k !== "track_high" && k !== "heli_outside" && k !== "aerial_live") camP.rotateX(camP.fov * RAD * 0.16);
        if (k === "wire_side") wireFov = camP.fov;
        cam = camP;
      }
    }
    s.forEach((q, i) => {
      const g = groups[i];
      g.position.set(q.x, 0, q.y);
      g.rotation.y = -q.hd * RAD;
      let dh = (q.hd - prevHd[i] + 540) % 360 - 180;
      prevHd[i] = q.hd;
      const amp = Math.min(q.v / 9, 1), ph = q.d / 7.2 % 1, TAU = 2 * Math.PI;
      gait(g, ph, Math.max(-0.16, Math.min(0.16, dh * 0.05)), amp, performance.now() / 1e3 + i * 1.7);
      const drive = q.d > L - 450 && q.d < L + 25 ? Math.min((q.d - (L - 450)) / 150, 1) : 0;
      const J = g.jockey;
      J.rotation.z = (-0.12 - 0.16 * drive) * amp + Math.sin(TAU * (ph + 0.15)) * (0.03 + 0.09 * drive) * amp;
      J.position.x = -0.06 + Math.sin(TAU * (ph + 0.15)) * (0.03 + 0.07 * drive) * amp;
      if (g.rider) {
        const zf = cam.isPerspectiveCamera ? cam.fov / 40 : 3;
        const near = Math.hypot(q.x - cam.position.x, q.y - cam.position.z, cam.position.y) * zf < 110;
        if (g.rider.visible !== near) {
          g.rider.visible = near;
          g.jockeyParts.forEach((o) => {
            o.visible = !near;
          });
        }
      }
      const cur = curModel(g);
      if (cur) {
        const A = cur.anim;
        A.aG.time = ph * A.dur;
        A.aG.weight = amp;
        if (A.aI) {
          const D = A.aI.getClip().duration, u = (performance.now() / 1e3 * 0.4 + i * 0.37) % (2 * D);
          A.aI.time = u < D ? u : 2 * D - u;
          A.aI.weight = 1 - amp;
        }
        A.mixer.update(0);
        const bob = Math.sin(TAU * (ph + 0.4)), pit = Math.sin(TAU * (ph + 0.12));
        const lift = -(cur.footG * amp + cur.footI * (1 - amp)) - cur.base + 0.03;
        cur.pivot.position.y = lift + Math.max(0, bob) * (0.07 + 0.04 * drive) * amp;
        cur.pivot.rotation.z = pit * (0.05 + 0.03 * drive) * amp;
        cur.pivot.rotation.x = Math.sin(TAU * ph) * 0.025 * amp;
        g.trunk.position.y = cur.pivot.position.y * 0.8;
        g.trunk.rotation.z = cur.pivot.rotation.z;
        g.jockey.position.y += cur.jockeyY - 1.56;
        g.jockey.position.x += cur.jockeyX + 0.06;
      }
      if (mode !== "overhead" && q.d > 2 && q.d < L) {
        const j = i * DUST + dustK % DUST, b = j * 3;
        const back = -1.1, c = Math.cos(q.hd * RAD), sn = Math.sin(q.hd * RAD);
        dustPos[b] = q.x + c * back + (Math.random() - 0.5) * 0.7;
        dustPos[b + 1] = 0.25 + Math.random() * 0.35;
        dustPos[b + 2] = q.y + sn * back + (Math.random() - 0.5) * 0.7;
        dustAge[j] = 1;
      }
      if (mode === "overhead") {
        const tr = trails[i], pa = tr.geometry.attributes.position;
        const fi = Math.min(Math.floor(mt / dt), frames - 1);
        for (let f = 0; f <= fi; f++) {
          pa.setXYZ(f, hs[i].track_xyh[f][0], 3, hs[i].track_xyh[f][1]);
        }
        pa.needsUpdate = true;
        tr.geometry.setDrawRange(0, fi + 1);
        tr.visible = true;
      } else {
        trails[i].visible = false;
      }
    });
    dustK++;
    for (let j = 0; j < dustAge.length; j++) {
      if (dustAge[j] > 0) {
        dustAge[j] -= 0.035;
        dustPos[j * 3 + 1] += 0.035;
      } else {
        dustPos[j * 3 + 1] = -50;
      }
    }
    dustG.attributes.position.needsUpdate = true;
    dust.visible = mode !== "overhead";
    const c0 = course.v3(pPack, 0, 0);
    sun.target.position.copy(c0);
    sun.position.set(c0.x - 320, 330, c0.z + 200);
    sun.target.updateMatrixWorld();
    gate.open(Math.min(Math.max(t2 / 0.35, 0), 1));
    gate.visible = t2 < 20;
    mtNow = mt;
    {
      const f4 = top(Math.min(4, n));
      const c = f4.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / f4.length);
      focusD = Math.max(8, cam.position.distanceTo(c) + 6);
    }
    placeOverlay(plateOn, s);
    if (KUMA && scene.fog) {
      const hiCam = cam.position.y > 40;
      const n2 = hiCam ? 500 : 2200, f = hiCam ? 2400 : 15e3;
      scene.fog.near += (n2 - scene.fog.near) * 0.2;
      scene.fog.far += (f - scene.fog.far) * 0.2;
    }
    if (castleBoard) {
      const aerialNow = S.camera === "aerial" || S.camera === "heli_outside" || S.camera === "castle_oblique";
      const want = aerialNow && castleTexB ? castleTexB : castleTexA;
      if (want && castleBoard.material.map !== want) {
        castleBoard.material.map = want;
        castleBoard.material.needsUpdate = true;
      }
      if (aerialNow) castleBoard.lookAt(cam.position);
      else castleBoard.lookAt(cam.position.x, castleBoard.position.y, cam.position.z);
    }
    const bgOn = !camOverride && FIXED[S.camera] && useBg(S.camera);
    if (!bgOn) useBg(null);
    if (bgOn) {
      groups.forEach((g) => {
        if (!g.__l2 || g.__l2 < 3) {
          g.traverse((o) => o.layers.enable(2));
          g.__l2 = (g.__l2 || 0) + (g.rider ? 1 : 0);
        }
      });
      camP.layers.set(2);
      const c = course.v3(pPack, 0, 0);
      shadowCatcher.position.x = c.x;
      shadowCatcher.position.z = c.z;
    } else camP.layers.set(0);
    if (camOverride) {
      const o = camOverride;
      camP.up.set(0, 1, 0);
      camP.position.set(...o.eye);
      camP.lookAt(new THREE.Vector3(...o.tgt));
      camP.fov = o.fov;
      camP.near = o.near || 0.5;
      camP.far = o.far || 4e4;
      camP.updateProjectionMatrix();
      cam = camP;
    }
    if (hud) hud(S, mt, s, dMax, t2);
    return S;
  }
  let plate = null, plateKey = "", plateOn = false;
  const ovR = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  ovR.setPixelRatio(pr);
  ovR.setClearColor(0, 0);
  ovR.domElement.style.cssText = "position:absolute;left:0;top:0;z-index:1;pointer-events:none;transform-origin:0 0;display:none";
  host.appendChild(ovR.domElement);
  const S2 = geo.straight_m, R2 = geo.turn_radius_m;
  const topCam = new THREE.OrthographicCamera(0, 1, 0, -1, 1, 3e3);
  topCam.position.set(0, 1e3, 0);
  topCam.up.set(0, 0, -1);
  topCam.lookAt(0, 0, 0);
  topCam.layers.set(1);
  scene.traverse((o) => {
    if (o.isLight) o.layers.enable(1);
  });
  const tags = groups.map((g, i) => {
    const h = hs[i];
    const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.25, 28), new THREE.MeshBasicMaterial({ color: hex(h.waku_color.bg) }));
    ring.rotation.x = -Math.PI / 2;
    ring.layers.set(1);
    scene.add(ring);
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    x.fillStyle = h.waku_color.bg;
    x.beginPath();
    x.arc(32, 32, 29, 0, Math.PI * 2);
    x.fill();
    x.lineWidth = 4;
    x.strokeStyle = "#000";
    x.stroke();
    x.fillStyle = h.waku_color.fg;
    x.font = "bold 36px system-ui,sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(String(h.draw), 32, 34);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
    sp.renderOrder = 5;
    sp.layers.set(1);
    scene.add(sp);
    return { ring, sp };
  });
  const [, gyC] = course.at(goalP, 0), SG = Math.sign(gyC) || 1;
  const trackWm = halfW * 2 + 5;
  function toImage(x, y) {
    const o = plate.oval, k = o.width / trackWm, yy = y * SG;
    let ix, iy;
    if (Math.abs(x) <= S2 / 2) {
      const f = (x + S2 / 2) / S2, lane = Math.abs(yy) - R2;
      ix = o.cx_l + f * (o.cx_r - o.cx_l);
      iy = yy >= 0 ? o.cy - o.r - lane * k : o.cy + o.r + lane * k;
    } else {
      const c = x > 0 ? S2 / 2 : -S2 / 2, th = Math.atan2(yy, x - c), rr = o.r + (Math.hypot(x - c, yy) - R2) * k;
      ix = (x > 0 ? o.cx_r : o.cx_l) + Math.cos(th) * rr;
      iy = o.cy - Math.sin(th) * rr;
    }
    if (o.home === "bottom") iy = 2 * o.cy - iy;
    const [iw] = plate.size;
    return [plate.flip ? iw - ix : ix, iy];
  }
  let pfit = null;
  function prepPlate() {
    const W = host.clientWidth, H = host.clientHeight, key = W + "x" + H;
    if (key !== plateKey) {
      plateKey = key;
      ovR.setSize(W, H, false);
      ovR.domElement.style.width = W + "px";
      ovR.domElement.style.height = H + "px";
      topCam.left = 0;
      topCam.right = W;
      topCam.top = 0;
      topCam.bottom = -H;
      topCam.updateProjectionMatrix();
      const [iw, ih] = plate.size, sc = Math.max(W / iw, H / ih);
      pfit = { sc, ox: (W - iw * sc) / 2, oy: (H - ih * sc) / 2 };
    }
    return [W, H];
  }
  const toStage = ([ix, iy]) => [pfit.ox + pfit.sc * ix, pfit.oy + pfit.sc * iy];
  function plateVisible() {
    return !!plate;
  }
  const ZOOM = 2.2, zc = { x: null, y: null };
  const SPREAD = 2.5;
  let mtNow = 0;
  function placeOverlay(on, s) {
    if (!on || !plate) {
      ovR.domElement.style.display = "none";
      zc.x = null;
      if (plate && plate.el) plate.el.style.transform = plate.flip ? "scaleX(-1)" : "";
      return;
    }
    const [W, H] = prepPlate();
    ovR.domElement.style.display = "";
    const fi = Math.min(Math.floor(mtNow / dt), frames - 1);
    const lead = s.map((q, i) => [q.d, i]).sort((p, r) => r[0] - p[0]).slice(0, 6);
    const dC = lead.reduce((k, [d]) => k + d, 0) / lead.length;
    const o = plate.oval, kpx = pfit.sc * o.width / trackWm;
    const pos = s.map((q, i) => {
      const pp = startP + dC + SPREAD * (q.d - dC), ln = hs[i].lane_m[fi] + 3;
      const a = course.at(pp, ln), b = course.at(pp + 1.5, ln);
      const A = toStage(toImage(a[0], a[1])), Bp = toStage(toImage(b[0], b[1]));
      return [A[0], A[1], Math.atan2(Bp[1] - A[1], Bp[0] - A[0])];
    });
    let cx = 0, cy = 0;
    for (const [, i] of lead) {
      cx += pos[i][0] / lead.length;
      cy += pos[i][1] / lead.length;
    }
    if (zc.x == null) {
      zc.x = cx;
      zc.y = cy;
    } else {
      zc.x += (cx - zc.x) * 0.08;
      zc.y += (cy - zc.y) * 0.08;
    }
    const tx = Math.min(0, Math.max(W - ZOOM * W, W / 2 - ZOOM * zc.x));
    const ty = Math.min(0, Math.max(H - ZOOM * H, H / 2 - ZOOM * zc.y));
    const zoomCss = `translate(${tx}px,${ty}px) scale(${ZOOM})`;
    ovR.domElement.style.transform = zoomCss;
    if (plate.el) {
      plate.el.style.transformOrigin = "0 0";
      plate.el.style.transform = zoomCss + (plate.flip ? " translateX(100%) scaleX(-1)" : "");
    }
    const hsc = kpx * 2.2, keep = groups.map((g) => [g.position.clone(), g.rotation.y]);
    groups.forEach((g, i) => {
      if (!g.__l1) {
        g.traverse((o2) => o2.layers.enable(1));
        if (g.rider && curModel(g)) g.__l1 = true;
      }
      const [X, Y, hd] = pos[i];
      g.position.set(X, 0, Y);
      g.rotation.y = -hd;
      g.scale.setScalar(hsc);
      tags[i].ring.position.set(X, 0.05, Y);
      tags[i].ring.scale.setScalar(hsc * 2.1);
      tags[i].sp.position.set(X, 50, Y);
      tags[i].sp.scale.set(hsc * 1.8, hsc * 1.8, 1);
    });
    ovR.render(scene, topCam);
    groups.forEach((g, i) => {
      g.scale.setScalar(1);
      g.position.copy(keep[i][0]);
      g.rotation.y = keep[i][1];
    });
  }
  let camOverride = null, backdropObj = null;
  const bgs = {};
  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(4e3, 4e3), new THREE.ShadowMaterial({ opacity: 0.38 }));
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = 0.03;
  shadowCatcher.receiveShadow = true;
  shadowCatcher.layers.set(2);
  scene.add(shadowCatcher);
  scene.traverse((o) => {
    if (o.isLight) o.layers.enable(2);
  });
  renderer.domElement.style.zIndex = "1";
  let bgNow = null;
  function useBg(key) {
    const el2 = key ? bgs[key] : null;
    if (el2 === bgNow) return !!el2;
    if (bgNow) {
      bgNow.style.display = "none";
      if (bgNow.pause) bgNow.pause();
    }
    bgNow = el2;
    if (el2) {
      el2.style.display = "";
      if (el2.play) el2.play().catch(() => {
      });
    }
    return !!el2;
  }
  let t = -PRE, speed = 1, playing = true, last = performance.now(), raf, dead = 0;
  function loop() {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    if (playing) t = Math.min(t + (now - last) / 1e3 * speed, endT);
    last = now;
    try {
      place(t);
      draw();
      dead = 0;
    } catch (e) {
      if (++dead > 60) {
        cancelAnimationFrame(raf);
        throw e;
      }
    }
  }
  loop();
  return {
    setMode(m) {
      mode = m;
    },
    setHorseStyle(v) {
      horseStyle = v;
      applyStyle();
    },
    getHorseStyle() {
      return horseStyle;
    },
    info() {
      const r = renderer.info.render;
      return { tris: r.triangles, calls: r.calls, pr };
    },
    camInfo() {
      return { x: cam.position.x, y: cam.position.y, z: cam.position.z, fov: cam.isPerspectiveCamera ? cam.fov : 60 };
    },
    getMode() {
      return mode;
    },
    setSpeed(s) {
      speed = s;
    },
    setTime(v) {
      t = Math.max(-PRE, Math.min(v, endT));
    },
    start: -PRE,
    cardEnd: A0,
    raceEnd: endT - 8,
    getCredit() {
      return credit;
    },
    cutAt(tt) {
      const S = sceneAt(tt);
      return {
        key: S.key,
        camera: S.camera,
        label: S.label,
        race_sec: Math.max(0, Math.min(modelTime(S, tt), total))
      };
    },
    endTime: endT,
    cutInfo(tt) {
      if (AER && tt < A0 + AER) return { slot: "aerial", from: A0, len: AER };
      const c0 = A0 + AER;
      if (CLIP_PRE && tt < c0 + 4.2) return { slot: "stand", from: c0, len: 4.2 };
      if (CLIP_PRE && tt < c0 + 8.4) return { slot: "warmup", from: c0 + 4.2, len: 4.2 };
      const S = sceneAt(tt);
      if (S.camera === "aerial_live" && plateOn) return { slot: "aerial_live", from: tt, len: 1 };
      if (KUMA && S.key === "backstretch" && tt < S.from_sec + 4.2) return { slot: "aerial_run", from: S.from_sec, len: 4.2 };
      if (KUMA && S.key === "winner" && tt < S.from_sec + 4.4) return { slot: "finish", from: S.from_sec, len: 4.4 };
      return null;
    },
    setPlate(p) {
      plate = p;
      plateKey = "";
      plate.el = host.querySelector("#plate");
    },
    setBackdrop(b) {
      if (!KUMA || !castleIt || backdropObj) return;
      backdropObj = true;
      TEXL.load(b.src, (tex) => {
        const img = tex.image, cw = img.width, ch = img.height;
        const c = document.createElement("canvas");
        c.width = cw;
        c.height = ch;
        const x = c.getContext("2d");
        x.drawImage(img, 0, 0);
        x.globalCompositeOperation = "destination-in";
        const gx = x.createLinearGradient(0, 0, cw, 0);
        gx.addColorStop(0, "rgba(0,0,0,0)");
        gx.addColorStop(0.12, "#000");
        gx.addColorStop(0.88, "#000");
        gx.addColorStop(1, "rgba(0,0,0,0)");
        x.fillStyle = gx;
        x.fillRect(0, 0, cw, ch);
        const c2 = document.createElement("canvas");
        c2.width = cw;
        c2.height = ch;
        const y = c2.getContext("2d");
        y.drawImage(c, 0, 0);
        y.globalCompositeOperation = "destination-in";
        const gy = y.createLinearGradient(0, 0, 0, ch);
        gy.addColorStop(0, "rgba(0,0,0,0)");
        gy.addColorStop(0.3, "#000");
        gy.addColorStop(1, "#000");
        y.fillStyle = gy;
        y.fillRect(0, 0, cw, ch);
        const t2 = new THREE.CanvasTexture(c2);
        t2.colorSpace = THREE.SRGBColorSpace;
        const [kx, ky] = castleIt.at, dist0 = Math.hypot(kx, ky), dir = [kx / dist0, ky / dist0];
        const D = dist0 + 150;
        const castleH = 70 * D / dist0;
        const Hh = castleH / (b.castle.base - b.castle.top), Ww = Hh * cw / ch;
        const baseY = castleTop - 64;
        const bottomY = baseY - (1 - b.castle.base) * Hh;
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(Ww, Hh),
          new THREE.MeshBasicMaterial({ map: t2, transparent: true, depthWrite: false, fog: false })
        );
        const side = [-dir[1], dir[0]], sx = (b.castle.x - 0.5) * Ww;
        m.position.set(dir[0] * D - side[0] * sx, bottomY + Hh / 2, dir[1] * D - side[1] * sx);
        m.lookAt(0, bottomY + Hh / 2, 0);
        m.renderOrder = -0.5;
        scene.add(m);
        backdropObj = m;
        for (const [o] of castleObj) o.visible = false;
      });
    },
    setBackgrounds(b) {
      for (const [k, v] of Object.entries(b)) {
        if (!FIXED[k] || bgs[k]) continue;
        const el2 = document.createElement(v.type === "img" ? "img" : "video");
        el2.src = v.src;
        el2.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;display:none";
        if (el2.tagName === "VIDEO") {
          el2.muted = true;
          el2.loop = true;
          el2.playsInline = true;
          el2.preload = "auto";
        }
        host.insertBefore(el2, host.firstChild);
        bgs[k] = el2;
      }
    },
    fixedCameras() {
      return Object.fromEntries(Object.entries(FIXED).map(([k, F]) => [k, { eye: F.eye.toArray(), tgt: F.tgt.toArray(), fov: F.fov }]));
    },
    setHorsesVisible(v) {
      groups.forEach((g) => {
        g.visible = v;
      });
    },
    setCamOverride(o) {
      camOverride = o;
      if (!o) {
        camP.near = 0.5;
        camP.far = KUMA ? 4e4 : 9e3;
        camP.updateProjectionMatrix();
      }
    },
    renderNow() {
      place(t);
      draw();
    },
    debugImage(pts) {
      return plate ? pts.map(([x, y]) => toImage(x, y)) : null;
    },
    getTime() {
      return t;
    },
    duration: endT,
    atEnd() {
      return t >= endT - 1e-6;
    },
    toggle() {
      playing = !playing;
      return playing;
    },
    isPlaying() {
      return playing;
    },
    dispose() {
      cancelAnimationFrame(raf);
      renderer.dispose();
      ovR.dispose();
      host.innerHTML = "";
    }
  };
}
