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

  // lavanda davanti al portico
  const lav = rand(11);
  for (let x = 0.8; x < variant.portico.x1 - 0.6; x += 0.62) {
    for (const z of [28.6, 29.3]) {
      const g = new THREE.IcosahedronGeometry(0.34 + lav() * 0.08, 1);
      g.scale(1, 0.75, 1);
      g.translate(x + (lav() - 0.5) * 0.15, 0.2, z + (lav() - 0.5) * 0.15);
      b.geometry(g, 'lavender|1');
    }
  }


  // pianta in vaso sul portico est
  for (const z of [7.6]) {
    const pot = new THREE.CylinderGeometry(0.32, 0.26, 0.6, 18);
    pot.translate(12.3, 0.3, z);
    b.geometry(pot, 'stone|1', { lines: 'e', threshold: 50 });
    const g = new THREE.IcosahedronGeometry(0.45, 1);
    g.translate(12.3, 0.95, z);
    b.geometry(g, 'leaves|1');
  }

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

function olive(b, t, rnd) {
  // tronco: tre rami che si aprono da un fusto basso e contorto
  const base = new THREE.Vector3(t.x, 0, t.z);
  const trunkTop = new THREE.Vector3(t.x + (rnd() - 0.5) * 0.4, t.h * 0.38, t.z + (rnd() - 0.5) * 0.4);
  const limb = (a, c, r0, r1) => {
    const dir = new THREE.Vector3().subVectors(c, a);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, 7, 1);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    g.applyQuaternion(q);
    g.translate(a.x, a.y, a.z);
    b.geometry(g, 'bark|1');
  };
  limb(base, trunkTop, 0.24, 0.17);
  const tips = [];
  for (let k = 0; k < 3; k++) {
    const ang = k * 2.1 + rnd();
    const tip = new THREE.Vector3(
      t.x + Math.cos(ang) * t.r * 0.45,
      t.h * (0.62 + rnd() * 0.12),
      t.z + Math.sin(ang) * t.r * 0.45);
    limb(trunkTop, tip, 0.13, 0.06);
    tips.push(tip);
  }
  // chioma: grappoli di sfere grigio-verdi
  for (let k = 0; k < 11; k++) {
    const tip = tips[k % 3];
    const s = t.r * (0.36 + rnd() * 0.2);
    const g = new THREE.IcosahedronGeometry(s, 1);
    g.scale(1, 0.62, 1);
    g.translate(
      tip.x + (rnd() - 0.5) * t.r * 0.9,
      tip.y + (rnd() - 0.2) * t.h * 0.18,
      tip.z + (rnd() - 0.5) * t.r * 0.9);
    b.geometry(g, 'leaves|1');
  }
}
