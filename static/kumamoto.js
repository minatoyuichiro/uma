import * as THREE from "./vendor/three.module.min.js";
const BASE = "static/assets/kumamoto/";
const SHIMOTORI = { e: 252, n: -521 };
const get = (f, kind) => fetch(BASE + f + "?v=1").then((r) => {
  if (!r.ok) throw new Error(f + " " + r.status);
  return kind === "json" ? r.json() : r.arrayBuffer();
});
function facadeTex(kind) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const x = c.getContext("2d");
  const rnd = /* @__PURE__ */ ((i) => () => (i = i * 16807 % 2147483647) / 2147483647)(kind * 97 + 11);
  if (kind === 0) {
    x.fillStyle = "#cfd3d6";
    x.fillRect(0, 0, 128, 128);
    const g = x.createLinearGradient(0, 30, 0, 100);
    g.addColorStop(0, "#9fb4c6");
    g.addColorStop(1, "#4f6273");
    x.fillStyle = g;
    x.fillRect(0, 26, 128, 76);
    x.fillStyle = "rgba(255,255,255,.18)";
    x.fillRect(0, 26, 128, 10);
    x.fillStyle = "#8c949b";
    for (let i = 0; i < 128; i += 32) x.fillRect(i, 26, 3, 76);
  } else if (kind === 1) {
    x.fillStyle = "#e6e0d4";
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = "#5d6670";
    x.fillRect(14, 20, 44, 60);
    x.fillRect(70, 20, 44, 60);
    x.fillStyle = "rgba(210,225,235,.35)";
    x.fillRect(14, 20, 44, 12);
    x.fillRect(70, 20, 44, 12);
    x.fillStyle = "#c9c2b4";
    x.fillRect(0, 80, 128, 30);
    x.fillStyle = "#a8a092";
    x.fillRect(0, 80, 128, 4);
    for (let i = 0; i < 6; i++) if (rnd() < 0.5) {
      x.fillStyle = ["#f2efe8", "#d6c8a8", "#b9c7d8"][i % 3];
      x.fillRect(16 + i * 18, 60, 10, 20);
    }
  } else {
    x.fillStyle = "#d8cfbf";
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = "#6b6f73";
    x.fillRect(22, 30, 30, 36);
    x.fillRect(78, 30, 30, 36);
    x.fillStyle = "#9ea7ae";
    x.fillRect(22, 30, 30, 8);
    x.fillRect(78, 30, 30, 8);
    x.fillStyle = "#b3a896";
    x.fillRect(0, 112, 128, 16);
  }
  for (let i = 0; i < 700; i++) {
    x.fillStyle = `rgba(${rnd() < 0.5 ? "0,0,0" : "255,255,255"},${rnd() * 0.05})`;
    x.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 5, 1 + rnd() * 9);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export async function loadKumamoto(geo, castle, halfW, goal, texLoader) {
  const [meta, nearB, farB, bB, tB] = await Promise.all([
    get("meta.json", "json"),
    get("near_h.bin"),
    get("far_h.bin"),
    get("bldg.bin"),
    get("trees.bin")
  ]);
  const S = geo.straight_m, R = geo.turn_radius_m;
  const [cx, cy] = castle;
  const ux = -cx, uy = -cy;
  const th = Math.atan2(uy, ux) - Math.atan2(-SHIMOTORI.n, SHIMOTORI.e);
  const co = Math.cos(th), si = Math.sin(th);
  const toPack = (e, n) => [cx + e * co - -n * si, cy + e * si + -n * co];
  const sdf = (x, y) => Math.hypot(Math.max(Math.abs(x) - S / 2, 0), y) - R;
  const GROUNDS = halfW + 95;
  const BLEND = 140;
  const nearL = meta.layers.near, farL = meta.layers.far;
  const nearH = new Float32Array(nearB), farH = new Float32Array(farB);
  const hAt = (L, H, e, n) => {
    const g = L.grid, s = 2 * L.half_m / (g - 1);
    const fx = (e + L.half_m) / s, fy = (L.half_m - n) / s;
    const i = Math.min(Math.max(Math.floor(fx), 0), g - 2), j = Math.min(Math.max(Math.floor(fy), 0), g - 2);
    const a = Math.min(Math.max(fx - i, 0), 1), b = Math.min(Math.max(fy - j, 0), 1);
    const p = (k) => H[k];
    return (p(j * g + i) * (1 - a) + p(j * g + i + 1) * a) * (1 - b) + (p((j + 1) * g + i) * (1 - a) + p((j + 1) * g + i + 1) * a) * b;
  };
  const toReal = (x, y) => {
    const dx = x - cx, dy = y - cy;
    const e = dx * co + dy * si, mn = -dx * si + dy * co;
    return [e, -mn];
  };
  const samp = [];
  for (let p = 0; p < 1; p += 0.02) {
    const a = p * 2 * Math.PI, x = Math.cos(a) * (S / 2 + R), y = Math.sin(a) * R;
    const [e, n] = toReal(x, y);
    samp.push(hAt(nearL, nearH, e, n));
  }
  samp.sort((a, b) => a - b);
  const h0 = samp[samp.length >> 1];
  const group = new THREE.Group();
  function terrain(L, H, photo, lower, skipNear) {
    const g = L.grid, st = 2, gs = (g - 1) / st;
    const geom = new THREE.PlaneGeometry(2 * L.half_m, 2 * L.half_m, gs, gs);
    const pos = geom.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const e = pos.getX(k), n = pos.getY(k);
      const [x, y] = toPack(e, n);
      const r = Math.floor(k / (gs + 1)) * st, c = k % (gs + 1) * st;
      let h = H[r * g + c] - h0 - lower;
      if (skipNear && Math.abs(e) < nearL.half_m - 60 && Math.abs(n) < nearL.half_m - 60) h -= 6;
      const d = sdf(x, y);
      if (d < GROUNDS) h = -0.6;
      else if (d < GROUNDS + BLEND) {
        const s = (d - GROUNDS) / BLEND, w = s * s * (3 - 2 * s);
        h = -0.6 + (h + 0.6) * w;
      }
      pos.setXYZ(k, x, h, y);
    }
    geom.computeVertexNormals();
    const tex = texLoader.load(BASE + photo + "?v=1");
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const m = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide
    }));
    m.receiveShadow = true;
    return m;
  }
  group.add(terrain(nearL, nearH, nearL.photo, 0, false));
  if (window.UMA_NO_H3) group.add(terrain(farL, farH, farL.photo, 1.5, true));
  const dv = new DataView(bB);
  const nB = dv.getUint32(0, true), nP = dv.getUint32(4, true);
  const hts = new Int16Array(bB, 8, nB * 2);
  const pts = new Int16Array(bB, 8 + nB * 4, nP * 2);
  const cnt = new Uint8Array(bB, 8 + nB * 4 + nP * 4, nB);
  const Q = meta.buildings.quant_m;
  const [gx, gy] = goal;
  const segL = Math.hypot(cx - gx, cy - gy);
  const corridor = (x, y, tMax = 1) => {
    const t = ((x - gx) * (cx - gx) + (y - gy) * (cy - gy)) / (segL * segL);
    if (t < 0 || t > tMax) return false;
    const px = gx + (cx - gx) * t, py = gy + (cy - gy) * t;
    return Math.hypot(x - px, y - py) < 45 + 70 * t;
  };
  const NK = 5, wallP = [...Array(NK)].map(() => []), wallU = [...Array(NK)].map(() => []), wallC = [...Array(NK)].map(() => []), wallH = [...Array(NK)].map(() => []), roofP = [], roofU = [];
  const col = new THREE.Color();
  let off = 0, kept = 0;
  const NEAR_B = 450;
  for (let b = 0; b < nB; b++) {
    const n = cnt[b], ring = [];
    let me = 0, mn = 0;
    for (let k = 0; k < n; k++) {
      const e = pts[(off + k) * 2] * Q, nn = pts[(off + k) * 2 + 1] * Q;
      ring.push([e, nn]);
      me += e;
      mn += nn;
    }
    off += n;
    me /= n;
    mn /= n;
    const [bx, by] = toPack(me, mn);
    const dG = sdf(bx, by);
    if (dG > GROUNDS + NEAR_B) continue;
    if (dG < GROUNDS + 25) continue;
    if (Math.hypot(me, mn) < 190) continue;
    if (corridor(bx, by)) continue;
    kept++;
    const y0 = hts[b * 2] / 10 - h0 - 1, y1 = y0 + 1 + hts[b * 2 + 1] / 10;
    const P = ring.map(([e, nn]) => toPack(e, nn));
    const hgt = hts[b * 2 + 1] / 10, tall = hgt > 14;
    const hsh = b * 2654435761 >>> 0;
    const kind = hgt > 30 ? [0, 3, 0, 1][hsh % 4] : hgt > 9 ? [1, 3, 4, 4, 3][hsh % 5] : 2;
    if (kind === 2) col.setHSL(0.08 + b * 7919 % 100 / 900, 0.18, 0.7 + b * 104729 % 100 / 1e3);
    else col.setHSL(0.08, 0.04, 0.86 + b * 104729 % 100 / 700);
    for (let k = 0; k < n; k++) {
      const [ax, ay] = P[k], [qx, qy] = P[(k + 1) % n];
      const len = Math.hypot(qx - ax, qy - ay);
      const u1 = kind === 2 ? len / 4 : len / 12, v1 = kind === 2 ? (y1 - y0) / 3.3 : (y1 - y0) / 12;
      wallP[kind].push(ax, y0, ay, qx, y0, qy, qx, y1, qy, ax, y0, ay, qx, y1, qy, ax, y1, ay);
      wallU[kind].push(0, 0, u1, 0, u1, v1, 0, 0, u1, v1, 0, v1);
      for (let r = 0; r < 6; r++) wallC[kind].push(col.r, col.g, col.b);
      const hh = y1 - y0;
      wallH[kind].push(0, 0, hh, 0, hh, hh);
    }
    const tri = THREE.ShapeUtils.triangulateShape(P.map(([x, y]) => new THREE.Vector2(x, y)), []);
    for (const t of tri) {
      for (const i of t) {
        const [e, nn] = ring[i];
        roofP.push(P[i][0], y1, P[i][1]);
        roofU.push((e + nearL.half_m) / (2 * nearL.half_m), (nn + nearL.half_m) / (2 * nearL.half_m));
      }
    }
  }
  const mk = (P, U, C) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
    if (C) g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
    g.computeVertexNormals();
    return g;
  };
  const PHOTO = { 0: "Facade001", 1: "Facade018A", 3: "Facade019A", 4: "Facade020A" };
  const ftex = (id, sfx, srgb) => {
    const t = texLoader.load("static/assets/tex/facade/" + id + sfx + ".jpg?v=1");
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  for (let kd = 0; kd < NK; kd++) {
    if (!wallP[kd].length) continue;
    const ph = PHOTO[kd];
    const mat = ph ? new THREE.MeshStandardMaterial({
      map: ftex(ph, "_c", true),
      normalMap: ftex(ph, "_n", false),
      vertexColors: true,
      roughness: kd === 0 ? 0.35 : 0.8,
      metalness: kd === 0 ? 0.25 : 0,
      side: THREE.DoubleSide
    }) : new THREE.MeshStandardMaterial({ map: facadeTex(2), vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aoh; varying float vAoh;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvAoh = aoh;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vAoh;").replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb *= mix(0.45, 1.0, smoothstep(0.0, 6.0, vAoh));");
    };
    const gW = mk(wallP[kd], wallU[kd], wallC[kd]);
    gW.setAttribute("aoh", new THREE.Float32BufferAttribute(wallH[kd], 1));
    const w = new THREE.Mesh(gW, mat);
    w.receiveShadow = true;
    group.add(w);
  }
  const roofTex = texLoader.load(BASE + nearL.photo + "?v=1");
  roofTex.colorSpace = THREE.SRGBColorSpace;
  const roofs = new THREE.Mesh(mk(roofP, roofU), new THREE.MeshStandardMaterial({
    map: roofTex,
    roughness: 0.9,
    side: THREE.DoubleSide
  }));
  roofs.receiveShadow = true;
  group.add(roofs);
  {
    const T = new Int16Array(tB), nT = T.length / 2;
    const geoT = new THREE.BufferGeometry();
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
      geoT.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
      geoT.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
      geoT.setIndex(I);
      geoT.computeVertexNormals();
      const nr = geoT.attributes.normal;
      for (let v = 0; v < nr.count; v++) nr.setXYZ(v, 0, 1, 0);
    }
    const tTex = texLoader.load("static/assets/tree/tree_b.webp?v=1");
    tTex.colorSpace = THREE.SRGBColorSpace;
    tTex.anisotropy = 4;
    const mT = new THREE.MeshBasicMaterial({ map: tTex, alphaTest: 0.45, side: THREE.DoubleSide, color: 15266016 });
    const trees = new THREE.InstancedMesh(geoT, mT, nT * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    let k = 0;
    const bases = [];
    for (let i = 0; i < nT; i++) {
      const e = T[i * 2], nn = T[i * 2 + 1];
      const [x, y] = toPack(e, nn);
      const dT = sdf(x, y);
      if (dT < GROUNDS + 12) continue;
      if (dT > GROUNDS + 350 && Math.hypot(e, nn) > 130) continue;
      if (corridor(x, y, 0.7)) continue;
      const tall = 7 + i * 7919 % 100 / 12;
      const h = hAt(nearL, nearH, e, nn) - h0;
      p.set(x, h - 0.3, y);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 2654435761 >>> 0) % 628 / 100);
      sc.set(tall * 1.05, tall, tall * 1.05);
      trees.setMatrixAt(k, m4.compose(p, q, sc));
      const lum = 0.82 + i * 104729 % 100 / 450;
      c.setRGB(lum, lum * 1.02, lum * 0.95);
      trees.setColorAt(k, c);
      k++;
      if (dT < GROUNDS + 200) bases.push([x, h, y, tall, i]);
      if (dT < GROUNDS + 200) {
        const jx = (i * 7907 % 100 - 50) / 12, jz = (i * 6007 % 100 - 50) / 12, t2 = tall * (0.7 + i * 131 % 100 / 300);
        p.set(x + jx, h - 0.3, y + jz);
        sc.set(t2 * 1.05, t2, t2 * 1.05);
        trees.setMatrixAt(k, m4.compose(p, q, sc));
        trees.setColorAt(k, c);
        k++;
      }
    }
    trees.count = k;
    {
      const c2 = document.createElement("canvas");
      c2.width = c2.height = 64;
      const x = c2.getContext("2d"), gr = x.createRadialGradient(32, 32, 2, 32, 32, 31);
      gr.addColorStop(0, "rgba(0,0,0,0.55)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = gr;
      x.fillRect(0, 0, 64, 64);
      const blob = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c2), transparent: true, depthWrite: false }),
        k
      );
      const mm = new THREE.Matrix4(), pp = new THREE.Vector3(), ss = new THREE.Vector3(), qq = new THREE.Quaternion(), sc2 = new THREE.Vector3();
      for (let i = 0; i < k; i++) {
        trees.getMatrixAt(i, mm);
        mm.decompose(pp, qq, ss);
        pp.y += 0.35;
        sc2.set(ss.x * 0.75, 1, ss.x * 0.75);
        blob.setMatrixAt(i, mm.compose(pp, new THREE.Quaternion(), sc2));
      }
      blob.renderOrder = 1;
      group.add(blob);
    }
    if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
    {
      const sTex = texLoader.load("static/assets/tree/shrub.webp?v=1");
      sTex.colorSpace = THREE.SRGBColorSpace;
      sTex.anisotropy = 4;
      const bi = new THREE.InstancedMesh(geoT, new THREE.MeshBasicMaterial({
        map: sTex,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
        color: 15002844
      }), bases.length * 2);
      let n = 0;
      for (const [x, h, y, tall, i] of bases) for (let j = 0; j < 2; j++) {
        const a = (i * 7919 + j * 3571 >>> 0) % 628 / 100, r = tall * (0.1 + (i + j) * 131 % 100 / 900);
        const hb = 1.2 + (i * 31 + j * 17) % 100 / 120, H = hb / 0.45;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a * 1.7);
        bi.setMatrixAt(n++, m4.compose(p.set(x + Math.cos(a) * r, h - 0.15, y + Math.sin(a) * r), q, sc.set(H * 1.3, H, H * 1.3)));
      }
      bi.count = n;
      group.add(bi);
    }
    group.add(trees);
  }
  const castleY = meta.tenshu_elev_m - h0;
  return {
    group,
    h0,
    castleY,
    kept,
    toPack,
    credit: "航空写真・標高：" + meta.credit + "／建物：" + meta.buildings.credit
  };
}
