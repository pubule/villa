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
  geometry(geo, matKey, { lines = null, threshold = 30 } = {}) {
    const g = this._group(matKey);
    const ng = geo.index ? geo.toNonIndexed() : geo;
    const p = ng.attributes.position.array, n = ng.attributes.normal.array;
    const base = g.pos.length / 3;
    for (let i = 0; i < p.length / 3; i++) {
      g.pos.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      g.nor.push(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]);
      const ax = Math.abs(n[i * 3]), ay = Math.abs(n[i * 3 + 1]);
      if (ax > 0.6) g.uv.push(p[i * 3 + 2], p[i * 3 + 1]);
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
      const [base, mode] = key.split('|');
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      geo.setIndex(g.idx);
      const mesh = new THREE.Mesh(geo, this.materials.get(base, Number(mode || 0)));
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
      const ls = new THREE.LineSegments(geo, this.materials.lines(mode, key === 'f' ? 0.55 : 0.9));
      ls.renderOrder = 3;
      parent.add(ls);
      out.push(ls);
    }
    return out;
  }
}

export { mergeGeometries };
