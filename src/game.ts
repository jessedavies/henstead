import * as THREE from 'three';
import { makeDog, makeChicken, makeHawk, makeFox, makeCoop, fenceRun, makeGate, mat, HEN_COLORS } from './models';
import { sfx, initAudio, setMuted, isMuted } from './audio';

const $ = (id: string) => document.getElementById(id)!;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------- seeded randomness for the landscape ----------
const SEED = (Math.random() * 1e9) | 0;
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
const R = Math.random;

// ---------- tunables ----------
const PEN = { x0: -4.5, x1: 4.5, z0: -10, z1: -4, gate: 1.6 };
const WORLD_R = 26;
const DOG_SPEED = 8.5, DOG_STEADY = 2.6;
const PRESSURE = 7.5, PRESSURE_STEADY = 4.5;
const GATHER_CD = 5, BARK_CD = 3, DAY_LEN = 30;

// ---------- renderer / scene ----------
const canvas = $('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe6e4);
scene.fog = new THREE.Fog(0xcfe6e4, 70, 120);
const camera = new THREE.PerspectiveCamera(28, 1, 1, 200);
const camTarget = new THREE.Vector3(0, 0, -1);
const CAM_OFF = new THREE.Vector3(0, 36, 31);

const hemi = new THREE.HemisphereLight(0xdff0ff, 0x8a9a6a, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 120 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // keep roughly the same horizontal coverage on narrow (phone) screens
  const base = Math.tan((14 * Math.PI) / 180);
  camera.fov = clamp((2 * Math.atan(base * clamp(1.1 / camera.aspect, 1, 1.9)) * 180) / Math.PI, 28, 62);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- landscape ----------
type Obstacle = { x: number; z: number; r: number; alive: boolean; bush: boolean; i: number; s: number; rot: number; shake: number };
const obstacles: Obstacle[] = [];
const grid = new Map<number, Obstacle[]>();
const gkey = (x: number, z: number) => Math.floor((x + 64) / 4) * 64 + Math.floor((z + 64) / 4);
function addObstacle(o: Obstacle) {
  obstacles.push(o);
  const k = gkey(o.x, o.z);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k)!.push(o);
}
function nearObstacles(x: number, z: number, fn: (o: Obstacle) => void) {
  for (let dx = -4; dx <= 4; dx += 4) for (let dz = -4; dz <= 4; dz += 4) {
    const l = grid.get(gkey(x + dx, z + dz));
    if (l) for (const o of l) if (o.alive) fn(o);
  }
}
const edgeDist = (x: number, z: number) => Math.hypot(x, z * 1.05) + (vnoise(x * 0.09 + 50, z * 0.09 + 50) - 0.5) * 9;

{ // ground with per-triangle colour so the clearing and forest floor read differently
  const g = new THREE.PlaneGeometry(150, 150, 75, 75).rotateX(-Math.PI / 2).toNonIndexed();
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const t = clamp((edgeDist(x, z) - 13) / 9, 0, 1);
    c.setHex(0x9dba68).lerp(new THREE.Color(0x6c9052), t);
    c.offsetHSL(0, 0, (vnoise(x * 0.35, z * 0.35) - 0.5) * 0.07 + (hash2(x, z) - 0.5) * 0.025);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true;
  scene.add(ground);
}

const bushMesh = (() => {
  const trees: { x: number; z: number; s: number; round: boolean }[] = [];
  const bushes: { x: number; z: number; s: number }[] = [];
  for (let gx = -52; gx <= 52; gx += 2.3) for (let gz = -52; gz <= 52; gz += 2.3) {
    const x = gx + (wrand() - 0.5) * 1.7, z = gz + (wrand() - 0.5) * 1.7, d = edgeDist(x, z), r = wrand();
    if (d < 14 || (Math.abs(x) < 7 && z > -14.5 && z < -2)) continue;
    if (d < 23) { if (r < 0.5) bushes.push({ x, z, s: 0.8 + wrand() * 0.5 }); else if (r < 0.57) trees.push({ x, z, s: 0.8 + wrand() * 0.4, round: wrand() < 0.5 }); }
    else if (r < 0.72) trees.push({ x, z, s: 0.85 + wrand() * 0.6, round: wrand() < 0.3 });
    else if (r < 0.84) bushes.push({ x, z, s: 0.8 + wrand() * 0.6 });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
  const inst = (geo: THREE.BufferGeometry, color: number, n: number) => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true }), n);
    m.castShadow = true; m.receiveShadow = true; scene.add(m); return m;
  };
  const trunk = inst(new THREE.CylinderGeometry(0.16, 0.26, 1.4, 5).translate(0, 0.7, 0), 0x7a5a3c, trees.length);
  const pines = trees.filter(t => !t.round), rounds = trees.filter(t => t.round);
  const cone1 = inst(new THREE.ConeGeometry(1.3, 2.5, 6).translate(0, 2.3, 0), 0xffffff, pines.length);
  const cone2 = inst(new THREE.ConeGeometry(0.9, 2.0, 6).translate(0, 3.6, 0), 0xffffff, pines.length);
  const ball = inst(new THREE.IcosahedronGeometry(1.5, 0).translate(0, 2.6, 0), 0xffffff, rounds.length);
  let pi = 0, ri = 0;
  trees.forEach((t, i) => {
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, wrand() * 6.28);
    m4.compose(v.set(t.x, 0, t.z), q, sc.setScalar(t.s));
    trunk.setMatrixAt(i, m4);
    c.setHex([0x4f7d52, 0x5d8a4e, 0x426f4c, 0x6a9455][(wrand() * 4) | 0]);
    if (t.round) { c.offsetHSL(0.02, 0, 0.04); ball.setMatrixAt(ri, m4); ball.setColorAt(ri++, c); }
    else { cone1.setMatrixAt(pi, m4); cone1.setColorAt(pi, c); cone2.setMatrixAt(pi, m4); cone2.setColorAt(pi++, c.offsetHSL(0, 0, 0.03)); }
    if (Math.hypot(t.x, t.z) < 31) addObstacle({ x: t.x, z: t.z, r: 0.55 * t.s, alive: true, bush: false, i, s: t.s, rot: 0, shake: 0 });
  });
  const bm = inst(new THREE.IcosahedronGeometry(0.85, 0), 0xffffff, bushes.length * 2);
  bushes.forEach((b, i) => {
    c.setHex([0x7fa650, 0x8db25a, 0x6f9a4a][(wrand() * 3) | 0]);
    bm.setColorAt(i * 2, c); bm.setColorAt(i * 2 + 1, c.offsetHSL(0, 0, 0.04));
    const o: Obstacle = { x: b.x, z: b.z, r: 0.85 * b.s, alive: true, bush: true, i, s: b.s, rot: wrand() * 6.28, shake: 0 };
    if (Math.hypot(b.x, b.z) < 31) addObstacle(o);
    setBush(bm, o, 1);
  });
  return bm;
})();

function setBush(bm: THREE.InstancedMesh, o: Obstacle, k: number) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, o.rot);
  const wob = Math.sin(o.shake * 40) * 0.08 * (o.shake > 0 ? 1 : 0);
  m4.compose(new THREE.Vector3(o.x + wob, 0.5 * o.s * k, o.z), q, new THREE.Vector3(o.s * k, o.s * 0.75 * k, o.s * k));
  bm.setMatrixAt(o.i * 2, m4);
  m4.compose(new THREE.Vector3(o.x + Math.cos(o.rot) * 0.6 * o.s - wob, 0.38 * o.s * k, o.z + Math.sin(o.rot) * 0.6 * o.s), q, new THREE.Vector3(o.s * 0.62 * k, o.s * 0.5 * k, o.s * 0.62 * k));
  bm.setMatrixAt(o.i * 2 + 1, m4);
  bm.instanceMatrix.needsUpdate = true;
}

// ---------- pen, gate, coop ----------
const walls: number[][] = [
  [PEN.x0, PEN.z0, PEN.x1, PEN.z0], [PEN.x0, PEN.z0, PEN.x0, PEN.z1], [PEN.x1, PEN.z0, PEN.x1, PEN.z1],
  [PEN.x0, PEN.z1, -PEN.gate, PEN.z1], [PEN.gate, PEN.z1, PEN.x1, PEN.z1],
];
const gateSeg = [-PEN.gate, PEN.z1, PEN.gate, PEN.z1];
for (const w of walls) scene.add(fenceRun(w[0], w[1], w[2], w[3]));
const gate = makeGate(PEN.gate * 2);
gate.position.set(-PEN.gate, 0, PEN.z1);
scene.add(gate);
const coop = makeCoop();
coop.position.set(0, 0, -11.4);
scene.add(coop);
const COOP = { x0: -1.8, x1: 1.8, z0: -12.7, z1: -10.2 };
{
  const dirt = new THREE.Mesh(new THREE.PlaneGeometry(PEN.x1 - PEN.x0, PEN.z1 - PEN.z0).rotateX(-Math.PI / 2), mat(0xc4a878));
  dirt.position.set(0, 0.015, (PEN.z0 + PEN.z1) / 2); dirt.receiveShadow = true; scene.add(dirt);
  const path = new THREE.Mesh(new THREE.CircleGeometry(2.2, 7).rotateX(-Math.PI / 2), mat(0xb8a878));
  path.position.set(0, 0.012, PEN.z1 + 0.6); path.scale.set(1, 1, 0.9); path.receiveShadow = true; scene.add(path);
}
const inPen = (x: number, z: number) => x > PEN.x0 && x < PEN.x1 && z > PEN.z0 && z < PEN.z1;

function isOpen(x: number, z: number, margin: number) {
  if (Math.hypot(x, z) > WORLD_R - 2) return false;
  if (x > PEN.x0 - 0.8 && x < PEN.x1 + 0.8 && z > COOP.z0 - 0.8 && z < PEN.z1 + 0.8) return false;
  let ok = true;
  nearObstacles(x, z, o => { if (Math.hypot(x - o.x, z - o.z) < o.r + margin) ok = false; });
  return ok;
}
function randomOpen(cx: number, cz: number, rad: number) {
  for (let i = 0; i < 40; i++) {
    const a = R() * 6.283, d = Math.sqrt(R()) * rad, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (isOpen(x, z, 0.8)) return { x, z };
  }
  return { x: cx, z: cz };
}

type Body = { x: number; z: number };
function pushSeg(p: Body, r: number, s: number[]) {
  const dx = s[2] - s[0], dz = s[3] - s[1];
  const t = clamp(((p.x - s[0]) * dx + (p.z - s[1]) * dz) / (dx * dx + dz * dz), 0, 1);
  const cx = s[0] + dx * t, cz = s[1] + dz * t, d = Math.hypot(p.x - cx, p.z - cz);
  if (d < r && d > 1e-5) { const k = (r - d) / d; p.x += (p.x - cx) * k; p.z += (p.z - cz) * k; }
}
function collide(p: Body, r: number) {
  nearObstacles(p.x, p.z, o => {
    const d = Math.hypot(p.x - o.x, p.z - o.z), min = o.r + r;
    if (d < min && d > 1e-5) { const k = (min - d) / d; p.x += (p.x - o.x) * k; p.z += (p.z - o.z) * k; }
  });
  for (const w of walls) pushSeg(p, r + 0.1, w);
  if (!G.gateOpen) pushSeg(p, r + 0.1, gateSeg);
  // coop is a box behind the pen
  if (p.x > COOP.x0 - r && p.x < COOP.x1 + r && p.z > COOP.z0 - r && p.z < COOP.z1 + r) {
    const dl = p.x - (COOP.x0 - r), dr = COOP.x1 + r - p.x, dt = p.z - (COOP.z0 - r);
    if (dt < dl && dt < dr) p.z = COOP.z0 - r; else if (dl < dr) p.x = COOP.x0 - r; else p.x = COOP.x1 + r;
  }
  const d = Math.hypot(p.x, p.z);
  if (d > WORLD_R) { p.x *= WORLD_R / d; p.z *= WORLD_R / d; }
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
  if (!r) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    r = { m, t: 0, max, dur }; rings.push(r); scene.add(m);
  }
  (r.m.material as THREE.MeshBasicMaterial).color.setHex(color);
  r.m.position.set(x, 0.06, z); r.m.visible = true; r.t = 0; r.max = max; r.dur = dur;
}
const marker = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.8, depthWrite: false }));
marker.visible = false; scene.add(marker);

// ---------- entities ----------
const dogModel = makeDog();
scene.add(dogModel.group);
const dog = {
  x: 0, z: 3, vx: 0, vz: 0, face: Math.PI, anim: 0, lying: false, steady: false,
  target: null as Body | null, digTarget: null as Obstacle | null, digT: 0,
  gather: null as { swept: number; last: number; t: number } | null, gatherCd: 0, barkCd: 0,
};

type Chicken = {
  x: number; z: number; vx: number; vz: number; fear: number; panic: number; bold: number; rogue: boolean;
  boltT: number; boltCd: number; bx: number; bz: number; wx: number; wz: number; idle: number;
  jit: number; jitT: number; color: number; chick: boolean; rooster: boolean; cock: boolean; fightT: number; home: boolean; face: number; anim: number;
  model: ReturnType<typeof makeChicken>;
};
let chickens: Chicken[] = [];
function addChicken(chick: boolean, at: Body, rogue = false, rooster = false) {
  const color = chick ? 0xf2d35a : rooster ? 0x9c3a22 : HEN_COLORS[(R() * HEN_COLORS.length) | 0];
  const model = makeChicken(color, chick, rooster);
  scene.add(model.group);
  const c: Chicken = {
    x: at.x, z: at.z, vx: 0, vz: 0, fear: 0, panic: 0, bold: rooster ? 1 : R(), rogue, rooster, cock: chick && R() < 0.2, fightT: 2, boltT: 0, boltCd: 4 + R() * 4, bx: 0, bz: 0,
    wx: at.x, wz: at.z, idle: R() * 3, jit: 0, jitT: 0, color, chick, home: false, face: R() * 6.28, anim: R() * 10, model,
  };
  chickens.push(c);
  return c;
}
function removeChicken(c: Chicken) {
  scene.remove(c.model.group);
  chickens = chickens.filter(o => o !== c);
}

const hawkModel = makeHawk();
hawkModel.group.visible = false;
scene.add(hawkModel.group);
const hawkShadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a1a22, transparent: true, opacity: 0.25, depthWrite: false }));
hawkShadow.visible = false; hawkShadow.position.y = 0.05;
scene.add(hawkShadow);
const hawk = { state: 'none' as 'none' | 'circle' | 'dive' | 'leave', t: 0, a: 0, x: 0, y: 12, z: 0, target: null as Chicken | null, timer: 8, carried: false };

const foxModel = makeFox();
foxModel.group.visible = false;
scene.add(foxModel.group);
const fox = { state: 'none' as 'none' | 'hunt' | 'flee', x: 0, z: 0, timer: 10, face: 0, anim: 0, dashing: false };
const theRooster = () => chickens.find(c => c.rooster && !c.chick) || null;
const hens = () => chickens.filter(c => !c.rooster);

// ---------- game state ----------
const G = {
  state: 'title' as 'title' | 'day' | 'dusk' | 'summary' | 'over',
  day: 1, t: 0, len: 100, eggs: 0, cleared: 0, gateOpen: true, allHomeT: 0, sky: 0, lostToHawk: 0, lostToFox: 0,
  cap: 8, hatch: 0, buyRoo: false, coopCost: 10,
};
const playing = () => G.state === 'day' || G.state === 'dusk';
const keys = new Set<string>();
const toggles = { steady: false, lie: false, dig: false };

function toast(msg: string, ms = 2600) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout((toast as any).h);
  (toast as any).h = setTimeout(() => t.classList.remove('show'), ms);
}

function startDay(n: number) {
  G.day = n; G.lostToHawk = 0; G.lostToFox = 0; G.allHomeT = 0;
  // chicks grow up overnight, then eggs hatch
  for (const c of [...chickens]) if (c.chick) { const p = { x: c.x, z: c.z }; removeChicken(c); addChicken(false, p, false, c.cock); }
  let hatched = 0;
  if (n === 1) { for (let i = 0; i < 6; i++) addChicken(false, { x: 0, z: 0 }, i === 0); }
  else {
    if (G.buyRoo) addChicken(false, { x: 0, z: 0 }, false, true);
    while (hatched < G.hatch && G.eggs > 0 && chickens.length < G.cap) { G.eggs--; addChicken(true, { x: 0, z: 0 }); hatched++; }
  }
  G.hatch = 0; G.buyRoo = false;
  fox.state = 'none'; fox.timer = 8 + R() * 6; foxModel.group.visible = false;
  for (const c of chickens) {
    const p = randomOpen(0, n === 1 ? 7 : 4, n === 1 ? 7 : 12);
    Object.assign(c, p, { wx: p.x, wz: p.z, vx: 0, vz: 0, fear: 0, panic: 0, home: false });
  }
  Object.assign(dog, { x: 0, z: 1, vx: 0, vz: 0, target: null, digTarget: null, gather: null, gatherCd: 0, barkCd: 0 });
  toggles.lie = toggles.steady = toggles.dig = false;
  hawk.state = 'none'; hawk.timer = 7; hawkModel.group.visible = hawkShadow.visible = false;
  if (n === 1) beginDusk(110);
  else {
    G.state = 'day'; G.t = 0; G.len = DAY_LEN; G.gateOpen = false;
    toast(hatched ? `${hatched} chick${hatched > 1 ? 's' : ''} hatched. Keep watch until dusk.` : 'Keep watch until dusk.', 3500);
  }
  $('overlay').hidden = true;
}
function beginDusk(len?: number) {
  G.state = 'dusk'; G.t = 0; G.len = len ?? Math.max(60, 95 - 5 * G.day); G.gateOpen = true;
  sfx.dusk();
  toast(G.day === 1 ? 'Herd the hens through the gate before dark.' : 'Dusk. The gate is open: bring them home.', 4000);
}
function endDay(early: boolean) {
  const home = chickens.filter(c => c.home), lost = chickens.filter(c => !c.home);
  for (const c of lost) removeChicken(c);
  const layers = home.filter(c => !c.chick && !c.rooster).length;
  const forage = Math.min(layers, Math.floor(G.cleared / 3));
  const bonus = early ? Math.floor((G.len - G.t) / 20) : 0;
  const spare = chickens.filter(c => c.rooster && !c.chick).slice(1);
  for (const c of spare) removeChicken(c);
  G.eggs += layers + forage + bonus + spare.length * 4;
  const lines = [`<b>${home.length}</b> home safe`];
  if (lost.length) lines.push(`<b>${lost.length}</b> left out after dark and lost`);
  if (G.lostToFox) lines.push(`<b>${G.lostToFox}</b> taken by the fox`);
  if (G.lostToHawk) lines.push(`<b>${G.lostToHawk}</b> taken by the hawk`);
  lines.push(`<b>+${layers}</b> eggs laid` + (forage ? `, <b>+${forage}</b> from cleared forage` : '') + (bonus ? `, <b>+${bonus}</b> for finishing early` : ''));
  if (spare.length) lines.push(`<b>+${spare.length * 4}</b> eggs: spare rooster traded to the neighbours`);
  if (!hens().length) {
    G.state = 'over'; sfx.lose();
    showOverlay('No hens left', `You lasted ${G.day} day${G.day > 1 ? 's' : ''} and finished with ${G.eggs} eggs.`, 'Start again');
    return;
  }
  G.state = 'summary';
  (lost.length ? sfx.lose : sfx.win)();
  const tip = G.day === 1
    ? 'Tomorrow the hens forage by day and a hawk hunts them. When its shadow circles a hen, get close and bark. The gate opens at dusk.'
    : G.day === 2 ? 'From tomorrow a fox comes out of the trees at dusk. Run at it or bark to drive it off. Every 3 bushes you dig out adds an egg a night.'
      : !theRooster() ? 'Eggs only hatch with a rooster in the flock. He also keeps the hens together and crows at danger.'
        : 'Bigger flocks lay more and scatter more. Gather first, then walk them in steadily.';
  summaryHead = `<ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>`; summaryTip = tip;
  renderSummary();
}
let summaryHead = '', summaryTip = '';
function renderSummary() {
  const roo = !!theRooster() || G.buyRoo, room = G.cap - chickens.length - (G.buyRoo ? 1 : 0);
  G.hatch = clamp(G.hatch, 0, Math.max(0, Math.min(room, G.eggs)));
  const basket = G.eggs - G.hatch;
  const row = (label: string, note: string, ctl: string) => `<div class="row"><span>${label}<small>${note}</small></span>${ctl}</div>`;
  const shop = [
    row('Leave eggs to hatch', !roo ? 'Needs a rooster' : room <= 0 ? 'The coop is full' : `One egg each. Room for ${room} more.`,
      `<span class="stepper"><button type="button" data-s="hm" ${G.hatch <= 0 ? 'disabled' : ''}>&minus;</button><b>${G.hatch}</b><button type="button" data-s="hp" ${!roo || G.hatch >= room || basket <= 0 ? 'disabled' : ''}>+</button></span>`),
    roo ? '' : row('Rooster', 'Lets eggs hatch, keeps hens together, crows at danger', `<button type="button" data-s="roo" ${basket < 6 || room <= 0 ? 'disabled' : ''}>6 eggs</button>`),
    row('Bigger coop', `Holds ${G.cap} birds now, ${G.cap + 4} after`, `<button type="button" data-s="coop" ${basket < G.coopCost ? 'disabled' : ''}>${G.coopCost} eggs</button>`),
  ].join('');
  showOverlay(`Day ${G.day} done`, `${summaryHead}<div class="shop">${shop}</div><p class="basket">Egg basket: <b>${basket}</b></p><p class="tip">${summaryTip}</p>`, `Start day ${G.day + 1}`);
}
$('ovBody').addEventListener('click', e => {
  const k = (e.target as HTMLElement).closest<HTMLElement>('[data-s]')?.dataset.s;
  if (!k || G.state !== 'summary') return;
  if (k === 'hp') G.hatch++;
  else if (k === 'hm') G.hatch--;
  else if (k === 'roo') { G.eggs -= 6; G.buyRoo = true; sfx.buy(); }
  else if (k === 'coop') { G.eggs -= G.coopCost; G.cap += 4; G.coopCost += 8; sfx.buy(); }
  renderSummary();
});
function showOverlay(title: string, body: string, btn: string) {
  $('ovTitle').textContent = title; $('ovBody').innerHTML = body; $('ovBtn').textContent = btn;
  $('overlay').hidden = false;
  if (!document.activeElement || !$('ovBody').contains(document.activeElement)) ($('ovBtn') as HTMLButtonElement).focus();
}
function advance() {
  initAudio();
  if (G.state === 'summary') startDay(G.day + 1);
  else if (G.state === 'title' || G.state === 'over') { for (const c of [...chickens]) removeChicken(c); Object.assign(G, { eggs: 0, cap: 8, hatch: 0, buyRoo: false, coopCost: 10 }); startDay(1); }
}

// ---------- commands (the whistles) ----------
function cmdGather() {
  if (!playing() || dog.gatherCd > 0 || !chickens.some(c => !c.home)) return;
  dog.gather = { swept: 0, last: NaN, t: 0 }; dog.gatherCd = GATHER_CD; dog.target = null; dog.digTarget = null; toggles.lie = false;
  sfx.gather(); ring(dog.x, dog.z, 3, 0xfff3c4);
}
function cmdBark() {
  if (!playing() || dog.barkCd > 0) return;
  dog.barkCd = BARK_CD; sfx.bark(); ring(dog.x, dog.z, 9, 0xffffff, 0.45);
  for (const c of chickens) {
    const d = Math.hypot(c.x - dog.x, c.z - dog.z);
    if (d < 8 && !(c.home && G.state === 'dusk')) { c.panic = 1; c.fear = 1; }
  }
  if ((hawk.state === 'circle' || hawk.state === 'dive') && hawk.target && Math.hypot(hawk.target.x - dog.x, hawk.target.z - dog.z) < 10) {
    hawk.state = 'leave'; hawk.t = 0; hawk.target = null; toast('Hawk scared off.');
  }
  if (fox.state === 'hunt' && Math.hypot(fox.x - dog.x, fox.z - dog.z) < 10) { fox.state = 'flee'; toast('Fox driven off.'); }
}
function setLie(on: boolean) { if (on && !dog.lying) sfx.lie(); toggles.lie = on; if (on) { dog.gather = null; dog.target = null; } }
function setSteady(on: boolean) { if (on && !toggles.steady) sfx.steady(); toggles.steady = on; }

// ---------- input ----------
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === 'enter' && !$('overlay').hidden) { advance(); return; }
  if (!playing()) return;
  if (k === 'q') cmdGather();
  else if (k === 'e') cmdBark();
  else if (k === ' ') { e.preventDefault(); setLie(true); }
  else if (k === 'shift') setSteady(true);
  else if (k === 'm') toggleMute();
});
window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  keys.delete(k);
  if (k === ' ') toggles.lie = false;
  if (k === 'shift') toggles.steady = false;
});
window.addEventListener('blur', () => keys.clear());

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
let pointerDown = false;
function pointTo(e: PointerEvent, first: boolean) {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(groundPlane, hit)) return;
  dog.gather = null; toggles.lie = false; dog.digTarget = null;
  if (first) {
    let best: Obstacle | null = null, bd = 1.3;
    nearObstacles(hit.x, hit.z, o => { const d = Math.hypot(o.x - hit.x, o.z - hit.z); if (o.bush && d < bd) { bd = d; best = o; } });
    if (best) dog.digTarget = best;
  }
  dog.target = { x: hit.x, z: hit.z };
  marker.position.set(hit.x, 0.05, hit.z); marker.visible = true;
}
canvas.addEventListener('pointerdown', e => { initAudio(); if (!playing()) return; pointerDown = true; pointTo(e, true); });
canvas.addEventListener('pointermove', e => { if (pointerDown && playing()) pointTo(e, false); });
window.addEventListener('pointerup', () => { pointerDown = false; });

document.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach(b => {
  const cmd = b.dataset.cmd!;
  b.addEventListener('click', () => {
    initAudio();
    if (cmd === 'gather') cmdGather();
    else if (cmd === 'bark') cmdBark();
    else if (cmd === 'lie') setLie(!toggles.lie);
    else if (cmd === 'steady') setSteady(!toggles.steady);
    else if (cmd === 'dig') toggles.dig = !toggles.dig;
    b.blur();
  });
});
$('ovBtn').addEventListener('click', advance);
function toggleMute() { setMuted(!isMuted()); $('mute').textContent = isMuted() ? 'Sound off' : 'Sound on'; }
$('mute').addEventListener('click', () => { initAudio(); toggleMute(); });

// ---------- simulation ----------
function flockCentre() {
  let x = 0, z = 0, n = 0;
  for (const c of chickens) if (!c.home) { x += c.x; z += c.z; n++; }
  if (!n) return null;
  x /= n; z /= n;
  let rad = 0;
  for (const c of chickens) if (!c.home) rad = Math.max(rad, Math.hypot(c.x - x, c.z - z));
  return { x, z, rad };
}

function updateDog(dt: number) {
  dog.gatherCd = Math.max(0, dog.gatherCd - dt); dog.barkCd = Math.max(0, dog.barkCd - dt);
  let ix = 0, iz = 0;
  if (playing()) {
    if (keys.has('w') || keys.has('arrowup')) iz -= 1;
    if (keys.has('s') || keys.has('arrowdown')) iz += 1;
    if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
    if (keys.has('d') || keys.has('arrowright')) ix += 1;
  }
  const manual = ix !== 0 || iz !== 0;
  if (manual) { dog.target = null; dog.digTarget = null; dog.gather = null; marker.visible = false; if (!keys.has(' ')) toggles.lie = false; }
  dog.lying = playing() && toggles.lie;
  dog.steady = toggles.steady && !dog.lying;
  const max = dog.lying ? 0 : dog.steady ? DOG_STEADY : DOG_SPEED;
  let dvx = 0, dvz = 0;

  // digging: hold F / Dig toggle next to a bush, or click a bush
  let digging: Obstacle | null = null;
  if (playing() && !manual && !dog.lying) {
    if (dog.digTarget && dog.digTarget.alive) {
      const o = dog.digTarget;
      if (Math.hypot(o.x - dog.x, o.z - dog.z) < o.r + 0.75) digging = o;
      else dog.target = { x: o.x, z: o.z };
    } else if (keys.has('f') || toggles.dig) {
      let bd = 2.4;
      nearObstacles(dog.x, dog.z, o => { const d = Math.hypot(o.x - dog.x, o.z - dog.z) - o.r; if (o.bush && d < bd) { bd = d; digging = o; } });
    }
  }
  if (digging) {
    const o = digging as Obstacle;
    dog.target = null; marker.visible = false;
    dog.face = Math.atan2(o.x - dog.x, o.z - dog.z);
    dog.digT += dt; o.shake += dt;
    if (((dog.digT * 6) | 0) !== (((dog.digT - dt) * 6) | 0)) { sfx.dig(); puff(o.x, 0.3, o.z, 0x8a6a48, 2, 2); }
    setBush(bushMesh, o, 1 - (o.shake / 1.2) * 0.3);
    if (o.shake >= 1.2) {
      o.alive = false; setBush(bushMesh, o, 0); G.cleared++; dog.digTarget = null; dog.digT = 0;
      sfx.pop(); puff(o.x, 0.5, o.z, 0x7fa650, 12, 4);
      const patch = new THREE.Mesh(new THREE.CircleGeometry(o.r + 0.5, 7).rotateX(-Math.PI / 2), mat(0xa9c474));
      patch.position.set(o.x, 0.02, o.z); patch.rotation.y = R() * 6; patch.receiveShadow = true; scene.add(patch);
      if (toggles.dig && G.cleared === 1) toast('Bush cleared. More open ground for the flock.');
    }
  } else if (manual) {
    const l = Math.hypot(ix, iz); dvx = (ix / l) * max; dvz = (iz / l) * max;
  } else if (dog.gather && !dog.lying) {
    const f = flockCentre(), g = dog.gather;
    if (!f) dog.gather = null;
    else {
      const rad = Math.min(f.rad, 9) + 3.5, a = Math.atan2(dog.z - f.z, dog.x - f.x);
      if (!isNaN(g.last)) { let da = a - g.last; if (da > Math.PI) da -= 6.283; if (da < -Math.PI) da += 6.283; g.swept += da; }
      g.last = a; g.t += dt;
      const tx = f.x + Math.cos(a + 0.55) * rad, tz = f.z + Math.sin(a + 0.55) * rad, l = Math.hypot(tx - dog.x, tz - dog.z) || 1;
      dvx = ((tx - dog.x) / l) * max; dvz = ((tz - dog.z) / l) * max;
      if (Math.abs(g.swept) > 6.283 * 1.1 || g.t > 8) dog.gather = null;
    }
  } else if (dog.target && !dog.lying) {
    const dx = dog.target.x - dog.x, dz = dog.target.z - dog.z, l = Math.hypot(dx, dz);
    if (l < 0.3) { dog.target = null; marker.visible = false; }
    else { const s = Math.min(max, l * 6); dvx = (dx / l) * s; dvz = (dz / l) * s; }
  }
  const k = Math.min(1, dt * 12);
  dog.vx += (dvx - dog.vx) * k; dog.vz += (dvz - dog.vz) * k;
  dog.x += dog.vx * dt; dog.z += dog.vz * dt;
  collide(dog, 0.45);
  const sp = Math.hypot(dog.vx, dog.vz);
  if (sp > 0.4) dog.face = Math.atan2(dog.vx, dog.vz);
  // animation
  dog.anim += dt * (4 + sp * 2.2);
  const m = dogModel;
  m.group.position.set(dog.x, 0, dog.z);
  let dr = dog.face - m.group.rotation.y; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283;
  m.group.rotation.y += dr * Math.min(1, dt * 14);
  const swing = Math.min(1, sp / 4) * 0.8;
  m.legs.forEach((l, i) => { l.rotation.x = Math.sin(dog.anim + (i % 3 === 0 ? 0 : Math.PI)) * swing; l.scale.y = lerp(l.scale.y, dog.lying ? 0.35 : 1, dt * 12); });
  m.inner.position.y = lerp(m.inner.position.y, dog.lying ? -0.3 : digging ? -0.08 + Math.sin(dog.digT * 30) * 0.04 : Math.abs(Math.sin(dog.anim)) * 0.05 * swing, dt * 12);
  m.inner.rotation.x = lerp(m.inner.rotation.x, digging ? 0.3 : dog.steady && sp > 0.5 ? 0.12 : 0, dt * 10);
  m.head.rotation.x = lerp(m.head.rotation.x, dog.steady || dog.lying ? 0.25 : 0, dt * 8);
  m.tail.rotation.y = Math.sin(dog.anim * 1.5) * (sp > 1 ? 0.25 : 0.6);
}

function updateChickens(dt: number) {
  const dusk = G.state === 'dusk';
  const pressure = dog.lying ? 0 : dog.steady ? PRESSURE_STEADY : PRESSURE;
  const fleeMax = dog.steady ? 2.4 : 5.6;
  const dogSpeed = Math.hypot(dog.vx, dog.vz);
  for (const c of chickens) {
    const inside = inPen(c.x, c.z);
    if (dusk && inside && !c.home) { c.home = true; sfx.home(); puff(c.x, 0.6, c.z, 0xfff3c4, 5, 2); c.wx = c.x; c.wz = c.z - 1; }
    else if (!inside && c.home) c.home = false;
    const dx = c.x - dog.x, dz = c.z - dog.z, d = Math.hypot(dx, dz) || 0.01;
    const pr = pressure * (1 - 0.3 * c.bold) * (c.chick ? 1.2 : 1) * (c.home ? 0.25 : 1);
    const strength = d < pr ? 1 - d / pr : 0;
    c.fear += (strength - c.fear) * Math.min(1, dt * (strength > c.fear ? 10 : 1.1));
    if (d < 2.2 && dogSpeed > 4 && !c.home) c.panic = Math.min(1, c.panic + dt * (c.chick ? 4 : 2.5));
    c.panic = Math.max(0, c.panic - dt * 0.45);
    let ax = 0, az = 0;
    if (strength > 0) { const s = fleeMax * Math.pow(strength, 0.6); ax += (dx / d) * s; az += (dz / d) * s; }
    if (fox.state === 'hunt' && !c.home) {
      const fx = c.x - fox.x, fz = c.z - fox.z, fd = Math.hypot(fx, fz) || 0.01;
      if (fd < 5.5) { const s = 1 - fd / 5.5; ax += (fx / fd) * 5.5 * s; az += (fz / fd) * 5.5 * s; c.fear = Math.max(c.fear, s); if (fd < 2.5) c.panic = Math.min(1, c.panic + dt * 2); }
    }
    if (c.rooster && !c.chick && !c.home) { // two roosters in one flock fight
      const o = chickens.find(r => r !== c && r.rooster && !r.chick && !r.home && Math.hypot(r.x - c.x, r.z - c.z) < 5);
      if (o) {
        ax += (o.x - c.x) * 0.8; az += (o.z - c.z) * 0.8; c.fightT -= dt;
        if (c.fightT <= 0) { c.fightT = 2.5 + R() * 2; puff(c.x, 0.6, c.z, 0x9c3a22, 6, 3); sfx.cluck(1); for (const h of chickens) if (!h.home && Math.hypot(h.x - c.x, h.z - c.z) < 4.5) h.panic = Math.max(h.panic, 0.9); }
      }
    }
    // flocking: hens bunch up when worried, which is what makes them herdable
    let nx = 0, nz = 0, nvx = 0, nvz = 0, n = 0;
    for (const o of chickens) {
      if (o === c) continue;
      const ox = c.x - o.x, oz = c.z - o.z, od = Math.hypot(ox, oz) || 0.01;
      if (od < 0.85) { ax += (ox / od) * (0.85 - od) * 7; az += (oz / od) * (0.85 - od) * 7; }
      if (od < 5.5 && o.home === c.home) { nx += o.x; nz += o.z; nvx += o.vx; nvz += o.vz; n++; }
    }
    if (n && c.fear > 0.08) {
      const w = 1.7 * c.fear * (1 - c.panic * 0.8);
      ax += (nx / n - c.x) * w * 0.5; az += (nz / n - c.z) * w * 0.5;
      ax += (nvx / n) * 0.5 * c.fear; az += (nvz / n) * 0.5 * c.fear;
    }
    if (c.panic > 0.05) {
      c.jitT -= dt; if (c.jitT <= 0) { c.jit = R() * 6.283; c.jitT = 0.25 + R() * 0.3; if (R() < 0.5) sfx.cluck(c.panic); }
      ax += Math.cos(c.jit) * c.panic * 4.5; az += Math.sin(c.jit) * c.panic * 4.5;
    }
    // the rogue hen bolts sideways now and then
    if (c.rogue && !c.home) {
      c.boltCd -= dt * (c.fear > 0.25 ? 1 : 0);
      if (c.boltCd <= 0) { c.boltCd = 7 + R() * 5; c.boltT = 0.9; const s = R() < 0.5 ? 1 : -1; c.bx = (-dz / d) * s; c.bz = (dx / d) * s; sfx.cluck(1); }
      if (c.boltT > 0) { c.boltT -= dt; ax += c.bx * 6; az += c.bz * 6; }
    }
    if (dusk && !c.home) { // homing instinct near the gate
      const gd = Math.hypot(c.x, c.z - (PEN.z1 + 0.8));
      if (gd < 6 && (c.fear > 0.1 || gd < 3)) { const tx = -c.x, tz = PEN.z1 - 2 - c.z, l = Math.hypot(tx, tz) || 1; ax += (tx / l) * 2.4; az += (tz / l) * 2.4; }
    }
    if (dusk && c.home && c.z > PEN.z1 - 1.3) az -= 2.5;
    if (c.fear < 0.08 && c.panic < 0.05 && c.boltT <= 0) {
      const wx = c.wx - c.x, wz = c.wz - c.z, wl = Math.hypot(wx, wz);
      if (wl > 0.3) { ax += (wx / wl) * 1.1; az += (wz / wl) * 1.1; }
      else {
        c.idle -= dt;
        if (c.idle <= 0) {
          c.idle = 1 + R() * 3.5;
          if (c.home) { c.wx = lerp(PEN.x0 + 0.8, PEN.x1 - 0.8, R()); c.wz = lerp(PEN.z0 + 0.8, PEN.z1 - 1.6, R()); }
          else for (let i = 0; i < 6; i++) {
            const roo = theRooster(), near = roo && roo !== c && !roo.home && R() < 0.75 ? roo : null; // hens keep close to the rooster
            const a = R() * 6.283, r = near ? 1 + R() * 3.5 : 2 + R() * (G.state === 'day' ? 7 : 4), x = (near || c).x + Math.cos(a) * r, z = (near || c).z + Math.sin(a) * r;
            if (isOpen(x, z, 1) && Math.hypot(x, z) < 20) { c.wx = x; c.wz = z; break; }
          }
        }
      }
    } else { c.wx = c.x; c.wz = c.z; }
    const maxS = (1.3 + c.fear * ((fox.state === 'hunt' ? 5.6 : fleeMax) - 1.2) + c.panic * 1.6 + (c.boltT > 0 ? 2 : 0)) * (c.chick ? 1.1 : 1);
    const al = Math.hypot(ax, az);
    if (al > maxS) { ax *= maxS / al; az *= maxS / al; }
    const k = Math.min(1, dt * 7);
    c.vx += (ax - c.vx) * k; c.vz += (az - c.vz) * k;
    c.x += c.vx * dt; c.z += c.vz * dt;
    collide(c, 0.3);
    // animation
    const sp = Math.hypot(c.vx, c.vz);
    if (sp > 0.25) c.face = Math.atan2(c.vx, c.vz);
    c.anim += dt * (3 + sp * 5);
    const g = c.model.group;
    g.position.set(c.x, c.panic > 0.4 ? Math.abs(Math.sin(c.anim * 1.3)) * 0.25 : 0, c.z);
    let dr = c.face - g.rotation.y; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283;
    g.rotation.y += dr * Math.min(1, dt * 10);
    c.model.inner.rotation.z = Math.sin(c.anim) * Math.min(0.2, sp * 0.06);
    c.model.inner.position.y = Math.abs(Math.sin(c.anim)) * Math.min(0.06, sp * 0.03);
    c.model.head.rotation.x = sp < 0.2 && c.fear < 0.05 ? Math.max(0, Math.sin(c.anim * 0.9)) * 1.1 : Math.sin(c.anim) * 0.12;
  }
}

function updateHawk(dt: number) {
  const active = (G.state === 'day' && G.day >= 2) || (G.state === 'dusk' && G.day >= 6);
  const h = hawk;
  if (h.state === 'none') {
    if (!active) return;
    h.timer -= dt;
    if (h.timer > 0) return;
    h.timer = Math.max(8, 17 - G.day) + R() * 4;
    const prey = chickens.filter(c => !c.home);
    if (!prey.length) return;
    h.target = prey[(R() * prey.length) | 0];
    h.state = 'circle'; h.t = 0; h.a = R() * 6.28; h.y = 11; h.carried = false;
    sfx.hawk(); if (theRooster()) sfx.crow(); toast(G.day === 2 && G.lostToHawk === 0 ? 'Hawk overhead. Get close and bark (E).' : 'Hawk overhead.');
  }
  h.t += dt;
  const tgt = h.target && chickens.includes(h.target) ? h.target : null;
  let px = h.x, pz = h.z;
  if (h.state === 'circle') {
    if (!tgt || tgt.home) { h.state = 'leave'; h.t = 0; }
    else {
      h.a += dt * 1.9;
      h.x = tgt.x + Math.cos(h.a) * 3.2; h.z = tgt.z + Math.sin(h.a) * 3.2; h.y = 11;
      if (h.t > 4.6) { h.state = 'dive'; h.t = 0; sfx.hawk(); }
    }
  } else if (h.state === 'dive') {
    if (!tgt) { h.state = 'leave'; h.t = 0; }
    else {
      const k = Math.min(1, h.t / 1.1);
      h.x = lerp(h.x, tgt.x, k * k); h.z = lerp(h.z, tgt.z, k * k); h.y = lerp(11, 0.7, k * k);
      if (k >= 1) {
        if (Math.hypot(tgt.x - dog.x, tgt.z - dog.z) < 2.4) toast('The hawk veered off. Too close to the dog.');
        else { puff(tgt.x, 0.6, tgt.z, tgt.color, 14, 4); sfx.cluck(1); removeChicken(tgt); G.lostToHawk++; h.carried = true; toast('The hawk took a hen.'); }
        h.state = 'leave'; h.t = 0; h.target = null;
      }
    }
  } else if (h.state === 'leave') {
    h.x += Math.cos(h.a) * 14 * dt; h.z += Math.sin(h.a) * 14 * dt - 6 * dt; h.y += 9 * dt;
    if (h.t > 2.2) { h.state = 'none'; hawkModel.group.visible = hawkShadow.visible = false; return; }
  }
  hawkModel.group.visible = hawkShadow.visible = true;
  hawkModel.group.position.set(h.x, h.y, h.z);
  if (Math.hypot(h.x - px, h.z - pz) > 0.001) hawkModel.group.rotation.y = Math.atan2(h.x - px, h.z - pz);
  const flap = Math.sin(performance.now() * 0.012) * (h.state === 'circle' ? 0.25 : 0.7);
  hawkModel.wings[0].rotation.z = flap; hawkModel.wings[1].rotation.z = -flap;
  const low = 1 - clamp(h.y / 11, 0, 1);
  hawkShadow.position.set(h.x, 0.05, h.z);
  hawkShadow.scale.setScalar(lerp(2.0, 0.8, low));
  (hawkShadow.material as THREE.MeshBasicMaterial).opacity = lerp(0.22, 0.5, low);
}

function updateFox(dt: number) {
  const f = fox;
  if (f.state === 'none') {
    if (G.state !== 'dusk' || G.day < 3) return;
    f.timer -= dt;
    if (f.timer > 0) return;
    if (!chickens.some(c => !c.home)) { f.timer = 3; return; }
    let best = -1;
    for (let i = 0; i < 8; i++) { // come out of the trees on the side away from the dog
      const a = R() * 6.283, x = Math.cos(a) * 23, z = Math.sin(a) * 23, d = Math.hypot(x - dog.x, z - dog.z);
      if (d > best && z > -8) { best = d; f.x = x; f.z = z; }
    }
    f.state = 'hunt'; foxModel.group.visible = true;
    sfx.fox(); if (theRooster()) sfx.crow();
    toast(G.day === 3 ? 'Fox at the tree line. Run at it or bark.' : 'Fox at the tree line.');
  }
  let dx = 0, dz = 0, speed = 0;
  if (f.state === 'hunt') {
    let prey: Chicken | null = null, pd = 1e9;
    for (const c of chickens) if (!c.home) { const d = Math.hypot(c.x - f.x, c.z - f.z); if (d < pd) { pd = d; prey = c; } }
    const dd = Math.hypot(dog.x - f.x, dog.z - f.z);
    if (!prey) f.state = 'flee';
    else if (dd < 4.5 && !dog.lying) { f.state = 'flee'; toast('Fox chased off.'); }
    else {
      const p = prey as Chicken;
      f.dashing = pd < 5.5; speed = f.dashing ? 7.2 : 2.4; dx = p.x - f.x; dz = p.z - f.z;
      if (pd < 0.6) { puff(p.x, 0.6, p.z, p.color, 14, 4); sfx.cluck(1); removeChicken(p); G.lostToFox++; toast(p.rooster ? 'The fox took the rooster.' : 'The fox took a hen.'); f.state = 'flee'; }
    }
  }
  if (f.state === 'flee') {
    dx = f.x; dz = f.z; speed = 9.5; f.dashing = true;
    if (Math.hypot(f.x, f.z) > 27) { f.state = 'none'; f.timer = 12 + R() * 6; foxModel.group.visible = false; return; }
  }
  const l = Math.hypot(dx, dz) || 1;
  f.x += (dx / l) * speed * dt; f.z += (dz / l) * speed * dt;
  f.face = Math.atan2(dx, dz); f.anim += dt * speed * 2.2;
  const g = foxModel.group;
  g.position.set(f.x, f.dashing ? 0 : -0.1, f.z);
  let dr = f.face - g.rotation.y; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283;
  g.rotation.y += dr * Math.min(1, dt * 10);
  foxModel.legs.forEach((leg, i) => { leg.position.y = 0.16 + Math.max(0, Math.sin(f.anim + (i % 3 === 0 ? 0 : Math.PI))) * 0.1; });
  foxModel.tail.rotation.y = Math.sin(f.anim * 0.5) * 0.3;
}

const cA = new THREE.Color(), cB = new THREE.Color();
function tri(out: THREE.Color, a: number, b: number, c: number, k: number) {
  if (k < 0.6) out.setHex(a).lerp(cB.setHex(b), k / 0.6); else out.setHex(b).lerp(cB.setHex(c), (k - 0.6) / 0.4);
  return out;
}
function updateSky(dt: number) {
  const want = G.state === 'dusk' ? (G.t / G.len) * 0.85 : G.state === 'summary' || G.state === 'over' ? 1 : 0;
  G.sky += (want - G.sky) * Math.min(1, dt * 2);
  const k = G.sky;
  tri(sun.color, 0xfff4e0, 0xffb27a, 0x7080c0, k);
  sun.intensity = k < 0.6 ? lerp(2.4, 2.0, k / 0.6) : lerp(2.0, 0.5, (k - 0.6) / 0.4);
  tri(hemi.color, 0xdff0ff, 0xffd8b8, 0x3a4a7a, k);
  hemi.intensity = lerp(1.0, 0.55, k);
  tri(cA, 0xcfe6e4, 0xf0b890, 0x1f2a48, k);
  (scene.background as THREE.Color).copy(cA); scene.fog!.color.copy(cA);
  sun.target.position.copy(camTarget);
  sun.position.set(camTarget.x + lerp(-14, -34, k), lerp(34, 13, k), camTarget.z + lerp(16, 8, k));
}

function updateHud() {
  const home = chickens.filter(c => c.home).length;
  $('day').textContent = `Day ${G.day}`;
  $('phase').textContent = G.state === 'day' ? 'Daytime: keep watch' : G.state === 'dusk' ? 'Dusk: bring them home' : '';
  $('home').textContent = G.state === 'day' ? `${chickens.length}/${G.cap}` : `${home}/${chickens.length}`;
  $('homeLabel').textContent = G.state === 'day' ? 'Flock' : 'Home';
  $('eggs').textContent = `${G.eggs}`;
  $('cleared').textContent = `${G.cleared}`;
  const f = playing() ? clamp(1 - G.t / G.len, 0, 1) : 0;
  $('sunfill').style.transform = `scaleX(${f})`;
  $('sun').classList.toggle('dusk', G.state === 'dusk');
  $('sun').classList.toggle('low', G.state === 'dusk' && G.len - G.t < 15);
  const set = (cmd: string, on: boolean, cd = 0) => {
    const b = document.querySelector<HTMLElement>(`[data-cmd="${cmd}"]`)!;
    b.classList.toggle('on', on); b.style.setProperty('--cd', String(cd));
  };
  set('gather', !!dog.gather, dog.gatherCd / GATHER_CD);
  set('bark', false, dog.barkCd / BARK_CD);
  set('steady', toggles.steady); set('lie', toggles.lie); set('dig', toggles.dig || keys.has('f'));
}

function step(dt: number) {
  if (playing()) {
    G.t += dt;
    if (G.state === 'day' && G.t >= G.len) beginDusk();
    else if (G.state === 'dusk') {
      const all = chickens.length > 0 && chickens.every(c => c.home);
      G.allHomeT = all ? G.allHomeT + dt : 0;
      if (!chickens.length || G.allHomeT > 0.9) endDay(true);
      else if (G.t >= G.len) endDay(false);
    }
  }
  if (G.state !== 'summary' && G.state !== 'over') { updateDog(dt); updateChickens(dt); updateHawk(dt); updateFox(dt); }
  gate.rotation.y = lerp(gate.rotation.y, G.gateOpen ? 1.45 : 0, Math.min(1, dt * 5));
  for (const p of particles) if (p.life > 0) {
    p.life -= dt; p.vy -= 9 * dt;
    p.m.position.x += p.vx * dt; p.m.position.y = Math.max(0.03, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
    p.m.rotation.x += dt * 6; p.m.rotation.z += dt * 4;
    if (p.life <= 0) p.m.visible = false;
  }
  for (const r of rings) if (r.t < r.dur) {
    r.t += dt; const k = r.t / r.dur;
    r.m.scale.setScalar(lerp(0.5, r.max, k)); (r.m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.7;
    if (r.t >= r.dur) r.m.visible = false;
  }
  const ck = Math.min(1, dt * 3);
  camTarget.x += (dog.x * 0.7 - camTarget.x) * ck; camTarget.z += (dog.z * 0.7 - 1.5 - camTarget.z) * ck;
  camera.position.copy(camTarget).add(CAM_OFF);
  camera.lookAt(camTarget);
  updateSky(dt);
  updateHud();
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  step(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// title screen: a quiet farm in the background
for (let i = 0; i < 6; i++) addChicken(false, randomOpen(0, 3, 8));
for (const c of [...chickens]) { c.wx = c.x; c.wz = c.z; }
(window as any).__cb = { G, dog, hawk, fox, renderSummary, get chickens() { return chickens; }, step, keys, toggles, startDay, cmdGather, cmdBark, obstacles, PEN };
requestAnimationFrame(frame);
