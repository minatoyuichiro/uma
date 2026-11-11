import * as THREE from "./vendor/three.module.min.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import * as SkeletonUtils from "./vendor/SkeletonUtils.js";
export const CREDIT_RIDER = "騎手の3Dモデル：「Nathan Animated 003」Renderpeople（Sketchfab、CC BY 4.0）を加工";
const H_RIDER = 1.76;
const PRE = "rp_nathan_animated_003_walking_";
const PART = (n) => /spine|shoulder|upperarm|lowerarm/.test(n) ? 1 : /upperleg|hip|root/.test(n) ? 2 : /lowerleg|foot|ball/.test(n) ? 3 : 0;
let LOADED = null;
function load() {
  if (!LOADED) {
    const L = new GLTFLoader();
    LOADED = L.loadAsync("static/assets/jockey/rider.glb?v=1").then((r) => ({ r, mask: makeMask(r) }));
  }
  return LOADED;
}
function makeMask(gltf) {
  let mesh = null;
  gltf.scene.traverse((o) => {
    if (o.isSkinnedMesh && !mesh) mesh = o;
  });
  const g = mesh.geometry, uv = g.attributes.uv, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const bones = mesh.skeleton.bones.map((b) => b.name.replace(PRE, ""));
  const part = (v) => {
    let best = 0, w = -1;
    for (let k = 0; k < 4; k++) {
      const ww = sw.getComponent(v, k);
      if (ww > w) {
        w = ww;
        best = si.getComponent(v, k);
      }
    }
    return PART(bones[best] || "");
  };
  const S = 1024, c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d");
  x.fillStyle = "#000";
  x.fillRect(0, 0, S, S);
  const idx = g.index ? g.index.array : null, nTri = (idx ? idx.length : uv.count) / 3;
  const col = ["", "#ff0000", "#00ff00", "#0000ff"];
  x.lineWidth = 2;
  x.lineJoin = "round";
  for (let t = 0; t < nTri; t++) {
    const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, cc = idx ? idx[t * 3 + 2] : t * 3 + 2;
    const pa = part(a), pb = part(b), pc = part(cc);
    const p = pa === pb || pa === pc ? pa : pb === pc ? pb : pa;
    if (!p) continue;
    x.fillStyle = x.strokeStyle = col[p];
    x.beginPath();
    x.moveTo(uv.getX(a) * S, uv.getY(a) * S);
    x.lineTo(uv.getX(b) * S, uv.getY(b) * S);
    x.lineTo(uv.getX(cc) * S, uv.getY(cc) * S);
    x.closePath();
    x.fill();
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  return tex;
}
function silkMaterial(base, mask, silk) {
  const m = base.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMask = { value: mask };
    sh.uniforms.uSilk = { value: new THREE.Color(silk) };
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D uMask; uniform vec3 uSilk;").replace("#include <map_fragment>", `#include <map_fragment>
{ vec3 mk = texture2D(uMask, vMapUv).rgb;
  float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  float sh = clamp(l * 2.2, 0.35, 1.25);                     // 元の服のしわの陰影を残す
  diffuseColor.rgb = mix(diffuseColor.rgb, uSilk * sh, mk.r);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93) * sh, mk.g);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06) * sh, mk.b); }`);
  };
  m.customProgramCacheKey = () => "silk";
  m.roughness = 0.7;
  return m;
}
export async function makeRider(jGroup, silk) {
  const { r, mask } = await load();
  const root = new THREE.Group();
  jGroup.add(root);
  const m = SkeletonUtils.clone(r.scene);
  root.add(m);
  let mesh = null;
  m.traverse((o) => {
    if (o.isSkinnedMesh) {
      mesh = o;
      o.frustumCulled = false;
      o.castShadow = true;
    }
  });
  mesh.material = silkMaterial(mesh.material, mask, silk);
  const B = {};
  m.traverse((o) => {
    if (o.isBone) B[o.name.replace(PRE, "")] = o;
  });
  const W = (n) => B[n].getWorldPosition(new THREE.Vector3());
  const upd = () => root.updateWorldMatrix(true, true);
  upd();
  const tall = W("head_end_08").y - Math.min(W("foot_end_l_078").y, W("foot_end_r_085").y);
  m.scale.multiplyScalar(H_RIDER / tall * (1 / root.getWorldScale(new THREE.Vector3()).y));
  upd();
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const fwd = W("jaw_09").applyMatrix4(inv).sub(W("head_07").applyMatrix4(inv));
  fwd.y = 0;
  m.rotation.y = Math.atan2(fwd.z, fwd.x);
  upd();
  const headBox = (() => {
    const names = [
      "head_07",
      "head_end_08",
      "jaw_09",
      "jaw_end_010",
      "eye_l_011",
      "eye_r_013",
      "eyelid_l_017",
      "eyelid_r_019",
      "eyebrow_l_021",
      "eyebrow_r_022",
      "mouth_l_015",
      "mouth_r_016"
    ];
    const idx = new Set(names.map((n) => mesh.skeleton.bones.findIndex((b) => b.name === PRE + n)).filter((k) => k >= 0));
    const pa = mesh.geometry.attributes.position, si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
    upd();
    const inv3 = new THREE.Matrix4().copy(B.head_07.matrixWorld).invert();
    const M = new THREE.Matrix4().multiplyMatrices(inv3, mesh.matrixWorld);
    const box = new THREE.Box3(), v = new THREE.Vector3();
    for (let k = 0; k < pa.count; k++) {
      let w = 0;
      for (let c = 0; c < 4; c++) if (idx.has(si.getComponent(k, c))) w += sw.getComponent(k, c);
      if (w >= 0.6) box.expandByPoint(v.fromBufferAttribute(pa, k).applyMatrix4(M));
    }
    return box;
  })();
  const qRoot = root.getWorldQuaternion(new THREE.Quaternion());
  const inv2 = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const side = (n) => Math.sign(W(n).applyMatrix4(inv2).z) || 1;
  const aim = (bone, child, dir) => {
    const b = B[bone], c = B[child];
    upd();
    const cur = W(child).sub(W(bone)).normalize();
    const tgt = dir.clone().normalize().applyQuaternion(qRoot);
    const q = new THREE.Quaternion().setFromUnitVectors(cur, tgt);
    const bw = b.getWorldQuaternion(new THREE.Quaternion());
    const pw = b.parent.getWorldQuaternion(new THREE.Quaternion());
    b.quaternion.copy(pw.invert().multiply(q.multiply(bw)));
    upd();
    void c;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  aim("spine_01_03", "spine_02_04", V(0.97, 0.2, 0));
  aim("spine_02_04", "spine_03_05", V(0.98, 0.16, 0));
  aim("spine_03_05", "neck_06", V(0.93, 0.36, 0));
  aim("neck_06", "head_07", V(0.72, 0.69, 0));
  aim("head_07", "head_end_08", V(0.38, 0.93, 0));
  for (const s of ["l", "r"]) {
    const L = s === "l", sd = side(L ? "upperleg_l_074" : "upperleg_r_081");
    const n = (a, b) => L ? a : b;
    aim(n("upperleg_l_074", "upperleg_r_081"), n("lowerleg_l_075", "lowerleg_r_082"), V(0.48, -0.68, 0.55 * sd));
    aim(n("lowerleg_l_075", "lowerleg_r_082"), n("foot_l_076", "foot_r_083"), V(-0.32, -0.9, 0.3 * sd));
    aim(n("foot_l_076", "foot_r_083"), n("ball_l_077", "ball_r_084"), V(0.9, -0.3, 0));
    const sa = side(n("upperarm_l_024", "upperarm_r_049"));
    aim(n("upperarm_l_024", "upperarm_r_049"), n("lowerarm_l_025", "lowerarm_r_050"), V(0.78, -0.58, 0.16 * sa));
    aim(n("lowerarm_l_025", "lowerarm_r_050"), n("hand_l_026", "hand_r_051"), V(0.93, -0.36, -0.12 * sa));
  }
  upd();
  const hip = W("hip_02").applyMatrix4(new THREE.Matrix4().copy(root.matrixWorld).invert());
  m.position.sub(hip).add(V(-0.05, 0.28, 0));
  upd();
  const hc = headBox.getCenter(new THREE.Vector3()), hs = headBox.getSize(new THREE.Vector3());
  const upL = B.head_end_08.position.clone().normalize();
  const jaw = B.jaw_09.position.clone();
  const fwdL = jaw.sub(upL.clone().multiplyScalar(jaw.dot(upL))).normalize();
  const dims = [hs.x, hs.y, hs.z].sort((a, b) => a - b);
  const rad = dims[1] * 0.53;
  const capM = new THREE.MeshStandardMaterial({ color: new THREE.Color(silk), roughness: 0.4 });
  const cap = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(rad, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), capM);
  dome.scale.set(0.92, 0.85, 1.08);
  const peak = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.95, rad * 0.95, rad * 0.05, 20, 1, false, -0.7, 1.4), capM);
  peak.position.set(0, 0, rad * 0.12);
  dome.castShadow = peak.castShadow = true;
  cap.add(dome, peak);
  upd();
  const qH = B.head_07.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(root.getWorldQuaternion(new THREE.Quaternion()));
  const skyL = V(0, 1, 0).applyQuaternion(qH);
  const capUp = skyL.normalize();
  const capFwd = fwdL.clone().sub(capUp.clone().multiplyScalar(fwdL.dot(capUp))).normalize();
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(capUp, capFwd), capUp, capFwd);
  cap.quaternion.setFromRotationMatrix(basis);
  cap.position.copy(hc).add(capUp.clone().multiplyScalar(-hs.length() * 0.01)).add(capFwd.clone().multiplyScalar(dims[1] * 0.21));
  B.head_07.add(cap);
  return root;
}
