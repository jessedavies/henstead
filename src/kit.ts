// Loads the KayKit models packed by tools/pack_models.py, plus the animated farmer (glTF).
// Every model in a pack shares one texture atlas, so each pack gets a single material.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type Entry = { n: number; i: number; o: number; u32: boolean; box: number[]; t?: number[] };
const geos = new Map<string, THREE.BufferGeometry>();
const info = new Map<string, Entry>();
const packOf = new Map<string, string>();
const mats = new Map<string, THREE.MeshLambertMaterial>();
const tints = new Map<string, THREE.MeshLambertMaterial>();
export let farmerGltf: { scene: THREE.Group; clips: THREE.AnimationClip[] } | null = null;

const PACKS = ['forest', 'village', 'plush', 'halloween', 'kitchen', 'resource', 'dog'];

/** Binary files, with a base64 text copy as fallback for hosts that only serve text and media (claude.ai artifacts). */
async function fetchBinary(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url).catch(() => null);
  if (r && r.ok && !(r.headers.get('content-type') || '').includes('text/html')) return r.arrayBuffer();
  const t = await fetch(url + '.b64.txt');
  if (!t.ok) throw new Error('missing ' + url);
  const s = atob((await t.text()).trim()), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

function buildGeometry(buf: ArrayBuffer, e: Entry) {
  const g = new THREE.BufferGeometry();
  let o = e.o;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, o, e.n * 3), 3)); o += e.n * 12;
  const half = new Uint16Array(buf, o, e.n * 3), nor = new Float32Array(e.n * 3);
  for (let k = 0; k < half.length; k++) nor[k] = THREE.DataUtils.fromHalfFloat(half[k]);
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); o += e.n * 6; o += (4 - (o % 4)) % 4;
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf, o, e.n * 2), 2)); o += e.n * 8;
  g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(buf, o, e.n * 3), 3, true)); o += e.n * 3; o += (4 - (o % 4)) % 4;
  g.setIndex(new THREE.BufferAttribute(e.u32 ? new Uint32Array(buf, o, e.i) : new Uint16Array(buf, o, e.i), 1));
  g.computeBoundingSphere();
  return g;
}

/** Fetches every pack (plus extraPacks, used by the library page). onProgress gets 0..1. Rejects if any file fails to load. */
export async function loadKit(base: string, onProgress?: (f: number) => void, extraPacks: string[] = []) {
  let done = 0;
  const packs = [...PACKS, ...extraPacks];
  const total = packs.length + 3;
  const tick = () => onProgress?.(++done / total);
  const texLoader = new THREE.TextureLoader();
  await Promise.all(packs.map(async pack => {
    const [index, buf] = await Promise.all([
      fetch(base + pack + '.json').then(r => (r.ok ? r.json() : Promise.reject(new Error(pack)))),
      fetchBinary(base + pack + '.bin'),
    ]);
    let map: THREE.Texture | null = null;
    if (index.texture) {
      map = await texLoader.loadAsync(base + index.texture);
      map.flipY = false; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    }
    mats.set(pack, new THREE.MeshLambertMaterial({ map, vertexColors: true }));
    for (const [name, e] of Object.entries(index.models as Record<string, Entry>)) {
      geos.set(name, buildGeometry(buf, e)); info.set(name, e); packOf.set(name, pack);
    }
    tick();
  }));
  const loader = new GLTFLoader();
  const [ranger, moves, general] = await Promise.all(['Ranger.glb', 'Rig_Medium_MovementBasic.glb', 'Rig_Medium_General.glb'].map(f => fetchBinary(base + f).then(b => loader.parseAsync(b, base)).then(g => { tick(); return g; })));
  ranger.scene.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const old = m.material as THREE.MeshStandardMaterial;
      m.material = new THREE.MeshLambertMaterial({ map: old.map });
      m.castShadow = true;
    }
  });
  farmerGltf = { scene: ranger.scene, clips: [...moves.animations, ...general.animations] };
}

export const has = (name: string) => geos.has(name);
/** Names of every loaded model in a pack, in pack order. */
export const modelsIn = (pack: string) => [...packOf].filter(([, p]) => p === pack).map(([n]) => n);
export const triangles = (name: string) => info.get(name)!.i / 3;
export const geo = (name: string) => { const g = geos.get(name); if (!g) throw new Error('missing model ' + name); return g; };
export const box = (name: string) => info.get(name)!.box;
export const pivot = (name: string) => info.get(name)!.t || [0, 0, 0];
export const material = (name: string) => mats.get(packOf.get(name)!)!;
/** The pack material multiplied by a colour, shared between meshes that use the same tint. */
export function tinted(name: string, color: number) {
  const key = packOf.get(name) + ':' + color;
  let m = tints.get(key);
  if (!m) { m = material(name).clone(); m.color.setHex(color); tints.set(key, m); }
  return m;
}
export function mesh(name: string, opts: { tint?: number; shadow?: boolean } = {}) {
  const m = new THREE.Mesh(geo(name), opts.tint !== undefined ? tinted(name, opts.tint) : material(name));
  m.castShadow = opts.shadow !== false; m.receiveShadow = true;
  return m;
}
export function instanced(name: string, count: number) {
  const m = new THREE.InstancedMesh(geo(name), material(name), Math.max(1, count));
  m.count = count; m.castShadow = true; m.receiveShadow = true;
  return m;
}
