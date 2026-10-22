import * as THREE from 'three';
import { revealSurface, revealLines } from './reveal.js';

// Texture CC0 da Poly Haven (1k). Le UV sono in metri: "scale" dice quanti
// metri copre una ripetizione della texture.
const TEX = {
  stone_wall: 1.7,
  plastered_wall_04: 2.5,
  marble_01: 1.6,
  oak_veneer_01: 1.4,
  large_floor_tiles_02: 2.4,
  leafy_grass: 3.0,
  gravel_floor_02: 2.0,
  rough_linen: 0.8,
};

// materiali di base: texture + tinta + rugosità
const BASES = {
  stone:   { tex: 'stone_wall', color: '#e9dccb', rough: 1 },
  plaster: { tex: 'plastered_wall_04', color: '#f4efe6', rough: 1 },
  ceiling: { tex: 'plastered_wall_04', color: '#f4efe6', rough: 1, emissive: '#5a544b' },
  floor:   { tex: 'marble_01', color: '#f3ece0', rough: 0.55, nrm: 0.3 },
  oakfloor:{ tex: 'oak_veneer_01', color: '#e6d0b4', rough: 0.8 },
  garage:  { tex: 'large_floor_tiles_02', color: '#d8d2c8', rough: 0.9 },
  paving:  { tex: 'marble_01', color: '#e9dcc5', rough: 0.9, nrm: 0.5 },
  grass:   { tex: 'leafy_grass', color: '#e4f0bf', rough: 1 },
  meadow:  { color: '#9fa676', rough: 1 },
  roofgreen: { tex: 'leafy_grass', color: '#dfeab6', rough: 1 },
  gravel:  { tex: 'gravel_floor_02', color: '#f1e7d8', rough: 1 },
  timber:  { tex: 'oak_veneer_01', color: '#c9ab88', rough: 0.85 },
  oak:     { tex: 'oak_veneer_01', color: '#efdcc2', rough: 0.7 },
  walnut:  { tex: 'oak_veneer_01', color: '#8a6446', rough: 0.6 },
  linen:   { tex: 'rough_linen', noMap: true, color: '#d9ccb6', rough: 1 },
  linenDark: { tex: 'rough_linen', noMap: true, color: '#8f7f69', rough: 1 },
  linenWhite: { tex: 'rough_linen', noMap: true, color: '#f4efe6', rough: 1 },
  botticino: { tex: 'marble_01', color: '#f2e6d2', rough: 0.35 },
  ceramic: { color: '#f7f5f1', rough: 0.25 },
  metal:   { color: '#3c3833', rough: 0.45, metal: 0.8 },
  black:   { color: '#1d1c1b', rough: 0.3 },
  leaves:  { color: '#8a9670', rough: 0.9 },
  bark:    { color: '#6e6355', rough: 1 },
  lavender:{ color: '#8f88a8', rough: 1 },
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
    this.anisotropy = 4;
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
  get(baseName, mode = 0) {
    const k = `${baseName}|${mode}`;
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
    if (b.emissive) opts.emissive = new THREE.Color(b.emissive);
    let m;
    if (b.glass) {
      m = new THREE.MeshPhysicalMaterial({ ...opts, transparent: true, opacity: 0.22, envMapIntensity: 1.4, depthWrite: false });
    } else {
      m = new THREE.MeshStandardMaterial(opts);
    }
    m.side = THREE.DoubleSide;
    m.shadowSide = THREE.FrontSide;
    revealSurface(m, { mode });
    this.cache.set(k, m);
    return m;
  }

  lines(mode = 0, opacity = 0.9) {
    const k = `${mode}|${opacity}`;
    if (this.lineCache.has(k)) return this.lineCache.get(k);
    const m = new THREE.LineBasicMaterial({ color: '#24221f', transparent: true, opacity, depthWrite: false });
    revealLines(m, { mode });
    this.lineCache.set(k, m);
    return m;
  }
}
