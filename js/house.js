import * as THREE from 'three';
import { Batch } from './builder.js';
import { H } from './plans.js';
import * as F from './furniture.js';

// Costruisce la casa di una variante: muri in pietra fuori e intonaco dentro,
// pavimenti, serramenti, tetto a padiglione in coppi, pergolato, arredi.

const FLOOR_MAT = { stone: 'floor|0', oak: 'oakfloor|0', garage: 'garage|0' };
const WALL_IN = { bagno: 'botticino|0', bagno2: 'botticino|0', garage: 'plaster|0' };

export function buildHouse(variant, materials, parent, opts = {}) {
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
  // fuori: intonaco bianco burro; pietra solo in qualche dettaglio
  // (il portico d'ingresso a est, il deposito, i pilastri del portico sud)
  const stoneAt = (x, z) => (x > 9.9 && z > 6.849 && z < 16.2)
    || (x < 1.5 && z > 20.4)
    || z > 24.7;
  const outMat = (p) => (stoneAt(p[0], p[2]) ? 'ashlar|1' : 'render|1');
  const wallMat = (n, p) => {
    if (n[1] !== 0) return outMat(p);
    const r = roomAt(p[0], p[2]);
    if (!r) return inFootprint(p[0], p[2]) ? 'plaster|0' : outMat(p);
    return WALL_IN[r.id] || 'plaster|0';
  };

  // ---- muri
  // la base sta 5 mm sopra il solaio: vista dall'alto è il "pieno" della sezione
  const solid = variant.walls.map((w) => ({ r: w, y: [-0.035, H] }));

  // ---- aperture
  for (const o of variant.openings) {
    const [x0, z0, x1, z1] = o.r;
    const alongX = (x1 - x0) > (z1 - z0);
    if (o.sill > 0) solid.push({ r: o.r, y: [-0.035, o.sill] });
    solid.push({ r: o.r, y: [o.head, H] });
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
    // porte lasciate aperte, così si entra in tutti i locali
    if (o.kind === 'door') {
      // anta in noce aperta a 90° verso l'esterno
      if (alongX) b.box(x0 + 0.02, 0, z1 + 0.01, x0 + 0.07, o.head - 0.02, z1 + 0.01 + (x1 - x0) - 0.04, 'walnut|2', { lines: 'b' });
      else b.box(x1 + 0.01, 0, z0 + 0.02, x1 + 0.01 + (z1 - z0) - 0.04, o.head - 0.02, z0 + 0.07, 'walnut|2', { lines: 'b' });
    }
    if (o.kind === 'panel') {
      // pannello scorrevole raccolto contro il muro
      if (alongX) b.box(x1 - 0.12, 0, z1 + 0.01, x1 - 0.06, o.head - 0.02, z1 + 0.07, 'walnut|2', { lines: 'b' });
      else b.box(x1 + 0.01, 0, z1 - 0.12, x1 + 0.07, o.head - 0.02, z1 - 0.02, 'walnut|2', { lines: 'b' });
    }
    if (o.kind === 'entry') {
      // porta a bilico in noce, aperta verso il soggiorno
      b.box(x1 + 0.02, 0, z1 - 0.07, x1 + 1.02, o.head - 0.02, z1 - 0.01, 'walnut|2', { lines: 'b' });
      b.box(x0 - 0.06, 0, z0, x0, 0.02, z1, 'botticino|2', { edges: false });
    }
  }

  b.solids(solid, wallMat, 'b');

  // ---- pavimenti
  for (const r of variant.roofs) b.box(r[0], -0.34, r[1], r[2], -0.04, r[3], 'floor|2', { edges: false });
  for (const room of rooms) {
    const m = room.id === 'deposito' ? null : FLOOR_MAT[room.floor];
    if (!m) continue;
    // solo la faccia di sopra: i fianchi coinciderebbero con le facce dei muri
    for (const q of room.rects) b.box(q[0], -0.3, q[1], q[2], 0, q[3], (n) => (n[1] > 0 ? m : null), { edges: false });
  }
  // portico est e portico sud
  const px1 = variant.portico.x1;
  b.box(10.376, -0.3, 6.849, 12.996, -0.01, 16.087, 'paving|1', { lines: 'e' });
  b.box(0, -0.3, 20.523, 5.101, -0.01, 26.09, 'paving|1', { lines: 'e' });
  b.box(5.101, -0.3, 21.319, px1, -0.01, 26.09, 'paving|1', { lines: 'e' });
  // gradino davanti al portico
  b.box(-0.2, -0.3, 26.09, px1 + 0.2, -0.16, 26.6, 'paving|1', { lines: 'e' });


  // ---- coperture: solaio (il soffitto delle stanze), tetti a padiglione in
  // coppi e pergolato. Stanno in un
  // gruppo a parte, che scende dall'alto quando la camera si avvicina.
  const rb = new Batch(materials);
  rb.lineTag = 'r';
  const slabMat = (n, p) => {
    if (n[1] > 0) return 'plaster|1|r';
    if (n[1] < 0) return roomAt(p[0], p[2]) ? 'ceiling|0|r' : 'plaster|1|r';
    return 'render|1|r';
  };
  for (const r of variant.roofs) rb.box(r[0], H, r[1], r[2], H + 0.42, r[3], slabMat, { lines: 'e' });
  for (const r of variant.hips) hipRoof(rb, r, H + 0.42, 21, 0.55);
  rb.box(0, 2.72, 25.70, px1, H + 0.2, 26.09, 'ashlar|1|r', { lines: 'e' });
  rb.box(0, 2.72, 23.169, 0.38, H + 0.2, 25.70, 'ashlar|1|r', { lines: 'e' });
  rb.box(px1 - 0.38, 2.72, 21.319, px1, H + 0.2, 25.70, 'ashlar|1|r', { lines: 'e' });
  for (let x = 1.75; x < px1 - 0.5; x += 0.42) {
    const zStart = x < 5.101 ? 20.523 : 21.319;
    rb.box(x, H - 0.12, zStart, x + 0.07, H + 0.2, 25.70, 'timber|1|r', { lines: 'e' });
  }
  rb.box(1.448, H - 0.24, 23.0, px1 - 0.38, H - 0.12, 23.14, 'timber|1|r', { lines: 'e' });
  const roofGroup = new THREE.Group();
  rb.build(roofGroup);
  parent.add(roofGroup);

  // ---- arredi
  furnish(b, variant, opts);

  const objs = b.build(parent);
  return { objs, roomAt, roofGroup };
}

// Tetto a padiglione su un rettangolo [x0,z0,x1,z1]: colmo lungo il lato
// lungo, falde inclinate di "pitch" gradi, gronda sporgente di "over" metri.
function hipRoof(b, [x0, z0, x1, z1], y, pitch, over) {
  x0 -= over; z0 -= over; x1 += over; z1 += over;
  const t = Math.tan(pitch * Math.PI / 180);
  const alongX = (x1 - x0) >= (z1 - z0);
  const half = (alongX ? z1 - z0 : x1 - x0) / 2;
  const h = half * t;
  const k = 1 / Math.cos(pitch * Math.PI / 180);
  const P = (x, z, yy) => [x, yy, z];
  let faces;
  if (alongX) {
    const zc = (z0 + z1) / 2, ra = P(x0 + half, zc, y + h), rbb = P(x1 - half, zc, y + h);
    faces = [
      { pts: [P(x0, z1, y), P(x1, z1, y), rbb, ra], e: [1, 0], s: [0, -1] },
      { pts: [P(x1, z0, y), P(x0, z0, y), ra, rbb], e: [-1, 0], s: [0, 1] },
      { pts: [P(x0, z0, y), P(x0, z1, y), ra], e: [0, 1], s: [1, 0] },
      { pts: [P(x1, z1, y), P(x1, z0, y), rbb], e: [0, -1], s: [-1, 0] },
    ];
  } else {
    const xc = (x0 + x1) / 2, ra = P(xc, z0 + half, y + h), rbb = P(xc, z1 - half, y + h);
    faces = [
      { pts: [P(x1, z1, y), P(x1, z0, y), ra, rbb], e: [0, -1], s: [-1, 0] },
      { pts: [P(x0, z0, y), P(x0, z1, y), rbb, ra], e: [0, 1], s: [1, 0] },
      { pts: [P(x1, z0, y), P(x0, z0, y), ra], e: [-1, 0], s: [0, 1] },
      { pts: [P(x0, z1, y), P(x1, z1, y), rbb], e: [1, 0], s: [0, -1] },
    ];
  }
  for (const f of faces) {
    const uv = f.pts.map((p) => [p[0] * f.e[0] + p[2] * f.e[1], (p[0] * f.s[0] + p[2] * f.s[1]) * k]);
    b.poly('roof|1|r', f.pts, uv);
    for (let i = 0; i < f.pts.length; i++) b.segment('e', f.pts[i], f.pts[(i + 1) % f.pts.length]);
  }
  // sottogronda in legno e fascia di bordo
  b.box(x0, y - 0.14, z0, x1, y, z1, (n) => (n[1] > 0 ? null : n[1] < 0 ? 'timber|1|r' : 'plaster|1|r'), { lines: 'e' });
}

function legs(b, x0, z0, x1, z1, h, mat, t = 0.05, lines = 'f') {
  b.box(x0, 0, z0, x0 + t, h, z0 + t, mat, { lines });
  b.box(x1 - t, 0, z0, x1, h, z0 + t, mat, { lines });
  b.box(x0, 0, z1 - t, x0 + t, h, z1, mat, { lines });
  b.box(x1 - t, 0, z1 - t, x1, h, z1, mat, { lines });
}

function counter(b, x0, z0, x1, z1, h = 0.9) {
  b.box(x0, 0.08, z0, x1, h - 0.04, z1, 'lacquer|0', { lines: 'f' });
  b.box(x0, 0, z0 + 0.05, x1, 0.08, z1 - 0.05, 'black|0', { edges: false });
  b.box(x0 - 0.01, h - 0.04, z0 - 0.01, x1 + 0.01, h, z1 + 0.01, 'travStone|0', { lines: 'f' });
}

// sedia rivolta verso un punto
const facing = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

function furnish(b, v, opts = {}) {
  const A = v.id === 'a';
  const feature = opts.featureStone || 'stoneIn|0';
  const rnd = rand(21);

  // --- soggiorno: parete in pietra a vista, mobile a listelli e TV
  const SW = [0.453, 0.5];
  if (A) {
    b.box(SW[0], 0, 14.973, SW[1], H - 0.01, 18.284, feature, { lines: 'f' });
    b.box(SW[0], 0, 19.126, SW[1], H - 0.01, 20.074, feature, { lines: 'f' });
    b.box(SW[0], 0, 18.284, SW[1], 0.5, 19.126, feature, { lines: 'f' });
    b.box(SW[0], 2.5, 18.284, SW[1], H - 0.01, 19.126, feature, { lines: 'f' });
  } else {
    b.box(SW[0], 0, 14.973, SW[1], H - 0.01, 20.074, feature, { lines: 'f' });
  }
  F.slatConsole(b, SW[1], 18.0, Math.PI / 2, 2.4);
  F.tv(b, SW[1] + 0.02, 16.8, Math.PI / 2);
  // divano modulare bianco a L, rivolto verso la TV
  const sz = A ? 0 : -0.1;
  // opts.modelSofa: il divano lo mette chi chiama (modello glTF)
  if (!opts.modelSofa) {
    for (const z of [15.5, 16.5, 17.5]) F.sofaModule(b, 4.45, z + sz, -Math.PI / 2, 1.0, 1.0);
    F.sofaModule(b, 3.45, 17.5 + sz, -Math.PI / 2, 1.0, 1.0, { back: false });
  }
  F.openBoxTable(b, 3.45, 18.55 + sz, 0, 1.0, 0.4, 0.36);
  F.rug(b, 1.2, 15.4, 4.3, 18.9);
  F.coffeeTable(b, 1.5, 15.95, 0, 1.0, 1.25);
  F.armchair(b, 1.55, 19.45, Math.PI * 0.85);
  // opts.plantSpots: le piante le mette chi chiama (modelli glTF)
  const plant = (x, z, o) => (opts.plantSpots ? opts.plantSpots.push([x, z, o.h]) : F.pottedPlant(b, x, z, o));
  plant(0.95, 15.4, { h: 1.3, r: 0.22, rnd });
  plant(6.35, 15.45, { h: 1.7, r: 0.27, rnd });

  // --- panca in pietra nella nicchia sud
  b.box(5.55, 0, 20.3, 7.0, 0.45, 20.87, 'travStone|0', { lines: 'f' });

  // --- cucina: colonne laccate a tutta altezza, banco e isola in pietra
  const tx = A ? 8.911 : 8.8;
  F.tallUnits(b, tx, 16.535, 12.543, 17.135, H - 0.01, 17.137);
  const cx = A ? 11.9 : 11.75;
  F.stoneBlock(b, cx, 17.135, 12.543, 20.87, 0.92, A ? {} : { sink: [cx + 0.38, 19.6] });
  b.box(cx + 0.06, 0.92, 17.6, 12.48, 0.926, 18.2, 'screen|0', { edges: false });
  if (A) {
    F.stoneBlock(b, 10.0, 18.0, 10.88, 20.1, 0.92, { sink: [10.44, 19.2] });
  }
  plant(A ? 11.25 : 11.1, 20.45, { h: 1.8, r: 0.28, rnd });

  // --- pranzo
  let lampPts;
  if (A) {
    const [ox, oz] = [8.3, 19.06];
    F.roundTable(b, ox, oz, 0.65);
    for (let k = 0; k < 5; k++) {
      const a = Math.PI * 0.1 + (k / 5) * Math.PI * 2;
      const x = ox + Math.cos(a) * 0.86, z = oz + Math.sin(a) * 0.86;
      F.woodChair(b, x, z, facing(x, z, ox, oz));
    }
    lampPts = [[ox, oz]];
  } else {
    F.oakTable(b, 8.4, 18.36, 10.4, 19.24);
    for (const x of [8.9, 9.9]) {
      F.woodChair(b, x, 17.98, 0);
      F.woodChair(b, x, 19.62, Math.PI);
    }
    F.woodChair(b, 8.02, 18.8, Math.PI / 2);
    F.woodChair(b, 10.78, 18.8, -Math.PI / 2);
    lampPts = [[8.9, 18.8], [9.9, 18.8]];
  }
  for (const [x, z] of lampPts) F.pendant(b, x, z, 1.62, A ? 0.32 : 0.22);

  // --- camera padronale: parete in rovere dietro il letto
  b.box(5.927, 0, 9.025, 9.224, 2.9, 9.07, 'oak|0', { lines: 'f' });
  F.bed(b, 6.77, 9.07, 0, 1.8, 2.05);
  F.nightstand(b, 6.42, 9.07, 0);
  F.nightstand(b, 8.92, 9.07, 0);
  F.rug(b, 6.4, 11.3, 9.1, 12.4);
  F.pottedPlant(b, 9.55, 12.25, { h: 1.2, r: 0.2, rnd });

  // --- guardaroba
  F.tallUnits(b, 5.927, 6.849, 9.927, 7.45, 2.7, 7.452);
  b.box(6.3, 0, 8.3, 9.0, 0.9, 8.85, 'oak|0', { lines: 'f' });

  // --- bagno grande: wc e bidet sospesi, mobile con due lavabi, doccia
  F.wc(b, 0.85, 8.175, 0);
  F.wc(b, 1.55, 8.175, 0, true);
  F.vanity(b, 3.6, 10.774, Math.PI, 2.6, 2);
  b.box(2.532, 0, 8.175, 4.449, 0.04, 9.12, 'travStone|0', { lines: 'f' });
  b.box(2.532, 0.04, 9.08, 3.35, 2.1, 9.1, 'glass|0', { lines: 'f' });
  F.rainShower(b, 3.5, 8.65);

  // --- bagno padronale: lavabo, sanitari, vasca libera e doccia
  F.vanity(b, 6.1, 12.772, 0, 2.0, 1);
  F.wc(b, 8.75, 12.772, 0);
  F.wc(b, 9.4, 12.772, 0, true);
  F.bathtub(b, 7.1, 14.3, 0, 1.7, 0.8);
  b.box(8.4, 0, 14.0, 9.927, 0.04, 14.842, 'travStone|0', { lines: 'f' });
  b.box(8.38, 0.04, 14.0, 8.4, 2.1, 14.75, 'glass|0', { lines: 'f' });
  F.rainShower(b, 9.15, 14.42);

  // --- seconda camera
  F.bed(b, 1.65, 10.897, 0, 1.6, 2.05);
  F.nightstand(b, 1.39, 10.897, 0);
  F.nightstand(b, 3.51, 10.897, 0);
  F.tallUnits(b, 0.6, 14.1, 3.7, 14.698, 2.6, 14.098);

  // --- lavanderia: piano, lavatrice e asciugatrice in colonna
  counter(b, 0.453, 4.606, 1.1, 7.2);
  F.washer(b, 0.8, 8.048, Math.PI);
  F.washer(b, 0.8, 8.048, Math.PI, 0.87);
  F.tallUnits(b, 3.0, 4.606, 3.861, 5.3, 2.2, 5.302);

  // --- cantina: scaffali
  for (const y of [0.4, 0.9, 1.4, 1.9]) b.box(0.601, y, 0.5, 1.05, y + 0.03, 4.2, 'timber|0', { lines: 'f' });
  b.box(0.601, 0, 0.5, 1.05, 2.2, 0.53, 'timber|0', { edges: false });
  b.box(0.601, 0, 4.17, 1.05, 2.2, 4.2, 'timber|0', { edges: false });

  // --- autorimessa: banco da lavoro
  b.box(3.514, 0, 0.8, 4.1, 0.9, 3.6, 'timber|0', { lines: 'f' });

  // --- portico sud: tavolo lungo in legno, sedie e panca
  F.lineKey('e');
  const [tx0, tz0, tx1, tz1] = v.portico.table;
  b.box(tx0, 0.72, tz0, tx1, 0.77, tz1, 'timber|1', { lines: 'e' });
  legs(b, tx0 + 0.1, tz0 + 0.1, tx1 - 0.1, tz1 - 0.1, 0.72, 'metal|1', 0.06, 'e');
  b.box(tx0 + 0.2, 0.42, tz0 - 0.55, tx1 - 0.2, 0.46, tz0 - 0.2, 'timber|1', { lines: 'e' });
  legs(b, tx0 + 0.3, tz0 - 0.5, tx1 - 0.3, tz0 - 0.25, 0.42, 'metal|1', 0.05, 'e');
  for (let x = tx0 + 0.45; x < tx1 - 0.3; x += 0.9) F.woodChair(b, x, tz1 + 0.38, Math.PI, 'timber|1');

  // --- portico est: due poltrone basse
  for (const z of [10.0, 13.0]) F.sofaModule(b, 11.15, z + 0.4, Math.PI / 2, 0.8, 0.85, { armL: true, armR: true, mat: 'linen|1' });
  F.pottedPlant(b, 12.3, 7.6, { h: 1.4, r: 0.32, pot: 'terracotta|1', leaves: 'leavesOlive|1', rnd });
  F.lineKey('f');
}

function rand(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
