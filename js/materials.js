import * as THREE from 'three';
import { revealSurface, revealLines } from './reveal.js';

// Texture CC0 da Poly Haven e ambientCG (2k per pietra, pavimenti, intonaco e
// coppi). Le UV sono in metri: "scale" dice quanti metri copre una ripetizione.
const TEX = {
  stone_wall: 1.7,
  ashlar_r06a: 1.1,
  plaster001: 2.2,
  travertine009: 1.8,
  tiles143: 2.0,
  woodfloor051: 2.2,
  roofingtiles006: 2.2,
  oak_veneer_01: 1.4,
  leafy_grass: 3.0,
  gravel_floor_02: 2.0,
  rough_linen: 0.8,
};

// materiali di base: texture + tinta + rugosità
const BASES = {
  stone:   { tex: 'stone_wall', color: '#efe3d2', rough: 1 },
  // rivestimento a blocchi squadrati (R06A di Abitare in Pietra) per i dettagli
  ashlar:  { tex: 'ashlar_r06a', color: '#ffffff', rough: 1, nrm: 0.8 },
  // intonaco esterno bianco burro
  render:  { tex: 'plaster001', color: '#fde8bd', rough: 1, nrm: 0.7 },
  plaster: { tex: 'plaster001', color: '#f5ecdf', rough: 1, nrm: 0.6 },
  ceiling: { tex: 'plaster001', color: '#f5ecdf', rough: 1, nrm: 0.4, emissive: '#5a5246' },
  // microcemento beige caldo, come nella foto di riferimento
  floor:   { tex: 'plaster001', color: '#d9c6a8', rough: 0.55, nrm: 0.12 },
  // parete in pietra a vista del soggiorno
  stoneIn: { tex: 'stone_wall', color: '#f0dcbb', rough: 1, nrm: 1.2 },
  lacquer: { color: '#eee5d6', rough: 0.55 },
  travStone: { tex: 'travertine009', color: '#f3e8d8', rough: 0.5, nrm: 0.4 },
  rug:     { tex: 'rough_linen', color: '#d9c7a6', rough: 1, nrm: 1.5 },
  screen:  { color: '#0d0d0e', rough: 0.12, metal: 0.2 },
  chrome:  { color: '#d6d2cb', rough: 0.18, metal: 1 },
  terracotta: { color: '#b9744f', rough: 0.9 },
  // foglie su cartoncini trasparenti (texture disegnata in canvas)
  leavesOlive: { canvas: 'olive', color: '#ffffff', rough: 0.85, twoSided: true },
  leavesBroad: { canvas: 'broad', color: '#ffffff', rough: 0.7, twoSided: true },
  lavenderCard: { canvas: 'lavender', color: '#ffffff', rough: 0.9, twoSided: true },
  grassCard: { canvas: 'grass', color: '#ffffff', rough: 0.9, twoSided: true },
  shrub:   { color: '#7d8a63', rough: 1 },
  oakfloor:{ tex: 'woodfloor051', color: '#f2e6d6', rough: 0.8 },
  garage:  { tex: 'tiles143', color: '#e2dcd2', rough: 0.95 },
  paving:  { tex: 'tiles143', color: '#ffffff', rough: 0.95 },
  roof:    { tex: 'roofingtiles006', color: '#e6d2c2', rough: 1 },
  grass:   { tex: 'leafy_grass', color: '#e4f0bf', rough: 1 },
  meadow:  { color: '#9fa676', rough: 1 },
  gravel:  { tex: 'gravel_floor_02', color: '#f1e7d8', rough: 1 },
  timber:  { tex: 'oak_veneer_01', color: '#c9ab88', rough: 0.85 },
  oak:     { tex: 'oak_veneer_01', color: '#efdcc2', rough: 0.7 },
  walnut:  { tex: 'oak_veneer_01', color: '#8a6446', rough: 0.6 },
  linen:   { tex: 'rough_linen', noMap: true, color: '#d9ccb6', rough: 1 },
  linenDark: { tex: 'rough_linen', noMap: true, color: '#8f7f69', rough: 1 },
  linenWhite: { tex: 'rough_linen', noMap: true, color: '#f4efe6', rough: 1 },
  botticino: { tex: 'travertine009', color: '#fffaf2', rough: 0.35, nrm: 0.3 },
  ceramic: { color: '#f7f5f1', rough: 0.25 },
  metal:   { color: '#3c3833', rough: 0.45, metal: 0.8 },
  black:   { color: '#1d1c1b', rough: 0.3 },
  leaves:  { color: '#8a9670', rough: 0.9 },
  bark:    { color: '#6e6355', rough: 1 },
  lavender:{ color: '#8f88a8', rough: 1 },
  lavLeaf: { color: '#8f9c86', rough: 0.95, twoSided: true },
  lavStem: { color: '#7d8866', rough: 1 },
  lavFlower: { color: '#7562a8', rough: 0.85 },
  glass:   { color: '#cfdcdc', rough: 0.05, metal: 0.0, glass: true },
  water:   { color: '#7fa3a5', rough: 0.05 },
};

export class Materials {
  constructor(manager, base = 'assets/tex/') {
    this.loader = new THREE.TextureLoader(manager);
    this.base = base;
    this.tex = {};
    this.cache = new Map();
    this.lineCache = new Map();
    this.anisotropy = 8;
  }

  loadTextures() {
    for (const name of Object.keys(TEX)) {
      const s = TEX[name];
      const load = (file, srgb) => {
        const t = this.loader.load(`${this.base}${name}/${file}.jpg`);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1 / s, 1 / s);
        t.anisotropy = this.anisotropy;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      this.tex[name] = { map: load('diff', true), normalMap: load('nor', false), arm: load('arm', false) };
    }
  }

  // key: "base" + modalità di rivelazione (0 interno, 1 esterno, 2 entrambi)
  // tag: un gruppo di materiali separato (es. 'r' per le coperture animate)
  get(baseName, mode = 0, tag = '') {
    const k = `${baseName}|${mode}|${tag}`;
    if (this.cache.has(k)) return this.cache.get(k);
    const b = BASES[baseName];
    if (!b) throw new Error('materiale sconosciuto ' + baseName);
    const opts = { color: new THREE.Color(b.color), roughness: b.rough ?? 1, metalness: b.metal ?? 0 };
    if (b.tex) {
      const t = this.tex[b.tex];
      if (!b.noMap) opts.map = t.map;
      opts.normalMap = t.normalMap;
      opts.normalScale = new THREE.Vector2(b.nrm ?? 1, b.nrm ?? 1);
      opts.aoMap = t.arm;
      opts.aoMapIntensity = 0.6;
      opts.roughnessMap = t.arm;
    }
    if (b.canvas) {
      opts.map = leafTexture(b.canvas);
      opts.alphaTest = 0.3;
    }
    if (b.emissive) opts.emissive = new THREE.Color(b.emissive);
    let m;
    if (b.glass) {
      m = new THREE.MeshPhysicalMaterial({ ...opts, transparent: true, opacity: 0.22, envMapIntensity: 1.4, depthWrite: false });
    } else {
      m = new THREE.MeshStandardMaterial(opts);
    }
    m.side = THREE.DoubleSide;
    // le superfici arretrano di un soffio nel depth buffer: gli spigoli disegnati
    // sopra restano netti invece di sfarfallare
    m.polygonOffset = true;
    m.polygonOffsetFactor = 1;
    m.polygonOffsetUnits = 1;
    m.shadowSide = THREE.FrontSide;
    revealSurface(m, { mode, twoSided: !!b.twoSided });
    this.cache.set(k, m);
    return m;
  }

  lines(mode = 0, opacity = 0.9, tag = '') {
    const k = `${mode}|${opacity}|${tag}`;
    if (this.lineCache.has(k)) return this.lineCache.get(k);
    const m = new THREE.LineBasicMaterial({ color: '#24221f', transparent: true, opacity, depthWrite: false });
    revealLines(m, { mode });
    this.lineCache.set(k, m);
    return m;
  }
}

// Texture disegnate in canvas per le piante: rametti di ulivo, foglie larghe,
// spighe di lavanda, ciuffi d'erba. Sfondo trasparente, si usano con alphaTest.
const leafCache = {};
function leafTexture(kind) {
  if (leafCache[kind]) return leafCache[kind];
  const N = 512;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  let seed = { olive: 3, broad: 5, lavender: 7, grass: 9 }[kind] || 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const leaf = (x, y, ang, len, wid, col) => {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(len * 0.5, -wid, len, 0);
    g.quadraticCurveTo(len * 0.5, wid, 0, 0);
    g.fill();
    g.restore();
  };
  if (kind === 'olive') {
    // ciuffo tondo di rametti che partono dal centro: foglie strette, verde
    // scuro sopra e argento sotto; niente oltre il cerchio, così il bordo
    // del cartoncino non si vede
    const tops = ['#5d6a45', '#68744d', '#55613f', '#77825a', '#4f5b3a'];
    const unders = ['#a9b096', '#b8bea6', '#9da58a'];
    const C = N / 2;
    for (let k = 0; k < 60; k++) {
      const a0 = rnd() * Math.PI * 2;
      const r0 = rnd() * N * 0.08, r1 = N * (0.3 + rnd() * 0.14);
      const x = C + Math.cos(a0) * r0, y = C + Math.sin(a0) * r0;
      const ex = C + Math.cos(a0) * r1, ey = C + Math.sin(a0) * r1;
      g.strokeStyle = '#6b5d48';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(ex, ey);
      g.stroke();
      for (let i = 0; i < 16; i++) {
        const u = 0.15 + rnd() * 0.85;
        const px = x + (ex - x) * u, py = y + (ey - y) * u;
        const side = rnd() < 0.5 ? -1 : 1;
        const col = rnd() < 0.3 ? unders[(rnd() * unders.length) | 0] : tops[(rnd() * tops.length) | 0];
        const len = N * (0.06 + rnd() * 0.035) * (1 - 0.35 * u);
        leaf(px, py, a0 + side * (0.45 + rnd() * 0.5), len, N * 0.018, col);
      }
    }
  } else if (kind === 'broad') {
    // foglie larghe tipo banano o strelitzia, da vaso
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + (rnd() - 0.5) * 1.6;
      const len = N * (0.35 + rnd() * 0.12);
      g.strokeStyle = '#4b6236';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(N / 2, N);
      g.lineTo(N / 2 + Math.cos(a) * N * 0.4, N + Math.sin(a) * N * 0.4);
      g.stroke();
      leaf(N / 2 + Math.cos(a) * N * 0.35, N + Math.sin(a) * N * 0.35, a, len, N * 0.07, ['#4f6d38', '#5f7c41', '#47622f'][k % 3]);
    }
  } else if (kind === 'lavender') {
    // steli verde-grigio con spighe viola in cima
    for (let k = 0; k < 90; k++) {
      const x0 = N * (0.2 + rnd() * 0.6);
      const a = -Math.PI / 2 + (x0 / N - 0.5) * 1.4 + (rnd() - 0.5) * 0.3;
      const len = N * (0.55 + rnd() * 0.3);
      const ex = x0 + Math.cos(a) * len, ey = N + Math.sin(a) * len;
      g.strokeStyle = '#7f8b6a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x0, N);
      g.lineTo(ex, ey);
      g.stroke();
      for (let i = 0; i < 7; i++) {
        const u = 0.8 + i * 0.03;
        g.fillStyle = ['#7d6fa8', '#8c7db6', '#6c5f98'][(rnd() * 3) | 0];
        g.beginPath();
        g.ellipse(x0 + (ex - x0) * u, N + (ey - N) * u, 4, 6, a + Math.PI / 2, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else {
    // ciuffi d'erba ornamentale, verdi e paglia
    for (let k = 0; k < 120; k++) {
      const x0 = N * (0.3 + rnd() * 0.4);
      const a = -Math.PI / 2 + (rnd() - 0.5) * 1.5;
      const len = N * (0.5 + rnd() * 0.45);
      g.strokeStyle = ['#a7a26f', '#c2b483', '#8c9561', '#d1c497'][(rnd() * 4) | 0];
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(x0, N);
      g.quadraticCurveTo(x0 + Math.cos(a) * len * 0.5, N + Math.sin(a) * len * 0.6, x0 + Math.cos(a) * len, N + Math.sin(a) * len * 0.9);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  leafCache[kind] = t;
  return t;
}
