import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Arredi modellati: spigoli arrotondati, cuscini morbidi, profili torniti per
// sanitari e lampade. Ogni pezzo si costruisce in coordinate locali (x verso
// destra, z verso chi guarda, y in alto) e poi si posa nella stanza con una
// posizione e una rotazione. Le linee del disegno sono il contorno di una
// scatola semplice, così in pianta l'arredo resta leggibile.

// chiave delle linee del disegno: 'f' arredi interni, 'e' esterni
let LINE = 'f';
export const lineKey = (k) => { LINE = k; };
// qualità: moltiplica le suddivisioni di spigoli arrotondati e torniti
let Q = 1;
export const setQuality = (q) => { Q = q; };

export class Piece {
  constructor(b, x, z, rot = 0, y = 0) {
    this.b = b;
    this.m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);
  }

  add(geo, mat, ownUV = false) {
    geo.applyMatrix4(this.m);
    this.b.geometry(geo, mat, { ownUV });
    return this;
  }

  // parallelepipedo arrotondato da (x0,y0,z0) a (x1,y1,z1), coordinate locali
  rbox(x0, y0, z0, x1, y1, z1, r, mat, { outline = true, seg = 3 } = {}) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const rr = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
    const g = new RoundedBoxGeometry(w, h, d, Math.round(seg * Q), Math.max(rr, 0.002));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(g, mat);
    if (outline) this.outline(x0, y0, z0, x1, y1, z1);
    return this;
  }

  box(x0, y0, z0, x1, y1, z1, mat, { outline = true } = {}) {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(g, mat);
    if (outline) this.outline(x0, y0, z0, x1, y1, z1);
    return this;
  }

  cyl(x, y0, z, r0, r1, y1, mat, seg = 24) {
    const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, Math.round(seg * Q));
    g.translate(x, (y0 + y1) / 2, z);
    return this.add(g, mat);
  }

  // profilo tornito: punti [r, y]; sx/sz allungano la forma (vasche, lavabi ovali)
  lathe(x, y, z, pts, mat, { sx = 1, sz = 1, seg = 40 } = {}) {
    const g = new THREE.LatheGeometry(pts.map(([r, yy]) => new THREE.Vector2(r, yy)), Math.round(seg * Q));
    g.scale(sx, 1, sz);
    g.translate(x, y, z);
    return this.add(g, mat);
  }

  tube(pts, r, mat, seg = 24) {
    const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    return this.add(new THREE.TubeGeometry(c, Math.round(seg * Q), r, Math.round(8 * Q), false), mat);
  }

  outline(x0, y0, z0, x1, y1, z1, key = LINE) {
    const P = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]
      .map((p) => new THREE.Vector3(...p).applyMatrix4(this.m).toArray());
    const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [i, j] of E) this.b.segment(key, P[i], P[j]);
    return this;
  }
}

const P = (b, x, z, rot, y) => new Piece(b, x, z, rot, y);

// ---------------------------------------------------------------- soggiorno

// modulo di divano: seduta profonda, schienale e braccioli opzionali.
// locale: larghezza w lungo x, profondità d lungo z (lo schienale sta a z=0)
export function sofaModule(b, x, z, rot, w, d, { back = true, armL = false, armR = false, mat = 'linenWhite|0' } = {}) {
  const p = P(b, x, z, rot);
  p.rbox(0.01, 0.05, 0.01, w - 0.01, 0.24, d - 0.01, 0.05, mat);
  p.rbox(0.02, 0.24, back ? 0.2 : 0.02, w - 0.02, 0.44, d - 0.02, 0.09, mat, { outline: false });
  if (back) p.rbox(0.02, 0.24, 0.0, w - 0.02, 0.74, 0.24, 0.1, mat, { outline: false });
  if (armL) p.rbox(0.0, 0.24, 0.0, 0.2, 0.6, d, 0.08, mat, { outline: false });
  if (armR) p.rbox(w - 0.2, 0.24, 0.0, w, 0.6, d, 0.08, mat, { outline: false });
  return p;
}

// mobile basso a listelli in noce (sotto la TV)
export function slatConsole(b, x, z, rot, w, d = 0.42, h = 0.42, y0 = 0.14) {
  const p = P(b, x, z, rot);
  p.box(0, y0, 0, w, y0 + h, d - 0.02, 'walnut|0');
  for (let u = 0.03; u < w - 0.03; u += 0.06) p.box(u, y0 + 0.02, d - 0.02, u + 0.035, y0 + h - 0.02, d, 'walnut|0', { outline: false });
  return p;
}

export function tv(b, x, z, rot, w = 1.45, h = 0.83, y0 = 1.0) {
  const p = P(b, x, z, rot);
  p.rbox(-w / 2, y0, 0, w / 2, y0 + h, 0.035, 0.01, 'screen|0');
  return p;
}

// tavolino a scatola aperta in rovere, come nella foto
export function openBoxTable(b, x, z, rot, w, d, h) {
  const p = P(b, x, z, rot);
  const t = 0.04;
  p.box(0, h - t, 0, w, h, d, 'oak|0');
  p.box(0, 0, 0, w, t, d, 'oak|0', { outline: false });
  p.box(0, 0, 0, t, h, d, 'oak|0', { outline: false });
  p.box(w - t, 0, 0, w, h, d, 'oak|0', { outline: false });
  return p;
}

export function coffeeTable(b, x, z, rot, w, d, h = 0.32) {
  const p = P(b, x, z, rot);
  p.rbox(0, h - 0.07, 0, w, h, d, 0.02, 'walnut|0');
  p.rbox(0.12, 0, 0.12, w - 0.12, h - 0.07, d - 0.12, 0.02, 'walnut|0', { outline: false });
  return p;
}

export function rug(b, x0, z0, x1, z1) {
  const p = P(b, 0, 0, 0);
  p.rbox(x0, 0.0, z0, x1, 0.014, z1, 0.006, 'rug|0', { seg: 1 });
}

// poltrona morbida a pozzetto
export function armchair(b, x, z, rot) {
  const p = P(b, x, z, rot);
  p.rbox(-0.42, 0.05, -0.4, 0.42, 0.38, 0.4, 0.12, 'linen|0');
  p.rbox(-0.4, 0.3, -0.4, 0.4, 0.74, -0.18, 0.1, 'linen|0', { outline: false });
  p.rbox(-0.42, 0.3, -0.4, -0.24, 0.6, 0.38, 0.08, 'linen|0', { outline: false });
  p.rbox(0.24, 0.3, -0.4, 0.42, 0.6, 0.38, 0.08, 'linen|0', { outline: false });
  return p;
}

// pianta in vaso: vaso in terracotta o pietra, foglie su cartoncini incrociati
export function pottedPlant(b, x, z, { h = 1.6, r = 0.26, pot = 'terracotta|0', leaves = 'leavesBroad|0', rnd = Math.random } = {}) {
  const p = P(b, x, z, rnd() * Math.PI);
  p.lathe(0, 0, 0, [[0, 0], [r * 0.75, 0], [r, r * 1.6], [r * 0.92, r * 1.62], [r * 0.85, r * 1.45], [0, r * 1.45]], pot, { seg: 28 });
  p.outline(-r, 0, -r, r, r * 1.6, r);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(h * 0.85, h);
    g.translate(0, r * 1.4 + h / 2, 0);
    g.rotateY((i / n) * Math.PI + rnd() * 0.3);
    p.add(g, leaves, true);
  }
  return p;
}

// ---------------------------------------------------------------- cucina e pranzo

// isola o banco monolitico in pietra; sink: lavello con rubinetto
export function stoneBlock(b, x0, z0, x1, z1, h = 0.92, { sink = null } = {}) {
  const p = P(b, 0, 0, 0);
  p.rbox(x0, 0, z0, x1, h, z1, 0.015, 'travStone|0');
  if (sink) {
    const [sx, sz] = sink;
    p.box(sx - 0.3, h - 0.004, sz - 0.2, sx + 0.3, h + 0.001, sz + 0.2, 'metal|0', { outline: false });
    p.cyl(sx, h, sz - 0.26, 0.018, 0.018, h + 0.32, 'chrome|0', 12);
    p.tube([[sx, h + 0.32, sz - 0.26], [sx, h + 0.4, sz - 0.18], [sx, h + 0.3, sz - 0.05]], 0.012, 'chrome|0', 12);
  }
  return p;
}

// colonne a tutta altezza laccate, ante a filo con fughe sottili
export function tallUnits(b, x0, z0, x1, z1, h, faceZ) {
  const p = P(b, 0, 0, 0);
  p.box(x0, 0, z0, x1, h, z1, 'lacquer|0');
  for (let x = x0 + 0.6; x < x1 - 0.1; x += 0.6) b.segment('f', [x, 0.06, faceZ], [x, h - 0.02, faceZ]);
  b.segment('f', [x0, 0.08, faceZ], [x1, 0.08, faceZ]);
  return p;
}

export function roundTable(b, x, z, r = 0.65, top = 'lacquer|0') {
  const p = P(b, x, z, 0);
  p.cyl(0, 0.72, 0, r, r, 0.75, top, 48);
  p.lathe(0, 0, 0, [[0, 0], [0.32, 0], [0.3, 0.03], [0.1, 0.25], [0.07, 0.72], [0, 0.72]], top, { seg: 32 });
  p.outline(-r, 0, -r, r, 0.75, r);
  return p;
}

export function oakTable(b, x0, z0, x1, z1) {
  const p = P(b, 0, 0, 0);
  p.rbox(x0, 0.71, z0, x1, 0.76, z1, 0.02, 'oak|0');
  for (const [lx, lz] of [[x0 + 0.12, z0 + 0.12], [x1 - 0.12, z0 + 0.12], [x0 + 0.12, z1 - 0.12], [x1 - 0.12, z1 - 0.12]]) {
    p.cyl(lx, 0, lz, 0.03, 0.035, 0.71, 'oak|0', 12);
  }
  return p;
}

// sedia in legno a guscio, schienale curvo; rot: verso cui guarda chi siede
export function woodChair(b, x, z, rot, mat = 'oak|0') {
  const p = P(b, x, z, rot);
  p.rbox(-0.23, 0.43, -0.22, 0.23, 0.47, 0.22, 0.02, mat);
  for (const [lx, lz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) p.cyl(lx, 0, lz, 0.018, 0.022, 0.43, mat, 10);
  // schienale: spicchio di cilindro dietro la seduta
  const g = new THREE.CylinderGeometry(0.27, 0.25, 0.3, 24, 1, true, Math.PI * 0.62, Math.PI * 0.76);
  g.translate(0, 0.66, 0.02);
  p.add(g, mat);
  p.outline(-0.25, 0, -0.22, 0.25, 0.8, 0.26);
  return p;
}

export function stool(b, x, z, mat = 'oak|0') {
  const p = P(b, x, z, 0);
  p.cyl(0, 0.62, 0, 0.18, 0.18, 0.66, mat, 24);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    p.tube([[Math.cos(a) * 0.12, 0.62, Math.sin(a) * 0.12], [Math.cos(a) * 0.19, 0, Math.sin(a) * 0.19]], 0.014, 'black|0', 4);
  }
  p.outline(-0.18, 0, -0.18, 0.18, 0.66, 0.18);
  return p;
}

export function pendant(b, x, z, y = 1.6, r = 0.2) {
  const p = P(b, x, z, 0);
  p.cyl(0, y + 0.1, 0, 0.004, 0.004, 3.0, 'black|0', 6);
  p.lathe(0, y, 0, [[0.03, 0.1], [r * 0.6, 0.08], [r * 0.95, 0.02], [r, 0], [r * 0.98, -0.005]], 'linenWhite|0', { seg: 32 });
  return p;
}

// ---------------------------------------------------------------- camere

// letto con testata imbottita; la testata sta a z=0, il letto va verso +z
export function bed(b, x, z, rot, w = 1.8, l = 2.05) {
  const p = P(b, x, z, rot);
  p.rbox(0, 0.06, 0.06, w, 0.34, l, 0.04, 'linen|0');
  p.rbox(-0.04, 0.0, 0, w + 0.04, 1.1, 0.1, 0.05, 'linen|0', { outline: false });
  p.rbox(0.03, 0.34, 0.1, w - 0.03, 0.56, l - 0.03, 0.08, 'linenWhite|0', { outline: false });
  // piumino che ricade sui lati
  p.rbox(-0.02, 0.4, 0.75, w + 0.02, 0.6, l + 0.02, 0.07, 'linenWhite|0', { outline: false });
  p.rbox(-0.03, 0.5, l - 0.55, w + 0.03, 0.63, l - 0.1, 0.05, 'linenDark|0', { outline: false });
  const pw = w / 2 - 0.12;
  p.rbox(0.08, 0.56, 0.14, 0.08 + pw, 0.72, 0.5, 0.07, 'linenWhite|0', { outline: false });
  p.rbox(w - 0.08 - pw, 0.56, 0.14, w - 0.08, 0.72, 0.5, 0.07, 'linenWhite|0', { outline: false });
  return p;
}

export function nightstand(b, x, z, rot, lamp = true) {
  const p = P(b, x, z, rot);
  p.rbox(-0.24, 0.18, 0, 0.24, 0.5, 0.4, 0.03, 'walnut|0');
  if (lamp) {
    p.cyl(0, 0.5, 0.2, 0.06, 0.05, 0.62, 'travStone|0', 16);
    p.lathe(0, 0.62, 0.2, [[0.05, 0.22], [0.11, 0.2], [0.14, 0.02], [0.13, 0]], 'linenWhite|0', { seg: 24 });
  }
  return p;
}

// ---------------------------------------------------------------- bagni

// wc o bidet sospeso: forma a uovo; si appoggia al muro a z=0 e sporge verso +z
export function wc(b, x, z, rot, bidet = false) {
  const p = P(b, x, z, rot);
  p.rbox(-0.18, 0.22, 0, 0.18, 0.4, 0.2, 0.06, 'ceramic|0');
  p.lathe(0, 0.22, 0.32, [[0, 0], [0.12, 0], [0.17, 0.06], [0.18, 0.18], [0.16, 0.19], [0.12, 0.16], [0, 0.14]], 'ceramic|0', { sx: 1, sz: 1.3, seg: 32 });
  if (!bidet) p.lathe(0, 0.41, 0.32, [[0, 0.02], [0.17, 0.02], [0.18, 0], [0, 0]], 'ceramic|0', { sx: 1, sz: 1.3, seg: 32 });
  else p.cyl(0, 0.41, 0.06, 0.012, 0.012, 0.5, 'chrome|0', 10);
  p.box(-0.25, 0.9, -0.01, 0.25, 1.06, 0.0, 'ceramic|0', { outline: false });
  p.outline(-0.18, 0.22, 0, 0.18, 0.42, 0.55);
  return p;
}

// mobile sospeso in noce con piano in pietra, lavabi d'appoggio e specchio;
// il muro sta a z=0, il mobile sporge verso +z
export function vanity(b, x, z, rot, w, basins = 1) {
  const p = P(b, x, z, rot);
  p.rbox(0, 0.35, 0, w, 0.78, 0.5, 0.015, 'walnut|0');
  p.rbox(0, 0.78, 0, w, 0.82, 0.52, 0.01, 'travStone|0', { outline: false });
  for (let k = 0; k < basins; k++) {
    const cx = (w / (basins + 1)) * (k + 1);
    p.lathe(cx, 0.82, 0.27, [[0, 0], [0.13, 0], [0.19, 0.06], [0.2, 0.14], [0.185, 0.145], [0.17, 0.08], [0.1, 0.03], [0, 0.03]], 'ceramic|0', { sx: 1.25, sz: 1, seg: 32 });
    p.tube([[cx, 1.1, 0.0], [cx, 1.12, 0.12], [cx, 1.05, 0.2]], 0.012, 'chrome|0', 10);
    p.rbox(cx - 0.35, 1.25, 0.0, cx + 0.35, 2.05, 0.02, 0.01, 'chrome|0', { outline: false });
  }
  return p;
}

// vasca da bagno libera, ovale
export function bathtub(b, x, z, rot, l = 1.7, w = 0.8) {
  const p = P(b, x, z, rot);
  const R = 0.5;
  p.lathe(0, 0, 0, [[0, 0], [R * 0.78, 0], [R * 0.95, 0.12], [R, 0.56], [R * 0.93, 0.58], [R * 0.86, 0.2], [R * 0.6, 0.1], [0, 0.1]], 'ceramic|0', { sx: l / (2 * R), sz: w / (2 * R), seg: 48 });
  p.cyl(l / 2 - 0.1, 0, 0.45, 0.015, 0.015, 0.95, 'chrome|0', 10);
  p.outline(-l / 2, 0, -w / 2, l / 2, 0.58, w / 2);
  return p;
}

// soffione della doccia a soffitto
export function rainShower(b, x, z) {
  const p = P(b, x, z, 0);
  p.cyl(0, 2.2, 0, 0.015, 0.015, 3.0, 'chrome|0', 8);
  p.cyl(0, 2.18, 0, 0.15, 0.15, 2.2, 'chrome|0', 32);
  return p;
}

// ---------------------------------------------------------------- servizi

export function washer(b, x, z, rot, y0 = 0) {
  const p = P(b, x, z, rot, y0);
  p.rbox(-0.3, 0, 0, 0.3, 0.85, 0.6, 0.03, 'ceramic|0');
  const ring = new THREE.TorusGeometry(0.17, 0.025, 10, 32);
  ring.translate(0, 0.45, 0.6);
  p.add(ring, 'chrome|0');
  const glass = new THREE.CircleGeometry(0.16, 32);
  glass.translate(0, 0.45, 0.605);
  p.add(glass, 'screen|0');
  return p;
}
