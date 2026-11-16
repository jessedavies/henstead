"""Pack selected glTF models from KayKit asset packs into one compact file per texture atlas.

Usage: KAYKIT_DIR=<folder with the unzipped packs> python3 tools/pack_models.py tools/models.json assets/models

The manifest maps a pack name to {"dir": path to the pack's gltf folder, "models": [names], "split": [names]}.
Models listed in "split" keep each top-level node as a separate part (with its pivot) so it can be animated.
Untextured materials become (linear) vertex colours; recolor.py can repaint a model (the border collie).
For each pack this writes <pack>.json (model index), <pack>.bin (all vertex data) and copies the
texture atlas. Node transforms are baked in and all primitives of a model are merged, since every
KayKit model in a pack uses the same single texture. The game builds THREE.BufferGeometry from it.
"""
import base64, json, os, shutil, struct, sys, math
import recolor

COMP = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def read_accessor(g, bins, i):
    a = g['accessors'][i]; bv = g['bufferViews'][a['bufferView']]
    fmt, size = COMP[a['componentType']]; n = NCOMP[a['type']]
    stride = bv.get('byteStride', size * n)
    data = bins[bv['buffer']]; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    out = []
    for k in range(a['count']):
        out.append(struct.unpack_from('<' + fmt * n, data, off + k * stride))
    if a.get('normalized') and fmt != 'f':
        mx = float((1 << (8 * size - (0 if fmt.isupper() else 1))) - 1)
        out = [tuple(max(-1.0, v / mx) for v in t) for t in out]
    return out

def mat_mul(a, b):
    return [sum(a[r + 4 * k] * b[k + 4 * c] for k in range(4)) for c in range(4) for r in range(4)]

def node_matrix(n):
    if 'matrix' in n: return n['matrix']
    tx, ty, tz = n.get('translation', [0, 0, 0]); qx, qy, qz, qw = n.get('rotation', [0, 0, 0, 1]); sx, sy, sz = n.get('scale', [1, 1, 1])
    r = [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qz * qw), 2 * (qx * qz - qy * qw), 0,
         2 * (qx * qy - qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qx * qw), 0,
         2 * (qx * qz + qy * qw), 2 * (qy * qz - qx * qw), 1 - 2 * (qx * qx + qy * qy), 0, 0, 0, 0, 1]
    s = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1]
    m = mat_mul(r, s); m[12], m[13], m[14] = tx, ty, tz
    return m

def xf(m, p, w):
    return tuple(m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r] * w for r in range(3))

def load_model(path):
    g = json.load(open(path))
    base = os.path.dirname(path)
    bins = [base64.b64decode(b['uri'].split(',', 1)[1]) if b['uri'].startswith('data:') else open(os.path.join(base, b['uri']), 'rb').read() for b in g['buffers']]
    return g, bins, base

def lin2srgb(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055

def extract(g, bins, roots, root_xform):
    pos, nor, uv, col, idx, images = [], [], [], [], [], set()
    def walk(ni, parent, top=False):
        n = g['nodes'][ni]; m = mat_mul(parent, root_xform(n) if top else node_matrix(n))
        if 'mesh' in n:
            for prim in g['meshes'][n['mesh']]['primitives']:
                at = prim['attributes']; base_i = len(pos)
                P = read_accessor(g, bins, at['POSITION'])
                N = read_accessor(g, bins, at['NORMAL']) if 'NORMAL' in at else [(0, 1, 0)] * len(P)
                T = read_accessor(g, bins, at['TEXCOORD_0']) if 'TEXCOORD_0' in at else [(0, 0)] * len(P)
                for p in P: pos.append(xf(m, p, 1))
                for q in N:
                    v = xf(m, q, 0); l = math.sqrt(sum(c * c for c in v)) or 1; nor.append(tuple(c / l for c in v))
                uv.extend(T)
                mi = prim.get('material'); fac = [1, 1, 1, 1]
                if mi is not None: fac = g['materials'][mi].get('pbrMetallicRoughness', {}).get('baseColorFactor', fac)
                col.extend([tuple(fac[:3])] * len(P))  # linear, as three.js expects vertex colours
                I = [t[0] for t in read_accessor(g, bins, prim['indices'])] if 'indices' in prim else list(range(len(P)))
                idx.extend(base_i + i for i in I)
                if mi is not None:
                    tex = g['materials'][mi].get('pbrMetallicRoughness', {}).get('baseColorTexture')
                    if tex: images.add(g['images'][g['textures'][tex['index']]['source']]['uri'])
        for c in n.get('children', []): walk(c, m)
    ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    for ni in roots: walk(ni, ident, True)
    return pos, nor, uv, col, idx, images

def entries(name, path, split):
    g, bins, base = load_model(path)
    roots = g['scenes'][g.get('scene', 0)]['nodes']
    if not split:
        yield name, None, extract(g, bins, roots, node_matrix), base
        return
    # Body = the root's own mesh; every child node becomes a part that keeps its pivot (geometry in local space).
    local = lambda nd: node_matrix({k: v for k, v in nd.items() if k != 'translation'})
    for ni in roots:
        n = g['nodes'][ni]
        body = dict(n); body.pop('children', None)
        g['nodes'].append(body)
        yield name + ':' + n.get('name', str(ni)), [0, 0, 0], extract(g, bins, [len(g['nodes']) - 1], node_matrix), base
        for c in n.get('children', []):
            cn = g['nodes'][c]
            yield name + ':' + cn.get('name', str(c)), [round(v, 4) for v in cn.get('translation', [0, 0, 0])], extract(g, bins, [c], local), base

def main():
    manifest = json.load(open(sys.argv[1])); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
    for pack, spec in manifest.items():
        blob = bytearray(); index = {}; atlas = None
        folder = spec['dir'].replace('{KAYKIT}', os.environ.get('KAYKIT_DIR', 'kaykit'))
        for model in spec['models']:
          for name, pivot, (pos, nor, uv, col, idx, images), base in entries(os.path.basename(model), os.path.join(folder, model + '.gltf'), model in spec.get('split', [])):
            col = recolor.apply(os.path.basename(model), name, pos, col)
            if len(images) > 1: raise SystemExit(f'{name}: more than one texture')
            if images:
                img = images.pop()
                if atlas and atlas[0] != img: raise SystemExit(f'{name}: different atlas {img}')
                atlas = (img, base)
            ys = [p[1] for p in pos]; xs = [p[0] for p in pos]; zs = [p[2] for p in pos]
            ent = {'n': len(pos), 'i': len(idx), 'box': [round(min(xs), 3), round(min(ys), 3), round(min(zs), 3), round(max(xs), 3), round(max(ys), 3), round(max(zs), 3)]}
            if pivot: ent['t'] = pivot
            ent['o'] = len(blob)
            for p in pos: blob += struct.pack('<3f', *p)
            for q in nor: blob += struct.pack('<3e', *q)  # half floats are plenty for normals
            if len(blob) % 4: blob += b'\0' * (4 - len(blob) % 4)
            for t in uv: blob += struct.pack('<2f', *t)
            for c in col: blob += bytes(max(0, min(255, round(v * 255))) for v in c)
            if len(blob) % 4: blob += b'\0' * (4 - len(blob) % 4)
            big = len(pos) > 65535
            for i in idx: blob += struct.pack('<I' if big else '<H', i)
            ent['u32'] = big
            if len(blob) % 4: blob += b'\0' * (4 - len(blob) % 4)
            index[name] = ent
        open(os.path.join(out, pack + '.bin'), 'wb').write(blob)
        tex = None
        if atlas:
            tex = pack + '_' + os.path.basename(atlas[0])
            shutil.copy(os.path.join(atlas[1], atlas[0]), os.path.join(out, tex))
        json.dump({'texture': tex, 'models': index}, open(os.path.join(out, pack + '.json'), 'w'), separators=(',', ':'))
        print(f'{pack}: {len(index)} models, {len(blob) // 1024} KB, texture {tex}')

main()
