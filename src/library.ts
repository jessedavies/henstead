// Henstead Library: a design reference page, not part of the game.
// Shows every model the game uses, new pieces built in the KayKit style, more KayKit models that could join,
// a look-development diorama (current vs proposed lighting) and the proposed UI kit with icons rendered from the models.
//
// Rendering: one fixed, transparent canvas draws every catalogue thumbnail with scissor rects (the three.js
// "multiple elements" technique), so a hundred live models cost one WebGL context. The diorama has its own
// renderer because it uses post-processing.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/examples/jsm/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/examples/jsm/shaders/VerticalTiltShiftShader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as kit from './kit';
import { makeDog, makeChicken, makeCoop, makeFence, makeGateItem, makePatch, makeDecor } from './kitmodels';
import { makeHawk, makeFox, makeSnake, makeEgg, setSoftStyle, HEN_COLORS } from './models';

setSoftStyle();
const $ = (id: string) => document.getElementById(id)!;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const GAME_PACKS = ['forest', 'village', 'plush', 'halloween', 'kitchen', 'resource'];
const X_PACKS = ['x_forest', 'x_halloween', 'x_village', 'x_bag1', 'x_bag2', 'x_tools', 'x_resource', 'x_holiday', 'x_board', 'x_furniture', 'x_kitchen'];

// ---------- look state ----------
type Look = { warm: boolean; tone: boolean; soft: boolean; ao: boolean; tilt: boolean; life: boolean; outline: boolean; extras: boolean };
const PRESETS: Record<string, Look> = {
  current: { warm: false, tone: false, soft: false, ao: false, tilt: false, life: false, outline: false, extras: false },
  proposed: { warm: true, tone: true, soft: true, ao: false, tilt: true, life: true, outline: false, extras: true },
};
const LABELS: [keyof Look, string][] = [['warm', 'Warm light'], ['tone', 'Tone mapping'], ['soft', 'Soft shadows'], ['ao', 'Ambient occlusion (heavy)'], ['tilt', 'Tilt-shift'], ['life', 'Idle life'], ['outline', 'Outlines'], ['extras', 'New pieces']];
const look: Look = { ...PRESETS.proposed };
let lifeAmp = 1;

// ---------- shared helpers ----------
const lam = (color: number) => new THREE.MeshLambertMaterial({ color });
const rbox = (w: number, h: number, d: number, color: number, r = 0.3) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * r), lam(color)); m.castShadow = true; m.receiveShadow = true; return m; };
const ball = (r: number, color: number, w = 16, h = 12) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, w, h), lam(color)); m.castShadow = true; return m; };
const pretty = (n: string) => n.replace(/_Color1$/, '').replace(/^building_/, '').replace(/_/g, ' ').replace(/\b([a-z])/, c => c.toUpperCase()).replace(/ ([A-Z]) /g, ' $1 ').trim();

/** A KayKit model scaled so its largest side (or height) is `size`, centred on x/z and sitting on y = 0. */
function sized(name: string, size: number, by: 'max' | 'y' = 'max', tint?: number) {
  const m = kit.mesh(name, tint !== undefined ? { tint } : {}); const b = kit.box(name);
  const dims = [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
  const s = size / (by === 'y' ? dims[1] : Math.max(...dims));
  m.scale.setScalar(s); m.position.set((-(b[0] + b[3]) / 2) * s, -b[1] * s, (-(b[2] + b[5]) / 2) * s);
  const g = new THREE.Group(); g.add(m); return g;
}

/** Fits any object into a ~1.7 unit box, centred, resting on the ground. Returns its final size. */
function fit(obj: THREE.Object3D, target = 1.7) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj), s = b.getSize(new THREE.Vector3());
  const k = target / Math.max(s.y, Math.max(s.x, s.z) * 0.92, 0.001);
  obj.scale.multiplyScalar(k);
  obj.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj), c = b2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= b2.min.y;
  return b2.getSize(new THREE.Vector3());
}

// Blob shadow: one soft radial texture for every thumbnail.
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(70,45,20,0.55)'); gr.addColorStop(1, 'rgba(70,45,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
})();
const blob = (w: number, d: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })); m.scale.set(w * 1.35, 1, d * 1.35); m.position.y = 0.005; m.renderOrder = -1; return m; };

// Outlines: an inverted hull pushed out in clip space, so the line is the same width at any scale.
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x3b2a1f, side: THREE.BackSide });
outlineMat.onBeforeCompile = s => { s.vertexShader = s.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n{ vec3 n = normalize(normalMatrix * normal); gl_Position.xy += n.xy * 0.0055 * gl_Position.w; }'); };
const hulls: THREE.Mesh[] = [];
function addOutlines(root: THREE.Object3D) {
  const list: THREE.Mesh[] = [];
  root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !(m as any).isInstancedMesh && !m.userData.noOutline && !(m.material as THREE.Material).transparent) list.push(m); });
  for (const m of list) {
    let h: THREE.Mesh;
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) { const sm = m as THREE.SkinnedMesh; const s = new THREE.SkinnedMesh(sm.geometry, outlineMat); s.bind(sm.skeleton, sm.bindMatrix); h = s; }
    else h = new THREE.Mesh(m.geometry, outlineMat);
    h.castShadow = false; h.receiveShadow = false; h.userData.noOutline = true; h.visible = look.outline; h.frustumCulled = false;
    m.add(h); hulls.push(h);
  }
}

// Lighting rigs: every scene registers its lights so the look toggles reach thumbnails and the diorama alike.
type Rig = { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight; scale: number };
const rigs: Rig[] = [];
function makeRig(scene: THREE.Scene, scale = 1) {
  const r: Rig = { hemi: new THREE.HemisphereLight(), sun: new THREE.DirectionalLight(), scale };
  scene.add(r.hemi, r.sun, r.sun.target); rigs.push(r); applyRig(r); return r;
}
function applyRig(r: Rig) {
  const w = look.warm;
  r.hemi.color.setHex(w ? 0xd3ebff : 0xdff0ff); r.hemi.groundColor.setHex(w ? 0x8a8f52 : 0x8a9a6a); r.hemi.intensity = w ? 1.35 : 1.0;
  r.sun.color.setHex(w ? 0xffd9a3 : 0xfff4e0); r.sun.intensity = w ? 3.1 : 2.4;
  const d = w ? new THREE.Vector3(-22, 24, 13) : new THREE.Vector3(-14, 34, 16);
  r.sun.position.copy(r.sun.target.position).addScaledVector(d, r.scale);
}

// ---------- animation ----------
type Anim = (t: number, dt: number, amp: number) => void;
/** Idle squash-and-bob for an animal, with an occasional peck when `head` is given. */
function idle(group: THREE.Object3D, head?: THREE.Object3D, seed = Math.random() * 10): Anim {
  const by = group.position.y, sy = group.scale.y, sx = group.scale.x;
  return (t, _dt, a) => {
    const b = Math.sin(t * 5 + seed);
    group.position.y = by + Math.max(0, b) * 0.04 * a * sy;
    group.scale.y = sy * (1 + b * 0.035 * a); group.scale.x = group.scale.z = sx * (1 - b * 0.018 * a);
    if (head) { const p = Math.max(0, Math.sin(t * 1.3 + seed * 3)); head.rotation.x = Math.pow(p, 8) * 0.55 * a; }
  };
}
const sway = (o: THREE.Object3D, k = 0.03, seed = Math.random() * 10): Anim => { const z = o.rotation.z, x = o.rotation.x; return (t, _d, a) => { o.rotation.z = z + Math.sin(t * 1.1 + seed) * k * a; o.rotation.x = x + Math.sin(t * 0.8 + seed * 2) * k * 0.6 * a; }; };

// ---------- models made for Henstead ----------
const EGG_GEO = (() => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 18; i++) { const t = (i / 18) * Math.PI; pts.push(new THREE.Vector2(Math.max(0.0001, Math.sin(t) * 0.1 * (1 + 0.16 * Math.cos(t))), (1 - Math.cos(t)) * 0.13)); }
  return new THREE.LatheGeometry(pts, 22);
})();
function egg(color: number, speckle = 0, gold = false) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(EGG_GEO, gold ? new THREE.MeshLambertMaterial({ color: 0xf7c34f, emissive: 0x6a4500, emissiveIntensity: 0.35 }) : lam(color)); m.castShadow = true; g.add(m);
  for (let i = 0; i < speckle; i++) {
    const a = i * 2.4, y = 0.04 + ((i * 37) % 17) / 17 * 0.17, t = Math.acos(1 - y / 0.13), r = Math.sin(t) * 0.1 * (1 + 0.16 * Math.cos(t));
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.012 + (i % 3) * 0.004, 6), lam(0x7a5a3c)); d.position.set(Math.cos(a) * r * 1.01, y, Math.sin(a) * r * 1.01); d.lookAt(d.position.x * 3, y, d.position.z * 3); g.add(d);
  }
  if (gold) for (let i = 0; i < 3; i++) { const s = sparkle(0.04); s.position.set(Math.cos(i * 2.1) * 0.17, 0.12 + i * 0.07, Math.sin(i * 2.1) * 0.17); g.add(s); }
  return g;
}
const EGGS: [string, number, number, boolean][] = [['Cream', 0xf6ead2, 0, false], ['Brown', 0xc98b5a, 0, false], ['Sky blue', 0xa9d8dc, 0, false], ['Olive', 0x9fa86a, 0, false], ['Speckled', 0xe8cfa6, 14, false], ['Golden', 0, 0, true]];
function sparkle(r = 0.06) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), new THREE.MeshBasicMaterial({ color: 0xfff1a8 })); m.userData.noOutline = true; m.name = 'sparkle'; return m; }

function mushroom(h = 0.24, cap = 0xe2584b) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, h, 10), lam(0xf6ead2)); stem.position.y = h / 2; stem.castShadow = true; g.add(stem);
  const c = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), lam(cap)); c.scale.y = 0.75; c.position.y = h - 0.02; c.castShadow = true; g.add(c);
  for (let i = 0; i < 6; i++) { const p = 0.35 + (i % 3) * 0.3, a = i * 1.9; const d = ball(0.022, 0xfff8ea, 8, 6); d.scale.y = 0.5; d.position.set(Math.sin(p) * Math.cos(a) * 0.15, h - 0.02 + Math.cos(p) * 0.15 * 0.75, Math.sin(p) * Math.sin(a) * 0.15); g.add(d); }
  return g;
}

const made: Record<string, () => { obj: THREE.Object3D; anims?: Anim[] }> = {
  fox() {
    const g = new THREE.Group(), O = 0xe8803a, W = 0xfff4e4, D = 0x3b2a1f;
    const body = rbox(0.42, 0.38, 0.8, O, 0.45); body.position.set(0, 0.42, 0); g.add(body);
    const chest = rbox(0.3, 0.3, 0.2, W, 0.45); chest.position.set(0, 0.42, 0.34); g.add(chest);
    const head = new THREE.Group(); head.position.set(0, 0.72, 0.42); g.add(head);
    head.add(rbox(0.5, 0.42, 0.42, O, 0.45));
    const snout = rbox(0.26, 0.18, 0.24, W, 0.45); snout.position.set(0, -0.08, 0.26); head.add(snout);
    const nose = ball(0.045, D); nose.position.set(0, -0.04, 0.39); head.add(nose);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 4), lam(O)); ear.position.set(s * 0.15, 0.3, -0.02); ear.rotation.y = Math.PI / 4; ear.castShadow = true; head.add(ear);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4), lam(D)); tip.position.set(s * 0.15, 0.4, -0.02); tip.rotation.y = Math.PI / 4; head.add(tip);
      const eye = ball(0.04, D); eye.position.set(s * 0.12, 0.05, 0.21); head.add(eye);
      const hi = ball(0.014, 0xffffff, 6, 4); hi.position.set(s * 0.12 + 0.012, 0.065, 0.245); hi.userData.noOutline = true; head.add(hi);
    }
    for (const [x, z] of [[-0.13, 0.25], [0.13, 0.25], [-0.13, -0.25], [0.13, -0.25]]) { const l = rbox(0.11, 0.26, 0.12, D, 0.4); l.position.set(x, 0.13, z); g.add(l); }
    const tail = new THREE.Group(); tail.position.set(0, 0.5, -0.38); g.add(tail);
    const tb = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.42, 6, 12), lam(O)); tb.rotation.x = -1.0; tb.position.set(0, 0.15, -0.22); tb.castShadow = true; tail.add(tb);
    const tt = ball(0.13, W); tt.position.set(0, 0.36, -0.42); tail.add(tt);
    return { obj: g, anims: [(t, _d, a) => { tail.rotation.y = Math.sin(t * 3) * 0.35 * a; head.rotation.z = Math.sin(t * 0.9) * 0.12 * a; }, idle(g)] };
  },
  snake() {
    const g = new THREE.Group(), pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * Math.PI * 3.1, r = 0.42 - t * 0.2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0.08 + t * t * 0.32, Math.sin(a) * r)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.085, 10), lam(0x76b84e)); tube.castShadow = true; g.add(tube);
    for (let i = 1; i < 9; i++) { const p = curve.getPoint(i / 10); const s = ball(0.05, 0xf3d26a, 8, 6); s.position.copy(p); s.position.y += 0.06; s.scale.y = 0.5; g.add(s); }
    const end = curve.getPoint(1), head = new THREE.Group(); head.position.copy(end); head.position.y += 0.08; g.add(head);
    const hd = ball(0.14, 0x76b84e); hd.scale.set(1.1, 0.85, 1.3); head.add(hd);
    for (const s of [-1, 1]) { const e = ball(0.045, 0xffffff, 10, 8); e.position.set(s * 0.08, 0.07, 0.08); head.add(e); const p = ball(0.022, 0x3b2a1f, 8, 6); p.position.set(s * 0.085, 0.075, 0.12); head.add(p); }
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.12), lam(0xe2584b)); tongue.position.set(0, -0.03, 0.2); head.add(tongue);
    head.rotation.y = 0.6;
    return { obj: g, anims: [(t, _d, a) => { head.position.y = end.y + 0.08 + Math.sin(t * 2) * 0.03 * a; tongue.scale.z = 0.4 + Math.max(0, Math.sin(t * 7)) * 0.8 * a + (1 - a) * 0.6; }] };
  },
  eggs() {
    const g = new THREE.Group();
    EGGS.forEach(([, c, sp, gold], i) => { const e = egg(c, sp, gold); e.position.set(((i % 3) - 1) * 0.25 + (i >= 3 ? 0.1 : 0), 0, i >= 3 ? 0.22 : -0.04); e.rotation.z = (i % 2 ? -1 : 1) * 0.12; g.add(e); });
    const spk = g.getObjectsByProperty('name', 'sparkle');
    return { obj: g, anims: [(t, _d, a) => spk.forEach((s, i) => { s.rotation.y = t * 2 + i; s.scale.setScalar(0.6 + 0.4 * Math.abs(Math.sin(t * 2.5 + i * 1.7)) * a + (1 - a) * 0.4); })] };
  },
  nest() {
    const g = new THREE.Group();
    g.add(sized('crate_open', 1.0));
    const p = sized('pillow_A', 0.6); p.position.y = 0.2; p.rotation.y = 0.2; g.add(p);
    const eggs = [egg(0xf6ead2), egg(0xc98b5a), egg(0xe8cfa6, 10)];
    eggs.forEach((e, i) => { e.position.set((i - 1) * 0.17, 0.34, (i % 2) * 0.08 - 0.04); e.rotation.z = (i - 1) * 0.3; g.add(e); });
    return { obj: g };
  },
  dig() {
    const g = new THREE.Group();
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam(0x8a6444)); mound.scale.y = 0.38; mound.castShadow = true; mound.receiveShadow = true; g.add(mound);
    for (let i = 0; i < 9; i++) { const c = ball(0.05 + (i % 3) * 0.02, i % 2 ? 0x9b7350 : 0x74533a, 8, 6); const a = i * 0.8, r = 0.5 + (i % 3) * 0.1; c.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r); g.add(c); }
    for (let i = 0; i < 4; i++) { const tuft = sized(i % 2 ? 'Grass_1_B_Color1' : 'Grass_2_B_Color1', 0.32); const a = i * 1.6 + 0.4; tuft.position.set(Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72); g.add(tuft); }
    const spk: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) { const s = sparkle(0.07 - i * 0.008); g.add(s); spk.push(s); }
    return { obj: g, anims: [(t, _d, a) => spk.forEach((s, i) => { const ph = t * 1.4 + i * 1.57; s.position.set(Math.cos(i * 1.7) * 0.22, 0.32 + ((ph % 2) / 2) * 0.5 * a + (1 - a) * i * 0.1, Math.sin(i * 1.7) * 0.22); s.rotation.y = t * 3; s.scale.setScalar(a > 0 ? Math.sin(((ph % 2) / 2) * Math.PI) + 0.2 : 1); })] };
  },
  fairy() {
    const g = new THREE.Group(), list: THREE.Group[] = [];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, m = mushroom(0.18 + (i % 3) * 0.06, i % 4 === 3 ? 0xf7c34f : 0xe2584b); m.position.set(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7); m.rotation.y = a; g.add(m); list.push(m); }
    const c = mushroom(0.34, 0xa98bd8); c.scale.setScalar(1.3); g.add(c); list.push(c);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.85, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.35, depthWrite: false })); glow.position.y = 0.01; g.add(glow);
    return { obj: g, anims: [(t, _d, a) => list.forEach((m, i) => { m.scale.y = (i === 8 ? 1.3 : 1) * (1 + Math.sin(t * 3 + i) * 0.06 * a); }), (t, _d, a) => { (glow.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(t * 1.5) * 0.12 * a; }] };
  },
  pond() {
    const g = new THREE.Group();
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.25, 28).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x7fcde3, emissive: 0x1d5f78, emissiveIntensity: 0.25 })); water.position.y = 0.03; water.receiveShadow = true; g.add(water);
    const edge = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.42, 28).rotateX(-Math.PI / 2), lam(0x9b7a52)); edge.position.y = 0.02; g.add(edge);
    for (let i = 0; i < 10; i++) { const r = sized(['Rock_1_A_Color1', 'Rock_1_B_Color1', 'Rock_1_C_Color1'][i % 3], 0.32 + (i % 3) * 0.08); const a = i * 0.63 + 0.2; r.position.set(Math.cos(a) * 1.38, 0, Math.sin(a) * 1.38); r.rotation.y = i; g.add(r); }
    const lily = sized('waterlily_A', 0.55); lily.position.set(0.3, 0.03, 0.2); g.add(lily);
    const lily2 = sized('waterlily_A', 0.4); lily2.position.set(-0.45, 0.03, -0.3); lily2.rotation.y = 2; g.add(lily2);
    const reed = sized('waterplant_B', 0.7, 'y'); reed.position.set(-0.95, 0, 0.6); g.add(reed);
    return { obj: g, anims: [(t, _d, a) => { lily.position.y = 0.03 + Math.sin(t * 1.3) * 0.015 * a; lily.rotation.y = Math.sin(t * 0.4) * 0.3 * a; }] };
  },
  butterfly() {
    const g = new THREE.Group(), body = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 4, 8), lam(0x3b2a1f)); body.rotation.x = Math.PI / 2; g.add(body);
    const wingShape = new THREE.Shape(); wingShape.absellipse(0.16, 0.06, 0.17, 0.12, 0, Math.PI * 2, false, 0.3);
    const lower = new THREE.Shape(); lower.absellipse(0.11, -0.1, 0.1, 0.08, 0, Math.PI * 2, false, -0.4);
    const wings: THREE.Group[] = [];
    for (const s of [-1, 1]) {
      const w = new THREE.Group(); w.scale.x = s;
      const a = new THREE.Mesh(new THREE.ShapeGeometry(wingShape, 10).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xa98bd8, side: THREE.DoubleSide }));
      const b = new THREE.Mesh(new THREE.ShapeGeometry(lower, 10).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf7c34f, side: THREE.DoubleSide }));
      a.castShadow = b.castShadow = true; w.add(a, b); g.add(w); wings.push(w);
    }
    const holder = new THREE.Group(); g.position.y = 0.6; holder.add(g);
    return { obj: holder, anims: [(t, _d, a) => { const f = Math.sin(t * 16) * 0.9 * a + (1 - a) * 0.35; wings[0].rotation.z = f; wings[1].rotation.z = -f; g.position.y = 0.6 + Math.sin(t * 2) * 0.12 * a; }] };
  },
  henPhones() {
    const h = makeChicken(HEN_COLORS[0], false); const g = new THREE.Group(); g.add(h.group);
    const p = sized('cat_headphones_A', 0.62); p.position.set(0, 0.62, 0.02); h.head.add(p);
    return { obj: g, anims: [idle(h.group, h.head)] };
  },
  henCrown() { const r = crownHen(HEN_COLORS[3]); return { obj: r.g, anims: [idle(r.h.group, r.h.head)] }; },
  hay() {
    const g = new THREE.Group();
    const b = rbox(1.1, 0.62, 0.72, 0xe9c35e, 0.22); b.position.y = 0.31; g.add(b);
    for (const x of [-0.28, 0.28]) { const band = rbox(0.06, 0.66, 0.76, 0xb3823a, 0.3); band.position.set(x, 0.31, 0); g.add(band); }
    for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.16), lam(0xf3d67a)); s.position.set(-0.5 + i * 0.12, 0.6 + (i % 2) * 0.03, -0.3 + (i % 3) * 0.28); s.rotation.set(0.4 * (i % 2 ? 1 : -1), i, 0); g.add(s); }
    return { obj: g };
  },
  scarecrow() {
    const g = new THREE.Group(), wood = 0x8a6444;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.9, 8), lam(wood)); post.position.y = 0.95; post.castShadow = true; g.add(post);
    const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8), lam(wood)); arms.rotation.z = Math.PI / 2; arms.position.y = 1.32; arms.castShadow = true; g.add(arms);
    const shirt = rbox(0.56, 0.6, 0.3, 0x5a8fc0, 0.3); shirt.position.y = 1.15; g.add(shirt);
    for (const s of [-1, 1]) { const sl = rbox(0.34, 0.2, 0.22, 0x5a8fc0, 0.3); sl.position.set(s * 0.42, 1.3, 0); g.add(sl); const straw = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6), lam(0xf3d67a)); straw.rotation.z = s * Math.PI / 2; straw.position.set(s * 0.66, 1.3, 0); g.add(straw); }
    const patch = rbox(0.14, 0.14, 0.04, 0xe2584b, 0.3); patch.position.set(0.12, 1.05, 0.16); g.add(patch);
    const head = sized('sack', 0.42); head.position.y = 1.48; g.add(head);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.04, 16), lam(0xe9c35e)); brim.position.y = 1.86; brim.castShadow = true; g.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.2, 16), lam(0xe9c35e)); crown.position.y = 1.97; g.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.05, 16), lam(0xe2584b)); band.position.y = 1.92; g.add(band);
    for (const s of [-1, 1]) { const e = ball(0.035, 0x3b2a1f); e.position.set(s * 0.09, 1.66, 0.19); g.add(e); }
    return { obj: g, anims: [sway(g, 0.025)] };
  },
};
function crownHen(color: number) {
  const h = makeChicken(color, false); const g = new THREE.Group(); g.add(h.group);
  const crown = new THREE.Group(); crown.position.set(0, 0.8, -0.3); h.head.add(crown);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const f = sized(i % 2 ? 'flax_flower_A' : 'flax_flower_B', 0.16); f.position.set(Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15); crown.add(f); }
  return { g, h };
}
const MADE: [string, string, string, string[]][] = [
  ['fox', 'Fox, rounded', 'Replaces the boxy primitive: big head, white chest, swishing tail. Same proportions as KayKit animals.', ['new', 'fix']],
  ['snake', 'Grass snake', 'Coiled, cartoon eyes, flicking tongue. Gentle enough for a cosy egg thief.', ['new', 'fix']],
  ['scarecrow', 'Scarecrow, KayKit-ish', 'KayKit sack for a head, straw hat, patched shirt. Replaces the primitive.', ['new', 'fix']],
  ['hay', 'Hay bale', 'KayKit has none. Rounded, banded, with stray straw.', ['new', 'build']],
  ['eggs', 'Egg breeds', 'Cream, brown, sky blue, olive, speckled and the rare golden egg. Breed shows in the egg.', ['new', 'find']],
  ['nest', 'Nest box', 'KayKit crate and pillow. A place hens choose, and where eggs are collected.', ['new', 'build']],
  ['dig', 'Something buried', 'The discovery marker: a fresh mound with sparkles where the dog has sniffed something out.', ['new', 'find']],
  ['fairy', 'Fairy ring', 'Appears overnight near the forest edge after clearing. Pure whimsy, no mechanic needed.', ['new', 'find']],
  ['pond', 'Duck pond', 'Water, KayKit rocks, lilies and reeds. A place to build toward.', ['new', 'build']],
  ['butterfly', 'Butterfly', 'Ambient life over flowers. Cheap and makes the clearing breathe.', ['new']],
  ['henPhones', 'Hen in headphones', 'KayKit cat headphones on a hen. Wearables are earned from finds.', ['new', 'wear']],
  ['henCrown', 'Flower crown', 'Flax flowers from Mixed Bag 1 in a ring. Another wearable.', ['new', 'wear']],
];

// ---------- the game's own pieces ----------
const HEN_NAMES = ['Cream', 'Russet', 'Slate', 'Buff', 'Chestnut'];
function farmerClone() {
  const g = kit.farmerGltf!; const s = SkeletonUtils.clone(g.scene) as THREE.Group; s.scale.setScalar(0.8);
  const mixer = new THREE.AnimationMixer(s); mixer.clipAction(g.clips.find(c => c.name === 'Idle_A')!).play();
  const holder = new THREE.Group(); holder.add(s);
  return { obj: holder, anims: [((_t: number, dt: number) => mixer.update(dt)) as Anim] };
}
type Spec = { id: string; name: string; note: string; tags: string[]; build: () => { obj: THREE.Object3D; anims?: Anim[] } };
const GAME: [string, Spec[]][] = [
  ['Characters', [
    { id: 'farmer', name: 'Farmer', note: 'KayKit Ranger, Adventurers pack. Idle, walk, run, interact.', tags: ['kaykit'], build: farmerClone },
    { id: 'dog', name: 'Border collie', note: 'Mini-Game Variety dog, repainted by tools/recolor.py.', tags: ['kaykit'], build: () => { const d = makeDog(); return { obj: d.group, anims: [idle(d.inner, d.head)] }; } },
    ...HEN_COLORS.map((c, i) => ({ id: 'hen' + i, name: 'Hen · ' + HEN_NAMES[i], note: 'Chicken plush, Mixed Bag 1' + (i > 1 ? ', tinted.' : '.'), tags: ['kaykit'], build: () => { const h = makeChicken(c, false); return { obj: h.group, anims: [idle(h.group, h.head)] }; } })),
    { id: 'rooster', name: 'Rooster', note: 'Plush B with a cone tail added.', tags: ['kaykit'], build: () => { const h = makeChicken(HEN_COLORS[0], false, true); return { obj: h.group, anims: [idle(h.group, h.head)] }; } },
    { id: 'chick', name: 'Chick', note: 'Plush A, small and yellow.', tags: ['kaykit'], build: () => { const h = makeChicken(HEN_COLORS[0], true); return { obj: h.group, anims: [idle(h.group, h.head)] }; } },
  ]],
  ['Farm', [
    { id: 'coop', name: 'Coop', note: 'Medieval Hexagon cottage at 3.5x.', tags: ['kaykit'], build: () => ({ obj: makeCoop() }) },
    { id: 'fence', name: 'Fence', note: 'Hexagon picket fence, stretched to 2 units.', tags: ['kaykit'], build: () => ({ obj: makeFence() }) },
    { id: 'gate', name: 'Gate', note: 'Hinged at one end so it swings.', tags: ['kaykit'], build: () => { const g = makeGateItem(); return { obj: g.group, anims: [(t, _d, a) => { g.leaf.rotation.y = (Math.sin(t * 0.8) * 0.5 + 0.5) * 1.2 * a; }] }; } },
    ...([['Feed patch · sown', 0.4, 0], ['Feed patch · ripe', 1, 8], ['Feed patch · eaten', 1, 2]] as [string, number, number][]).map(([n, gr, sv], i) => ({ id: 'patch' + i, name: n, note: 'Soil box, grass sprouts, then the hexagon grain field.', tags: ['kaykit'], build: () => { const p = makePatch(); p.set(gr, sv); return { obj: p.group }; } })),
  ]],
  ['Decorations', ([['flowers', 'Flowers'], ['hay', 'Log pile'], ['lantern', 'Lantern'], ['bench', 'Bench'], ['barrel', 'Barrel'], ['pumpkins', 'Pumpkins'], ['crate', 'Veg crate'], ['well', 'Well'], ['wheelbarrow', 'Wheelbarrow'], ['scarecrow', 'Scarecrow']] as [string, string][]).map(([t, n]) => ({ id: 'decor-' + t, name: n, note: t === 'scarecrow' ? 'Primitive: no KayKit scarecrow.' : t === 'hay' ? 'Item id is still "hay" for old saves.' : 'KayKit.', tags: t === 'scarecrow' ? ['prim'] : ['kaykit'], build: () => ({ obj: makeDecor(t) }) }))],
  ['Visitors and props', [
    { id: 'fox0', name: 'Fox', note: 'Primitive boxes. See the rounded one in New pieces.', tags: ['prim'], build: () => { const f = makeFox(); return { obj: f.group, anims: [(t, _d, a) => { f.tail.rotation.y = Math.sin(t * 3) * 0.3 * a; }] }; } },
    { id: 'hawk0', name: 'Hawk', note: 'Primitive. Seen mostly as a shadow; a silhouette pass is enough.', tags: ['prim'], build: () => { const h = makeHawk(); return { obj: h.group, anims: [(t, _d, a) => h.wings.forEach((w: THREE.Object3D, i: number) => { w.rotation.z = (i ? -1 : 1) * Math.sin(t * 6) * 0.4 * a; })] }; } },
    { id: 'snake0', name: 'Snake', note: 'Primitive segments.', tags: ['prim'], build: () => ({ obj: makeSnake().group }) },
    { id: 'egg0', name: 'Egg', note: 'An icosahedron. One shape for every hen.', tags: ['prim'], build: () => ({ obj: makeEgg() }) },
  ]],
];

// Themes for the extra KayKit models.
const THEMES: [string, string, string[]][] = [
  ['finds', 'Finds to dig up', ['Gold_Nugget_Small', 'Silver_Nugget_Small', 'Copper_Nugget_Small', 'coin_gold', 'coin_copper', 'idol_A', 'idol_B', 'rollerskate_A', 'pickle_jar', 'puzzlecube_complete', 'umbrella_pink', 'mining_helmet', 'compass_base', 'map_rolled', 'bell', 'book_mimic', 'hourglass', 'D6_A', 'cat_headphones_A']],
  ['explore', 'Explorer kit', ['journal_open', 'journal_closed', 'magnifying_glass', 'shovel', 'trowel', 'lantern', 'rope_bundle_A', 'instantcamera']],
  ['season', 'Seasons', ['tree_pine_orange_medium', 'tree_pine_yellow_medium', 'tree_pine_orange_small', 'Tree_Bare_1_A_Color1', 'Tree_Bare_2_B_Color1', 'autumn_wreath', 'pumpkin_yellow_small', 'candle_triple', 'wreath', 'present_A_red', 'present_sphere_A_red', 'snowman_A', 'sled', 'lantern_mini', 'hot_chocolate', 'cookie']],
  ['build', 'Farm buildings and props', ['building_windmill_red', 'building_watermill_red', 'building_home_B_red', 'building_market_red', 'tent', 'woodstove', 'bucket_water', 'bucket_empty', 'bowl', 'crate_open', 'crate_potatoes', 'crate_tomatoes', 'ladder', 'flag_yellow', 'resource_lumber', 'Pallet_Wood_Covered_A', 'Wood_Log_A', 'Textiles_A', 'jar_A_small', 'milk', 'rug_oval_A', 'pillow_A', 'lamp_standing', 'food_ingredient_carrot', 'food_ingredient_tomato']],
  ['land', 'Landscape', ['Tree_3_A_Color1', 'Bush_1_E_Color1', 'Bush_2_E_Color1', 'Bush_4_E_Color1', 'Rock_2_A_Color1', 'Rock_3_C_Color1', 'Rock_3_J_Color1', 'tree_single_A_cut', 'trees_A_cut', 'path_A', 'path_C', 'waterlily_A', 'waterplant_B', 'cloud_big', 'cloud_small', 'Stone_Chunks_Small', 'post', 'lantern_hanging', 'cactus_small_A']],
  ['whimsy', 'Whimsy', ['circus_tent']],
];
const THEME_TAG: Record<string, string> = { finds: 'find', explore: 'find', season: 'season', build: 'build', land: 'build', whimsy: 'wear' };
const NICE: Record<string, string> = {
  Gold_Nugget_Small: 'Shiny pebble', Silver_Nugget_Small: 'Moon pebble', Copper_Nugget_Small: 'Copper lump', coin_copper: 'Old penny', coin_gold: 'Gold coin', idol_A: 'Little stone idol', idol_B: 'Another idol',
  rollerskate_A: 'One roller skate', pickle_jar: 'Mystery pickles', puzzlecube_complete: 'Puzzle cube', umbrella_pink: 'Pink umbrella', mining_helmet: "Miner's helmet", compass_base: 'Lost compass',
  map_rolled: 'Map scrap', bell: 'Bell (no cow)', book_mimic: 'Book with teeth', hourglass: 'Hourglass', D6_A: 'A single die', cat_headphones_A: 'Tiny headphones', instantcamera: 'Instant camera',
  tree_pine_orange_medium: 'Autumn pine', tree_pine_yellow_medium: 'Golden pine', tree_pine_orange_small: 'Autumn sapling', tree_single_A_cut: 'Stump', trees_A_cut: 'Stumps',
};

// ---------- views (catalogue thumbnails) ----------
type View = { el: HTMLElement; scene: THREE.Scene; camera: THREE.PerspectiveCamera; spinner: THREE.Group; anims: Anim[]; spin: boolean; base: number };
const views: View[] = [];
function addView(el: HTMLElement, built: { obj: THREE.Object3D; anims?: Anim[] }, opts: { spin?: boolean; angle?: number; elev?: number; zoom?: number; target?: number } = {}) {
  const scene = new THREE.Scene(); makeRig(scene, 0.06);
  const spinner = new THREE.Group(); scene.add(spinner);
  // Fit a wrapper, not the object itself: idle animations remember the object's own scale and position.
  const holder = new THREE.Group(); holder.add(built.obj);
  const size = fit(holder, opts.target ?? 1.7); spinner.add(holder);
  scene.add(blob(Math.max(size.x, 0.3), Math.max(size.z, 0.3)));
  addOutlines(built.obj);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 50);
  const r = Math.max(size.x, size.y, size.z) * 0.62 + 0.25, d = (r / Math.sin((13 * Math.PI) / 180)) * (opts.zoom ?? 1), e = ((opts.elev ?? 20) * Math.PI) / 180;
  camera.position.set(0, size.y * 0.45 + Math.sin(e) * d, Math.cos(e) * d); camera.lookAt(0, size.y * 0.45, 0);
  const base = opts.angle ?? -0.6; spinner.rotation.y = base;
  const v: View = { el, scene, camera, spinner, anims: built.anims || [], spin: opts.spin !== false && !reduceMotion, base };
  views.push(v); return v;
}

const viewsCanvas = $('views') as HTMLCanvasElement;
const vr = new THREE.WebGLRenderer({ canvas: viewsCanvas, antialias: true, alpha: true });
vr.setPixelRatio(Math.min(devicePixelRatio, 2)); vr.setClearColor(0x000000, 0);
function renderViews(t: number, dt: number) {
  const w = innerWidth, h = innerHeight;
  if (viewsCanvas.width !== Math.floor(w * vr.getPixelRatio()) || viewsCanvas.height !== Math.floor(h * vr.getPixelRatio())) vr.setSize(w, h, false);
  vr.setScissorTest(false); vr.clear(); vr.setScissorTest(true);
  for (const v of views) {
    const r = v.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > h || r.right < 0 || r.left > w || r.width === 0) continue;
    v.camera.aspect = r.width / r.height; v.camera.updateProjectionMatrix();
    vr.setViewport(r.left, h - r.bottom, r.width, r.height); vr.setScissor(r.left, h - r.bottom, r.width, r.height);
    if (v.spin) v.spinner.rotation.y = v.base + Math.sin(t * 0.35 + r.left * 0.01) * 0.7;
    for (const a of v.anims) a(t, dt, lifeAmp);
    vr.render(v.scene, v.camera);
  }
}

// ---------- icons rendered from the models ----------
const icons: Record<string, string> = {};
function renderIcons(list: [string, () => THREE.Object3D, { sil?: boolean; angle?: number; elev?: number }?][]) {
  const c = document.createElement('canvas'); const ir = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
  ir.setSize(192, 192, false); ir.setClearColor(0, 0); ir.toneMapping = THREE.ACESFilmicToneMapping; ir.toneMappingExposure = 1.15;
  const silMat = new THREE.MeshBasicMaterial({ color: 0x9b8571 });
  for (const [key, make, o = {}] of list) {
    const scene = new THREE.Scene(); const rig = makeRig(scene, 0.06);
    const obj = new THREE.Group(); obj.add(make()); obj.rotation.y = o.angle ?? -0.55; const size = fit(obj, 1.6); scene.add(obj);
    const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 50), r = Math.max(size.x, size.y, size.z) * 0.6 + 0.08, d = r / Math.sin((12 * Math.PI) / 180), e = ((o.elev ?? 18) * Math.PI) / 180;
    cam.position.set(0, size.y * 0.5 + Math.sin(e) * d, Math.cos(e) * d); cam.lookAt(0, size.y * 0.5, 0);
    scene.overrideMaterial = o.sil ? silMat : null;
    ir.render(scene, cam); icons[key] = c.toDataURL('image/png');
    rigs.splice(rigs.indexOf(rig), 1);
  }
  ir.dispose(); ir.forceContextLoss();
  document.querySelectorAll<HTMLImageElement>('img[data-icon]').forEach(img => { const k = img.dataset.icon!; if (icons[k]) img.src = icons[k]; img.alt = img.alt || ''; });
}

// ---------- the diorama ----------
function buildStage() {
  const canvas = $('stage') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 200);
  camera.position.set(0, 15.5, 15.8);
  const controls = new OrbitControls(camera, canvas); controls.target.set(0.5, 0, -1); controls.enableDamping = true; controls.maxPolarAngle = 1.2; controls.minDistance = 8; controls.maxDistance = 40; controls.enablePan = false; controls.update();
  const rig = makeRig(scene, 1.4); rig.sun.target.position.set(0, 0, -1);
  rig.sun.castShadow = true; rig.sun.shadow.mapSize.set(2048, 2048);
  Object.assign(rig.sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 120 });
  rig.sun.shadow.bias = -0.0005; rig.sun.shadow.normalBias = 0.04;

  const skyTex = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#8fd3ea'); gr.addColorStop(0.6, '#d9eee6'); gr.addColorStop(1, '#f6e9c6'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  scene.fog = new THREE.Fog(0xcfe6e4, 40, 90);

  // Ground with the game's colours: light lawn in the clearing, darker toward the trees.
  const gg = new THREE.CircleGeometry(60, 64).rotateX(-Math.PI / 2), p = gg.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color(), c2 = new THREE.Color(0x7dab62);
  for (let i = 0; i < p.count; i++) { const d = Math.hypot(p.getX(i), p.getZ(i) + 1); c.setHex(0xaad27a).lerp(c2, THREE.MathUtils.clamp((d - 9) / 8, 0, 1)); col.set([c.r, c.g, c.b], i * 3); }
  gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ground = new THREE.Mesh(gg, new THREE.MeshLambertMaterial({ vertexColors: true })); ground.receiveShadow = true; scene.add(ground);

  const world = new THREE.Group(), extras = new THREE.Group(); scene.add(world, extras);
  const anims: Anim[] = [];
  const put = (o: THREE.Object3D, x: number, z: number, ry = 0, parent = world) => { o.position.x += x; o.position.z += z; o.rotation.y = ry; parent.add(o); o.traverse(m => { if ((m as THREE.Mesh).isMesh) { m.castShadow = !m.userData.noOutline; m.receiveShadow = true; } }); return o; };

  // Forest ring
  const TREES = ['Tree_1_A_Color1', 'Tree_2_A_Color1', 'Tree_2_B_Color1', 'Tree_4_A_Color1', 'Tree_1_B_Color1', 'Tree_2_C_Color1', 'Tree_4_B_Color1'];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, r = 12.5 + rnd() * 9; const x = Math.cos(a) * r * 1.15, z = Math.sin(a) * r - 2;
    if (z > 6 && Math.abs(x) < 14) continue;
    const t = new THREE.Group(); const m = kit.mesh(TREES[(rnd() * TREES.length) | 0]); m.scale.setScalar(0.82 * (0.85 + rnd() * 0.5)); t.add(m);
    put(t, x, z, rnd() * 6.28); anims.push(sway(m, 0.02));
  }
  for (let i = 0; i < 18; i++) { const a = rnd() * Math.PI * 2, r = 10 + rnd() * 3; const b = sized(['Bush_1_C_Color1', 'Bush_2_C_Color1', 'Bush_4_B_Color1'][i % 3], 1.3 + rnd() * 0.6); if (Math.sin(a) * r > 5) continue; put(b, Math.cos(a) * r * 1.1, Math.sin(a) * r - 2, rnd() * 6); }
  for (let i = 0; i < 6; i++) put(sized(['Rock_1_D_Color1', 'Rock_1_E_Color1', 'Rock_1_F_Color1'][i % 3], 0.9 + rnd() * 0.5), -9 + i * 3.6, -10 + (i % 2) * 2.5, i);
  for (let i = 0; i < 70; i++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 11; put(sized(['Grass_1_B_Color1', 'Grass_2_B_Color1', 'Grass_1_A_Color1'][i % 3], 0.35 + rnd() * 0.25), Math.cos(a) * r * 1.2, Math.sin(a) * r - 1, a); }

  // The farm
  put(makeCoop(), -5, -4.5, 0.15);
  for (const x of [1, 3, 5]) { put(makeFence(), x, -5); if (x !== 3) put(makeFence(), x, 1); }
  for (const z of [-4, -2, 0]) { put(makeFence(), 0, z, Math.PI / 2); put(makeFence(), 6, z, Math.PI / 2); }
  const gate = makeGateItem(); put(gate.group, 3, 1); anims.push((t, _d, a) => { gate.leaf.rotation.y = 0.9 + Math.sin(t * 0.5) * 0.2 * a; });
  const patch = makePatch(); patch.set(1, 8); put(patch.group, 4.2, -3.2);
  const hens: [number, number, number, number, boolean?][] = [[0, 1.6, -3.2, 0.4], [1, 2.4, -1.4, 2.2], [3, 4.6, -1.0, -0.6], [4, 1.5, -0.6, 1.2], [2, -2.8, 0.2, 2.6]];
  for (const [ci, x, z, ry] of hens) { const h = makeChicken(HEN_COLORS[ci], false); put(h.group, x, z, ry); anims.push(idle(h.group, h.head)); }
  const roo = makeChicken(HEN_COLORS[0], false, true); put(roo.group, 3.4, -4.0, 0.3); anims.push(idle(roo.group, roo.head));
  for (const [x, z] of [[2.2, -2.4], [2.6, -2.1]]) { const ch = makeChicken(HEN_COLORS[0], true); put(ch.group, x, z, x); anims.push(idle(ch.group, ch.head)); }
  const dog = makeDog(); put(dog.group, -0.8, 2.8, 2.6); anims.push(idle(dog.inner, dog.head));
  const farmer = farmerClone(); put(farmer.obj, -2.2, 2.4, 0.6); anims.push(...(farmer.anims || []));
  put(makeDecor('lantern'), -7, 0.5); put(makeDecor('well'), 9, -3); put(makeDecor('wheelbarrow'), -8.5, -6.5, 0.4); put(makeDecor('pumpkins'), -6.8, -1.6);
  put(makeDecor('bench'), 8.5, 1.2, -0.8); put(makeDecor('hay'), -2.4, -6.6); put(makeDecor('crate'), -3.4, -1.8, 0.3);
  for (const [x, z] of [[-1, 4.2], [0.4, 4.6], [7.5, -0.8], [-4.4, 3.2]]) put(makeDecor('flowers'), x, z, x);

  // New pieces (toggle "New pieces")
  const addMade = (k: string, x: number, z: number, ry = 0, s = 1) => { const r = made[k](); const holder = new THREE.Group(); holder.add(r.obj); holder.scale.setScalar(s); put(holder, x, z, ry, extras); if (r.anims) anims.push(...r.anims); return holder; };
  addMade('dig', 6.4, 4.4, 0, 1.1); addMade('fairy', -9.2, 3.2, 0, 1.6); addMade('pond', 10.4, 4.2, 0, 1.3); addMade('nest', -2.6, -3.0, 0.4, 1.2); addMade('hay', -1.2, -6.8, 0.3, 1.1);
  for (const [x, z] of [[-0.6, 4.4], [7.6, -0.6], [-4.2, 3.4]]) { const b = made.butterfly(); const holder = new THREE.Group(); b.obj.position.set(0.8, 0.2, 0); holder.add(b.obj); put(holder, x, z, 0, extras); const sp = 0.6 + Math.random() * 0.5, ph = Math.random() * 6; anims.push((t, _d, a) => { holder.rotation.y = ph + t * sp * a; b.obj.rotation.y = Math.PI; }, ...(b.anims || [])); }
  addMade('fox', -11.5, -4.5, 1.2, 1.3);
  addOutlines(world); addOutlines(extras);

  // Post-processing
  const target = new THREE.WebGLRenderTarget(16, 16, { samples: 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 16, 16);
  gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.2, thickness: 1, scale: 1.1, samples: 16, distanceFallOff: 1 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  gtao.blendIntensity = 0.85;
  composer.addPass(gtao);
  const hT = new ShaderPass(HorizontalTiltShiftShader), vT = new ShaderPass(VerticalTiltShiftShader);
  hT.uniforms.r.value = vT.uniforms.r.value = 0.48;
  composer.addPass(hT); composer.addPass(vT);
  composer.addPass(new OutputPass());

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    hT.uniforms.h.value = 2.2 / w; vT.uniforms.v.value = 2.2 / h;
  };
  new ResizeObserver(resize).observe(canvas); resize();

  let shadowType = -1;
  const apply = () => {
    scene.background = look.warm ? skyTex : new THREE.Color(0xcfe6e4);
    scene.fog!.color.setHex(look.warm ? 0xe6efd9 : 0xcfe6e4);
    const want = look.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (want !== shadowType) { shadowType = want; renderer.shadowMap.type = want; rig.sun.shadow.map?.dispose(); (rig.sun.shadow as any).map = null; scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material; if (m) m.needsUpdate = true; }); }
    rig.sun.shadow.radius = look.soft ? 1 : 4;
    gtao.enabled = look.ao; hT.enabled = vT.enabled = look.tilt; extras.visible = look.extras;
  };
  return { renderer, composer, controls, anims, apply };
}

// ---------- page: catalogue DOM ----------
function tile(parent: HTMLElement, name: string, note: string, tags: string[]) {
  const f = document.createElement('figure'); f.className = 'tile';
  const v = document.createElement('div'); v.className = 'view'; f.append(v);
  const cap = document.createElement('figcaption');
  const b = document.createElement('b'); b.textContent = name; const s = document.createElement('small'); s.textContent = note; cap.append(b, s);
  const TAGTEXT: Record<string, string> = { new: 'New', prim: 'Primitive', find: 'Find', season: 'Season', build: 'Build', wear: 'Wearable', fix: 'Replaces primitive', kaykit: 'KayKit' };
  if (tags.length) { const t = document.createElement('div'); t.className = 'tags'; for (const k of tags) { const e = document.createElement('span'); e.className = 'tag ' + k; e.textContent = TAGTEXT[k] || k; t.append(e); } cap.append(t); }
  f.append(cap); parent.append(f); return v;
}
function group(parent: HTMLElement, title: string, count: string, big = false) {
  const h = document.createElement('div'); h.className = 'group-title'; h.innerHTML = `<h3></h3><small></small>`; h.querySelector('h3')!.textContent = title; h.querySelector('small')!.textContent = count;
  const g = document.createElement('div'); g.className = 'grid' + (big ? ' big' : ''); parent.append(h, g); return { h, g };
}

function buildCatalogue() {
  const game = $('cat-game');
  for (const [title, specs] of GAME) { const { g } = group(game, title, specs.length + ' pieces'); for (const s of specs) addView(tile(g, s.name, s.note, s.tags), s.build()); }
  const madeEl = $('cat-made'); const { g: mg } = group(madeEl, 'Proposed pieces', MADE.length + ' new', true);
  for (const [k, n, note, tags] of MADE) addView(tile(mg, n, note, tags), made[k](), { target: k === 'eggs' ? 1.4 : 1.7, elev: k === 'butterfly' ? 50 : k === 'pond' || k === 'fairy' || k === 'dig' ? 32 : 20 });

  const ex = $('cat-extras'), filters = $('filters'), groups: { key: string; els: HTMLElement[] }[] = [];
  const seen = new Set<string>();
  for (const [key, title, names] of THEMES) {
    const list = names.filter(n => kit.has(n)); list.forEach(n => seen.add(n));
    const { h, g } = group(ex, title, list.length + ' models');
    for (const n of list) addView(tile(g, NICE[n] || pretty(n), `${n} · ${kit.triangles(n)} tris`, [THEME_TAG[key]]), { obj: kit.mesh(n) });
    groups.push({ key, els: [h, g] });
  }
  const rest = X_PACKS.flatMap(p => kit.modelsIn(p)).filter(n => !seen.has(n));
  if (rest.length) { const { h, g } = group(ex, 'Other', rest.length + ' models'); for (const n of rest) addView(tile(g, pretty(n), `${n} · ${kit.triangles(n)} tris`, []), { obj: kit.mesh(n) }); groups.push({ key: 'other', els: [h, g] }); }
  const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Filter expansion models');
  for (const [key, label] of [['all', 'All'], ...THEMES.map(t => [t[0], t[1]])]) {
    const b = document.createElement('button'); b.textContent = label; b.className = key === 'all' ? 'on' : '';
    b.onclick = () => { seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); for (const g of groups) g.els.forEach(e => (e.hidden = key !== 'all' && g.key !== key)); };
    seg.append(b);
  }
  filters.append(seg);

  const kitEl = $('cat-kit');
  for (const pack of GAME_PACKS) { const names = kit.modelsIn(pack); const { g } = group(kitEl, pack, names.length + ' models'); for (const n of names) addView(tile(g, pretty(n), `${kit.triangles(n)} tris`, []), { obj: kit.mesh(n) }); }
}

// ---------- page: UI kit ----------
const icon = (k: string, alt = '') => `<img data-icon="${k}" alt="${alt}">`;
function buildUiKit() {
  const root = $('uikit');
  const swatch = (name: string, v: string, lip: string) => `<div class="sw"><i style="background:var(${v});border-color:var(${lip})"></i><span>${name}<small>${getComputedStyle(document.documentElement).getPropertyValue(v).trim()}</small></span></div>`;
  root.innerHTML = `
  <article class="spec wide"><header><h3>Colour</h3><small>Every accent has a darker "lip" shade for the chunky edge. Text is bark brown, never black; surfaces are paper, never dark glass.</small></header>
    <div class="swatches">${[['Paper', '--paper', '--lip'], ['Paper 2', '--paper-2', '--lip'], ['Ink', '--ink', '--ink'], ['Ink 2', '--ink-2', '--ink-2'], ['Leaf', '--leaf', '--leaf-lip'], ['Wheat', '--wheat', '--wheat-lip'], ['Barn', '--barn', '--barn-lip'], ['Sky', '--sky', '--sky-lip'], ['Plum', '--plum', '--plum-lip'], ['Dusk', '--dusk', '--dusk'], ['Night', '--night', '--night'], ['Meadow', '--meadow', '--lip']].map(s => swatch(s[0], s[1], s[2])).join('')}</div></article>
  <article class="spec"><header><h3>Type</h3><small>Baloo 2 for anything you'd say out loud, Nunito for everything you read.</small></header>
    <div class="typescale">
      <div><small>Display 44</small><span style="font:800 44px/1 var(--display)">Henstead</span></div>
      <div><small>Title 28</small><span style="font:800 28px/1 var(--display)">One roller skate</span></div>
      <div><small>Label 17</small><span style="font:800 17px/1 var(--display)">Collect 3 eggs</span></div>
      <div><small>Body 15</small><span>Biscuit dug it up behind the stump.</span></div>
      <div><small>Caps 12</small><span style="font:800 12px var(--body);letter-spacing:.12em">UNCOMMON FIND</span></div>
    </div></article>
  <article class="spec"><header><h3>Buttons</h3><small>A 4px lip that the press squashes to 1px. 48px minimum for touch.</small></header>
    <div class="row-btns"><button class="btn leaf">Start the farm</button><button class="btn wheat">Buy ${icon('egg')} 5</button></div>
    <div class="row-btns"><button class="btn sky">${icon('dog')} Whistle</button><button class="btn">Not now</button><button class="btn" disabled>${icon('egg')} 12</button></div>
    <div class="row-btns"><button class="btn round" aria-label="Menu"><svg width="20" height="16" viewBox="0 0 20 16"><path d="M2 2h16M2 8h16M2 14h16" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></button><button class="btn round wheat" aria-label="Journal">${icon('journal')}</button><button class="btn barn">Shoo!</button><button class="btn ghost">Skip</button></div></article>
  <article class="spec wide"><header><h3>In-game HUD</h3><small>Light chips with model-rendered icons. The to-do hangs like a shop sign; the prompt points at the thing it's about.</small></header>
    <div class="scene tall">
      <div class="hud">
        <div style="display:flex;flex-direction:column;gap:22px;align-items:flex-start">
          <span class="chip"><span class="dial" style="--p:38%"></span><span>Day 3<small>Morning</small></span></span>
          <div class="todo"><span class="ribbon">Next up</span><b>Let Biscuit sniff around the old stump</b><small>Something's buried near the forest edge.</small><div class="dots"><i class="done"></i><i class="done"></i><i class="done"></i><i></i><i></i></div></div>
        </div>
        <div class="chips"><span class="chip"><span class="icon">${icon('egg')}</span>12</span><span class="chip"><span class="icon">${icon('hen')}</span>4/6</span><button class="btn round" aria-label="Menu"><svg width="20" height="16" viewBox="0 0 20 16"><path d="M2 2h16M2 8h16M2 14h16" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></button></div>
      </div>
      <div style="display:flex;justify-content:center;margin:34px 0 22px"><span class="bubble"><kbd>E</kbd>Dig here</span></div>
      <div class="toolbar">
        <button class="tool">${icon('hen')}Gather<kbd>Q</kbd></button>
        <button class="tool on">${icon('dog')}Bring<kbd>F</kbd></button>
        <button class="tool">${icon('farmer')}Heel<kbd>SPACE</kbd></button>
        <button class="tool">${icon('fox')}Away<kbd>R</kbd></button>
        <button class="tool">${icon('lumber')}Build<kbd>B</kbd></button>
        <button class="tool">${icon('journal')}Journal<kbd>J</kbd></button>
      </div>
    </div></article>
  <article class="spec"><header><h3>Toasts and prompts</h3><small>The thing that happened, with its picture. No dark pills.</small></header>
    <div style="display:flex;flex-direction:column;gap:14px;align-items:flex-start">
      <span class="toast"><span class="icon">${icon('eggSpeckled')}</span>Clover laid a speckled egg!</span>
      <span class="toast"><span class="icon">${icon('dog')}</span>Biscuit smells something…</span>
      <span class="toast"><span class="icon">${icon('fox')}</span>A fox is sniffing at the fence</span>
      <span class="bubble"><kbd>E</kbd>Collect 3 eggs</span>
    </div></article>
  <article class="spec"><header><h3>Hen card</h3><small>A portrait, a personality and needs as pictures, not a text list.</small></header>
    <div class="hen"><div class="portrait view" id="ui-hen"></div><div><h3>Clover</h3><span class="trait">Nosy · follows the dog</span>
      <div class="needs">
        <div class="need">${icon('sack')}<div class="bar"><i style="width:82%"></i></div></div>
        <div class="need">${icon('bucket')}<div class="bar"><i style="width:56%;background:var(--sky)"></i></div></div>
        <div class="need">${icon('coop')}<div class="bar"><i style="width:100%;background:var(--wheat)"></i></div></div>
        <div class="need">${icon('flower')}<div class="bar"><i style="width:70%;background:var(--plum)"></i></div></div>
      </div></div></div>
    <div class="row-btns"><button class="btn wheat">Pick up</button><button class="btn">Rename</button></div></article>
  <article class="spec wide"><header><h3>Build tray</h3><small>Each item is its own 3D model. Locked items say when they unlock instead of hiding.</small></header>
    <div class="tray">
      ${[['fence', 'Fence', 1], ['gate', 'Gate', 2], ['coop', 'Coop', 12], ['patch', 'Feed patch', 2], ['nest', 'Nest box', 3], ['hay', 'Hay bale', 1], ['flowers', 'Flowers', 1], ['lantern', 'Lantern', 2], ['pond', 'Pond', 8]].map(([k, n, c], i) => `<button class="item${i === 4 ? ' on' : ''}">${icon('b-' + k)}${n}<span class="price">${icon('egg')}${c}</span></button>`).join('')}
      <button class="item locked">${icon('b-windmill')}Windmill<span class="price">Day 7</span></button>
    </div></article>
  <article class="spec"><header><h3>A new find</h3><small>The peak moment. Rays, a rarity, the real model turning, one line of story.</small></header>
    <div class="reveal"><div class="rays"></div><span class="rarity">UNCOMMON FIND</span><div class="view" id="ui-reveal"></div><h3>One roller skate</h3><p>Biscuit dug it up behind the old stump. Where's the other one?</p><div class="row-btns"><button class="btn leaf">${icon('journal')} Add to journal</button></div></div></article>
  <article class="spec"><header><h3>Field journal</h3><small>Finds you have, silhouettes of finds you don't. The silhouettes are the open loop.</small></header>
    <div class="journal"><div class="rings">${'<i></i>'.repeat(7)}</div><header><b>Field journal</b><span>7 of 16 found</span></header><div class="pages" id="pages"></div></div></article>`;
  const pages = $('pages');
  JOURNAL.forEach(([k, n, found], i) => { const d = document.createElement('div'); d.className = 'entry' + (found ? '' : ' unknown'); d.innerHTML = `${icon((found ? 'j-' : 's-') + k)}<span class="no">No. ${String(i + 1).padStart(2, '0')}</span>${found ? '' : '???'}`; if (found) d.append(n as string); pages.append(d); });
}
const JOURNAL: [string, string, boolean][] = [
  ['rollerskate_A', 'One roller skate', true], ['Gold_Nugget_Small', 'Shiny pebble', true], ['coin_copper', 'Old penny', true], ['compass_base', 'Lost compass', true],
  ['pickle_jar', 'Mystery pickles', true], ['bell', 'Bell (no cow)', true], ['cat_headphones_A', 'Tiny headphones', true], ['idol_A', 'Little stone idol', false],
  ['puzzlecube_complete', 'Puzzle cube', false], ['umbrella_pink', 'Pink umbrella', false], ['mining_helmet', "Miner's helmet", false], ['map_rolled', 'Map scrap', false],
  ['book_mimic', 'Book with teeth', false], ['hourglass', 'Hourglass', false], ['Silver_Nugget_Small', 'Moon pebble', false], ['goldenEgg', 'Golden egg', false],
];

// ---------- page: ideas and references ----------
const IDEAS: [string, string, string[], boolean][] = [
  ['1', 'Finds under things (do this first)', [
    'About one bush, rock or stump in four hides something. Clearing works exactly as now; only what turns up varies, so the surprise is in the content, never the controls.',
    'The collie sniffs out the nearest hidden find: sits, wags, a "!" over its head, a sparkle on the ground. The dog stops being a herding tool and becomes your discovery companion.',
    'First time each find turns up: the reveal card. After that, a toast with its picture.',
    'Smallest build: reuses clearObstacle(), the puff effect and the save. Finds pick from their own seeded RNG keyed on obstacle id, like rocks do, so saved farms and wrand() order stay intact.',
  ], false],
  ['2', 'A field journal', [
    'Every find, hen breed, egg colour and visitor gets a page. Unfound ones show as silhouettes: you can see the shape of what you\'re missing.',
    'Finds can be placed on the farm as decorations, or worn: a hen in tiny headphones is the kind of thing people screenshot.',
  ], false],
  ['3', 'Life in the clearing', [
    'Port the lighting from this page: tone mapping, warm low sun, soft shadows. Add AO on desktop only and measure on a real iPad first.',
    'Idle squash-and-bob on hens and the dog, a breeze in the trees, butterflies over flowers. Fix the tree pop: fade only trees covering the farmer or a hen.',
    'Things that appear overnight: a fairy ring after you clear near the forest edge, a mushroom after rain.',
  ], false],
  ['·', 'Held back for later', [
    'Hen personalities that change behaviour (Nosy follows the dog, Bossy guards the feed).',
    'Seasons using the autumn pines, bare trees, snowman and presents already licensed.',
    'An end-of-day photo with the instant camera: a designed ending for each day instead of a fade to night.',
    'Egg breeds from crossing hens, so the egg colour you get is a small surprise at dawn.',
  ], true],
];
const REFS: [string, string, string, string][] = [
  ['Finch · nest home', 'https://mobbin.com/screens/04a24fa6-1ca2-46dc-b772-69dc16190191?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp', 'The pet lives in a room you decorate, with a pastel palette and chunky icon tabs. The whole app feels like the character\'s world.', 'UI made of the world\'s materials'],
  ['Finch · Micropedia', 'https://mobbin.com/screens/fe82294a-4d73-44ea-9114-412518dc4f53?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp', 'A spiral-bound field guide counting "0/60 found", with an "Unknown species" page for each one you haven\'t met.', 'The field journal'],
  ['Finch · Mr. Prickles\' shop', 'https://mobbin.com/screens/10e48a44-fe32-41af-8822-720cf70fe20b?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp', 'A shopkeeper character under a hanging sign, items as cards with prices. Shopping is a visit, not a list.', 'Hanging-sign headers, item cards'],
  ['Finch · claim reward', 'https://mobbin.com/screens/a2a3ba64-0615-4f5f-811c-769e6f4ce478?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp', 'A tilted item card, a gift box and one green Claim button. Gentle, no pressure.', 'Calm reward moments'],
  ['Duolingo · rarity reveal', 'https://mobbin.com/screens/2df438b2-5c11-49f3-af79-1e4de036b85d?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp', 'RARE in caps, the character already wearing the item, and a pun. The reveal is the peak of the session.', 'Rarity label, the find in use'],
  ['Duolingo ABC · mystery card', 'https://mobbin.com/screens/d01f618b-ad16-4326-bbfa-25d69a6d5dae?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp', 'A big glossy "?" for the reward still to come.', 'Locked things stay visible'],
  ['Swarm · collectibles', 'https://mobbin.com/screens/ba333423-75cf-44c3-9d6c-5c96d4f095ec?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp', 'Grey silhouettes for stickers not yet earned, colour for the ones you have, "6 of 100" at the top.', 'Silhouettes as the open loop'],
  ['Tolan · 3D world home', 'https://mobbin.com/screens/06ee91af-d314-4713-b15c-afea6aba596c?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp', 'A soft full-bleed 3D world, the character in it, and only a few round floating controls.', 'Let the world be the UI'],
  ['Abode · pet care', 'https://mobbin.com/screens/df4dc946-060d-45cd-b5da-9c35cfbdee68?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp', 'Chunky square action buttons with real depth, need bars with icons, a thought bubble saying what the pet wants.', 'Tool buttons and need bars'],
  ['Forest · reward awaits', 'https://mobbin.com/screens/9c79865b-4525-45ad-a89c-f4de4128fa27?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp', 'A diorama under a glass dome with a "?" tree, and the steps left to reveal it.', 'Anticipation before the reveal'],
  ['BitePal · wardrobe', 'https://mobbin.com/screens/b4bd8e47-e8a0-45ac-8170-61ac7cee286e?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp', 'The character large at the top, wearables in a priced grid below; tapping one tries it on.', 'Wearables for hens'],
  ['Ahead · unlock', 'https://mobbin.com/screens/7e9b3309-bc26-4ecc-8ae8-3495ab5efc71?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp', '"Use it right away" or "Store in treasure garden": a choice right after the reveal.', 'Place it now, or keep it'],
];
function buildIdeasAndRefs() {
  const ideas = $('ideas');
  for (const [n, title, items, later] of IDEAS) {
    const d = document.createElement('article'); d.className = 'idea' + (later ? ' later' : '');
    d.innerHTML = `<div class="n"></div><div><h3></h3><ul></ul></div>`; d.querySelector('.n')!.textContent = n; d.querySelector('h3')!.textContent = title;
    const ul = d.querySelector('ul')!; for (const i of items) { const li = document.createElement('li'); li.textContent = i; ul.append(li); }
    ideas.append(d);
  }
  const refs = $('refList');
  for (const [name, url, text, take] of REFS) {
    const d = document.createElement('article'); d.className = 'ref';
    d.innerHTML = `<header><b></b><a target="_blank" rel="noopener">View on Mobbin ↗</a></header><p></p><span class="take"></span>`;
    d.querySelector('b')!.textContent = name; (d.querySelector('a') as HTMLAnchorElement).href = url; d.querySelector('p')!.textContent = text; d.querySelector('.take')!.textContent = 'Take: ' + take;
    refs.append(d);
  }
}

// ---------- look controls ----------
function buildToggles(onChange: () => void) {
  const box = $('toggles'), inputs: Partial<Record<keyof Look, HTMLInputElement>> = {};
  for (const [k, label] of LABELS) {
    const l = document.createElement('label'); l.className = 'tog'; const i = document.createElement('input'); i.type = 'checkbox'; i.checked = look[k];
    i.onchange = () => { look[k] = i.checked; syncPreset(); onChange(); };
    l.append(i, label); box.append(l); inputs[k] = i;
  }
  const btns = document.querySelectorAll<HTMLButtonElement>('[data-preset]');
  const syncPreset = () => btns.forEach(b => b.classList.toggle('on', LABELS.every(([k]) => PRESETS[b.dataset.preset!][k] === look[k])));
  btns.forEach(b => (b.onclick = () => { Object.assign(look, PRESETS[b.dataset.preset!]); for (const [k] of LABELS) inputs[k]!.checked = look[k]; syncPreset(); onChange(); }));
  syncPreset();
}

// ---------- start ----------
async function main() {
  await kit.loadKit(new URL('../models/', location.href).href, undefined, X_PACKS);
  buildCatalogue(); buildUiKit(); buildIdeasAndRefs();
  addView($('ui-hen'), { obj: crownHen(HEN_COLORS[0]).g }, { spin: false, angle: 0.5, elev: 14, zoom: 0.95 });
  { const r = { obj: kit.mesh('rollerskate_A') }; addView($('ui-reveal'), r, { angle: -0.4, elev: 16, zoom: 0.7 }); }

  const stage = buildStage();
  const applyAll = () => {
    for (const r of rigs) applyRig(r);
    for (const h of hulls) h.visible = look.outline;
    for (const r of [vr, stage.renderer]) { r.toneMapping = look.tone ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping; r.toneMappingExposure = look.tone ? 1.12 : 1; }
    stage.apply();
  };
  buildToggles(applyAll); applyAll();

  const egg1 = (c: number, s = 0, gold = false) => () => egg(c, s, gold);
  const ICONS: [string, () => THREE.Object3D, { sil?: boolean; angle?: number; elev?: number }?][] = [
    ['egg', egg1(0xf6ead2), { elev: 10 }], ['eggSpeckled', egg1(0xe8cfa6, 14), { elev: 10 }],
    ['hen', () => makeChicken(HEN_COLORS[0], false).group], ['dog', () => makeDog().group], ['fox', () => made.fox().obj],
    ['farmer', () => farmerClone().obj, { angle: -0.3 }], ['lumber', () => kit.mesh('resource_lumber')], ['journal', () => kit.mesh('journal_open'), { elev: 40 }],
    ['sack', () => kit.mesh('sack')], ['bucket', () => kit.mesh('bucket_water')], ['coop', () => makeCoop()], ['flower', () => kit.mesh('flax_flower_A')],
    ['b-fence', () => makeFence()], ['b-gate', () => makeGateItem().group], ['b-coop', () => makeCoop()], ['b-patch', () => { const p = makePatch(); p.set(1, 8); return p.group; }],
    ['b-nest', () => made.nest().obj], ['b-hay', () => made.hay().obj], ['b-flowers', () => makeDecor('flowers')], ['b-lantern', () => makeDecor('lantern')], ['b-pond', () => made.pond().obj, { elev: 35 }],
    ['b-windmill', () => kit.mesh('building_windmill_red'), { sil: true }],
    ...JOURNAL.flatMap(([k]) => { const mk = k === 'goldenEgg' ? egg1(0, 0, true) : () => kit.mesh(k); return [['j-' + k, mk], ['s-' + k, mk, { sil: true }]] as [string, () => THREE.Object3D, { sil?: boolean }?][]; }),
  ];
  renderIcons(ICONS);
  $('loading').remove();

  const clock = new THREE.Clock(); let fpsT = 0, frames = 0;
  const fpsEl = $('fps');
  const stageEl = $('stage');
  let stageVisible = true;
  new IntersectionObserver(e => { stageVisible = e[0].isIntersecting; }).observe(stageEl);
  const loop = () => {
    const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
    lifeAmp += ((look.life && !reduceMotion ? 1 : 0) - lifeAmp) * Math.min(1, dt * 4);
    if (stageVisible) {
      stage.controls.update();
      for (const a of stage.anims) a(t, dt, lifeAmp);
      stage.composer.render(dt);
      frames++; fpsT += dt; if (fpsT > 0.5) { fpsEl.textContent = Math.round(frames / fpsT) + ' fps'; frames = 0; fpsT = 0; }
    }
    renderViews(t, dt);
    requestAnimationFrame(loop);
  };
  loop();
}
main().catch(e => { console.error(e); $('loading').textContent = 'The models could not load: ' + e.message; });
