// Farm models built from KayKit pieces (see kit.ts), with the same shapes of return value
// that the farm code animates: group, inner, head, legs and so on.
import * as THREE from 'three';
import * as kit from './kit';
import { mat, makeDecor as makeProceduralDecor, HEN_COLORS } from './models';

const pivotGroup = (name: string, scale = 1) => {
  const p = new THREE.Group(); const t = kit.pivot(name);
  p.position.set(t[0] * scale, t[1] * scale, t[2] * scale);
  const m = kit.mesh(name); p.add(m);
  return p;
};

/** KayKit's dog, repainted as a border collie at pack time. Head and front legs swing. */
export function makeDog() {
  const group = new THREE.Group(), inner = new THREE.Group();
  group.add(inner);
  const body = new THREE.Group(); body.scale.setScalar(0.62); inner.add(body);
  body.add(kit.mesh('character_dog:character_dog'));
  const head = pivotGroup('character_dog:character_dogHead');
  const legs = [pivotGroup('character_dog:character_dogArmLeft'), pivotGroup('character_dog:character_dogArmRight')];
  body.add(head, ...legs);
  const tail = new THREE.Object3D(); // the plush has no tail; kept so the farm code can wag it
  return { group, inner, head, legs, tail };
}

// Hen looks: which plush to use and how to tint it, keyed by the colour the farm saves for each hen.
const LOOKS: Record<number, [string, number]> = {
  [HEN_COLORS[0]]: ['chicken_plushie_A', 0xffffff],
  [HEN_COLORS[1]]: ['chicken_plushie_B', 0xffffff],
  [HEN_COLORS[2]]: ['chicken_plushie_A', 0x8a8a96],
  [HEN_COLORS[3]]: ['chicken_plushie_A', 0xf6d9a0],
  [HEN_COLORS[4]]: ['chicken_plushie_B', 0xc79a86],
};

/** KayKit chicken plush. `head` pivots the whole bird forward at the beak, for pecking. */
export function makeChicken(color: number, chick: boolean, rooster = false) {
  const group = new THREE.Group(), inner = new THREE.Group(), head = new THREE.Group();
  group.add(inner); inner.add(head);
  head.position.z = 0.3;
  const [model, tint] = chick ? ['chicken_plushie_A', 0xffe36a] : rooster ? ['chicken_plushie_B', 0xffc2b0] : LOOKS[color] || LOOKS[HEN_COLORS[0]];
  const m = kit.mesh(model, { tint }); m.position.z = -0.3; head.add(m);
  if (rooster) { // a tall dark tail marks the rooster
    for (const [a, h, c] of [[-0.5, 0.55, 0x2c5f57], [-0.95, 0.5, 0x1f4440], [-1.35, 0.42, 0x2c5f57]]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.09, h, 8), mat(c));
      f.position.set(0, 0.62 + Math.cos(a) * 0.18, -0.68 + Math.sin(a) * 0.16); f.rotation.x = a; f.castShadow = true;
      head.add(f);
    }
  }
  group.scale.setScalar(chick ? 0.45 : rooster ? 1.05 : 0.85);
  return { group, inner, head };
}

/** KayKit Ranger with its walk, run, idle and interact animations. */
export function makeFarmer() {
  const g = kit.farmerGltf!;
  const group = new THREE.Group();
  g.scene.scale.setScalar(0.8);
  group.add(g.scene);
  const mixer = new THREE.AnimationMixer(g.scene);
  const clip = (n: string) => g.clips.find(c => c.name === n)!;
  const actions: Record<string, THREE.AnimationAction> = {
    idle: mixer.clipAction(clip('Idle_A')), walk: mixer.clipAction(clip('Walking_A')),
    run: mixer.clipAction(clip('Running_A')), work: mixer.clipAction(clip('Interact')),
  };
  let cur = 'idle';
  actions.idle.play();
  return {
    group,
    update(dt: number, speed: number, working: boolean) {
      const want = working ? 'work' : speed > 4.2 ? 'run' : speed > 0.5 ? 'walk' : 'idle';
      if (want !== cur) { actions[want].reset().play(); actions[cur].crossFadeTo(actions[want], 0.18, false); cur = want; }
      if (want === 'walk') actions.walk.timeScale = speed / 2.6;
      if (want === 'run') actions.run.timeScale = speed / 5.6;
      mixer.update(dt);
    },
  };
}

/** KayKit cottage as the hen house; its door faces +z. */
export function makeCoop() {
  const g = new THREE.Group();
  const house = kit.mesh('building_home_A_red'); house.scale.setScalar(3.5); g.add(house);
  return g;
}

// Fences: KayKit's picket fence runs along z, one hex edge off centre. Re-centre it, turn it to run along x
// and stretch it to the farm's 2-unit fence span.
function fenceModel(name: string) {
  const s = 2 / 1.155, w = new THREE.Group();
  const m = kit.mesh(name); m.position.x = 1; m.rotation.y = 0;
  w.add(m); w.rotation.y = Math.PI / 2; w.scale.setScalar(s);
  return w;
}
export function makeFence() { const g = new THREE.Group(); g.add(fenceModel('fence_wood_straight')); return g; }
/** Gate: the leaf hinges at x = -1 so the farm can swing it open. */
export function makeGateItem() {
  const g = new THREE.Group(), leaf = new THREE.Group();
  leaf.position.x = -1;
  const f = fenceModel('fence_wood_straight_gate'); f.position.x = 1; leaf.add(f);
  g.add(leaf);
  return { group: g, leaf };
}

/** Feed patch: soil with sprouts that grow, then a field of grain that is eaten down. */
export function makePatch() {
  const g = new THREE.Group();
  const soil = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.1, 2.1), mat(0x8a6444)); soil.position.y = 0.05; soil.receiveShadow = true; g.add(soil);
  const sprouts: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const s = kit.mesh(i % 2 ? 'Grass_1_B_Color1' : 'Grass_2_B_Color1');
    s.position.set(((i % 3) - 1) * 0.62, 0.1, (Math.floor(i / 3) - 1) * 0.62); s.rotation.y = i * 1.7;
    g.add(s); sprouts.push(s);
  }
  const grain = kit.mesh('building_grain'); grain.position.y = 0.06; grain.scale.set(1.05, 1, 0.95); g.add(grain);
  return {
    group: g,
    set(grow: number, servings: number) {
      const ripe = grow >= 1;
      grain.visible = ripe; grain.scale.y = 0.4 + 0.6 * clamp01(servings / 8);
      for (const s of sprouts) { s.visible = grow >= 0 && !ripe; s.scale.setScalar(0.35 + clamp01(grow) * 0.75); }
    },
  };
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Decorations. Scarecrow stays hand-built: no free KayKit pack has one. */
export function makeDecor(t: string) {
  const g = new THREE.Group();
  const add = (name: string, s: number, x = 0, z = 0, ry = 0) => { const m = kit.mesh(name); m.scale.setScalar(s); m.position.set(x, 0, z); m.rotation.y = ry; g.add(m); return m; };
  if (t === 'flowers') { add('flax_flower_A', 0.8, -0.15, 0); add('flax_flower_B', 0.75, 0.2, 0.1, 1); add('flax_flower_A', 0.6, 0.05, -0.25, 2); add('Bush_1_B_Color1', 0.7, 0.1, 0.25); }
  else if (t === 'hay') add('Wood_Log_Stack', 0.65);
  else if (t === 'lantern') {
    add('post_lantern', 0.62, 0, -0.35);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc866, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(0, 0.04, 0.3); glow.name = 'glow'; g.add(glow);
  }
  else if (t === 'scarecrow') return makeProceduralDecor('scarecrow');
  else if (t === 'bench') add('bench', 0.85);
  else if (t === 'barrel') { add('barrel', 4); }
  else if (t === 'pumpkins') { add('pumpkin_orange', 0.7, -0.15, 0); add('pumpkin_orange_small', 0.7, 0.35, 0.25, 1); }
  else if (t === 'crate') add('crate_carrots', 0.55);
  else if (t === 'well') add('building_well_red', 2.4);
  else if (t === 'wheelbarrow') add('wheelbarrow', 4.2, 0, 0, -0.6);
  return g;
}

// ---------- forest ----------
// Only the lighter tree variants (about 300-650 triangles each); the large ones cost 1,000-2,200.
const TREES_NEAR = ['Tree_1_A_Color1', 'Tree_2_A_Color1', 'Tree_2_B_Color1', 'Tree_4_A_Color1'];
const TREES_FAR = [...TREES_NEAR, 'Tree_1_B_Color1', 'Tree_2_C_Color1', 'Tree_4_B_Color1'];
const BUSHES = ['Bush_1_C_Color1', 'Bush_1_D_Color1', 'Bush_2_C_Color1', 'Bush_3_B_Color1', 'Bush_4_B_Color1', 'Bush_4_C_Color1'];
export const ROCKS = ['Rock_1_D_Color1', 'Rock_1_E_Color1', 'Rock_1_F_Color1'];
export const PEBBLES = ['Rock_1_A_Color1', 'Rock_1_B_Color1', 'Rock_1_C_Color1'];
export const GRASS = ['Grass_1_B_Color1', 'Grass_1_A_Color1', 'Grass_2_B_Color1', 'Grass_2_A_Color1'];
/** Picks a tree model from a 0..1 value; trees near the clearing come from the smaller set. */
export const treeModel = (v: number, near: boolean) => { const l = near ? TREES_NEAR : TREES_FAR; return l[Math.min(l.length - 1, (v * l.length) | 0)]; };
export const bushModel = (v: number) => BUSHES[Math.min(BUSHES.length - 1, (v * BUSHES.length) | 0)];
export const modelWidth = (name: string) => { const b = kit.box(name); return Math.max(b[3] - b[0], b[5] - b[2]); };
