import * as THREE from 'three';
import { makeHawk, makeFox, makeSnake, makeEgg, mat, setSoftStyle, HEN_COLORS } from './models';
import { makeDog, makeChicken, makeFarmer, makeCoop, makePatch, makeDecor, makeFence, makeGateItem, treeModel, bushModel, modelWidth, ROCKS, PEBBLES, GRASS } from './kitmodels';
import * as kit from './kit';
import { sfx, initAudio, setMuted, isMuted, useSamples, setMusic, isMusicOn, setAmbience, suspendAudio } from './audio';

setSoftStyle();
useSamples('audio/');
const $ = (id: string) => document.getElementById(id)!;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
const R = Math.random;
const turn = (g: THREE.Object3D, face: number, k: number) => { let d = face - g.rotation.y; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283; g.rotation.y += d * Math.min(1, k); };

// ---------- save ----------
const SAVE_KEY = 'henstead-save-v1';
let saved: any = null;
try { const s = localStorage.getItem(SAVE_KEY); if (s) saved = JSON.parse(s); } catch { saved = null; }
const SEED: number = saved?.seed ?? ((Math.random() * 1e9) | 0);

function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const wrand = mulberry(SEED);
function hash2(x: number, z: number) { const s = Math.sin(x * 127.1 + z * 311.7 + SEED * 0.001) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(hash2(xi, zi), hash2(xi + 1, zi), u), lerp(hash2(xi, zi + 1), hash2(xi + 1, zi + 1), u), v);
}

// ---------- tunables ----------
const DAY = 150, DUSK = 40, NIGHT = 15, CYCLE = DAY + DUSK + NIGHT;
const WORLD_R = 32, COOP_CAP = 4;
const NAMES = ['Mabel', 'Dot', 'Clementine', 'Peggy', 'Hazel', 'Biscuit', 'Nora', 'Pip', 'Marigold', 'Olive', 'Betty', 'Juniper', 'Flossie', 'Wren', 'Dolly', 'Maple', 'Tilly', 'Ginger', 'Poppy', 'Ethel', 'Honey', 'Myrtle', 'Fern', 'Bramble'];
// solid: blocks walking. 'hay' is the log pile (kept as the saved id).
const DEFS: Record<string, { name: string; cost: number; rad: number; decor?: boolean; solid?: boolean }> = {
  fence: { name: 'Fence', cost: 0, rad: 0 }, gate: { name: 'Gate', cost: 1, rad: 0 },
  patch: { name: 'Feed patch', cost: 2, rad: 1.3 }, coop: { name: 'Coop', cost: 12, rad: 2.2 },
  flowers: { name: 'Flowers', cost: 1, rad: 0.35, decor: true }, hay: { name: 'Log pile', cost: 1, rad: 0.75, decor: true, solid: true },
  lantern: { name: 'Lantern', cost: 2, rad: 0.3, decor: true }, scarecrow: { name: 'Scarecrow', cost: 4, rad: 0.4, decor: true, solid: true },
  bench: { name: 'Bench', cost: 2, rad: 0.8, decor: true, solid: true }, barrel: { name: 'Barrel', cost: 1, rad: 0.45, decor: true, solid: true },
  pumpkins: { name: 'Pumpkins', cost: 1, rad: 0.5, decor: true }, crate: { name: 'Veg crate', cost: 2, rad: 0.6, decor: true, solid: true },
  wheelbarrow: { name: 'Wheelbarrow', cost: 3, rad: 0.7, decor: true, solid: true }, well: { name: 'Well', cost: 6, rad: 1.0, decor: true, solid: true },
};
const HEN_COST = 5, ROO_COST = 8;

// ---------- renderer / scene ----------
const canvas = $('c') as HTMLCanvasElement;
// Anti-aliasing costs a lot on high-density screens (iPad) and shows little there.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: window.devicePixelRatio < 2 });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe6e4);
scene.fog = new THREE.Fog(0xcfe6e4, 70, 120);
const camera = new THREE.PerspectiveCamera(28, 1, 1, 220);
const camTarget = new THREE.Vector3(0, 0, -1);
const CAM_OFF = new THREE.Vector3(0, 25, 27);
let zoom = 0.85;
const hemi = new THREE.HemisphereLight(0xdff0ff, 0x8a9a6a, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 130 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; sun.shadow.radius = 4;
scene.add(sun, sun.target);
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const base = Math.tan((14 * Math.PI) / 180);
  camera.fov = clamp((2 * Math.atan(base * clamp(1.1 / camera.aspect, 1, 1.9)) * 180) / Math.PI, 28, 62);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- landscape ----------
type Obstacle = { id: number; x: number; z: number; r: number; alive: boolean; bush: boolean; rock: boolean; im: THREE.InstancedMesh; i: number; k: number; rot: number; shake: number };
const obstacles: Obstacle[] = [];
const grid = new Map<number, Obstacle[]>();
const gkey = (x: number, z: number) => Math.floor((x + 64) / 4) * 64 + Math.floor((z + 64) / 4);
function addObstacle(o: Obstacle) { o.id = obstacles.length; obstacles.push(o); const k = gkey(o.x, o.z); if (!grid.has(k)) grid.set(k, []); grid.get(k)!.push(o); }
function nearObstacles(x: number, z: number, fn: (o: Obstacle) => void) {
  for (let dx = -4; dx <= 4; dx += 4) for (let dz = -4; dz <= 4; dz += 4) { const l = grid.get(gkey(x + dx, z + dz)); if (l) for (const o of l) if (o.alive) fn(o); }
}
const edgeDist = (x: number, z: number) => Math.hypot(x, z * 1.05) + (vnoise(x * 0.09 + 50, z * 0.09 + 50) - 0.5) * 9;
{
  const g = new THREE.PlaneGeometry(160, 160, 80, 80).rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color(), c2 = new THREE.Color(0x7dab62);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    c.setHex(0xaad27a).lerp(c2, clamp((edgeDist(x, z) - 13) / 9, 0, 1));
    c.offsetHSL(0, 0, (vnoise(x * 0.2, z * 0.2) - 0.5) * 0.06);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true; scene.add(ground);
}
const tm4 = new THREE.Matrix4(), tq = new THREE.Quaternion(), tv = new THREE.Vector3(), ts = new THREE.Vector3();
// Trees between the camera and the farmer shrink so they never hide the farm.
type Standing = { im: THREE.InstancedMesh; i: number; x: number; z: number; k: number; rot: number; f: number; o?: Obstacle };
const standing: Standing[] = [];
// The random calls below keep the same order as earlier versions, so saved farms clear the same trees and bushes.
(() => {
  type Place = { x: number; z: number; s: number; round?: boolean; model?: string };
  const trees: Place[] = [], bushes: Place[] = [];
  for (let gx = -56; gx <= 56; gx += 2.3) for (let gz = -56; gz <= 56; gz += 2.3) {
    const x = gx + (wrand() - 0.5) * 1.7, z = gz + (wrand() - 0.5) * 1.7, d = edgeDist(x, z), r = wrand();
    if (d < 14) continue;
    if (d < 23) { if (r < 0.5) bushes.push({ x, z, s: 0.8 + wrand() * 0.5 }); else if (r < 0.57) trees.push({ x, z, s: 0.8 + wrand() * 0.4, round: wrand() < 0.5 }); }
    else if (r < 0.72) trees.push({ x, z, s: 0.85 + wrand() * 0.6, round: wrand() < 0.3 });
    else if (r < 0.84) bushes.push({ x, z, s: 0.8 + wrand() * 0.6 });
  }
  const rots = trees.map(t => { const rot = wrand() * 6.28; t.model = treeModel(wrand(), edgeDist(t.x, t.z) < 26); return rot; });
  const brot = bushes.map(b => { b.model = bushModel(wrand()); return wrand() * 6.28; });
  const rrand = mulberry(SEED ^ 0x5eed), rocks: Place[] = [];
  for (let n = 0; n < 400 && rocks.length < 26; n++) {
    const a = rrand() * 6.283, rr = 14 + rrand() * 16, x = Math.cos(a) * rr, z = Math.sin(a) * rr * 0.95;
    if (edgeDist(x, z) < 15.5 || bushes.some(b => dist(b.x, b.z, x, z) < 2.4) || trees.some(t => dist(t.x, t.z, x, z) < 2) || rocks.some(q => dist(q.x, q.z, x, z) < 3)) continue;
    rocks.push({ x, z, s: 0.8 + rrand() * 0.5, model: ROCKS[(rrand() * ROCKS.length) | 0] });
  }
  // One instanced mesh per model per map tile, so tiles off screen are not drawn at all.
  const TILE = 22, key = (p: Place) => p.model + '|' + Math.floor(p.x / TILE) + ',' + Math.floor(p.z / TILE);
  const groups = new Map<string, Place[]>();
  for (const p of [...trees, ...bushes, ...rocks]) { const k = key(p); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(p); }
  const imOf = new Map<Place, THREE.InstancedMesh>(), slot = new Map<Place, number>(), all: THREE.InstancedMesh[] = [];
  for (const [k, list] of groups) { const im = kit.instanced(k.split('|')[0], list.length); scene.add(im); all.push(im); list.forEach((p, i) => { slot.set(p, i); imOf.set(p, im); }); }
  const put = (p: Place, k: number, rot: number) => { tq.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rot); tm4.compose(tv.set(p.x, 0, p.z), tq, ts.setScalar(k)); imOf.get(p)!.setMatrixAt(slot.get(p)!, tm4); };
  trees.forEach((t, i) => {
    const k = t.s * 0.82;
    put(t, k, rots[i]);
    const st: Standing = { im: imOf.get(t)!, i: slot.get(t)!, x: t.x, z: t.z, k, rot: rots[i], f: 1 };
    standing.push(st);
    if (Math.hypot(t.x, t.z) < 37) { const o: Obstacle = { id: 0, x: t.x, z: t.z, r: 0.55 * t.s, alive: true, bush: false, rock: false, im: st.im, i: st.i, k, rot: rots[i], shake: 0 }; addObstacle(o); st.o = o; }
  });
  bushes.forEach((b, i) => {
    const r = 0.85 * b.s, k = (2 * r * 1.1) / modelWidth(b.model!);
    put(b, k, brot[i]);
    if (Math.hypot(b.x, b.z) < 37) addObstacle({ id: 0, x: b.x, z: b.z, r, alive: true, bush: true, rock: false, im: imOf.get(b)!, i: slot.get(b)!, k, rot: brot[i], shake: 0 });
  });
  rocks.forEach(q => {
    const rot = rrand() * 6.28, k = q.s * 1.2;
    put(q, k, rot);
    addObstacle({ id: 0, x: q.x, z: q.z, r: 0.5 * k, alive: true, bush: false, rock: true, im: imOf.get(q)!, i: slot.get(q)!, k, rot, shake: 0 });
  });
  for (const im of all) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
})();
{ // grass tufts, pebbles and wild flowers give the lawn some texture
  const per = 240, tufts = GRASS.map(g => { const m = kit.instanced(g, per); m.castShadow = false; scene.add(m); return m; });
  const pebbles = PEBBLES.map(g => { const m = kit.instanced(g, 14); scene.add(m); return m; });
  const bloom = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.08, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), 160);
  const c = new THREE.Color();
  for (let i = 0; i < per * GRASS.length; i++) {
    const a = wrand() * 6.283, r = Math.sqrt(wrand()) * 34, x = Math.cos(a) * r, z = Math.sin(a) * r;
    tq.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a); tm4.compose(tv.set(x, 0, z), tq, ts.setScalar(0.45 + wrand() * 0.45));
    tufts[i % GRASS.length].setMatrixAt((i / GRASS.length) | 0, tm4);
    if (i < 160) { tm4.compose(tv.set(x + 0.4, 0.1, z + 0.3), tq, ts.setScalar(0.8 + wrand() * 0.6)); bloom.setMatrixAt(i, tm4); bloom.setColorAt(i, c.setHex([0xfff6e0, 0xf7d66a, 0xf2a0b0, 0xc9b2f0][(wrand() * 4) | 0])); }
    if (i < 42) { tm4.compose(tv.set(x - 0.6, 0, z - 0.5), tq, ts.setScalar(0.5 + wrand() * 0.6)); pebbles[i % 3].setMatrixAt((i / 3) | 0, tm4); }
  }
  scene.add(bloom);
}
function fadeTrees(dt: number) {
  for (const t of standing) {
    const dx = t.x - camTarget.x, dz = t.z - camTarget.z;
    const want = dz > 1 && dz < 16 && Math.abs(dx) < 5 + dz * 0.4 ? 0.1 : 1;
    if (Math.abs(want - t.f) < 0.005) continue;
    t.f += (want - t.f) * Math.min(1, dt * 5);
    if (t.o && (!t.o.alive || t.o.shake > 0)) continue;
    tq.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t.rot); tm4.compose(tv.set(t.x, 0, t.z), tq, ts.setScalar(t.k * t.f));
    t.im.setMatrixAt(t.i, tm4); t.im.instanceMatrix.needsUpdate = true;
  }
}
/** k: size factor (1 = full), lean: tilt while being chopped. */
function setObs(o: Obstacle, k: number, lean = 0) {
  const wob = o.shake > 0 && !o.alive ? 0 : o.shake > 0 ? Math.sin(o.shake * 40) * 0.06 : 0;
  tq.setFromAxisAngle(tv.set(0, 0, 1), lean); const q2 = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, o.rot); tq.multiply(q2);
  tm4.compose(tv.set(o.x + wob, 0, o.z), tq, ts.setScalar(o.k * k));
  o.im.setMatrixAt(o.i, tm4); o.im.instanceMatrix.needsUpdate = true;
}
function clearObstacle(o: Obstacle, quiet = false) {
  o.alive = false; navDirty();
  setObs(o, 0);
  const patch = new THREE.Mesh(new THREE.CircleGeometry(o.r + 0.6, 7).rotateX(-Math.PI / 2), mat(0xa9c474));
  patch.position.set(o.x, 0.02, o.z); patch.rotation.y = o.id; patch.receiveShadow = true; scene.add(patch);
  if (!quiet) { G.cleared++; sfx.pop(); puff(o.x, 0.6, o.z, o.rock ? 0x9aa3a8 : o.bush ? 0x7fbf4a : 0x6fae4a, o.bush ? 12 : 20, 4); }
}

// ---------- placed items ----------
type Item = { t: string; x: number; z: number; r: number; mesh: THREE.Group; open: boolean; eggs: number; brood: number; grow: number; servings: number; extra?: any; pop?: number };
const items: Item[] = [];
const coops = () => items.filter(i => i.t === 'coop');
const segOf = (i: Item) => (i.r ? [i.x, i.z - 1, i.x, i.z + 1] : [i.x - 1, i.z, i.x + 1, i.z]);
const door = (c: Item) => ({ x: c.x, z: c.z + 2.1 });

function buildMesh(t: string, r: number): { mesh: THREE.Group; extra?: any } {
  if (t === 'fence') { const m = makeFence(); m.rotation.y = r ? Math.PI / 2 : 0; return { mesh: m }; }
  if (t === 'gate') { const g = makeGateItem(); g.group.rotation.y = r ? Math.PI / 2 : 0; return { mesh: g.group, extra: { leaf: g.leaf } }; }
  if (t === 'coop') {
    const m = makeCoop(), eggs: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) { const e = makeEgg(); e.position.set(-0.75 + i * 0.3, 0.14, 1.72 + (i % 2) * 0.2); e.visible = false; m.add(e); eggs.push(e); }
    const nest = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 0.7), mat(0xe0c060)); nest.position.set(0, 0.04, 1.8); nest.receiveShadow = true; m.add(nest);
    return { mesh: m, extra: { eggs } };
  }
  if (t === 'patch') { const p = makePatch(); return { mesh: p.group, extra: p }; }
  const m = makeDecor(t); m.rotation.y = r * Math.PI / 2;
  return { mesh: m };
}
function addItem(t: string, x: number, z: number, r: number, state: Partial<Item> = {}) {
  const b = buildMesh(t, r);
  const it: Item = { t, x, z, r, mesh: b.mesh, extra: b.extra, open: false, eggs: 0, brood: 0, grow: -1, servings: 0, ...state };
  it.mesh.position.set(x, 0, z);
  scene.add(it.mesh); items.push(it); navDirty();
  if (state.eggs === undefined && G.started) it.pop = 0;
  refreshItem(it);
  return it;
}
function refreshItem(it: Item) {
  if (it.t === 'coop') it.extra.eggs.forEach((e: THREE.Mesh, i: number) => (e.visible = i < it.eggs));
  if (it.t === 'patch') it.extra.set(it.grow, it.servings);
}
function snap(t: string, r: number, x: number, z: number) {
  const odd = (v: number) => 2 * Math.round((v - 1) / 2) + 1, even = (v: number) => 2 * Math.round(v / 2);
  if (t === 'fence' || t === 'gate') return r ? { x: even(x), z: odd(z) } : { x: odd(x), z: even(z) };
  if (t === 'coop' || t === 'patch') return { x: Math.round(x), z: Math.round(z) };
  return { x: Math.round(x * 2) / 2, z: Math.round(z * 2) / 2 };
}
function canPlace(t: string, r: number, x: number, z: number) {
  if (Math.hypot(x, z) > WORLD_R - 2) return false;
  const d = DEFS[t], line = t === 'fence' || t === 'gate';
  let ok = true;
  nearObstacles(x, z, o => { if (dist(x, z, o.x, o.z) < o.r * 0.8 + (line ? 0.3 : d.rad)) ok = false; });
  for (const i of items) {
    const il = i.t === 'fence' || i.t === 'gate';
    if (line && il) { if (i.x === x && i.z === z && i.r === r) ok = false; }
    else if (line || il) { const other = line ? i : null; const rad = other ? DEFS[other.t].rad : d.rad; if (dist(x, z, i.x, i.z) < rad * 0.75) ok = false; }
    else if (dist(x, z, i.x, i.z) < (d.rad + DEFS[i.t].rad) * 0.85) ok = false;
  }
  if (t === 'coop' && dist(x, z + 2.1, farmer.x, farmer.z) < 0.6) ok = false;
  return ok;
}
function removeItem(it: Item) {
  scene.remove(it.mesh); items.splice(items.indexOf(it), 1); navDirty();
  for (const h of hens) if (h.coop === it) { h.coop = null; if (h.state === 'housed') releaseHen(h, it); }
}

// ---------- navigation ----------
const NAV_N = 34, NAV_W = 68;
let navBlock: Uint8Array | null = null, navH = new Uint8Array(0), navV = new Uint8Array(0);
const navCache = new Map<number, Uint16Array>();
function navDirty() { navBlock = null; navCache.clear(); }
function navBuild() {
  const B = (navBlock = new Uint8Array(NAV_W * NAV_W)); navH = new Uint8Array(NAV_W * NAV_W); navV = new Uint8Array(NAV_W * NAV_W);
  const fill = (x: number, z: number, test: (cx: number, cz: number) => boolean, rad: number) => {
    for (let j = Math.floor(z - rad) + NAV_N; j <= Math.floor(z + rad) + NAV_N; j++) for (let i = Math.floor(x - rad) + NAV_N; i <= Math.floor(x + rad) + NAV_N; i++)
      if (i >= 0 && j >= 0 && i < NAV_W && j < NAV_W && test(i - NAV_N + 0.5, j - NAV_N + 0.5)) B[j * NAV_W + i] = 1;
  };
  for (let j = 0; j < NAV_W; j++) for (let i = 0; i < NAV_W; i++) if (Math.hypot(i - NAV_N + 0.5, j - NAV_N + 0.5) > WORLD_R) B[j * NAV_W + i] = 1;
  for (const o of obstacles) if (o.alive) fill(o.x, o.z, (cx, cz) => dist(cx, cz, o.x, o.z) < o.r + 0.25, o.r + 1);
  for (const i of items) {
    if (i.t === 'coop') fill(i.x, i.z, (cx, cz) => Math.abs(cx - i.x) < 1.8 && Math.abs(cz - i.z + 0.15) < 1.9, 3);
    else if (DEFS[i.t].solid) fill(i.x, i.z, (cx, cz) => dist(cx, cz, i.x, i.z) < DEFS[i.t].rad * 0.8, 2);
    else if (i.t === 'fence' || (i.t === 'gate' && !i.open)) {
      if (i.r) for (const cz of [i.z - 1, i.z]) navV[(cz + NAV_N) * NAV_W + i.x + NAV_N] = 1;
      else for (const cx of [i.x - 1, i.x]) navH[(i.z + NAV_N) * NAV_W + cx + NAV_N] = 1;
    }
  }
}
function navCan(i: number, j: number, di: number, dj: number) {
  const ni = i + di, nj = j + dj;
  if (ni < 0 || nj < 0 || ni >= NAV_W || nj >= NAV_W || navBlock![nj * NAV_W + ni]) return false;
  if (di && dj) return navCan(i, j, di, 0) && navCan(i, j, 0, dj) && navCan(i + di, j, 0, dj) && navCan(i, j + dj, di, 0);
  if (di > 0) return !navV[j * NAV_W + i + 1]; if (di < 0) return !navV[j * NAV_W + i];
  return dj > 0 ? !navH[(j + 1) * NAV_W + i] : !navH[j * NAV_W + i];
}
function navField(tx: number, tz: number) {
  if (!navBlock) navBuild();
  const ti = clamp(Math.floor(tx) + NAV_N, 0, NAV_W - 1), tj = clamp(Math.floor(tz) + NAV_N, 0, NAV_W - 1), key = tj * NAV_W + ti;
  let f = navCache.get(key);
  if (f) return f;
  f = new Uint16Array(NAV_W * NAV_W).fill(65535); f[key] = 0;
  const q = [key];
  for (let h = 0; h < q.length; h++) {
    const k = q[h], i = k % NAV_W, j = (k / NAV_W) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = (j + dj) * NAV_W + i + di;
      if (navCan(i + di, j + dj, -di, -dj) || (k === key && i + di >= 0 && j + dj >= 0 && i + di < NAV_W && j + dj < NAV_W && !navBlock![n] && navCan(i, j, di, dj))) if (f[n] === 65535) { f[n] = f[k] + 1; q.push(n); }
    }
  }
  navCache.set(key, f);
  return f;
}
/** Next point to walk to on the way to (tx,tz), or null when fences leave no way through. */
function navStep(x: number, z: number, tx: number, tz: number): Body | null {
  const f = navField(tx, tz), i = clamp(Math.floor(x) + NAV_N, 0, NAV_W - 1), j = clamp(Math.floor(z) + NAV_N, 0, NAV_W - 1), d0 = f[j * NAV_W + i];
  if (d0 <= 1) return { x: tx, z: tz };
  let best = d0, bi = 0, bj = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if ((!di && !dj) || !navCan(i, j, di, dj)) continue;
    const d = f[(j + dj) * NAV_W + i + di];
    if (d < best) { best = d; bi = di; bj = dj; }
  }
  return best < d0 ? { x: i + bi - NAV_N + 0.5, z: j + bj - NAV_N + 0.5 } : null;
}
function nearFence(x: number, z: number) {
  for (const i of items) if ((i.t === 'fence' || (i.t === 'gate' && !i.open)) && Math.abs(x - i.x) < 1.5 && Math.abs(z - i.z) < 1.5) {
    const p = { x, z }; pushSeg(p, 0.45, segOf(i)); if (p.x !== x || p.z !== z) return true;
  }
  return false;
}

// ---------- collision ----------
type Body = { x: number; z: number };
function pushSeg(p: Body, r: number, s: number[]) {
  const dx = s[2] - s[0], dz = s[3] - s[1];
  const t = clamp(((p.x - s[0]) * dx + (p.z - s[1]) * dz) / (dx * dx + dz * dz), 0, 1);
  const cx = s[0] + dx * t, cz = s[1] + dz * t, d = Math.hypot(p.x - cx, p.z - cz);
  if (d < r && d > 1e-5) { const k = (r - d) / d; p.x += (p.x - cx) * k; p.z += (p.z - cz) * k; }
}
function collide(p: Body, r: number, fences: boolean) {
  nearObstacles(p.x, p.z, o => {
    const d = dist(p.x, p.z, o.x, o.z), min = o.r + r;
    if (d < min && d > 1e-5) { const k = (min - d) / d; p.x += (p.x - o.x) * k; p.z += (p.z - o.z) * k; }
  });
  for (const i of items) {
    if (i.t === 'coop') {
      const hx = 1.4 + r, hz = 1.5 + r, dx = p.x - i.x, dz = p.z - (i.z - 0.15); // the cottage is about 2.8 by 3
      if (Math.abs(dx) < hx && Math.abs(dz) < hz) { if (hx - Math.abs(dx) < hz - Math.abs(dz)) p.x = i.x + Math.sign(dx || 1) * hx; else p.z = i.z - 0.15 + Math.sign(dz || 1) * hz; }
    } else if (DEFS[i.t].solid) {
      const d = dist(p.x, p.z, i.x, i.z), min = DEFS[i.t].rad * 0.8 + r;
      if (d < min && d > 1e-5) { const k = (min - d) / d; p.x += (p.x - i.x) * k; p.z += (p.z - i.z) * k; }
    } else if (fences && (i.t === 'fence' || (i.t === 'gate' && !i.open))) { if (Math.abs(p.x - i.x) < 2 && Math.abs(p.z - i.z) < 2) pushSeg(p, r + 0.1, segOf(i)); }
  }
  const d = Math.hypot(p.x, p.z);
  if (d > WORLD_R) { p.x *= WORLD_R / d; p.z *= WORLD_R / d; }
}
function isOpen(x: number, z: number, margin: number) {
  if (Math.hypot(x, z) > WORLD_R - 2) return false;
  let ok = true;
  nearObstacles(x, z, o => { if (dist(x, z, o.x, o.z) < o.r + margin) ok = false; });
  for (const i of items) if (i.t === 'coop' && Math.abs(x - i.x) < 2.2 && Math.abs(z - i.z) < 1.8) ok = false;
  return ok;
}

// ---------- effects ----------
const particles: { m: THREE.Mesh; vx: number; vy: number; vz: number; life: number }[] = [];
const pGeo = new THREE.BoxGeometry(0.14, 0.05, 0.14);
function puff(x: number, y: number, z: number, color: number, n: number, speed = 3) {
  for (let i = 0; i < n; i++) {
    let p = particles.find(q => q.life <= 0);
    if (!p) { if (particles.length > 90) return; p = { m: new THREE.Mesh(pGeo, mat(color)), vx: 0, vy: 0, vz: 0, life: 0 }; scene.add(p.m); particles.push(p); }
    p.m.material = mat(color); p.m.visible = true; p.m.position.set(x, y, z);
    const a = R() * 6.283;
    p.vx = Math.cos(a) * speed * R(); p.vz = Math.sin(a) * speed * R(); p.vy = 2 + R() * 3; p.life = 0.7 + R() * 0.5;
  }
}
const rings: { m: THREE.Mesh; t: number; max: number; dur: number }[] = [];
function ring(x: number, z: number, max: number, color: number, dur = 0.6) {
  let r = rings.find(q => q.t >= q.dur);
  if (!r) { const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })); r = { m, t: 0, max, dur }; rings.push(r); scene.add(m); }
  (r.m.material as THREE.MeshBasicMaterial).color.setHex(color);
  r.m.position.set(x, 0.06, z); r.m.visible = true; r.t = 0; r.max = max; r.dur = dur;
}
const marker = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.8, depthWrite: false }));
marker.visible = false; scene.add(marker);

// ---------- state ----------
const G = {
  started: false, day: 1, clock: 0, eggs: 10, cleared: 0, goal: 0, sky: 0,
  stats: { collected: 0, planted: 0, brought: 0, hatched: 0, bought: 0 },
};
const phase = () => (G.clock < DAY ? 'day' : G.clock < DAY + DUSK ? 'dusk' : 'night');
const keys = new Set<string>();
function toast(msg: string, ms = 3200) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout((toast as any).h); (toast as any).h = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- farmer ----------
const farmerModel = makeFarmer();
scene.add(farmerModel.group);
type Interact = { kind: 'coop' | 'patch' | 'gate' | 'obst' | 'hen'; ref: any; label: string; x: number; z: number; reach: number };
const farmer = { x: 0, z: 0, vx: 0, vz: 0, face: 0, anim: 0, hop: 0, target: null as Body | null, pending: null as Interact | null, act: null as { o: Obstacle; t: number } | null };

// ---------- dog ----------
const dogModel = makeDog();
scene.add(dogModel.group);
const dog = { x: 1.5, z: 1, vx: 0, vz: 0, face: 0, anim: 0, hop: 0, mode: 'heel' as 'heel' | 'gather' | 'bring' | 'chase', steady: false, t: 0, swept: 0, last: NaN, prey: null as any };
const dogWorking = () => dog.mode === 'gather' || dog.mode === 'bring';

// ---------- emotes: small icons over a hen that needs something ----------
const emoteTex: Record<string, THREE.CanvasTexture> = {};
function emoteTexture(kind: string) {
  if (emoteTex[kind]) return emoteTex[kind];
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#f6f1e4'; g.beginPath(); g.arc(32, 30, 26, 0, 6.3); g.fill(); g.beginPath(); g.moveTo(22, 50); g.lineTo(32, 63); g.lineTo(42, 50); g.fill();
  if (kind === 'hungry') { g.fillStyle = '#d9a23a'; for (const [x, y] of [[23, 26], [41, 26], [32, 38]]) { g.beginPath(); g.ellipse(x, y, 6, 9, 0.4, 0, 6.3); g.fill(); } }
  else { g.fillStyle = kind === 'spooked' ? '#d8553f' : kind === 'eat' ? '#d8553f' : '#1f2a2e'; g.font = '800 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(kind === 'spooked' ? '!' : kind === 'lost' ? '?' : kind === 'eat' ? '\u2665' : 'z', 32, 32); }
  return (emoteTex[kind] = new THREE.CanvasTexture(cv));
}
function makeEmote(parent: THREE.Object3D) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  s.position.y = 1.45; s.scale.setScalar(0.75); s.visible = false; parent.add(s);
  return s;
}

// ---------- hens ----------
type Hen = {
  name: string; color: number; chick: boolean; rooster: boolean; cock: boolean; x: number; z: number; vx: number; vz: number;
  fear: number; panic: number; bold: number; wx: number; wz: number; idle: number; jit: number; jitT: number; face: number; anim: number;
  model: ReturnType<typeof makeChicken>; state: 'out' | 'housed'; coop: Item | null; fed: number; spooked: boolean; rough: boolean; laid: boolean;
  eatT: number; patch: Item | null; seekT: number; lost: boolean; emote: THREE.Sprite; emoteKind: string;
};
const hens: Hen[] = [];
function addHen(o: Partial<Hen> & { x: number; z: number }) {
  const chick = !!o.chick, rooster = !!o.rooster;
  const color = chick ? 0xf2d35a : rooster ? 0x9c3a22 : o.color && o.color !== 0xf2d35a && o.color !== 0x9c3a22 ? o.color : HEN_COLORS[(R() * HEN_COLORS.length) | 0];
  const used = new Set(hens.map(h => h.name));
  const name = o.name || (rooster && !chick ? 'Rooster' : NAMES.filter(n => !used.has(n))[(R() * (NAMES.length - used.size)) | 0] || 'Hen ' + (hens.length + 1));
  const model = makeChicken(color, chick, rooster && !chick);
  scene.add(model.group);
  const h: Hen = {
    vx: 0, vz: 0, fear: 0, panic: 0, bold: R(), wx: o.x, wz: o.z, idle: R() * 3, jit: 0, jitT: 0, face: R() * 6.28, anim: R() * 10,
    state: 'out', coop: null, fed: 0.3, spooked: false, rough: false, laid: false, eatT: 0, patch: null, seekT: R() * 4, lost: false, emote: makeEmote(model.group), emoteKind: '', cock: chick && R() < 0.2,
    ...o, name, color, chick, rooster, model,
  };
  hens.push(h);
  return h;
}
function removeHen(h: Hen) { scene.remove(h.model.group); hens.splice(hens.indexOf(h), 1); }
const theRooster = () => hens.find(h => h.rooster && !h.chick) || null;
const outHens = () => hens.filter(h => h.state === 'out');
const coopCount = (c: Item) => hens.filter(h => h.coop === c).length;
const birds = () => hens.length + coops().reduce((s, c) => s + c.brood, 0);
const capacity = () => coops().length * COOP_CAP;
function releaseHen(h: Hen, c: Item) {
  const d = door(c);
  Object.assign(h, { state: 'out', x: d.x + (R() - 0.5) * 1.5, z: d.z + R() * 0.8, vx: 0, vz: 0.8, wx: d.x + (R() - 0.5) * 6, wz: d.z + 2 + R() * 4, idle: 0, fear: 0, panic: 0 });
  h.model.group.visible = true;
}

// ---------- predators (gentle: they spook hens and steal eggs, nothing dies) ----------
const hawkModel = makeHawk(); hawkModel.group.visible = false; scene.add(hawkModel.group);
const hawkShadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a1a22, transparent: true, opacity: 0.25, depthWrite: false }));
hawkShadow.visible = false; scene.add(hawkShadow);
const hawk = { state: 'none' as 'none' | 'circle' | 'dive' | 'leave', t: 0, a: 0, x: 0, y: 12, z: 0, target: null as Hen | null, timer: 45 };
const foxM = makeFox(), snakeM = makeSnake();
type Pred = { kind: 'fox' | 'snake'; state: 'none' | 'hunt' | 'flee'; x: number; z: number; t: number; timer: number; steal: number; anim: number; group: THREE.Group };
const fox: Pred = { kind: 'fox', state: 'none', x: 0, z: 0, t: 0, timer: 6, steal: 0, anim: 0, group: foxM.group };
const snake: Pred = { kind: 'snake', state: 'none', x: 0, z: 0, t: 0, timer: 50, steal: 0, anim: 0, group: snakeM.group };
for (const p of [fox, snake]) { p.group.visible = false; scene.add(p.group); }

// ---------- interaction ----------
let panelFor: { kind: string; ref: any } | null = null;
function findInteract(x: number, z: number, rad: number, click: boolean): Interact | null {
  let best: Interact | null = null, bs = 1e9;
  const consider = (i: Interact, size: number, bias = 0) => { const d = dist(x, z, i.x, i.z) - size; if (d < rad && d + bias < bs) { bs = d + bias; best = i; } };
  for (const i of items) {
    if (i.t === 'coop') { const d = door(i), lab = i.eggs ? `Collect ${i.eggs} egg${i.eggs > 1 ? 's' : ''}` : 'Look in the coop'; consider({ kind: 'coop', ref: i, label: lab, x: d.x, z: d.z - 0.3, reach: 1.9 }, click ? 1.6 : 1.0, -0.5); }
    else if (i.t === 'patch' && i.grow < 0) consider({ kind: 'patch', ref: i, label: 'Sow feed', x: i.x, z: i.z, reach: 2.1 }, 1.1);
    else if (i.t === 'gate') consider({ kind: 'gate', ref: i, label: i.open ? 'Close gate' : 'Open gate', x: i.x, z: i.z, reach: 2 }, 0.9, -0.3);
  }
  nearObstacles(x, z, o => consider({ kind: 'obst', ref: o, label: o.rock ? 'Break rock' : o.bush ? 'Clear bush' : 'Chop tree', x: o.x, z: o.z, reach: o.r + 1.1 }, o.r, 0.3));
  if (click) for (const h of hens) if (h.state === 'out') consider({ kind: 'hen', ref: h, label: h.name, x: h.x, z: h.z, reach: 30 }, 0.5, -0.2);
  return best;
}
function doInteract(i: Interact) {
  if (i.kind === 'coop') {
    const c: Item = i.ref;
    if (c.eggs) { G.eggs += c.eggs; G.stats.collected += c.eggs; toast(`Collected ${c.eggs} egg${c.eggs > 1 ? 's' : ''}.`); puff(c.x, 0.5, c.z + 1.6, 0xf6ead2, 6, 2); c.eggs = 0; sfx.home(); refreshItem(c); }
    showPanel('coop', c);
  } else if (i.kind === 'patch') { i.ref.grow = 0; G.stats.planted++; refreshItem(i.ref); sfx.dig(); puff(i.x, 0.3, i.z, 0x8a6444, 6, 2); toast('Feed sown. It ripens in about a minute.'); }
  else if (i.kind === 'gate') { i.ref.open = !i.ref.open; navDirty(); sfx.dig(); }
  else if (i.kind === 'obst') farmer.act = { o: i.ref, t: 0 };
  else if (i.kind === 'hen') showPanel('hen', i.ref);
  queueSave();
}
function showPanel(kind: string, ref: any) { panelFor = { kind, ref }; renderPanel(); $('panel').hidden = false; }
function hidePanel() { panelFor = null; $('panel').hidden = true; }
let panelHtml = '';
function renderPanel() {
  if (!panelFor) return;
  let html = '';
  if (panelFor.kind === 'hen') {
    const h: Hen = panelFor.ref;
    if (!hens.includes(h)) return hidePanel();
    const kind = h.chick ? 'Chick' : h.rooster ? 'Rooster' : 'Hen';
    const rows = [
      h.fed >= 0.6 ? ['ok', 'Well fed'] : ['no', h.fed > 0.3 ? 'Peckish' : 'Hungry'],
      h.rough ? ['no', 'Slept outside last night'] : ['ok', 'Slept in the coop'],
      h.spooked ? ['no', 'Spooked today'] : ['ok', 'Calm'],
    ];
    const lay = h.chick ? 'Grows up tomorrow morning.' : h.rooster ? 'Keeps the hens together and lets eggs hatch.' : h.laid ? 'Laid an egg this morning.' : 'No egg this morning.';
    html = `<h2>${h.name}</h2><p class="sub">${kind}</p><ul class="mood">${rows.map(r => `<li class="${r[0]}">${r[1]}</li>`).join('')}</ul><p class="sub">${lay}</p>`;
  } else {
    const c: Item = panelFor.ref;
    if (!items.includes(c)) return hidePanel();
    const n = birds(), roo = theRooster();
    const why = !roo ? 'Needs a rooster' : n >= capacity() ? 'The coops are full. Build another.' : G.eggs < 1 ? 'No eggs in the basket' : '';
    html = `<h2>Coop</h2><p class="sub">${n} birds on the farm, room for ${capacity()}${c.brood ? `, ${c.brood} egg${c.brood > 1 ? 's' : ''} hatching` : ''}</p>
      <p>A hen lays each morning if she was fed, slept inside and stayed calm.</p>
      <button type="button" data-p="hatch" ${why ? 'disabled' : ''}>Leave an egg to hatch</button><p class="sub">${why || 'Uses 1 egg from the basket. The chick arrives at dawn.'}</p>`;
  }
  if (html !== panelHtml) { panelHtml = html; $('panelBody').innerHTML = html; }
}
$('panelBody').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-p]');
  if (!b || !panelFor || panelFor.kind !== 'coop') return;
  const c: Item = panelFor.ref;
  if (theRooster() && birds() < capacity() && G.eggs >= 1) { G.eggs--; c.brood++; sfx.buy(); queueSave(); }
});
$('panelClose').addEventListener('click', hidePanel);

// ---------- build mode ----------
const build = { open: false, sel: null as string | null, rot: 0, ghost: null as THREE.Group | null, x: 0, z: 0, ok: false, has: false };
const ghostOk = new THREE.MeshBasicMaterial({ color: 0xbfe89a, transparent: true, opacity: 0.6, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: 0xe87a6a, transparent: true, opacity: 0.6, depthWrite: false });
function setGhost() {
  if (build.ghost) scene.remove(build.ghost);
  build.ghost = null;
  if (!build.sel || build.sel === 'remove') return;
  build.ghost = buildMesh(build.sel, build.rot).mesh;
  build.ghost.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = ghostOk; m.castShadow = false; } });
  build.ghost.visible = false;
  scene.add(build.ghost);
}
function selectBuild(sel: string | null) {
  if (sel && sel !== 'remove' && !DEFS[sel]) return;
  build.sel = build.sel === sel ? null : sel; build.has = false;
  if (build.sel && build.sel !== 'remove' && touchMode) { build.x = camTarget.x; build.z = camTarget.z + 1; build.has = true; }
  if (!DEFS[build.sel || ''] ) build.rot = 0;
  setGhost(); renderPalette();
}
function toggleBuild(on?: boolean) {
  build.open = on ?? !build.open;
  if (build.open) hidePanel();
  if (!build.open) { build.sel = null; setGhost(); }
  $('palette').hidden = !build.open; renderPalette();
}
function rooAllowed() { const n = hens.filter(h => !h.rooster).length, r = hens.filter(h => h.rooster).length; return r < Math.max(1, Math.floor(n / 8)); }
let paletteHtml = '';
function renderPalette() {
  if (!build.open) return;
  const full = birds() >= capacity(), gl = GOALS[G.goal], want = gl && gl.pal && !build.sel ? gl.pal() : '';
  const b = (key: string, name: string, cost: number, dis: boolean, note = '') =>
    `<button type="button" data-b="${key}" class="${build.sel === key ? 'on' : want === key ? 'pulse' : ''}" ${dis ? 'disabled' : ''} title="${note}">${name}<small>${cost ? cost + (cost > 1 ? ' eggs' : ' egg') : note || 'Free'}</small></button>`;
  const html = Object.entries(DEFS).map(([k, d]) => b(k, d.name, d.cost, G.eggs < d.cost)).join('')
    + `<span class="sep"></span>` + b('hen', 'Hen', HEN_COST, G.eggs < HEN_COST || full, full ? 'Coops full' : '')
    + b('rooster', 'Rooster', ROO_COST, G.eggs < ROO_COST || full || !rooAllowed(), !rooAllowed() ? 'One per 8 hens' : full ? 'Coops full' : '')
    + `<span class="sep"></span>` + b('rotate', 'Rotate', 0, false, 'R') + b('remove', 'Remove', 0, false, 'Refunds cost');
  if (html !== paletteHtml) { paletteHtml = html; $('palette').innerHTML = html; }
}
$('palette').addEventListener('click', e => {
  const k = (e.target as HTMLElement).closest<HTMLElement>('[data-b]')?.dataset.b;
  if (!k) return;
  initAudio();
  if (k === 'rotate') { build.rot = (build.rot + 1) % 2; setGhost(); }
  else if (k === 'hen' || k === 'rooster') buyBird(k === 'rooster');
  else selectBuild(k);
});
function buyBird(rooster: boolean) {
  const cost = rooster ? ROO_COST : HEN_COST, c = coops()[0];
  if (G.eggs < cost || !c || birds() >= capacity() || (rooster && !rooAllowed())) return;
  G.eggs -= cost; G.stats.bought++;
  const d = door(c), h = addHen({ x: d.x + (R() - 0.5) * 2, z: d.z + 1 + R(), rooster, fed: 0.6 });
  puff(h.x, 0.6, h.z, 0xfff3c4, 10, 3); sfx.buy(); if (rooster) sfx.crow();
  toast(rooster ? 'A rooster joins the flock. Eggs can hatch now.' : `${h.name} joins the flock.`);
  queueSave();
}
function placeAt(x: number, z: number) {
  if (build.sel === 'remove') {
    let best: Item | null = null, bd = 1.6;
    for (const i of items) { const d = dist(x, z, i.x, i.z) - (DEFS[i.t].rad || 0.6) * 0.6; if (d < bd) { bd = d; best = i; } }
    if (!best) return;
    const it = best as Item;
    if (it.t === 'coop' && coops().length === 1) return toast('The farm needs at least one coop.');
    G.eggs += DEFS[it.t].cost + it.eggs + it.brood; removeItem(it); sfx.pop(); puff(it.x, 0.5, it.z, 0xd9c7a0, 8, 3); queueSave();
    return;
  }
  const t = build.sel!, d = DEFS[t], s = snap(t, build.rot, x, z);
  if (!canPlace(t, build.rot, s.x, s.z)) return;
  if (G.eggs < d.cost) return toast('Not enough eggs in the basket.');
  G.eggs -= d.cost;
  addItem(t, s.x, s.z, build.rot);
  sfx.dig(); puff(s.x, 0.3, s.z, 0xd9c7a0, 5, 2);
  queueSave();
}

// ---------- whistles ----------
function flockFor() {
  const fl = outHens().filter(h => dist(h.x, h.z, farmer.x, farmer.z) < 40);
  if (!fl.length) return null;
  let x = 0, z = 0; for (const h of fl) { x += h.x; z += h.z; } x /= fl.length; z /= fl.length;
  let rad = 0; for (const h of fl) rad = Math.max(rad, dist(h.x, h.z, x, z));
  return { x, z, rad, fl };
}
function whistle(cmd: string) {
  if (!G.started) return;
  initAudio();
  if (cmd === 'gather') { if (!flockFor()) return toast('No hens out to gather.'); dog.mode = 'gather'; dog.t = 0; dog.swept = 0; dog.last = NaN; sfx.gather(); }
  else if (cmd === 'bring') { if (!flockFor()) return toast('No hens out to bring.'); dog.mode = 'bring'; dog.t = 0; sfx.steady(); }
  else if (cmd === 'heel') { dog.mode = 'heel'; sfx.lie(); }
  else if (cmd === 'away') {
    const p = fox.state === 'hunt' ? fox : snake.state === 'hunt' ? snake : hawk.state === 'circle' || hawk.state === 'dive' ? hawk : null;
    if (!p) return toast('Nothing to chase off.');
    dog.mode = 'chase'; dog.prey = p; dog.t = 0; sfx.bark();
  }
  ring(farmer.x, farmer.z, 3, 0xfff3c4);
}

// ---------- input ----------
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === 'enter' && !$('overlay').hidden) return start(false);
  if (!G.started) return;
  if (paused) { if (k === 'escape' || k === 'p') setPaused(false); return; }
  if (k === 'p') { setPaused(true); return; }
  if (k === 'q') whistle('gather');
  else if (k === 'f') whistle('bring');
  else if (k === ' ') { e.preventDefault(); whistle('heel'); }
  else if (k === 'r') { if (build.open && build.sel && build.sel !== 'remove') { build.rot = (build.rot + 1) % 2; setGhost(); } else whistle('away'); }
  else if (k === 'b') toggleBuild();
  else if (k === 'escape') { if (build.sel) selectBuild(build.sel); else if (build.open) toggleBuild(false); else if (panelFor) hidePanel(); else setPaused(true); }
  else if (k === 'e') { const i = findInteract(farmer.x, farmer.z, 1.5, false); if (i) { farmer.target = null; farmer.pending = null; doInteract(i); } }
  else if (k === 'm') toggleMute();
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
let pointerDown = false;
function groundAt(e: { clientX: number; clientY: number }) {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return !!ray.ray.intersectPlane(groundPlane, hit);
}
// Touch has no hover, so on a touchscreen building is drag-to-position then Place, and two fingers zoom.
let touchMode = window.matchMedia('(pointer: coarse)').matches;
const setTouch = (on: boolean) => { if (on !== touchMode || !document.body.dataset.input) { touchMode = on; document.body.dataset.input = on ? 'touch' : 'mouse'; document.body.classList.toggle('touch', on); } };
setTouch(touchMode);
const pointers = new Map<number, { x: number; y: number }>();
let pinch: { d: number; zoom: number } | null = null;
const pinchDist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
canvas.addEventListener('pointerdown', e => {
  initAudio(); setTouch(e.pointerType !== 'mouse');
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { pinch = { d: pinchDist(), zoom }; pointerDown = false; farmer.target = null; farmer.pending = null; marker.visible = false; return; }
  if (!G.started || pinch || !groundAt(e)) return;
  if (build.sel) {
    build.x = hit.x; build.z = hit.z; build.has = true;
    if (!touchMode || build.sel === 'remove') placeAt(hit.x, hit.z); else pointerDown = true;
    return;
  }
  pointerDown = true; farmer.act = null;
  const i = findInteract(hit.x, hit.z, touchMode ? 1.1 : 0.7, true);
  if (i && i.kind === 'hen') { doInteract(i); return; }
  farmer.pending = i;
  farmer.target = i ? { x: i.x, z: i.z } : { x: hit.x, z: hit.z };
  marker.position.set(farmer.target.x, 0.05, farmer.target.z); marker.visible = true;
});
canvas.addEventListener('pointermove', e => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) { zoom = clamp(pinch.zoom * pinch.d / pinchDist(), 0.5, 1.5); return; }
  if (!G.started || !groundAt(e)) return;
  if (build.sel) { if (!touchMode || pointerDown) { build.x = hit.x; build.z = hit.z; build.has = true; } }
  else if (pointerDown && !farmer.pending) { farmer.target = { x: hit.x, z: hit.z }; marker.position.set(hit.x, 0.05, hit.z); }
});
const pointerEnd = (e: PointerEvent) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; pointerDown = false; };
window.addEventListener('pointerup', pointerEnd);
window.addEventListener('pointercancel', pointerEnd);
for (const ev of ['gesturestart', 'gesturechange', 'contextmenu']) document.addEventListener(ev, e => e.preventDefault());
$('bubble').addEventListener('click', () => { const i = findInteract(farmer.x, farmer.z, 1.5, false); if (i) { farmer.target = null; farmer.pending = null; doInteract(i); } });
document.querySelectorAll<HTMLButtonElement>('[data-place]').forEach(b => b.addEventListener('click', () => {
  const k = b.dataset.place!;
  if (k === 'place') { if (build.sel && build.has) placeAt(build.x, build.z); }
  else if (k === 'rotate') { build.rot = (build.rot + 1) % 2; setGhost(); }
  else if (build.sel) selectBuild(build.sel);
}));
canvas.addEventListener('wheel', e => { zoom = clamp(zoom * (e.deltaY > 0 ? 1.08 : 0.93), 0.5, 1.5); e.preventDefault(); }, { passive: false });
document.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach(b => b.addEventListener('click', () => { const c = b.dataset.cmd!; if (c === 'build') toggleBuild(); else whistle(c); b.blur(); }));
function toggleMute() { setMuted(!isMuted()); $('mute').textContent = isMuted() ? 'Sound off' : 'Sound on'; }
$('mute').addEventListener('click', () => { initAudio(); toggleMute(); });
$('music').addEventListener('click', () => { initAudio(); setMusic(!isMusicOn()); $('music').textContent = isMusicOn() ? 'Music on' : 'Music off'; });

// ---------- simulation ----------
function updateFarmer(dt: number) {
  let ix = 0, iz = 0;
  if (G.started) {
    if (keys.has('w') || keys.has('arrowup')) iz -= 1;
    if (keys.has('s') || keys.has('arrowdown')) iz += 1;
    if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
    if (keys.has('d') || keys.has('arrowright')) ix += 1;
  }
  const f = farmer, SPEED = 5.6;
  let dvx = 0, dvz = 0;
  if (ix || iz) { const l = Math.hypot(ix, iz); dvx = (ix / l) * SPEED; dvz = (iz / l) * SPEED; f.target = null; f.pending = null; f.act = null; marker.visible = false; }
  else if (f.act) {
    const o = f.act.o, need = o.bush ? 1.1 : o.rock ? 1.8 : 2.8;
    f.face = Math.atan2(o.x - f.x, o.z - f.z);
    f.act.t += dt; o.shake += dt;
    if (((f.act.t * 4) | 0) !== (((f.act.t - dt) * 4) | 0)) { sfx.dig(); puff(o.x, 0.8, o.z, o.rock ? 0x9aa3a8 : o.bush ? 0x7fbf4a : 0xb0623a, 2, 2); }
    if (o.bush || o.rock) setObs(o, 1 - (f.act.t / need) * 0.3); else setObs(o, 1, Math.sin(f.act.t * 16) * 0.04 + (f.act.t / need) * 0.12);
    if (f.act.t >= need) { clearObstacle(o); f.act = null; queueSave(); }
  } else if (f.target) {
    const p = f.pending, dx = f.target.x - f.x, dz = f.target.z - f.z, l = Math.hypot(dx, dz);
    if (p && dist(f.x, f.z, p.x, p.z) < p.reach) { f.target = null; f.pending = null; marker.visible = false; doInteract(p); }
    else if (l < 0.25) { f.target = null; f.pending = null; marker.visible = false; }
    else { const s = Math.min(SPEED, l * 6); dvx = (dx / l) * s; dvz = (dz / l) * s; }
  }
  const k = Math.min(1, dt * 12);
  f.vx += (dvx - f.vx) * k; f.vz += (dvz - f.vz) * k;
  f.x += f.vx * dt; f.z += f.vz * dt;
  collide(f, 0.4, false);
  const sp = Math.hypot(f.vx, f.vz);
  if (sp > 0.4) f.face = Math.atan2(f.vx, f.vz);
  const m = farmerModel;
  f.hop = lerp(f.hop, sp > 0.5 && nearFence(f.x, f.z) ? 0.55 : 0, Math.min(1, dt * 12));
  m.group.position.set(f.x, f.hop, f.z);
  turn(m.group, f.face, dt * 14);
  m.update(dt, sp, !!f.act);
}

function updateDog(dt: number) {
  const d = dog;
  let tx = d.x, tz = d.z, speed = 0;
  d.steady = false; d.t += dt;
  if (d.mode === 'heel') {
    if (hawk.state === 'circle' && hawk.target && dist(d.x, d.z, hawk.target.x, hawk.target.z) < 10) { d.mode = 'chase'; d.prey = hawk; d.t = 0; sfx.bark(); }
    for (const p of [fox, snake]) if (p.state === 'hunt' && dist(d.x, d.z, p.x, p.z) < 10) { d.mode = 'chase'; d.prey = p; d.t = 0; sfx.bark(); }
    tx = farmer.x - Math.sin(farmer.face) * 1.4 + Math.cos(farmer.face) * 0.9; tz = farmer.z - Math.cos(farmer.face) * 1.4 - Math.sin(farmer.face) * 0.9;
    const l = dist(d.x, d.z, tx, tz); speed = l < 0.5 ? 0 : Math.min(8.5, l * 3.5);
  } else if (d.mode === 'chase') {
    const p = d.prey, active = p === hawk ? (hawk.state === 'circle' || hawk.state === 'dive') && hawk.target : p.state === 'hunt';
    if (!active || d.t > 12) d.mode = 'heel';
    else { const q = p === hawk ? hawk.target! : p; tx = q.x; tz = q.z; speed = 9.5; }
  } else {
    const f = flockFor();
    if (!f) d.mode = 'heel';
    else if (d.mode === 'gather') {
      const rad = Math.min(f.rad, 9) + 3.2, a = Math.atan2(d.z - f.z, d.x - f.x);
      if (!isNaN(d.last)) { let da = a - d.last; if (da > Math.PI) da -= 6.283; if (da < -Math.PI) da += 6.283; d.swept += da; }
      d.last = a; tx = f.x + Math.cos(a + 0.55) * rad; tz = f.z + Math.sin(a + 0.55) * rad; speed = 8.5;
      if (Math.abs(d.swept) > 6.283 * 1.1 || d.t > 9) d.mode = 'heel';
    } else { // bring: get behind the flock and walk it to the farmer
      let worst = 0, far = f.fl[0]; // work the hen furthest from the farmer, from behind
      for (const h of f.fl) { const dd = dist(h.x, h.z, farmer.x, farmer.z); if (dd > worst) { worst = dd; far = h; } }
      tx = far.x + ((far.x - farmer.x) / worst) * 2.2; tz = far.z + ((far.z - farmer.z) / worst) * 2.2;
      const gap = dist(d.x, d.z, far.x, far.z);
      d.steady = gap < 3.4; speed = d.steady ? Math.min(3.6, dist(d.x, d.z, tx, tz) * 3) : 8.5;
      if (worst < 5.5 || d.t > 40) { d.mode = 'heel'; if (worst < 5.5) { G.stats.brought++; sfx.home(); } }
    }
  }
  const dx = tx - d.x, dz = tz - d.z, l = Math.hypot(dx, dz) || 1, k = Math.min(1, dt * 12);
  d.vx += ((dx / l) * speed - d.vx) * k; d.vz += ((dz / l) * speed - d.vz) * k;
  d.x += d.vx * dt; d.z += d.vz * dt;
  collide(d, 0.45, false);
  const sp = Math.hypot(d.vx, d.vz);
  if (sp > 0.4) d.face = Math.atan2(d.vx, d.vz);
  const rest = d.mode === 'heel' && sp < 0.3 && phase() === 'night';
  d.anim += dt * (4 + sp * 2.2);
  const m = dogModel, swing = Math.min(1, sp / 4) * 0.8;
  d.hop = lerp(d.hop, sp > 0.5 && nearFence(d.x, d.z) ? 0.5 : 0, Math.min(1, dt * 12));
  m.group.position.set(d.x, d.hop, d.z);
  turn(m.group, d.face, dt * 14);
  m.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(d.anim + (i % 3 === 0 ? 0 : Math.PI)) * swing; leg.scale.y = lerp(leg.scale.y, rest ? 0.35 : 1, dt * 8); });
  m.inner.position.y = lerp(m.inner.position.y, rest ? -0.3 : Math.abs(Math.sin(d.anim)) * 0.05 * swing, dt * 8);
  m.inner.rotation.x = lerp(m.inner.rotation.x, d.steady ? 0.12 : 0, dt * 10);
  m.tail.rotation.y = Math.sin(d.anim * 1.5) * (sp > 1 ? 0.25 : 0.6);
}

function spook(x: number, z: number, rad: number) {
  for (const h of hens) if (h.state === 'out' && dist(h.x, h.z, x, z) < rad) { h.spooked = true; h.panic = 1; h.patch = null; h.eatT = 0; }
  sfx.cluck(1);
}
function updateHens(dt: number) {
  const ph = phase(), working = dogWorking(), pressure = !working ? 0 : dog.steady ? 4.5 : 7, fleeMax = dog.steady ? 3.3 : 5.6;
  const dogSpeed = Math.hypot(dog.vx, dog.vz), roo = theRooster(), n = Math.max(1, hens.length);
  const forage = (0.6 / 110) * Math.min(1, (3 + G.cleared * 0.5) / n);
  for (const h of hens) {
    if (h.state !== 'out') continue;
    const dx = h.x - dog.x, dz = h.z - dog.z, d = Math.hypot(dx, dz) || 0.01;
    const settled = dog.mode === 'bring' && dist(h.x, h.z, farmer.x, farmer.z) < 5; // delivered hens stay put by the farmer
    if (settled && dist(h.wx, h.wz, farmer.x, farmer.z) > 3.5) { const a = R() * 6.283; h.wx = farmer.x + Math.cos(a) * 2.2; h.wz = farmer.z + Math.sin(a) * 2.2; h.idle = 5; }
    const pr = settled ? 0 : pressure * (1 - 0.3 * h.bold) * (h.chick ? 1.2 : 1);
    const strength = d < pr ? 1 - d / pr : 0;
    h.fear += (strength - h.fear) * Math.min(1, dt * (strength > h.fear ? 10 : 1.1));
    if (working && d < 2.2 && dogSpeed > 4) h.panic = Math.min(1, h.panic + dt * 2.5);
    h.panic = Math.max(0, h.panic - dt * 0.45);
    let ax = 0, az = 0;
    if (strength > 0) {
      const s = fleeMax * Math.pow(strength, 0.6); ax += (dx / d) * s; az += (dz / d) * s;
      if (dog.mode === 'bring') { const fd = dist(h.x, h.z, farmer.x, farmer.z) || 1; ax += ((farmer.x - h.x) / fd) * 2.5; az += ((farmer.z - h.z) / fd) * 2.5; } // driven hens head for the farmer
    }
    if (fox.state === 'hunt') {
      const fx = h.x - fox.x, fz = h.z - fox.z, fd = Math.hypot(fx, fz) || 0.01;
      if (fd < 5) { const s = 1 - fd / 5; ax += (fx / fd) * 5 * s; az += (fz / fd) * 5 * s; h.fear = Math.max(h.fear, s); }
    }
    let nx = 0, nz = 0, nvx = 0, nvz = 0, cnt = 0;
    for (const o of hens) {
      if (o === h || o.state !== 'out') continue;
      const ox = h.x - o.x, oz = h.z - o.z, od = Math.hypot(ox, oz) || 0.01;
      if (od < 0.85) { ax += (ox / od) * (0.85 - od) * 7; az += (oz / od) * (0.85 - od) * 7; }
      if (od < 5.5) { nx += o.x; nz += o.z; nvx += o.vx; nvz += o.vz; cnt++; }
    }
    if (cnt && h.fear > 0.08) {
      const w = 1.7 * h.fear * (1 - h.panic * 0.8);
      ax += (nx / cnt - h.x) * w * 0.5; az += (nz / cnt - h.z) * w * 0.5; ax += (nvx / cnt) * 0.5 * h.fear; az += (nvz / cnt) * 0.5 * h.fear;
    }
    if (h.panic > 0.05) {
      h.jitT -= dt; if (h.jitT <= 0) { h.jit = R() * 6.283; h.jitT = 0.25 + R() * 0.3; if (R() < 0.4) sfx.cluck(h.panic); }
      ax += Math.cos(h.jit) * h.panic * 4.5; az += Math.sin(h.jit) * h.panic * 4.5;
    }
    const calm = h.fear < 0.08 && h.panic < 0.05;
    let walk = 1.1, sleeping = false;
    if (ph === 'day') h.lost = false;
    if (ph !== 'day') { // evening: head for a coop with room
      if (!h.coop || !items.includes(h.coop)) {
        h.coop = null; let bd = 20;
        for (const c of coops()) { const dr0 = door(c), dd = dist(h.x, h.z, dr0.x, dr0.z); if (dd < bd && coopCount(c) < COOP_CAP) { bd = dd; h.coop = c; } }
      }
      if (h.coop) {
        const dr = door(h.coop), dd = dist(h.x, h.z, dr.x, dr.z);
        if (dd < 0.75) { h.state = 'housed'; h.model.group.visible = false; puff(h.x, 0.5, h.z, 0xfff3c4, 3, 1.5); sfx.home(); continue; }
        h.wx = dr.x; h.wz = dr.z; walk = 2.0; h.idle = 0;
        const wp = navStep(h.x, h.z, dr.x, dr.z); h.lost = !wp;
        if (wp) { h.wx = wp.x; h.wz = wp.z; }
        if (!calm && dd < 6) { ax += ((dr.x - h.x) / dd) * 2.4; az += ((dr.z - h.z) / dd) * 2.4; }
      } else { h.lost = true; if (ph === 'night') sleeping = true; }
      h.patch = null; h.eatT = 0;
    } else if (calm) {
      h.fed = Math.min(1, h.fed + forage * dt);
      if (h.eatT > 0) {
        h.eatT -= dt; h.wx = h.x; h.wz = h.z;
        if (h.eatT <= 0 && h.patch && h.patch.grow >= 1) { h.fed = Math.min(1, h.fed + 0.7); if (--h.patch.servings <= 0) h.patch.grow = -1; refreshItem(h.patch); h.patch = null; }
      } else if (h.patch) {
        if (h.patch.grow < 1 || !items.includes(h.patch)) h.patch = null;
        else if (dist(h.x, h.z, h.patch.x, h.patch.z) < 1.0) h.eatT = 2.5;
        else { const wp = navStep(h.x, h.z, h.patch.x, h.patch.z); if (wp) { h.wx = wp.x; h.wz = wp.z; h.idle = 0; walk = 1.5; } else h.patch = null; }
      } else if (h.fed < 0.6) {
        h.seekT -= dt;
        if (h.seekT <= 0) { h.seekT = 4; let bd = 24; for (const i of items) if (i.t === 'patch' && i.grow >= 1) { const dd = dist(h.x, h.z, i.x, i.z); if (dd < bd && navField(i.x, i.z)[(clamp(Math.floor(h.z) + NAV_N, 0, NAV_W - 1)) * NAV_W + clamp(Math.floor(h.x) + NAV_N, 0, NAV_W - 1)] < 65535) { bd = dd; h.patch = i; } } }
      }
    }
    if (calm && !sleeping) {
      const wx = h.wx - h.x, wz = h.wz - h.z, wl = Math.hypot(wx, wz);
      if (wl > 0.3) { ax += (wx / wl) * walk; az += (wz / wl) * walk; }
      else if (ph === 'day' && h.eatT <= 0) {
        h.idle -= dt;
        if (h.idle <= 0) {
          h.idle = 1 + R() * 3.5;
          for (let i = 0; i < 6; i++) {
            const near = roo && roo !== h && roo.state === 'out' && R() < 0.75 ? roo : null;
            const a = R() * 6.283, r = near ? 1 + R() * 3.5 : 2 + R() * 6, x = (near || h).x + Math.cos(a) * r, z = (near || h).z + Math.sin(a) * r;
            if (isOpen(x, z, 1)) { h.wx = x; h.wz = z; break; }
          }
        }
      }
    } else if (!calm) { if (ph === 'day') { h.wx = h.x; h.wz = h.z; } h.eatT = 0; }
    const maxS = (1.3 + h.fear * 4.4 + h.panic * 1.6 + (walk - 1.1)) * (h.chick ? 1.1 : 1);
    const al = Math.hypot(ax, az);
    if (al > maxS) { ax *= maxS / al; az *= maxS / al; }
    const k = Math.min(1, dt * 7);
    h.vx += (ax - h.vx) * k; h.vz += (az - h.vz) * k;
    h.x += h.vx * dt; h.z += h.vz * dt;
    collide(h, 0.3, true);
    const sp = Math.hypot(h.vx, h.vz);
    if (sp > 0.25) h.face = Math.atan2(h.vx, h.vz);
    h.anim += dt * (3 + sp * 5);
    const g = h.model.group;
    g.position.set(h.x, h.panic > 0.4 ? Math.abs(Math.sin(h.anim * 1.3)) * 0.25 : sleeping ? -0.12 : 0, h.z);
    turn(g, h.face, dt * 10);
    h.model.inner.rotation.z = Math.sin(h.anim) * Math.min(0.2, sp * 0.06);
    h.model.inner.position.y = Math.abs(Math.sin(h.anim)) * Math.min(0.06, sp * 0.03);
    const em = h.spooked && h.panic < 0.3 && ph === 'day' ? 'spooked' : h.lost && ph !== 'day' && !sleeping ? 'lost' : sleeping ? 'sleep' : h.eatT > 0 ? 'eat' : ph === 'day' && h.fed < 0.35 && G.clock > DAY * 0.45 && !h.rooster ? 'hungry' : '';
    if (em !== h.emoteKind) { h.emoteKind = em; h.emote.visible = !!em; if (em) { h.emote.material.map = emoteTexture(em); h.emote.material.needsUpdate = true; } }
    if (em) h.emote.position.y = (1.45 + Math.sin(h.anim * 0.6) * 0.06) / g.scale.y;
    h.model.head.rotation.x = 0.4 * (sleeping ? 0.4 : h.eatT > 0 ? 0.6 + Math.sin(h.anim * 3) * 0.5 : sp < 0.2 && calm ? Math.max(0, Math.sin(h.anim * 0.9)) * 1.1 : Math.sin(h.anim) * 0.12);
  }
}

function updateHawk(dt: number) {
  const h = hawk;
  if (h.state === 'none') {
    if (phase() !== 'day' || G.day < 2 || !G.started) return;
    h.timer -= dt;
    if (h.timer > 0) return;
    h.timer = 55 + R() * 40;
    const crows = items.filter(i => i.t === 'scarecrow');
    const prey = outHens().filter(c => !crows.some(s => dist(c.x, c.z, s.x, s.z) < 9));
    if (!prey.length) return;
    h.target = prey[(R() * prey.length) | 0]; h.state = 'circle'; h.t = 0; h.a = R() * 6.28; h.y = 11;
    sfx.hawk(); if (theRooster()) sfx.crow();
    toast('A hawk is circling. Stand by the hen, or whistle Away (R).');
  }
  h.t += dt;
  const tgt = h.target && h.target.state === 'out' && hens.includes(h.target) ? h.target : null, px = h.x, pz = h.z;
  if (h.state === 'circle' || h.state === 'dive') {
    if (!tgt) { h.state = 'leave'; h.t = 0; }
    else if (dist(tgt.x, tgt.z, farmer.x, farmer.z) < 3 || dist(tgt.x, tgt.z, dog.x, dog.z) < 3) { h.state = 'leave'; h.t = 0; h.target = null; toast('The hawk gave up.'); }
    else if (h.state === 'circle') {
      h.a += dt * 1.9; h.x = tgt.x + Math.cos(h.a) * 3.2; h.z = tgt.z + Math.sin(h.a) * 3.2; h.y = 11;
      if (h.t > 6) { h.state = 'dive'; h.t = 0; sfx.hawk(); }
    } else {
      const k = Math.min(1, h.t / 1.1);
      h.x = lerp(h.x, tgt.x, k * k); h.z = lerp(h.z, tgt.z, k * k); h.y = lerp(11, 1.2, k * k);
      if (k >= 1) { puff(tgt.x, 0.6, tgt.z, tgt.color, 10, 4); spook(tgt.x, tgt.z, 4.5); toast(`The hawk spooked ${tgt.name}. No egg from a spooked hen.`); h.state = 'leave'; h.t = 0; h.target = null; }
    }
  } else if (h.state === 'leave') {
    h.x += Math.cos(h.a) * 14 * dt; h.z += Math.sin(h.a) * 14 * dt - 6 * dt; h.y += 9 * dt;
    if (h.t > 2.2) { h.state = 'none'; hawkModel.group.visible = hawkShadow.visible = false; return; }
  }
  hawkModel.group.visible = hawkShadow.visible = true;
  hawkModel.group.position.set(h.x, h.y, h.z);
  if (dist(h.x, h.z, px, pz) > 0.001) hawkModel.group.rotation.y = Math.atan2(h.x - px, h.z - pz);
  const flap = Math.sin(performance.now() * 0.012) * (h.state === 'circle' ? 0.25 : 0.7);
  hawkModel.wings[0].rotation.z = flap; hawkModel.wings[1].rotation.z = -flap;
  const low = 1 - clamp(h.y / 11, 0, 1);
  hawkShadow.position.set(h.x, 0.05, h.z); hawkShadow.scale.setScalar(lerp(2.0, 0.8, low));
  (hawkShadow.material as THREE.MeshBasicMaterial).opacity = lerp(0.22, 0.5, low);
}

function updatePred(p: Pred, dt: number) {
  const isFox = p.kind === 'fox', ph = phase();
  if (p.state === 'none') {
    if (!G.started || (isFox ? ph === 'day' || G.day < 3 : ph !== 'day' || G.day < 4 || G.clock < 20)) return;
    p.timer -= dt;
    if (p.timer > 0) return;
    const hasEggs = coops().some(c => c.eggs > 0);
    if (isFox ? !outHens().length && !hasEggs : !hasEggs) { p.timer = 8; return; }
    let best = -1;
    for (let i = 0; i < 8; i++) { const a = R() * 6.283, rr = WORLD_R - 3, x = Math.cos(a) * rr, z = Math.sin(a) * rr, d = dist(x, z, farmer.x, farmer.z); if (d > best) { best = d; p.x = x; p.z = z; } }
    p.state = 'hunt'; p.t = 0; p.steal = 0; p.group.visible = true;
    if (isFox) sfx.fox();
    if (theRooster()) sfx.crow();
    toast(isFox ? 'A fox is about. Hens indoors are safe.' : 'A snake is after the eggs in the coop.');
  }
  let dx = 0, dz = 0, speed = 0;
  p.t += dt;
  if (p.state === 'hunt') {
    let tx = 0, tz = 0, td = 1e9, hen: Hen | null = null, coop: Item | null = null;
    if (isFox) for (const h of outHens()) { const d = dist(h.x, h.z, p.x, p.z); if (d < td) { td = d; hen = h; tx = h.x; tz = h.z; } }
    if (!hen) for (const c of coops()) if (c.eggs > 0) { const dr = door(c), d = dist(dr.x, dr.z, p.x, p.z); if (d < td) { td = d; coop = c; tx = dr.x; tz = dr.z - 0.3; } }
    if (dist(p.x, p.z, farmer.x, farmer.z) < 3 || dist(p.x, p.z, dog.x, dog.z) < 3) { p.state = 'flee'; toast(isFox ? 'The fox ran off.' : 'The snake slid away.'); }
    else if ((!hen && !coop) || p.t > (isFox ? 26 : 40)) p.state = 'flee';
    else if (hen && td < 0.9) { spook(tx, tz, 5); toast('The fox scattered the hens left outside.'); p.state = 'flee'; }
    else if (coop && td < 1) { p.steal += dt; if (p.steal > 2.5) { coop.eggs--; refreshItem(coop); toast(isFox ? 'The fox stole an egg.' : 'The snake took an egg.'); sfx.pop(); p.state = 'flee'; } }
    else { dx = tx - p.x; dz = tz - p.z; speed = isFox ? (hen && td < 5 ? 6.2 : 2.4) : 1.7; }
  }
  if (p.state === 'flee') {
    dx = p.x; dz = p.z; speed = isFox ? 9.5 : 5;
    if (Math.hypot(p.x, p.z) > WORLD_R + 2) { p.state = 'none'; p.timer = isFox ? 14 + R() * 8 : 60 + R() * 40; p.group.visible = false; return; }
  }
  const l = Math.hypot(dx, dz) || 1;
  p.x += (dx / l) * speed * dt; p.z += (dz / l) * speed * dt;
  if (isFox && p.state === 'hunt') { const b = { x: p.x, z: p.z }; collide(b, 0.3, true); p.x = b.x; p.z = b.z; }
  p.anim += dt * (2 + speed * 2.2);
  p.group.position.set(p.x, 0, p.z);
  if (speed > 0.1) turn(p.group, Math.atan2(dx, dz), dt * 10);
  if (isFox) { foxM.legs.forEach((leg, i) => { leg.position.y = 0.16 + Math.max(0, Math.sin(p.anim + (i % 3 === 0 ? 0 : Math.PI))) * 0.1; }); foxM.tail.rotation.y = Math.sin(p.anim * 0.5) * 0.3; }
  else snakeM.segs.forEach((s, i) => { s.position.x = Math.sin(p.anim - i * 0.9) * 0.12; });
}

// ---------- day cycle ----------
function dawn() {
  G.day++;
  let laid = 0; const why: string[] = [];
  for (const h of [...hens]) {
    h.rough = h.state !== 'housed';
    h.laid = false;
    const c = h.coop;
    if (h.chick) { // chicks from an earlier dawn grow up
      const grown = addHen({ x: h.x, z: h.z, name: h.cock ? undefined : h.name, rooster: h.cock, fed: 0.3 });
      removeHen(h);
      if (h.state === 'housed' && c) releaseHen(grown, c);
      continue;
    }
    if (!h.rooster) {
      if (h.fed >= 0.6 && !h.rough && !h.spooked && c) { c.eggs++; laid++; h.laid = true; }
      else why.push(h.rough ? `${h.name} slept outside` : h.spooked ? `${h.name} was spooked` : `${h.name} went hungry`);
    }
    h.fed *= 0.15; h.spooked = false; h.patch = null; h.eatT = 0;
    if (h.state === 'housed' && c) releaseHen(h, c);
    h.coop = null;
  }
  for (const c of coops()) while (c.brood > 0) { c.brood--; const d = door(c); addHen({ x: d.x + (R() - 0.5), z: d.z + 0.6, chick: true, fed: 0.6 }); G.stats.hatched++; puff(d.x, 0.4, d.z, 0xf2d35a, 6, 2); }
  const roos = hens.filter(h => h.rooster && !h.chick);
  let traded = 0;
  while (roos.length > Math.max(1, Math.floor(hens.filter(h => !h.rooster).length / 8))) { removeHen(roos.pop()!); G.eggs += 4; traded++; }
  for (const c of coops()) refreshItem(c);
  if (theRooster()) sfx.crow(); else sfx.win();
  if (laid) setTimeout(() => sfx.cackle(), 1800);
  toast(`Day ${G.day}. ${laid} egg${laid === 1 ? '' : 's'} laid.` + (why.length ? ` ${why[0]}${why.length > 1 ? ` and ${why.length - 1} more had a bad day` : ''}.` : '') + (traded ? ' A spare cockerel went to the neighbours for 4 eggs.' : ''), 6000);
  save();
}
const cA = new THREE.Color(), cB = new THREE.Color();
function tri(out: THREE.Color, a: number, b: number, c: number, k: number) {
  if (k < 0.6) out.setHex(a).lerp(cB.setHex(b), k / 0.6); else out.setHex(b).lerp(cB.setHex(c), (k - 0.6) / 0.4);
  return out;
}
function updateSky(dt: number) {
  const ph = phase(), want = ph === 'dusk' ? ((G.clock - DAY) / DUSK) * 0.85 : ph === 'night' ? 1 : 0;
  G.sky += (want - G.sky) * Math.min(1, dt * (want < G.sky ? 0.5 : 2));
  const k = G.sky;
  setAmbience(1 - clamp((k - 0.4) / 0.5, 0, 1));
  tri(sun.color, 0xfff4e0, 0xffb27a, 0x7080c0, k);
  sun.intensity = k < 0.6 ? lerp(2.1, 1.9, k / 0.6) : lerp(1.9, 0.6, (k - 0.6) / 0.4);
  tri(hemi.color, 0xdff0ff, 0xffd8b8, 0x3a4a7a, k); hemi.intensity = lerp(1.3, 0.7, k);
  tri(cA, 0xcfe6e4, 0xf0b890, 0x1f2a48, k);
  (scene.background as THREE.Color).copy(cA); scene.fog!.color.copy(cA);
  sun.target.position.copy(camTarget);
  sun.position.set(camTarget.x + lerp(-14, -34, k), lerp(34, 13, k), camTarget.z + lerp(16, 8, k));
  for (const i of items) if (i.t === 'lantern') { const g = i.mesh.getObjectByName('glow') as THREE.Mesh; (g.material as THREE.MeshBasicMaterial).opacity = clamp((k - 0.3) * 0.5, 0, 0.3); }
}

// ---------- goals ----------
const decorCount = () => items.filter(i => DEFS[i.t].decor).length;
const coopDoor = () => { const c = coops()[0]; return c ? door(c) : null; };
let nearBush: Body | null = null;
const GOALS: { text: string; done: () => boolean; reward: number; at?: () => Body | null; ui?: string; pal?: () => string }[] = [
  { text: 'Collect the eggs from the coop', done: () => G.stats.collected > 0, reward: 2, at: coopDoor },
  { text: 'Build a feed patch, then sow it', done: () => G.stats.planted > 0, reward: 2, ui: 'build', pal: () => 'patch', at: () => items.find(i => i.t === 'patch' && i.grow < 0) || null },
  { text: 'Clear 3 bushes to open up more forage', done: () => G.cleared >= 3, reward: 3, at: () => nearBush },
  { text: 'Whistle Bring so the dog fetches the hens to you', done: () => G.stats.brought > 0, reward: 2, ui: 'bring' },
  { text: 'Fence a run: 6 fences and a gate', done: () => items.filter(i => i.t === 'fence').length >= 6 && items.some(i => i.t === 'gate'), reward: 3, ui: 'build', pal: () => (items.filter(i => i.t === 'fence').length >= 6 ? 'gate' : 'fence') },
  { text: 'Buy another hen', done: () => hens.filter(h => !h.rooster).length >= 4, reward: 2, ui: 'build', pal: () => 'hen' },
  { text: 'Get a rooster so eggs can hatch', done: () => !!theRooster(), reward: 3, ui: 'build', pal: () => 'rooster' },
  { text: 'Leave an egg to hatch at the coop', done: () => G.stats.hatched > 0 || coops().some(c => c.brood > 0), reward: 3, at: coopDoor },
  { text: 'Build a second coop', done: () => coops().length >= 2, reward: 5, ui: 'build', pal: () => 'coop' },
  { text: 'Place 5 decorations', done: () => decorCount() >= 5, reward: 3, ui: 'build', pal: () => 'flowers' },
  { text: 'Grow the flock to 8 birds', done: () => hens.length >= 8, reward: 6 },
];
const goalArrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xf2c14e }));
goalArrow.visible = false; scene.add(goalArrow);
const focusRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.75, depthWrite: false }));
focusRing.visible = false; scene.add(focusRing);
let goalT = 0;
function updateGoals(dt: number) {
  const cur = GOALS[G.goal], at = G.started && cur && cur.at ? cur.at() : null;
  goalArrow.visible = !!at && !build.sel;
  if (at) { goalArrow.position.set(at.x, 4 + Math.sin(performance.now() * 0.005) * 0.25, at.z); goalArrow.rotation.y += dt * 2; }
  goalT -= dt; if (goalT > 0 || !G.started) return; goalT = 0.5;
  if (G.goal === 2) { let bd = 1e9; nearBush = null; for (const o of obstacles) if (o.alive && o.bush) { const d = dist(o.x, o.z, farmer.x, farmer.z); if (d < bd) { bd = d; nearBush = o; } } }
  const g = GOALS[G.goal];
  if (g && g.done()) { G.eggs += g.reward; G.goal++; sfx.win(); toast(G.goal === 3 ? `Done. +${g.reward} eggs. The dog knows four whistles: try them.` : `Done. +${g.reward} eggs.`); queueSave(); }
}

// ---------- hud ----------
const cache: Record<string, string> = {};
function setText(id: string, s: string) { if (cache[id] !== s) { cache[id] = s; $(id).textContent = s; } }
function updateHud() {
  const ph = phase();
  setText('day', `Day ${G.day}`);
  setText('phase', ph === 'day' ? (G.clock < DAY * 0.4 ? 'Morning' : G.clock < DAY * 0.75 ? 'Afternoon' : 'Late afternoon') : ph === 'dusk' ? 'Dusk: hens head home' : 'Night');
  $('sunfill').style.transform = `scaleX(${G.clock / CYCLE})`;
  $('sun').classList.toggle('dusk', ph !== 'day');
  setText('eggs', String(G.eggs));
  setText('flock', `${hens.length}/${capacity()}`);
  setText('goal', GOALS[G.goal] ? GOALS[G.goal].text : 'The farm is yours. Keep building.');
  setText('goalN', GOALS[G.goal] ? `To do ${G.goal + 1}/${GOALS.length}` : 'All done');
  const i = G.started && !build.sel && !farmer.act ? findInteract(farmer.x, farmer.z, 1.5, false) : null;
  const pr = build.sel === 'remove' ? (touchMode ? 'Tap an item to remove it' : 'Click an item to remove it') : build.sel ? (touchMode ? `Drag the ${DEFS[build.sel].name.toLowerCase()} into position, then tap Place` : `Click to place ${DEFS[build.sel].name.toLowerCase()}. R rotates, Esc stops.`) : '';
  const pb = $('placeBar'), showPb = touchMode && !!build.sel; if (pb.hidden === showPb) pb.hidden = !showPb;
  ($('placeBtn') as HTMLButtonElement).disabled = !build.ok || build.sel === 'remove';
  setText('prompt', pr); $('prompt').classList.toggle('show', !!pr);
  const bub = $('bubble');
  focusRing.visible = !!i;
  if (i) {
    setText('bubbleT', i.label);
    tv.set(i.x, i.kind === 'coop' ? 2.6 : i.kind === 'obst' ? 2.2 : 1.4, i.z).project(camera);
    bub.style.transform = `translate(-50%, -100%) translate(${((tv.x + 1) / 2) * window.innerWidth}px, ${((1 - tv.y) / 2) * window.innerHeight}px)`;
    focusRing.position.set(i.x, 0.07, i.z); focusRing.scale.setScalar(i.kind === 'obst' ? i.ref.r + 0.5 : i.kind === 'coop' ? 1.3 : 1.2);
  }
  bub.classList.toggle('show', !!i);
  const gl = GOALS[G.goal];
  document.querySelectorAll<HTMLElement>('[data-cmd]').forEach(b => {
    const c = b.dataset.cmd!;
    b.classList.toggle('on', c === dog.mode || (c === 'away' && dog.mode === 'chase') || (c === 'build' && build.open));
    b.classList.toggle('pulse', G.started && !!gl && gl.ui === c && !(c === 'build' && build.open) && !(gl.at && gl.at()));
    if (c !== 'build') b.hidden = G.goal < 3;
  });
  renderPalette(); renderPanel();
}

// ---------- save / load ----------
let saveT = 0;
function queueSave() { saveT = 1.5; }
function save() {
  if (!G.started) return;
  const data = {
    v: 1, seed: SEED, day: G.day, clock: G.clock, eggs: G.eggs, cleared: G.cleared, goal: G.goal, stats: G.stats,
    gone: obstacles.filter(o => !o.alive).map(o => o.id),
    items: items.map(i => ({ t: i.t, x: i.x, z: i.z, r: i.r, open: i.open, eggs: i.eggs, brood: i.brood, grow: i.grow, servings: i.servings })),
    hens: hens.map(h => ({ name: h.name, color: h.color, chick: h.chick, rooster: h.rooster, cock: h.cock, x: h.x, z: h.z, fed: h.fed, spooked: h.spooked, rough: h.rough, laid: h.laid, housed: h.state === 'housed' ? items.indexOf(h.coop!) : -1 })),
    farmer: { x: farmer.x, z: farmer.z },
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage unavailable: the farm lasts for this visit only */ }
}
function newFarm() {
  addItem('coop', 0, -5, 0, { eggs: 2 });
  for (let i = 0; i < 3; i++) addHen({ x: -3 + i * 3 + R(), z: 1 + R() * 3, fed: 0.5 });
}
function loadFarm(s: any) {
  Object.assign(G, { day: s.day, clock: s.clock, eggs: s.eggs, cleared: s.cleared, goal: s.goal }); Object.assign(G.stats, s.stats);
  for (const id of s.gone) if (obstacles[id]) clearObstacle(obstacles[id], true);
  for (const i of s.items) addItem(i.t, i.x, i.z, i.r, { open: i.open, eggs: i.eggs, brood: i.brood, grow: i.grow, servings: i.servings });
  for (const h of s.hens) {
    const n = addHen({ name: h.name, color: h.color, chick: h.chick, rooster: h.rooster, x: h.x, z: h.z, fed: h.fed, spooked: h.spooked, rough: h.rough, laid: h.laid });
    n.cock = h.cock;
    if (h.housed >= 0 && items[h.housed]) { n.coop = items[h.housed]; n.state = 'housed'; n.model.group.visible = false; }
  }
  farmer.x = s.farmer.x; farmer.z = s.farmer.z; dog.x = farmer.x + 1.5; dog.z = farmer.z + 1;
  G.sky = phase() === 'night' ? 1 : 0;
}
function start(fresh: boolean) {
  initAudio();
  if (fresh && saved) { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } location.reload(); return; }
  G.started = true; $('overlay').hidden = true;
  toast(saved ? `Welcome back. Day ${G.day}.` : 'Morning on the farm. The coop has eggs waiting.', 4500);
}
$('ovBtn').addEventListener('click', () => start(false));
$('ovNew').addEventListener('click', () => start(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); setPaused(true); } });

// ---------- pause menu ----------
let paused = false, eraseArmed = 0;
const PHASE_NAME: Record<string, string> = { day: 'daytime', dusk: 'dusk', night: 'night' };
function setPaused(on: boolean) {
  if (!G.started || on === paused) return;
  paused = on; keys.clear(); pointerDown = false; farmer.target = null; marker.visible = false;
  suspendAudio(on);
  $('pause').hidden = !on;
  if (on) {
    save();
    setText('pauseInfo', `Day ${G.day}, ${PHASE_NAME[phase()]}. ${G.eggs} egg${G.eggs === 1 ? '' : 's'} in the basket, ${hens.length} bird${hens.length === 1 ? '' : 's'} on the farm.`);
    $('help').hidden = true; resetErase();
    ($('resume') as HTMLButtonElement).focus();
  }
}
function resetErase() { eraseArmed = 0; $('newFarm').textContent = 'Start a new farm'; $('newFarm').classList.remove('armed'); }
$('menuBtn').addEventListener('click', () => { initAudio(); setPaused(true); });
$('resume').addEventListener('click', () => setPaused(false));
$('helpBtn').addEventListener('click', () => { $('help').hidden = !$('help').hidden; });
$('newFarm').addEventListener('click', () => {
  const now = performance.now();
  if (!eraseArmed || now - eraseArmed > 5000) { eraseArmed = now; $('newFarm').textContent = 'Erase this farm? Tap again'; $('newFarm').classList.add('armed'); return; }
  G.started = false; // stops the save that would otherwise run as the page unloads
  try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
  location.reload();
});

// ---------- loop ----------
function step(dt: number) {
  if (G.started) {
    G.clock += dt;
    if (G.clock >= CYCLE) { G.clock -= CYCLE; dawn(); }
    if (saveT > 0) { saveT -= dt; if (saveT <= 0) save(); }
    for (const i of items) {
      if (i.t === 'patch' && i.grow >= 0 && i.grow < 1) { const b = i.grow; i.grow += dt / 70; if (i.grow >= 1) { i.grow = 1; i.servings = 8; } if (((b * 6) | 0) !== ((i.grow * 6) | 0) || i.grow >= 1) refreshItem(i); }
      if (i.pop !== undefined && i.pop < 1) { i.pop = Math.min(1, i.pop + dt * 3.5); i.mesh.scale.setScalar(1 + Math.sin(i.pop * Math.PI) * 0.22); }
      if (i.t === 'gate') i.extra.leaf.rotation.y = lerp(i.extra.leaf.rotation.y, i.open ? 1.45 : 0, Math.min(1, dt * 6));
    }
  }
  updateFarmer(dt); updateDog(dt); updateHens(dt); updateHawk(dt); updatePred(fox, dt); updatePred(snake, dt); updateGoals(dt);
  if (build.ghost) {
    const s = snap(build.sel!, build.rot, build.x, build.z);
    build.ghost.visible = build.has; build.ghost.position.set(s.x, 0.03, s.z);
    const ok = canPlace(build.sel!, build.rot, s.x, s.z) && G.eggs >= DEFS[build.sel!].cost;
    if (ok !== build.ok) { build.ok = ok; build.ghost.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.material = ok ? ghostOk : ghostBad; }); }
  }
  for (const p of particles) if (p.life > 0) {
    p.life -= dt; p.vy -= 9 * dt;
    p.m.position.x += p.vx * dt; p.m.position.y = Math.max(0.03, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
    p.m.rotation.x += dt * 6; p.m.rotation.z += dt * 4;
    if (p.life <= 0) p.m.visible = false;
  }
  for (const r of rings) if (r.t < r.dur) { r.t += dt; const k = r.t / r.dur; r.m.scale.setScalar(lerp(0.5, r.max, k)); (r.m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.7; if (r.t >= r.dur) r.m.visible = false; }
  const ck = Math.min(1, dt * 3.5);
  camTarget.x += (farmer.x - camTarget.x) * ck; camTarget.z += (farmer.z - 1 - camTarget.z) * ck;
  camera.position.copy(camTarget).addScaledVector(CAM_OFF, zoom);
  camera.lookAt(camTarget);
  fadeTrees(dt); updateSky(dt); updateHud();
}
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (!paused) step(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
if (saved && saved.v === 1) { try { loadFarm(saved); } catch { saved = null; newFarm(); } } else { saved = null; newFarm(); }
$('ovBtn').textContent = saved ? `Continue, day ${G.day}` : 'Start the farm';
($('ovBtn') as HTMLButtonElement).disabled = false;
$('ovNew').hidden = !saved;
(window as any).__hs = { renderer, scene, screen: (x: number, y: number, z: number) => { const v = new THREE.Vector3(x, y, z).project(camera); return [((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight]; }, G, farmer, dog, hawk, fox, snake, hens, items, obstacles, step, whistle, addItem, buyBird, doInteract, findInteract, toggleBuild, selectBuild, placeAt, save, DAY, DUSK, CYCLE };
requestAnimationFrame(frame);
