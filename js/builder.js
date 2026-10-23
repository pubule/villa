import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Raccoglie parallelepipedi in poche mesh (una per materiale) con UV in metri,
// più le linee del disegno (spigoli) in poche LineSegments.

const FACES = [
  // normale, asse u, asse v
  { n: [1, 0, 0] }, { n: [-1, 0, 0] },
  { n: [0, 1, 0] }, { n: [0, -1, 0] },
  { n: [0, 0, 1] }, { n: [0, 0, -1] },
];

export class Batch {
  constructor(materials) {
    this.materials = materials;
    this.groups = new Map(); // matKey -> {pos, nor, uv, idx}
    this.lines = new Map();  // lineKey -> number[]
    this.extra = [];         // mesh già pronte
  }

  _group(key) {
    let g = this.groups.get(key);
    if (!g) { g = { pos: [], nor: [], uv: [], idx: [] }; this.groups.set(key, g); }
    return g;
  }

  quad(key, a, b, c, d, n) {
    const g = this._group(key);
    const base = g.pos.length / 3;
    for (const p of [a, b, c, d]) {
      g.pos.push(p[0], p[1], p[2]);
      g.nor.push(n[0], n[1], n[2]);
      // UV planari in metri
      if (Math.abs(n[0]) > 0.5) g.uv.push(p[2], p[1]);
      else if (Math.abs(n[1]) > 0.5) g.uv.push(p[0], p[2]);
      else g.uv.push(p[0], p[1]);
    }
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // poligono convesso piano (3 o 4 vertici in senso antiorario visto dalla
  // normale) con UV date esplicitamente
  poly(key, pts, uvs) {
    const g = this._group(key);
    const a = new THREE.Vector3(...pts[0]), bb = new THREE.Vector3(...pts[1]), c = new THREE.Vector3(...pts[2]);
    const n = bb.sub(a).cross(c.sub(a)).normalize();
    const base = g.pos.length / 3;
    pts.forEach((p, i) => { g.pos.push(...p); g.nor.push(n.x, n.y, n.z); g.uv.push(...uvs[i]); });
    for (let i = 1; i < pts.length - 1; i++) g.idx.push(base, base + i, base + i + 1);
  }

  // box da (x0,y0,z0) a (x1,y1,z1). mat: stringa "base|mode" o funzione (faccia, punto di prova) -> stringa
  box(x0, y0, z0, x1, y1, z1, mat, { lines = 'i', edges = true } = {}) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    for (const f of FACES) {
      const [nx, ny, nz] = f.n;
      const fc = [nx ? (nx > 0 ? x1 : x0) : cx, ny ? (ny > 0 ? y1 : y0) : cy, nz ? (nz > 0 ? z1 : z0) : cz];
      const key = typeof mat === 'function' ? mat(f.n, [fc[0] + nx * 0.08, fc[1] + ny * 0.08, fc[2] + nz * 0.08]) : mat;
      if (!key) continue;
      let a, b, c, d;
      if (nx > 0) { a = [x1, y0, z1]; b = [x1, y0, z0]; c = [x1, y1, z0]; d = [x1, y1, z1]; }
      else if (nx < 0) { a = [x0, y0, z0]; b = [x0, y0, z1]; c = [x0, y1, z1]; d = [x0, y1, z0]; }
      else if (ny > 0) { a = [x0, y1, z1]; b = [x1, y1, z1]; c = [x1, y1, z0]; d = [x0, y1, z0]; }
      else if (ny < 0) { a = [x0, y0, z0]; b = [x1, y0, z0]; c = [x1, y0, z1]; d = [x0, y0, z1]; }
      else if (nz > 0) { a = [x0, y0, z1]; b = [x1, y0, z1]; c = [x1, y1, z1]; d = [x0, y1, z1]; }
      else { a = [x1, y0, z0]; b = [x0, y0, z0]; c = [x0, y1, z0]; d = [x1, y1, z0]; }
      this.quad(key, a, b, c, d, f.n);
    }
    if (edges && lines) this.boxEdges(x0, y0, z0, x1, y1, z1, lines);
  }

  // unione di prismi verticali {r: [x0, z0, x1, z1], y: [y0, y1]}: niente facce
  // sovrapposte né interne, così i muri che si incrociano non sfarfallano e la
  // sezione tagliata resta un pieno nero pulito. Spigoli solo sul contorno.
  solids(list, mat, lines) {
    const eps = 1e-4;
    const uniq = (a) => a.sort((p, q) => p - q).filter((v, i, arr) => i === 0 || v - arr[i - 1] > eps);
    // i rettangoli del PDF non combaciano al millimetro: coordinate più vicine di
    // 5 cm diventano una sola, così negli incroci non restano gradini e fessure
    const snap = (vals) => {
      const sorted = uniq(vals.slice());
      const groups = [];
      for (const v of sorted) {
        const g = groups[groups.length - 1];
        if (g && v - g[g.length - 1] < 0.05) g.push(v); else groups.push([v]);
      }
      const map = new Map();
      for (const g of groups) {
        const m = g.reduce((a, b) => a + b, 0) / g.length;
        for (const v of g) map.set(v, m);
      }
      return (v) => { for (const [k, m] of map) if (Math.abs(k - v) <= eps) return m; return v; };
    };
    const sx = snap(list.flatMap((s) => [s.r[0], s.r[2]]));
    const sz = snap(list.flatMap((s) => [s.r[1], s.r[3]]));
    list = list.map((s) => ({ r: [sx(s.r[0]), sz(s.r[1]), sx(s.r[2]), sz(s.r[3])], y: s.y }));
    const xs = uniq(list.flatMap((s) => [s.r[0], s.r[2]]));
    const zs = uniq(list.flatMap((s) => [s.r[1], s.r[3]]));
    const nx = xs.length - 1, nz = zs.length - 1;
    const ix = (v) => xs.findIndex((x) => Math.abs(x - v) <= eps);
    const iz = (v) => zs.findIndex((z) => Math.abs(z - v) <= eps);
    const merge = (iv) => {
      iv.sort((a, b) => a[0] - b[0]);
      const out = [];
      for (const [a, b] of iv) {
        const l = out[out.length - 1];
        if (l && a <= l[1] + eps) l[1] = Math.max(l[1], b); else out.push([a, b]);
      }
      return out;
    };
    const minus = (iv, cut) => {
      let cur = iv.map((v) => [...v]);
      for (const [c0, c1] of cut) {
        const nxt = [];
        for (const [a, b] of cur) {
          if (c1 <= a + eps || c0 >= b - eps) { nxt.push([a, b]); continue; }
          if (c0 > a + eps) nxt.push([a, c0]);
          if (c1 < b - eps) nxt.push([c1, b]);
        }
        cur = nxt;
      }
      return cur;
    };
    const cells = Array.from({ length: nx }, () => Array.from({ length: nz }, () => []));
    for (const s of list) {
      for (let i = ix(s.r[0]); i < ix(s.r[2]); i++) for (let j = iz(s.r[1]); j < iz(s.r[3]); j++) cells[i][j].push([...s.y]);
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) cells[i][j] = merge(cells[i][j]);
    const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= nz ? [] : cells[i][j]);
    const key = (n, p) => (typeof mat === 'function' ? mat(n, p) : mat);
    const seg = (a, b) => { if (lines) this.segment(lines, a, b); };
    // facce laterali esposte, per ogni lato di cella
    const exposed = (i, j, d) => {
      const [di, dj] = d;
      return minus(at(i, j), at(i + di, j + dj));
    };
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const iv = cells[i][j];
      if (!iv.length) continue;
      const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j], z1 = zs[j + 1];
      for (const [y0, y1] of iv) {
        const top = key([0, 1, 0], [(x0 + x1) / 2, y1 + 0.08, (z0 + z1) / 2]);
        if (top) this.quad(top, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
        const bot = key([0, -1, 0], [(x0 + x1) / 2, y0 - 0.08, (z0 + z1) / 2]);
        if (bot) this.quad(bot, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
      }
      // contorno di sopra e di sotto: spigolo dove il vicino non ha la stessa faccia orizzontale
      for (const [di, dj] of DIRS) {
        const nb = at(i + di, j + dj);
        const ends = [];
        for (const [y0, y1] of iv) {
          if (!nb.some((v) => Math.abs(v[1] - y1) < eps && v[0] < y1 - eps)) ends.push(y1);
          if (!nb.some((v) => Math.abs(v[0] - y0) < eps && v[1] > y0 + eps)) ends.push(y0);
        }
        for (const y of ends) {
          if (di === 1) seg([x1, y, z0], [x1, y, z1]);
          else if (di === -1) seg([x0, y, z0], [x0, y, z1]);
          else if (dj === 1) seg([x0, y, z1], [x1, y, z1]);
          else seg([x0, y, z0], [x1, y, z0]);
        }
      }
      for (const d of DIRS) {
        const [di, dj] = d;
        const n = [di, 0, dj];
        for (const [y0, y1] of exposed(i, j, d)) {
          let a, b2, c, e;
          if (di > 0) { a = [x1, y0, z1]; b2 = [x1, y0, z0]; c = [x1, y1, z0]; e = [x1, y1, z1]; }
          else if (di < 0) { a = [x0, y0, z0]; b2 = [x0, y0, z1]; c = [x0, y1, z1]; e = [x0, y1, z0]; }
          else if (dj > 0) { a = [x0, y0, z1]; b2 = [x1, y0, z1]; c = [x1, y1, z1]; e = [x0, y1, z1]; }
          else { a = [x1, y0, z0]; b2 = [x0, y0, z0]; c = [x0, y1, z0]; e = [x1, y1, z0]; }
          const fx = di ? (di > 0 ? x1 : x0) : (x0 + x1) / 2;
          const fz = dj ? (dj > 0 ? z1 : z0) : (z0 + z1) / 2;
          const k = key(n, [fx + di * 0.08, (y0 + y1) / 2, fz + dj * 0.08]);
          if (k) this.quad(k, a, b2, c, e, n);
          // spigoli verticali alle due estremità del lato, se la faccia non continua
          const ends = di ? [[x1 * (di > 0) + x0 * (di < 0), z0, 0, -1], [x1 * (di > 0) + x0 * (di < 0), z1, 0, 1]]
            : [[x0, z1 * (dj > 0) + z0 * (dj < 0), -1, 0], [x1, z1 * (dj > 0) + z0 * (dj < 0), 1, 0]];
          for (const [px, pz, si, sj] of ends) {
            const cont = exposed(i + si, j + sj, d).some((v) => Math.abs(v[0] - y0) < eps && Math.abs(v[1] - y1) < eps);
            if (!cont) seg([px, y0, pz], [px, y1, pz]);
          }
        }
      }
    }
  }

  boxEdges(x0, y0, z0, x1, y1, z1, key) {
    let L = this.lines.get(key);
    if (!L) { L = []; this.lines.set(key, L); }
    const P = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [i, j] of E) L.push(...P[i], ...P[j]);
  }

  segment(key, a, b) {
    let L = this.lines.get(key);
    if (!L) { L = []; this.lines.set(key, L); }
    L.push(...a, ...b);
  }

  // geometria qualsiasi (cilindri, sfere…) già posizionata in coordinate mondo
  // ownUV: tiene le UV della geometria (cartoncini delle piante) invece di
  // quelle planari in metri
  geometry(geo, matKey, { lines = null, threshold = 30, ownUV = false } = {}) {
    const g = this._group(matKey);
    const ng = geo.index ? geo.toNonIndexed() : geo;
    const p = ng.attributes.position.array, n = ng.attributes.normal.array;
    const uvA = ownUV ? ng.attributes.uv.array : null;
    const base = g.pos.length / 3;
    for (let i = 0; i < p.length / 3; i++) {
      g.pos.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      g.nor.push(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]);
      const ax = Math.abs(n[i * 3]), ay = Math.abs(n[i * 3 + 1]);
      if (uvA) g.uv.push(uvA[i * 2], uvA[i * 2 + 1]);
      else if (ax > 0.6) g.uv.push(p[i * 3 + 2], p[i * 3 + 1]);
      else if (ay > 0.6) g.uv.push(p[i * 3], p[i * 3 + 2]);
      else g.uv.push(p[i * 3], p[i * 3 + 1]);
      g.idx.push(base + i);
    }
    if (lines) {
      const eg = new THREE.EdgesGeometry(geo, threshold);
      let L = this.lines.get(lines);
      if (!L) { L = []; this.lines.set(lines, L); }
      L.push(...eg.attributes.position.array);
    }
  }

  build(parent) {
    const out = [];
    for (const [key, g] of this.groups) {
      const [base, mode, tag] = key.split('|');
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      geo.setIndex(g.idx);
      const mesh = new THREE.Mesh(geo, this.materials.get(base, Number(mode || 0), tag || ''));
      mesh.castShadow = base !== 'glass';
      mesh.receiveShadow = true;
      if (base === 'glass') mesh.renderOrder = 2;
      mesh.name = key;
      parent.add(mesh);
      out.push(mesh);
    }
    for (const [key, L] of this.lines) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(L, 3));
      const mode = key === 'e' ? 1 : key === 'b' ? 2 : 0;
      const ls = new THREE.LineSegments(geo, this.materials.lines(mode, key === 'f' ? 0.55 : 0.9, this.lineTag || ''));
      ls.renderOrder = 3;
      parent.add(ls);
      out.push(ls);
    }
    return out;
  }
}

export { mergeGeometries };
