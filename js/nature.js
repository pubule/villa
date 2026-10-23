import * as THREE from 'three';
import { Batch } from './builder.js';

// Giardino: prato del lotto, muretti a secco sul confine, ghiaia, ulivi,
// lavanda. Più lontano, la collina e il mare.

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export const TREES = [
  { x: -2.6, z: -3.4, r: 2.6, h: 4.6 },
  { x: 16.2, z: 2.8, r: 2.8, h: 5.0 },
  { x: 18.6, z: 13.8, r: 2.4, h: 4.4 },
  { x: 17.2, z: 23.2, r: 3.0, h: 5.2 },
  { x: -2.4, z: 29.0, r: 2.6, h: 4.6 },
  { x: 12.8, z: 30.0, r: 2.3, h: 4.2 },
];

export function buildNature(variant, materials, parent) {
  const b = new Batch(materials);
  const lot = variant.lot;

  // prato del lotto (faccia verso l'alto)
  const shape = new THREE.Shape(lot.map(([x, z]) => new THREE.Vector2(x, -z)));
  const lotGeo = new THREE.ShapeGeometry(shape);
  lotGeo.rotateX(-Math.PI / 2);
  lotGeo.translate(0, -0.06, 0);
  b.geometry(lotGeo, 'grass|1');

  // terreno intorno
  const ring = new THREE.CircleGeometry(160, 48);
  ring.rotateX(-Math.PI / 2);
  ring.translate(8, -0.14, 12);
  b.geometry(ring, 'meadow|1');

  // muretto a secco sul confine, con varco per il passo carraio a nord
  for (let i = 0; i < lot.length; i++) {
    const a = lot[i], c = lot[(i + 1) % lot.length];
    const segs = (i === 0) ? [[a[0], 4.4], [10.4, c[0]]] : [[0, 1]];
    for (const [s0, s1] of segs) {
      let p0, p1;
      if (i === 0) { p0 = [s0, a[1]]; p1 = [s1, a[1]]; } else {
        p0 = [a[0] + (c[0] - a[0]) * s0, a[1] + (c[1] - a[1]) * s0];
        p1 = [a[0] + (c[0] - a[0]) * s1, a[1] + (c[1] - a[1]) * s1];
      }
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const g = new THREE.BoxGeometry(len, 0.95, 0.45);
      g.rotateY(-Math.atan2(p1[1] - p0[1], p1[0] - p0[0]));
      g.translate((p0[0] + p1[0]) / 2, 0.4, (p0[1] + p1[1]) / 2);
      b.geometry(g, 'stone|1', { lines: 'e' });
    }
  }

  // ghiaia: passo carraio a nord, corte a est, sentiero verso sud
  b.box(4.4, -0.3, -6.8, 10.4, -0.03, 0, 'gravel|1', { lines: 'e' });
  b.box(12.996, -0.3, 5.2, 15.4, -0.03, 17.4, 'gravel|1', { lines: 'e' });
  b.box(0.5, -0.3, 26.6, variant.portico.x1 - 0.5, -0.03, 28.2, 'gravel|1', { lines: 'e' });
  // lastre in pietra nel prato verso l'ingresso
  const rnd = rand(7);
  for (let i = 0; i < 6; i++) {
    const z = 16.9 + i * 0.9;
    b.box(13.6 + rnd() * 0.3, -0.06, z, 14.6 + rnd() * 0.3, -0.01, z + 0.55, 'paving|1', { lines: 'e' });
  }

  // lavanda davanti al portico: cuscini grigio-verdi con spighe viola
  const lav = rand(11);
  for (let x = 0.8; x < variant.portico.x1 - 0.6; x += 0.62) {
    for (const z of [28.6, 29.3]) lavender(b, x + (lav() - 0.5) * 0.15, z + (lav() - 0.5) * 0.15, 0.9 + lav() * 0.3, lav);
  }
  // macchia mediterranea lungo il lato ovest e a nord-est: lavanda,
  // cespugli di pittosforo e graminacee, alternati come in un giardino secco
  const mac = rand(23);
  for (let z = 1.0; z < 22; z += 1.15) {
    const x = -1.0 - mac() * 0.6;
    const k = Math.floor(mac() * 3);
    if (k === 0) lavender(b, x, z, 1.0 + mac() * 0.3, mac);
    else if (k === 1) shrub(b, x, z, 0.5 + mac() * 0.25, mac);
    else grasses(b, x, z, 0.9 + mac() * 0.4, mac);
  }
  for (const [x, z] of [[11.4, -1.6], [12.4, -2.4], [3.4, -1.8], [2.4, -2.6], [14.2, 18.6], [15.0, 19.6], [14.4, 4.4]]) {
    lavender(b, x, z, 1.1, mac);
    grasses(b, x + 0.6, z + 0.3, 1.0, mac);
  }
  for (const [x, z] of [[19.2, 9.0], [19.8, 18.2], [-3.4, 12.0], [-3.2, 22.4], [8.0, 30.6]]) shrub(b, x, z, 0.8 + mac() * 0.3, mac);

  const objs = b.build(parent);

  // ulivi: ognuno nel suo gruppo, così possono "crescere" dalla pianta
  const trees = [];
  for (const [i, t] of TREES.entries()) {
    const tb = new Batch(materials);
    olive(tb, { ...t, x: 0, z: 0 }, rand(100 + i));
    const g = new THREE.Group();
    g.position.set(t.x, 0, t.z);
    g.rotation.y = i * 1.3;
    tb.build(g);
    parent.add(g);
    trees.push(g);
  }

  // mare in basso, oltre la collina
  const sea = new THREE.Mesh(new THREE.CircleGeometry(3000, 64), materials.get('water', 1));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -38, 0);
  parent.add(sea);
  objs.push(sea);
  return { objs, trees };
}

// Ulivo: fusto basso, contorto e spesso, che si apre in due o tre branche
// nodose; la chioma è fatta di cartoncini con rametti disegnati, argentei.
function olive(b, t, rnd) {
  const sc = t.h / 4.8;
  const leaders = 2 + Math.floor(rnd() * 2);
  const tips = [];
  const fork = new THREE.Vector3((rnd() - 0.5) * 0.3, 0.9 * sc + rnd() * 0.3, (rnd() - 0.5) * 0.3);
  // fusto: più largo alla base, con una torsione
  gnarl(b, [new THREE.Vector3(0, -0.1, 0), new THREE.Vector3((rnd() - 0.5) * 0.25, 0.45 * sc, (rnd() - 0.5) * 0.25), fork], 0.36 * sc, 0.24 * sc, rnd);
  for (let k = 0; k < leaders; k++) {
    const a = (k / leaders) * Math.PI * 2 + rnd() * 0.8;
    const out = t.r * (0.35 + rnd() * 0.15);
    const mid = new THREE.Vector3(fork.x + Math.cos(a) * out * 0.45, fork.y + 0.8 * sc, fork.z + Math.sin(a) * out * 0.45);
    const top = new THREE.Vector3(fork.x + Math.cos(a) * out, t.h * (0.62 + rnd() * 0.1), fork.z + Math.sin(a) * out);
    gnarl(b, [fork, mid, top], 0.17 * sc, 0.07 * sc, rnd);
    // rami secondari
    for (let j = 0; j < 3; j++) {
      const a2 = a + (rnd() - 0.5) * 2.2;
      const l2 = t.r * (0.3 + rnd() * 0.25);
      const end = new THREE.Vector3(top.x + Math.cos(a2) * l2, top.y + (0.2 + rnd() * 0.5) * sc, top.z + Math.sin(a2) * l2);
      gnarl(b, [mid.clone().lerp(top, 0.4 + rnd() * 0.5), end], 0.06 * sc, 0.025 * sc, rnd);
      tips.push(end);
    }
    tips.push(top);
  }
  // chioma: grappoli di cartoncini intorno alle punte dei rami
  for (const tip of tips) {
    const R = t.r * (0.5 + rnd() * 0.15);
    for (let n = 0; n < 40; n++) {
      const g = new THREE.PlaneGeometry(1.15 * sc + 0.35, 1.15 * sc + 0.35);
      g.rotateX((rnd() - 0.5) * Math.PI);
      g.rotateY(rnd() * Math.PI * 2);
      const u = rnd() * Math.PI * 2, v = Math.acos(2 * rnd() - 1), rr = Math.cbrt(rnd());
      g.translate(
        tip.x + Math.sin(v) * Math.cos(u) * R * rr,
        tip.y + Math.cos(v) * R * 0.55 * rr - 0.1,
        tip.z + Math.sin(v) * Math.sin(u) * R * rr);
      b.geometry(g, 'leavesOlive|1', { ownUV: true });
    }
  }
}

// ramo affusolato lungo una curva, con la corteccia un po' bitorzoluta
function gnarl(b, pts, r0, r1, rnd) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const seg = 14, rad = 9;
  const g = new THREE.TubeGeometry(curve, seg, 1, rad, false);
  const pos = g.attributes.position;
  const ph = rnd() * 10;
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    curve.getPointAt(u, c);
    const r = r0 + (r1 - r0) * Math.pow(u, 0.7);
    for (let j = 0; j <= rad; j++) {
      const k = i * (rad + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c);
      const bump = 1 + 0.22 * Math.sin(j * 1.7 + u * 9 + ph) + 0.12 * Math.sin(j * 3.1 - u * 13);
      v.multiplyScalar(r * bump).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  b.geometry(g, 'bark|1');
}

// cespuglio di lavanda: cuscino basso e tre cartoncini incrociati di spighe
function lavender(b, x, z, s, rnd) {
  const m = new THREE.IcosahedronGeometry(0.28 * s, 1);
  m.scale(1, 0.55, 1);
  m.translate(x, 0.08 * s, z);
  b.geometry(m, 'shrub|1');
  for (let k = 0; k < 3; k++) {
    const g = new THREE.PlaneGeometry(0.8 * s, 0.62 * s);
    g.translate(0, 0.31 * s, 0);
    g.rotateY((k / 3) * Math.PI + rnd() * 0.4);
    g.translate(x, 0, z);
    b.geometry(g, 'lavenderCard|1', { ownUV: true });
  }
}

function grasses(b, x, z, s, rnd) {
  for (let k = 0; k < 3; k++) {
    const g = new THREE.PlaneGeometry(0.9 * s, 0.95 * s);
    g.translate(0, 0.47 * s, 0);
    g.rotateY((k / 3) * Math.PI + rnd() * 0.4);
    g.translate(x, -0.04, z);
    b.geometry(g, 'grassCard|1', { ownUV: true });
  }
}

// cespuglio sempreverde (pittosforo, mirto): forma morbida e qualche rametto
function shrub(b, x, z, r, rnd) {
  const m = new THREE.IcosahedronGeometry(r * 0.8, 2);
  m.scale(1.15, 0.8, 1);
  const p = m.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + 0.12 * Math.sin(p.getX(i) * 9 + p.getZ(i) * 7) * Math.cos(p.getY(i) * 11);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  m.computeVertexNormals();
  m.translate(x, r * 0.6, z);
  b.geometry(m, 'shrub|1');
  for (let k = 0; k < 26; k++) {
    const g = new THREE.PlaneGeometry(r * 1.1, r * 1.1);
    g.rotateY(rnd() * Math.PI * 2);
    g.rotateX((rnd() - 0.5) * 1.2);
    g.translate(x + (rnd() - 0.5) * r * 1.6, r * (0.5 + rnd() * 0.8), z + (rnd() - 0.5) * r * 1.6);
    b.geometry(g, 'leavesOlive|1', { ownUV: true });
  }
}
