import * as THREE from 'three';
import { TREES } from './nature.js';

// Il "foglio": nomi dei locali, superfici, quote e simboli disegnati su una
// texture stesa sul pavimento a pochi millimetri. Il resto della pianta è il
// modello 3D stesso, tagliato a 1,20 m.

const X0 = -7, Z0 = -9, W = 31, D = 44, PX = 96;

const DIMS = [
  // [x0, z0, x1, z1, testo, lato]  lato: dove sta il testo rispetto alla linea
  [-0.0, -1.6, 12.996, -1.6, '13,00', -1],
  [-1.6, 0, -1.6, 26.09, '26,09', -1],
  [3.514, 2.0, 10.863, 2.0, '7,35', -1],
  [0.601, 1.0, 3.306, 1.0, '2,70', -1],
  [9.6, 0.301, 9.6, 6.549, '6,25', -1],
  [0.453, 7.45, 3.861, 7.45, '3,40', -1],
  [0.453, 14.25, 4.449, 14.25, '4,00', -1],
  [0.95, 10.897, 0.95, 14.698, '3,80', 1],
  [5.927, 12.25, 9.927, 12.25, '4,00', -1],
  [9.5, 9.025, 9.5, 12.624, '3,60', -1],
  [0.453, 20.45, 5.55, 20.45, '5,10', -1],
  [5.55, 20.25, 12.543, 20.25, '7,00', -1],
  [7.05, 14.973, 7.05, 20.87, '5,90', 1],
  [4.9, 20.523, 4.9, 25.70, '5,20', 1],
  [0.7, 20.523, 0.7, 22.919, '2,40', 1],
];

export async function buildSheet(variant, rooms) {
  try { await document.fonts.load('italic 40px "Instrument Serif"'); await document.fonts.load('400 20px "Geist Mono"'); } catch (e) { /* font di sistema */ }
  const cv = document.createElement('canvas');
  cv.width = W * PX; cv.height = D * PX;
  const g = cv.getContext('2d');
  const P = (x, z) => [(x - X0) * PX, (z - Z0) * PX];
  const ink = '#24221f';
  g.strokeStyle = ink; g.fillStyle = ink;
  g.lineCap = 'round';

  // confine del lotto, tratteggiato
  g.save();
  g.setLineDash([0.5 * PX, 0.18 * PX, 0.06 * PX, 0.18 * PX]);
  g.lineWidth = 2.2;
  g.beginPath();
  variant.lot.forEach(([x, z], i) => { const [u, v] = P(x, z); i ? g.lineTo(u, v) : g.moveTo(u, v); });
  g.closePath(); g.stroke();
  g.restore();

  // proiezione del tetto e del pergolato, tratteggio fine
  g.save();
  g.setLineDash([0.22 * PX, 0.14 * PX]);
  g.lineWidth = 1.4;
  g.strokeStyle = 'rgba(36,34,31,0.55)';
  {
    const [u0, v0] = P(0, 20.523); const [u1, v1] = P(variant.portico.x1, 26.09);
    g.strokeRect(u0, v0, u1 - u0, v1 - v0);
    const [e0, f0] = P(10.376, 6.849); const [e1, f1] = P(12.996, 16.087);
    g.strokeRect(e0, f0, e1 - e0, f1 - f0);
  }
  g.restore();

  // chiome degli ulivi
  for (const t of TREES) {
    const [u, v] = P(t.x, t.z);
    g.lineWidth = 1.6;
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 24) {
      const rr = t.r * PX * (1 + 0.06 * Math.sin(a * 7 + t.x));
      const px = u + Math.cos(a) * rr, pz = v + Math.sin(a) * rr;
      a ? g.lineTo(px, pz) : g.moveTo(px, pz);
    }
    g.stroke();
    g.beginPath(); g.arc(u, v, 0.1 * PX, 0, Math.PI * 2); g.fill();
  }

  // nomi dei locali
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const label = (x, z, name, note) => {
    const [u, v] = P(x, z);
    g.font = `italic ${0.52 * PX}px "Instrument Serif", Georgia, serif`;
    g.fillText(name, u, v);
    if (note) {
      g.font = `400 ${0.22 * PX}px "Geist Mono", ui-monospace, monospace`;
      g.fillText(note.toUpperCase(), u, v + 0.36 * PX);
    }
  };
  for (const r of rooms) if (r.label) label(r.label[0], r.label[1], r.name, r.id === 'soggiorno' ? variant.livingArea : r.note);
  label(6.0, 22.35, 'Portico', variant.portico.area);
  label(11.7, 8.3, 'Portico', '');
  label(7.4, -3.4, 'Passo carraio', '');
  label(4.8, 31.1, 'Giardino', '');

  // ingresso: freccia
  {
    const [u, v] = P(13.6, 15.53);
    const [u2] = P(10.7, 15.53);
    g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(u, v); g.lineTo(u2, v); g.stroke();
    g.beginPath(); g.moveTo(u2, v); g.lineTo(u2 + 0.3 * PX, v - 0.15 * PX); g.lineTo(u2 + 0.3 * PX, v + 0.15 * PX); g.closePath(); g.fill();
    g.font = `400 ${0.22 * PX}px "Geist Mono", ui-monospace, monospace`;
    g.textAlign = 'left';
    g.fillText('INGRESSO', u - 0.1 * PX, v - 0.25 * PX);
    g.textAlign = 'center';
  }

  // quote
  g.font = `400 ${0.26 * PX}px "Geist Mono", ui-monospace, monospace`;
  g.lineWidth = 1.3;
  g.strokeStyle = '#3c6866';
  g.fillStyle = '#3c6866';
  for (const [x0, z0, x1, z1, txt, side] of DIMS) {
    const [u0, v0] = P(x0, z0), [u1, v1] = P(x1, z1);
    g.beginPath(); g.moveTo(u0, v0); g.lineTo(u1, v1); g.stroke();
    const tick = (u, v) => { g.beginPath(); g.moveTo(u - 0.1 * PX, v + 0.1 * PX); g.lineTo(u + 0.1 * PX, v - 0.1 * PX); g.stroke(); };
    tick(u0, v0); tick(u1, v1);
    const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
    g.save();
    g.translate(mu, mv);
    if (Math.abs(v1 - v0) > Math.abs(u1 - u0)) g.rotate(-Math.PI / 2);
    g.fillText(txt, 0, side < 0 ? -0.1 * PX : 0.3 * PX);
    g.restore();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const geo = new THREE.PlaneGeometry(W, D);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(X0 + W / 2, 0.015, Z0 + D / 2);
  mesh.renderOrder = 4;
  return mesh;
}
