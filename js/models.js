import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Modelli glTF veri (Fab, Poly Haven) al posto degli arredi e delle piante
// disegnati: li usano sia il sito sia il mockup. Chi chiama decide cosa farne
// con onAdd (aggiungerli alla scena, renderli spostabili, ritagliarli).

export function createModels({ manager, onAdd, nextId = (k) => k, treeShadow = false }) {
  const gltf = new GLTFLoader(manager);
  const modelCache = {};
  // piante e vasi veri da Poly Haven (CC0), scalati all'altezza prevista
  // i modelli sono glTF in .json con il buffer in base64: lo decodifico qui e passo
  // al loader un GLB, perché la pagina non può leggere URL data: né file .glb
  async function fetchGlb(url) {
    const json = await (await fetch(url)).json();
    const buf = json.buffers[0];
    const bin = Uint8Array.from(atob(buf.uri.split(',')[1]), (c) => c.charCodeAt(0));
    delete buf.uri;
    buf.byteLength = bin.length;
    const enc = new TextEncoder().encode(JSON.stringify(json));
    const jsonLen = Math.ceil(enc.length / 4) * 4, binLen = Math.ceil(bin.length / 4) * 4;
    const out = new Uint8Array(12 + 8 + jsonLen + 8 + binLen);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
    dv.setUint32(12, jsonLen, true); dv.setUint32(16, 0x4e4f534a, true);
    out.fill(0x20, 20, 20 + jsonLen); out.set(enc, 20);
    dv.setUint32(20 + jsonLen, binLen, true); dv.setUint32(24 + jsonLen, 0x004e4942, true);
    out.set(bin, 28 + jsonLen);
    return out.buffer;
  }
  function loadModel(name) {
    const url = /^(fab|ph|lib)\//.test(name) ? `assets/models/${name}.json` : `assets/models/${name}/${name}.json`;
    modelCache[name] ||= fetchGlb(url).then((glb) => new Promise((ok, ko) => gltf.parse(glb, url.slice(0, url.lastIndexOf('/') + 1), (g) => ok(g.scene), ko)));
    modelCache[name].catch((e) => console.error('modello', name, e));
    return modelCache[name];
  }
  const PLANT_PICK = ['potted_plant_02', 'potted_plant_04', 'potted_plant_02'];
  function placePlants(spots) {
    spots.forEach(([x, z, h], i) => { const id = nextId('plant'); loadModel(PLANT_PICK[i % PLANT_PICK.length]).then((src) => {
      const m = src.clone(true);
      const box = new THREE.Box3().setFromObject(m);
      const s = h / (box.max.y - box.min.y);
      m.scale.setScalar(s);
      m.position.set(x, -box.min.y * s, z);
      m.rotation.y = i * 2.1;
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      onAdd(m, id, 'plant');
    }); });
  }

  // arredi da Fab (fab.com): file, scala, rotazione aggiuntiva; i modelli vengono centrati in pianta
  const FAB_KIND = {
    sofa: { file: 'fab/lshapedsofa', k: 0.66, mirror: true },
    tv: { file: 'fab/tv', k: 1, rot: -Math.PI / 2 },
    chair: { file: 'fab/diningchair', k: 1.05, rot: 0 },
    tap: { file: 'fab/tap', k: 0.01, rot: 0 },
    snake: { file: 'fab/snake', k: 0.85 },
    cereus: { file: 'fab/cereus', k: 1.2 },
    pothos: { file: 'fab/pothos', k: 0.75 },
    aloe: { file: 'fab/aloe', k: 1.3 },
  };
  const fabItems = [];
  function fabPlace(kind, x, z, rot = 0, y = 0) {
    if (!FAB_KIND[kind]) return false;
    fabItems.push([kind, x, z, rot, y]);
    return true;
  }
  function placeModels() {
    for (const [kind, x, z, rot, y] of fabItems.splice(0)) {
      const spec = FAB_KIND[kind];
      const id = nextId(kind);
      loadModel(spec.file).then((src) => {
        const m = src.clone(true);
        const k = spec.k;
        m.scale.set(spec.mirror ? -k : k, k, k);
        m.rotation.y = rot + (spec.rot || 0);
        m.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(m);
        m.position.set(x - (box.min.x + box.max.x) / 2, y - box.min.y, z - (box.min.z + box.max.z) / 2);
        m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        onAdd(m, id, kind);
      });
    }
  }

  // giardino: ulivi, lentisco/sommacco e graminacee di Poly Haven (CC0).
  // Ogni file ha più varianti come nodi separati: ne scelgo una per pianta.
  const OUTDOOR = {
    olive: { file: 'ph/island_tree_01', alt: 'ph/island_tree_02', h: (s) => s },
    shrub: { file: 'ph/searsia_lucida', nodes: 'abcdefg'.split('').map((c) => `searsia_lucida_${c}_LOD0`), h: (s) => s * 1.7 },
    grass: { file: 'ph/grass_medium_01', nodes: ['tall_a', 'tall_b', 'tall_c', 'large_a', 'large_b', 'large_c'].map((c) => `grass_medium_01_${c}_LOD0`), h: (s) => s * 0.75 },
  };
  const outdoorItems = [];
  function outdoorPlace(kind, x, z, s, seed) {
    if (!OUTDOOR[kind]) return false;
    outdoorItems.push([kind, x, z, s, seed]);
    return true;
  }
  function placeOutdoor() {
    for (const [kind, x, z, s, seed] of outdoorItems.splice(0)) {
      const spec = OUTDOOR[kind];
      const r = typeof seed === 'number' && seed < 1 ? seed : (seed * 0.618) % 1;
      const file = spec.alt && Math.floor(seed) % 2 ? spec.alt : spec.file;
      const id = nextId(kind);
      loadModel(file).then((src) => {
        let m;
        if (spec.nodes) {
          const name = spec.nodes[Math.floor(r * spec.nodes.length) % spec.nodes.length];
          m = src.getObjectByName(name).clone(true);
          m.position.set(0, 0, 0);
        } else m = src.clone(true);
        const g = new THREE.Group();
        g.add(m);
        g.rotation.y = r * Math.PI * 2;
        g.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(g);
        const k = spec.h(s) / (box.max.y - box.min.y);
        g.scale.setScalar(k);
        g.updateMatrixWorld(true);
        box.setFromObject(g);
        g.position.set(x - (box.min.x + box.max.x) / 2, -0.04 - box.min.y, z - (box.min.z + box.max.z) / 2);
        g.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = kind !== 'olive' || treeShadow;
          o.receiveShadow = true;
          // foglie in BLEND: meglio un ritaglio netto, così fanno ombra e non sfarfallano
          if (o.material.transparent) Object.assign(o.material, { transparent: false, alphaTest: 0.45, depthWrite: true, side: THREE.DoubleSide });
          // foglie d'ulivo: meno giallo, più grigio-argento
          if (kind === 'olive' && /leaves/.test(o.material.name)) o.material.color.set('#c4cbb4');
        });
        onAdd(g, id, kind);
      });
    }
  }

  return { loadModel, placePlants, fabPlace, placeModels, outdoorPlace, placeOutdoor };
}
