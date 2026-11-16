import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Every model is built from flat-shaded primitives; swap for authored meshes later.
let SOFT = false, DET = 0;
/** Rounded shapes with banded shading, used by the cosy farm game. */
export function setSoftStyle() { SOFT = true; DET = 2; }
export function makeMat(color: number): any {
  if (!SOFT) return new THREE.MeshLambertMaterial({ color, flatShading: true });
  return new THREE.MeshLambertMaterial({ color }); // smooth shading, to sit beside the KayKit models
}
const mats = new Map<number, any>();
export function mat(color: number) {
  let m = mats.get(color);
  if (!m) { m = makeMat(color); mats.set(color, m); }
  return m;
}

function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) {
  const geo = SOFT ? new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.3) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}

const BLACK = 0x2b2b30, WHITE = 0xf3efe6;

export function makeDog() {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  inner.add(box(0.5, 0.46, 1.1, BLACK, 0, 0.62, 0));
  inner.add(box(0.52, 0.4, 0.28, WHITE, 0, 0.58, 0.44)); // chest
  inner.add(box(0.3, 0.3, 0.3, WHITE, 0, 0.82, 0.55)); // ruff
  const head = new THREE.Group();
  head.position.set(0, 1.0, 0.72);
  head.add(box(0.4, 0.38, 0.42, BLACK));
  head.add(box(0.12, 0.39, 0.3, WHITE, 0, 0.005, 0.07)); // blaze
  head.add(box(0.22, 0.2, 0.28, WHITE, 0, -0.07, 0.3)); // muzzle
  head.add(box(0.1, 0.08, 0.06, BLACK, 0, -0.02, 0.45)); // nose
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, SOFT ? 10 : 4), mat(BLACK));
    ear.position.set(s * 0.14, 0.27, -0.08); ear.rotation.z = -s * 0.25; ear.castShadow = true;
    head.add(ear);
  }
  inner.add(head);
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[-0.17, 0.4], [0.17, 0.4], [-0.17, -0.4], [0.17, -0.4]]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.46, z);
    leg.add(box(0.14, 0.24, 0.14, BLACK, 0, -0.1, 0));
    leg.add(box(0.14, 0.24, 0.14, WHITE, 0, -0.34, 0));
    inner.add(leg); legs.push(leg);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.72, -0.55);
  tail.add(box(0.11, 0.11, 0.4, BLACK, 0, 0, -0.2));
  tail.add(box(0.12, 0.12, 0.16, WHITE, 0, 0, -0.46));
  tail.rotation.x = 0.5;
  inner.add(tail);
  return { group, inner, head, legs, tail };
}

export const HEN_COLORS = [0xf1ece0, 0xb9783f, 0x4a4a52, 0xe0b877, 0x8c4f2e];

export function makeChicken(color: number, chick: boolean, rooster = false) {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, DET), mat(color));
  body.scale.set(1, 0.92, 1.25); body.position.y = 0.44; body.castShadow = true;
  inner.add(body);
  if (!chick) {
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, SOFT ? 10 : 4), mat(color));
    tail.position.set(0, 0.66, -0.34); tail.rotation.x = -0.7; tail.castShadow = true;
    inner.add(tail);
    if (rooster) for (const [a, h, c] of [[-0.35, 0.6, 0x24504c], [-0.9, 0.55, 0x1c3b3a], [-1.3, 0.45, 0x24504c]]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.1, h, SOFT ? 10 : 4), mat(c));
      f.position.set(0, 0.74 + Math.cos(a) * 0.2, -0.42 + Math.sin(a) * 0.18); f.rotation.x = a; f.castShadow = true;
      inner.add(f);
    }
  }
  const head = new THREE.Group();
  head.position.set(0, 0.6, 0.22);
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, DET), mat(color));
  skull.position.set(0, 0.16, 0.08); skull.castShadow = true;
  head.add(skull);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, SOFT ? 10 : 4), mat(0xe89a3c));
  beak.position.set(0, 0.14, 0.27); beak.rotation.x = Math.PI / 2;
  head.add(beak);
  if (!chick) {
    head.add(box(0.05, rooster ? 0.2 : 0.1, rooster ? 0.24 : 0.16, 0xc8443a, 0, rooster ? 0.38 : 0.34, 0.07)); // comb
    head.add(box(0.05, 0.08, 0.05, 0xc8443a, 0, 0.03, 0.2)); // wattle
  }
  for (const s of [-1, 1]) head.add(box(0.03, 0.03, 0.03, 0x1c1c20, s * 0.12, 0.2, 0.17));
  inner.add(head);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, SOFT ? 12 : 4), mat(0xe89a3c));
    leg.position.set(s * 0.1, 0.1, 0);
    inner.add(leg);
  }
  if (chick) group.scale.setScalar(0.55);
  if (rooster) group.scale.setScalar(1.25);
  return { group, inner, head };
}

export function makeHawk() {
  const group = new THREE.Group();
  const C = 0x6b4a35;
  group.add(box(0.3, 0.2, 0.9, C));
  group.add(box(0.22, 0.2, 0.25, 0xe8dcc4, 0, 0.03, 0.52));
  group.add(box(0.4, 0.05, 0.35, C, 0, 0, -0.55));
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.add(box(1.3, 0.05, 0.5, C, s * 0.65, 0, 0));
    w.add(box(0.5, 0.05, 0.36, 0x4a3326, s * 1.45, 0, -0.05));
    group.add(w); wings.push(w);
  }
  group.scale.setScalar(1.5);
  return { group, wings };
}

export function makeCoop() {
  const g = new THREE.Group();
  g.add(box(3.2, 1.7, 2.2, 0xb5533c, 0, 0.85, 0));
  const roof = new THREE.Mesh((() => { const g = new THREE.ConeGeometry(2.5, 1.2, 4).toNonIndexed(); g.computeVertexNormals(); return g; })(), mat(0x5a4a42));
  roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.75); roof.position.y = 2.3; roof.castShadow = true;
  g.add(roof);
  g.add(box(0.8, 1.0, 0.1, 0x4a342a, 0, 0.5, 1.1));
  g.add(box(1.0, 0.1, 0.12, WHITE, 0, 1.05, 1.1));
  g.add(box(0.6, 0.5, 0.1, WHITE, -1.05, 1.1, 1.1));
  g.add(box(0.6, 0.5, 0.1, WHITE, 1.05, 1.1, 1.1));
  return g;
}

const FENCE = 0xd9c7a0;
export function fenceRun(ax: number, az: number, bx: number, bz: number) {
  const g = new THREE.Group();
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.round(len / 1.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    g.add(box(0.16, 0.95, 0.16, FENCE, ax + (bx - ax) * t, 0.47, az + (bz - az) * t));
  }
  for (const y of [0.35, 0.72]) {
    const r = box(len, 0.09, 0.07, FENCE, (ax + bx) / 2, y, (az + bz) / 2);
    r.rotation.y = -Math.atan2(bz - az, bx - ax);
    g.add(r);
  }
  return g;
}

export function makeGate(width: number) {
  const pivot = new THREE.Group();
  for (const y of [0.3, 0.55, 0.8]) pivot.add(box(width, 0.08, 0.06, 0xbfa87a, width / 2, y, 0));
  const diag = box(width * 1.05, 0.07, 0.05, 0xbfa87a, width / 2, 0.55, 0);
  diag.rotation.z = 0.16;
  pivot.add(diag);
  return pivot;
}

export function makeFox() {
  const group = new THREE.Group();
  const O = 0xd9772f;
  group.add(box(0.36, 0.34, 1.0, O, 0, 0.45, 0));
  group.add(box(0.34, 0.3, 0.36, O, 0, 0.62, 0.62));
  group.add(box(0.16, 0.14, 0.24, WHITE, 0, 0.55, 0.88));
  group.add(box(0.07, 0.06, 0.05, BLACK, 0, 0.58, 1.01));
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, SOFT ? 10 : 4), mat(BLACK));
    ear.position.set(s * 0.12, 0.86, 0.56); ear.castShadow = true; group.add(ear);
  }
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.13, 0.35], [0.13, 0.35], [-0.13, -0.35], [0.13, -0.35]]) { const l = box(0.1, 0.32, 0.1, BLACK, x, 0.16, z); group.add(l); legs.push(l); }
  const tail = new THREE.Group();
  tail.position.set(0, 0.5, -0.5);
  tail.add(box(0.22, 0.22, 0.5, O, 0, 0, -0.25));
  tail.add(box(0.2, 0.2, 0.22, WHITE, 0, 0, -0.58));
  tail.rotation.x = 0.35;
  group.add(tail);
  return { group, legs, tail };
}

export function makeFarmer() {
  const group = new THREE.Group();
  const DENIM = 0x3f5873, SHIRT = 0xc9583e, SKIN = 0xe8b48a, STRAW = 0xe3c878;
  const legs: THREE.Group[] = [], arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.13, 0.52, 0);
    leg.add(box(0.19, 0.52, 0.22, DENIM, 0, -0.26, 0)); leg.add(box(0.2, 0.1, 0.3, 0x4a342a, 0, -0.5, 0.04));
    group.add(leg); legs.push(leg);
    const arm = new THREE.Group(); arm.position.set(s * 0.33, 1.05, 0);
    arm.add(box(0.13, 0.3, 0.14, SHIRT, 0, -0.13, 0)); arm.add(box(0.12, 0.24, 0.13, SKIN, 0, -0.38, 0));
    group.add(arm); arms.push(arm);
  }
  group.add(box(0.5, 0.58, 0.3, SHIRT, 0, 0.8, 0));
  group.add(box(0.38, 0.36, 0.33, DENIM, 0, 0.7, 0));
  group.add(box(0.32, 0.3, 0.3, SKIN, 0, 1.26, 0));
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, SOFT ? 12 : 8), mat(STRAW)); brim.position.y = 1.43; brim.castShadow = true;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.18, SOFT ? 12 : 8), mat(STRAW)); top.position.y = 1.53;
  group.add(brim, top);
  group.scale.setScalar(1.15);
  return { group, legs, arms };
}

export function makeSnake() {
  const group = new THREE.Group();
  const segs: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) { const s = box(0.16 - i * 0.012, 0.12, 0.28, i % 2 ? 0x6b8f3a : 0x4f7030, 0, 0.07, -i * 0.26); group.add(s); segs.push(s); }
  group.add(box(0.2, 0.14, 0.24, 0x4f7030, 0, 0.09, 0.22));
  return { group, segs };
}

export function makeEgg() {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), mat(0xf6ead2));
  m.scale.set(1, 1.25, 1); m.castShadow = true;
  return m;
}

export function makePatch() {
  const g = new THREE.Group();
  const soil = box(2, 0.12, 2, 0x8a6444, 0, 0.06, 0); soil.receiveShadow = true; g.add(soil);
  for (const x of [-0.6, 0, 0.6]) g.add(box(0.08, 0.04, 1.8, 0x75533a, x + 0.3, 0.13, 0));
  const plants: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const p = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, SOFT ? 10 : 5).translate(0, 0.35, 0), makeMat(0x7fb04a));
    p.position.set(((i % 3) - 1) * 0.6, 0.12, (Math.floor(i / 3) - 1) * 0.6); p.castShadow = true;
    g.add(p); plants.push(p);
  }
  return { group: g, plants };
}

export function makeDecor(t: string) {
  const g = new THREE.Group();
  if (t === 'flowers') {
    const cols = [0xf2c14e, 0xe8788a, 0xf6f1e4, 0xb48be0];
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3, r = i ? 0.28 : 0;
      g.add(box(0.04, 0.3, 0.04, 0x5d8a4e, Math.cos(a) * r, 0.15, Math.sin(a) * r));
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, DET), mat(cols[i % 4])); f.position.set(Math.cos(a) * r, 0.34, Math.sin(a) * r); g.add(f);
    }
  } else if (t === 'hay') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.8, SOFT ? 12 : 8), mat(0xe0c060)); b.rotation.z = Math.PI / 2; b.position.y = 0.55; b.castShadow = true; g.add(b);
    g.add(box(0.82, 0.06, 1.12, 0xc9a84a, 0, 0.55, 0));
  } else if (t === 'lantern') {
    g.add(box(0.1, 1.3, 0.1, 0x4a342a, 0, 0.65, 0)); g.add(box(0.4, 0.06, 0.1, 0x4a342a, 0.15, 1.3, 0));
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), new THREE.MeshBasicMaterial({ color: 0xffd98a })); lamp.position.set(0.3, 1.12, 0); lamp.name = 'lamp'; g.add(lamp);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(3.2, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc866, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(0.3, 0.04, 0); glow.name = 'glow'; g.add(glow);
  } else if (t === 'scarecrow') {
    g.add(box(0.1, 1.7, 0.1, 0x7a5a3c, 0, 0.85, 0)); g.add(box(1.3, 0.09, 0.09, 0x7a5a3c, 0, 1.25, 0));
    g.add(box(0.5, 0.6, 0.22, 0x5a7d9a, 0, 1.1, 0)); g.add(box(0.3, 0.3, 0.3, 0xe3c878, 0, 1.6, 0));
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.36, SOFT ? 10 : 6), mat(0x8a6444)); hat.position.y = 1.92; hat.castShadow = true; g.add(hat);
  }
  return g;
}
