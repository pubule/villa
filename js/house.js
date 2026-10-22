import * as THREE from 'three';
import { Batch } from './builder.js';
import { H } from './plans.js';

// Costruisce la casa di una variante: muri in pietra fuori e intonaco dentro,
// pavimenti, serramenti, tetto verde, pergolato, arredi.

const FLOOR_MAT = { stone: 'floor|0', oak: 'oakfloor|0', garage: 'garage|0' };
const WALL_IN = { bagno: 'botticino|0', bagno2: 'botticino|0', garage: 'plaster|0' };

export function buildHouse(variant, materials, parent) {
  const b = new Batch(materials);
  const rooms = variant.rooms;

  const roomAt = (x, z) => {
    for (const r of rooms) {
      for (const q of r.rects) if (x > q[0] && x < q[2] && z > q[1] && z < q[3]) return r;
    }
    return null;
  };

  // facce dei muri: dentro intonaco (o pietra botticino nei bagni), fuori pietra
  // dentro l'ingombro del tetto (portico est escluso) vuol dire spalle di porte e finestre
  const inFootprint = (x, z) => variant.roofs.some((q) => x > q[0] && x < q[2] && z > q[1] && z < q[3])
    && !(x > 10.376 && z > 6.849 && z < 16.087)
    && !(x > 1.448 && x < 5.101 && z > 20.523) && !(x >= 5.101 && z > 21.319);
  const wallMat = (n, p) => {
    if (n[1] !== 0) return 'stone|1';
    const r = roomAt(p[0], p[2]);
    if (!r) return inFootprint(p[0], p[2]) ? 'plaster|0' : 'stone|1';
    return WALL_IN[r.id] || 'plaster|0';
  };

  // ---- muri
  // la base sta 5 mm sopra il solaio: vista dall'alto è il "pieno" della sezione
  for (const w of variant.walls) b.box(w[0], -0.035, w[1], w[2], H, w[3], wallMat, { lines: 'b' });

  // ---- aperture
  for (const o of variant.openings) {
    const [x0, z0, x1, z1] = o.r;
    const alongX = (x1 - x0) > (z1 - z0);
    if (o.sill > 0) b.box(x0, -0.035, z0, x1, o.sill, z1, wallMat, { lines: 'b' });
    b.box(x0, o.head, z0, x1, H, z1, wallMat, { lines: 'b' });
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const ft = 0.05; // telaio
    const pane = (y0, y1) => {
      if (alongX) {
        b.box(x0, y0, mz - 0.01, x1, y1, mz + 0.01, 'glass|2', { edges: false });
        b.box(x0, y0, mz - 0.035, x0 + ft, y1, mz + 0.035, 'metal|2', { lines: 'b' });
        b.box(x1 - ft, y0, mz - 0.035, x1, y1, mz + 0.035, 'metal|2', { lines: 'b' });
        b.box(x0, y0, mz - 0.035, x1, y0 + ft, mz + 0.035, 'metal|2', { edges: false });
        b.box(x0, y1 - ft, mz - 0.035, x1, y1, mz + 0.035, 'metal|2', { edges: false });
        if (x1 - x0 > 1.8) b.box(mx - 0.025, y0, mz - 0.035, mx + 0.025, y1, mz + 0.035, 'metal|2', { lines: 'b' });
      } else {
        b.box(mx - 0.01, y0, z0, mx + 0.01, y1, z1, 'glass|2', { edges: false });
        b.box(mx - 0.035, y0, z0, mx + 0.035, y1, z0 + ft, 'metal|2', { lines: 'b' });
        b.box(mx - 0.035, y0, z1 - ft, mx + 0.035, y1, z1, 'metal|2', { lines: 'b' });
        b.box(mx - 0.035, y0, z0, mx + 0.035, y0 + ft, z1, 'metal|2', { edges: false });
        b.box(mx - 0.035, y1 - ft, z0, mx + 0.035, y1, z1, 'metal|2', { edges: false });
        if (z1 - z0 > 1.8) b.box(mx - 0.035, y0, mz - 0.025, mx + 0.035, y1, mz + 0.025, 'metal|2', { lines: 'b' });
      }
    };
    if (o.kind === 'window' || o.kind === 'glass') pane(Math.max(o.sill, 0), o.head);
    if (o.kind === 'garage') {
      // portone sezionale in legno, filo esterno
      b.box(x0, 0, z0 + 0.04, x1, o.head, z0 + 0.1, 'timber|1', { lines: 'e' });
      for (let y = 0.52; y < o.head; y += 0.52) b.segment('e', [x0, y, z0 + 0.035], [x1, y, z0 + 0.035]);
    }
    if (o.kind === 'door' || o.kind === 'panel') {
      if (alongX) b.box(x0, 0, mz - 0.03, x1, o.head, mz + 0.03, 'walnut|2', { lines: 'b' });
      else b.box(mx - 0.03, 0, z0, mx + 0.03, o.head, z1, 'walnut|2', { lines: 'b' });
    }
    if (o.kind === 'entry') {
      // porta a bilico in noce, aperta verso il soggiorno
      b.box(x1 + 0.02, 0, z1 - 0.07, x1 + 1.02, o.head - 0.02, z1 - 0.01, 'walnut|2', { lines: 'b' });
      b.box(x0 - 0.06, 0, z0, x0, 0.02, z1, 'botticino|2', { edges: false });
    }
  }

  // ---- pavimenti
  for (const r of variant.roofs) b.box(r[0], -0.34, r[1], r[2], -0.04, r[3], 'floor|2', { edges: false });
  for (const room of rooms) {
    const m = room.id === 'deposito' ? null : FLOOR_MAT[room.floor];
    if (!m) continue;
    for (const q of room.rects) b.box(q[0], -0.3, q[1], q[2], 0, q[3], m, { edges: false });
  }
  // portico est e portico sud
  const px1 = variant.portico.x1;
  b.box(10.376, -0.3, 6.849, 12.996, -0.01, 16.087, 'paving|1', { lines: 'e' });
  b.box(0, -0.3, 20.523, 5.101, -0.01, 26.09, 'paving|1', { lines: 'e' });
  b.box(5.101, -0.3, 21.319, px1, -0.01, 26.09, 'paving|1', { lines: 'e' });
  // gradino davanti al portico
  b.box(-0.2, -0.3, 26.09, px1 + 0.2, -0.16, 26.6, 'paving|1', { lines: 'e' });

  // ---- tetto verde: lastra con bordo in pietra, intradosso in intonaco
  const roofMat = (n, p) => {
    if (n[1] > 0) return 'roofgreen|1';
    if (n[1] < 0) return roomAt(p[0], p[2]) ? 'ceiling|0' : 'plaster|1';
    return 'stone|1';
  };
  for (const r of variant.roofs) b.box(r[0], H, r[1], r[2], H + 0.42, r[3], roofMat, { lines: 'e' });
  // cordolo in pietra lungo il perimetro del tetto
  const coping = [[0.301, 0, 11.159, 0.25], [0, 4.153, 0.25, 23.169], [12.746, 4.153, 12.996, 21.319], [0.301, 0, 0.55, 4.153], [10.909, 0, 11.159, 4.153]];
  for (const c of coping) b.box(c[0], H + 0.42, c[1], c[2], H + 0.52, c[3], 'stone|1', { lines: 'e' });

  // ---- pergolato del portico sud: travi in pietra e lamelle in legno
  b.box(0, 2.72, 25.70, px1, H + 0.2, 26.09, 'stone|1', { lines: 'e' });
  b.box(0, 2.72, 23.169, 0.38, H + 0.2, 25.70, 'stone|1', { lines: 'e' });
  b.box(px1 - 0.38, 2.72, 21.319, px1, H + 0.2, 25.70, 'stone|1', { lines: 'e' });
  for (let x = 1.75; x < px1 - 0.5; x += 0.42) {
    const zStart = x < 5.101 ? 20.523 : 21.319;
    b.box(x, H - 0.12, zStart, x + 0.07, H + 0.2, 25.70, 'timber|1', { lines: 'e' });
  }
  b.box(1.448, H - 0.24, 23.0, px1 - 0.38, H - 0.12, 23.14, 'timber|1', { lines: 'e' });

  // ---- arredi
  furnish(b, variant);

  const objs = b.build(parent);
  return { objs, roomAt };
}

function legs(b, x0, z0, x1, z1, h, mat, t = 0.05, lines = 'f') {
  b.box(x0, 0, z0, x0 + t, h, z0 + t, mat, { lines });
  b.box(x1 - t, 0, z0, x1, h, z0 + t, mat, { lines });
  b.box(x0, 0, z1 - t, x0 + t, h, z1, mat, { lines });
  b.box(x1 - t, 0, z1 - t, x1, h, z1, mat, { lines });
}

function table(b, x0, z0, x1, z1, mode = 0) {
  const top = mode ? 'timber|1' : 'oak|0';
  const leg = mode ? 'metal|1' : 'walnut|0';
  const L = mode ? 'e' : 'f';
  b.box(x0, 0.72, z0, x1, 0.76, z1, top, { lines: L });
  legs(b, x0 + 0.08, z0 + 0.08, x1 - 0.08, z1 - 0.08, 0.72, leg, 0.06, L);
}

// sedia orientata: (x,z) centro, dir verso cui guarda chi è seduto
function chair(b, x, z, dir, mode = 0) {
  const s = 0.23;
  const seat = mode ? 'timber|1' : 'linen|0';
  const L = mode ? 'e' : 'f';
  b.box(x - s, 0.42, z - s, x + s, 0.47, z + s, seat, { lines: L });
  legs(b, x - s + 0.02, z - s + 0.02, x + s - 0.02, z + s - 0.02, 0.42, mode ? 'metal|1' : 'walnut|0', 0.035, L);
  const back = mode ? 'timber|1' : 'walnut|0';
  if (dir === 'n') b.box(x - s, 0.47, z + s - 0.04, x + s, 0.86, z + s, back, { lines: L });
  if (dir === 's') b.box(x - s, 0.47, z - s, x + s, 0.86, z - s + 0.04, back, { lines: L });
  if (dir === 'e') b.box(x - s, 0.47, z - s, x - s + 0.04, 0.86, z + s, back, { lines: L });
  if (dir === 'w') b.box(x + s - 0.04, 0.47, z - s, x + s, 0.86, z + s, back, { lines: L });
}

function bed(b, x0, z0, x1, z1, headAt = 'n') {
  b.box(x0, 0.08, z0, x1, 0.32, z1, 'oak|0', { lines: 'f' });
  b.box(x0 + 0.03, 0.32, z0 + 0.03, x1 - 0.03, 0.56, z1 - 0.03, 'linenWhite|0', { lines: 'f' });
  if (headAt === 'n') {
    b.box(x0 + 0.1, 0.56, z0 + 0.08, (x0 + x1) / 2 - 0.05, 0.7, z0 + 0.55, 'linenWhite|0', { lines: 'f' });
    b.box((x0 + x1) / 2 + 0.05, 0.56, z0 + 0.08, x1 - 0.1, 0.7, z0 + 0.55, 'linenWhite|0', { lines: 'f' });
    b.box(x0 - 0.02, 0.5, z1 - 0.6, x1 + 0.02, 0.6, z1 - 0.1, 'linenDark|0', { lines: 'f' });
  }
}

function counter(b, x0, z0, x1, z1, h = 0.9) {
  b.box(x0, 0.08, z0, x1, h - 0.04, z1, 'oak|0', { lines: 'f' });
  b.box(x0, 0, z0 + 0.05, x1, 0.08, z1 - 0.05, 'black|0', { edges: false });
  b.box(x0 - 0.01, h - 0.04, z0 - 0.01, x1 + 0.01, h, z1 + 0.01, 'botticino|0', { lines: 'f' });
}

function sanitary(b, x, z, along = 'z') {
  // wc o bidet sospeso, 0.38 x 0.55
  if (along === 'z') b.box(x - 0.19, 0.2, z, x + 0.19, 0.42, z + 0.55, 'ceramic|0', { lines: 'f' });
  else b.box(x, 0.2, z - 0.19, x + 0.55, 0.42, z + 0.19, 'ceramic|0', { lines: 'f' });
}

function furnish(b, v) {
  const A = v.id === 'a';

  // --- soggiorno: parete in legno a listelli che nasconde la TV, divano a L
  b.box(0.453, 0, 15.3, 0.98, 0.42, 19.9, 'oak|0', { lines: 'f' });
  for (let z = 15.3; z < 18.2; z += 0.12) b.box(0.453, 0.42, z, 0.53, 2.75, z + 0.07, 'oak|0', { edges: false });
  b.box(0.453, 0.42, 15.3, 0.47, 2.75, 18.2, 'walnut|0', { lines: 'f' });
  b.box(0.54, 1.1, 15.95, 0.58, 1.85, 17.55, 'black|0', { lines: 'f' });

  const sx = A ? 0 : 0.2, sz = A ? 0 : -0.1;
  b.box(3.55 + sx, 0.1, 15.2 + sz, 4.62 + sx, 0.44, 18.4 + sz, 'linen|0', { lines: 'f' });
  b.box(4.32 + sx, 0.44, 15.2 + sz, 4.62 + sx, 0.82, 18.4 + sz, 'linen|0', { lines: 'f' });
  b.box(2.68 + sx, 0.1, 15.2 + sz, 3.55 + sx, 0.44, 16.1 + sz, 'linen|0', { lines: 'f' });
  b.box(2.68 + sx, 0.44, 15.2 + sz, 4.32 + sx, 0.82, 15.48 + sz, 'linen|0', { lines: 'f' });
  b.box(3.55 + sx, 0.44, 18.12 + sz, 4.32 + sx, 0.62, 18.4 + sz, 'linen|0', { lines: 'f' });
  for (const z of [15.7, 16.6, 17.5]) b.box(4.12 + sx, 0.44, z + sz, 4.3 + sx, 0.78, z + 0.7 + sz, 'linenDark|0', { edges: false });
  // tappeto e tavolino
  b.box(1.35, 0, 15.5, 4.75, 0.012, 18.9, 'linenDark|0', { lines: 'f' });
  b.box(1.85, 0.3, 16.4, 2.95, 0.36, 17.6, 'walnut|0', { lines: 'f' });
  b.box(1.95, 0, 16.5, 2.85, 0.3, 17.5, 'walnut|0', { edges: false });
  // poltrona
  b.box(1.4, 0.1, 18.95, 2.2, 0.44, 19.75, 'linenDark|0', { lines: 'f' });
  b.box(1.4, 0.44, 19.5, 2.2, 0.8, 19.75, 'linenDark|0', { lines: 'f' });

  // --- panca in pietra nella nicchia sud
  b.box(5.55, 0, 20.3, 7.0, 0.45, 20.87, 'botticino|0', { lines: 'f' });

  // --- cucina
  const tx = A ? 8.911 : 8.8;
  b.box(tx, 0, 16.535, 12.543, 2.45, 17.135, 'oak|0', { lines: 'f' });
  for (let x = tx + 0.6; x < 12.5; x += 0.6) b.segment('f', [x, 0.05, 17.137], [x, 2.4, 17.137]);
  const cx = A ? 11.9 : 11.75;
  counter(b, cx, 17.135, 12.543, 20.87);
  if (A) counter(b, 10.0, 18.0, 10.88, 20.1);

  // --- pranzo
  if (A) {
    table(b, 7.85, 18.2, 8.75, 19.93);
    chair(b, 7.5, 18.65, 'e'); chair(b, 7.5, 19.5, 'e');
    chair(b, 9.1, 18.65, 'w'); chair(b, 9.1, 19.5, 'w');
    chair(b, 8.3, 17.85, 's'); chair(b, 8.3, 20.3, 'n');
  } else {
    table(b, 8.4, 18.36, 10.4, 19.24);
    chair(b, 8.9, 18.0, 's'); chair(b, 9.9, 18.0, 's');
    chair(b, 8.9, 19.6, 'n'); chair(b, 9.9, 19.6, 'n');
    chair(b, 8.05, 18.8, 'e'); chair(b, 10.75, 18.8, 'w');
  }
  // lampade a sospensione
  const tcx = A ? 8.3 : 9.4, tcz = A ? 19.06 : 18.8;
  const lampPts = A ? [[tcx, tcz - 0.45], [tcx, tcz + 0.45]] : [[tcx - 0.5, tcz], [tcx + 0.5, tcz]];
  for (const [x, z] of lampPts) {
    b.box(x - 0.005, 1.75, z - 0.005, x + 0.005, H, z + 0.005, 'black|0', { edges: false });
    const g = new THREE.SphereGeometry(0.17, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    g.translate(x, 1.62, z);
    b.geometry(g, 'linenWhite|0', { lines: 'f', threshold: 40 });
  }

  // --- camera padronale: parete in legno dietro il letto
  b.box(5.927, 0, 9.025, 9.224, 2.9, 9.07, 'oak|0', { lines: 'f' });
  bed(b, 6.77, 9.07, 8.57, 11.1);
  b.box(6.2, 0.2, 9.07, 6.65, 0.5, 9.5, 'walnut|0', { lines: 'f' });
  b.box(8.69, 0.2, 9.07, 9.14, 0.5, 9.5, 'walnut|0', { lines: 'f' });
  b.box(6.6, 0, 11.4, 9.0, 0.012, 12.3, 'linen|0', { edges: false });

  // --- guardaroba
  b.box(5.927, 0, 6.849, 9.927, 2.7, 7.45, 'oak|0', { lines: 'f' });
  for (let x = 6.43; x < 9.9; x += 0.5) b.segment('f', [x, 0.05, 7.452], [x, 2.65, 7.452]);
  b.box(6.3, 0, 8.3, 9.0, 0.9, 8.85, 'oak|0', { lines: 'f' });

  // --- bagno grande
  counter(b, 1.0, 10.2, 3.6, 10.774, 0.85);
  sanitary(b, 0.75, 8.175); sanitary(b, 1.35, 8.175);
  b.box(2.532, 0, 8.175, 4.449, 0.04, 9.12, 'botticino|0', { lines: 'f' });
  b.box(2.532, 0.04, 9.08, 3.35, 2.1, 9.1, 'glass|0', { lines: 'f' });
  b.box(1.0, 1.05, 10.72, 3.6, 1.95, 10.774, 'glass|2', { lines: 'f' });

  // --- bagno padronale
  counter(b, 6.1, 12.772, 8.1, 13.3, 0.85);
  sanitary(b, 8.7, 12.772); sanitary(b, 9.3, 12.772);
  b.box(8.4, 0, 14.0, 9.927, 0.04, 14.842, 'botticino|0', { lines: 'f' });
  b.box(8.38, 0.04, 14.0, 8.4, 2.1, 14.75, 'glass|0', { lines: 'f' });

  // --- seconda camera
  bed(b, 1.65, 10.897, 3.25, 12.95);
  b.box(1.2, 0.2, 10.897, 1.58, 0.5, 11.3, 'walnut|0', { lines: 'f' });
  b.box(3.32, 0.2, 10.897, 3.7, 0.5, 11.3, 'walnut|0', { lines: 'f' });
  b.box(0.6, 0, 14.1, 3.7, 2.45, 14.698, 'oak|0', { lines: 'f' });

  // --- lavanderia
  counter(b, 0.453, 4.606, 1.1, 7.2);
  b.box(0.5, 0, 7.3, 1.1, 1.75, 7.95, 'ceramic|0', { lines: 'f' });
  b.box(3.0, 0, 4.606, 3.861, 2.2, 5.3, 'oak|0', { lines: 'f' });

  // --- cantina: scaffali
  for (const y of [0.4, 0.9, 1.4, 1.9]) b.box(0.601, y, 0.5, 1.05, y + 0.03, 4.2, 'timber|0', { lines: 'f' });
  b.box(0.601, 0, 0.5, 1.05, 2.2, 0.53, 'timber|0', { edges: false });
  b.box(0.601, 0, 4.17, 1.05, 2.2, 4.2, 'timber|0', { edges: false });

  // --- autorimessa: banco da lavoro
  b.box(3.514, 0, 0.8, 4.1, 0.9, 3.6, 'timber|0', { lines: 'f' });

  // --- portico sud: tavolo lungo e panche
  const [tx0, tz0, tx1, tz1] = v.portico.table;
  table(b, tx0, tz0, tx1, tz1, 1);
  b.box(tx0 + 0.2, 0.42, tz0 - 0.55, tx1 - 0.2, 0.46, tz0 - 0.2, 'timber|1', { lines: 'e' });
  legs(b, tx0 + 0.3, tz0 - 0.5, tx1 - 0.3, tz0 - 0.25, 0.42, 'metal|1', 0.05, 'e');
  for (let x = tx0 + 0.45; x < tx1 - 0.3; x += 0.9) chair(b, x, tz1 + 0.35, 'n', 1);

  // --- portico est: due sedute basse
  for (const z of [9.6, 12.6]) {
    b.box(11.2, 0.1, z, 12.0, 0.38, z + 0.8, 'timber|1', { lines: 'e' });
    b.box(11.2, 0.38, z + 0.1, 12.0, 0.48, z + 0.7, 'linen|1', { lines: 'e' });
    b.box(11.9, 0.38, z, 12.0, 0.75, z + 0.8, 'timber|1', { lines: 'e' });
  }
}
