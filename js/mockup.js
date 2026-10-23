import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VARIANTS } from './plans.js';
import { Materials } from './materials.js';
import { reveal, setupRooms, setRoomProgress } from './reveal.js';
import { buildHouse } from './house.js';
import { buildNature } from './nature.js';
import { setQuality } from './furniture.js';
import { createModels } from './models.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

// Mockup di qualità per salotto e cucina: stessa casa del sito, con luce,
// ombre, occlusione ambientale e suddivisioni come proposte. "Com'è ora"
// rimette le impostazioni attuali per il confronto.

const params = new URLSearchParams(location.search);
const variant = VARIANTS.a;
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(params.get('q') === 'low' ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 9000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 0.3;
controls.maxDistance = 40;

const manager = new THREE.LoadingManager();
manager.onProgress = (_u, done, total) => { document.getElementById('pct').textContent = Math.round((done / total) * 100) + '%'; };
const materials = new Materials(manager);
materials.loadTextures();

// cielo e luce d'ambiente dalla stessa foto HDR del sito
const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false });
const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), skyMat);
sky.rotation.y = -0.287 * Math.PI * 2;
scene.add(sky);
new THREE.TextureLoader(manager).load('assets/sky/late_afternoon.jpg', (tex) => {
  tex.colorSpace = THREE.SRGBColorSpace;
  skyMat.map = tex;
  skyMat.needsUpdate = true;
  const env = tex.clone();
  env.mapping = THREE.EquirectangularReflectionMapping;
  env.needsUpdate = true;
  scene.environment = new THREE.PMREMGenerator(renderer).fromEquirectangular(env).texture;
  scene.environmentRotation.y = 0.287 * Math.PI * 2;
});

// ---------------------------------------------------------------- luci
const FOCUS = new THREE.Vector3(6.5, 0, 18);
const sun = new THREE.DirectionalLight('#ffcd92', 3.4);
sun.target.position.copy(FOCUS);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight('#f6e6cc', '#c6a982', 0.6);
const amb = new THREE.AmbientLight('#fff4e6', 0.35);
scene.add(hemi, amb);
const points = [[3.0, 17.2], [9.4, 18.8], [7.6, 10.8], [5.25, 10]].map(([x, z]) => {
  const l = new THREE.PointLight('#ffc98f', 4, 8, 1.4);
  l.position.set(x, 2.6, z);
  scene.add(l);
  return l;
});

// ---------------------------------------------------------------- post
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1.2, scale: 1.2, samples: 16 });
gtao.blendIntensity = 1.0;
composer.addPass(gtao);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- casa
const world = new THREE.Group();
scene.add(world);
setupRooms(variant.rooms);
for (const r of variant.rooms) setRoomProgress(r, 1000);
reveal.outProgress.value = 1000;
reveal.cutOn.value = 0;
reveal.capK.value = 0;

let quality = 'dopo';
function build() {
  tc.detach();
  selectObj(null);
  movables.length = 0;
  for (const k in counters) delete counters[k];
  for (const o of [...world.children]) {
    world.remove(o);
    o.traverse?.((m) => m.geometry?.dispose());
  }
  const hq = quality === 'dopo';
  setQuality(hq ? 3 : 1);
  const plantSpots = hq ? [] : null;
  const house = buildHouse(variant, materials, world, {
    featureStone: hq ? 'ashlar|0' : 'stoneIn|0', plantSpots, modelSofa: hq, place: hq ? fabPlace : null,
    piece: hq ? (g, kind) => addMovable(g, nextId(kind), kind) : null,
  });
  if (hq) {
    // divano a L: centro della pianta, rivolto verso la TV
    fabPlace('sofa', 4.35, 16.7, -Math.PI / 2);
    // piante: sansevieria vicino alla pietra, cactus in cucina, pothos sul mobile TV, agave sul portico
    const [s0, s1, s2] = plantSpots;
    fabPlace('snake', s0[0], s0[1]);
    placePlants([s1]);
    fabPlace('cereus', s2[0], s2[1]);
    fabPlace('pothos', 0.71, 17.75, 0, 0.56);
    fabPlace('aloe', 2.6, 21.7);
    placeModels();
    restoreAdded();
  }
  house.roofGroup.position.y = 0;
  const nature = buildNature(variant, materials, world, hq ? { place: outdoorPlace, lavender3d: true } : {});
  nature.trees.forEach((g) => g.scale.setScalar(1));
  if (hq) placeOutdoor();
  const natureMeshes = new Set();
  if (params.get('treeshadow') !== '1') nature.trees.forEach((g) => g.traverse((o) => natureMeshes.add(o)));
  world.traverse((o) => {
    if (o.isMesh) { o.castShadow = o.material.name !== 'glass' && !o.material.transparent && !natureMeshes.has(o); o.receiveShadow = true; }
    if (o.isLineSegments) o.visible = false;
  });
  setQuality(1);
  applyLook(hq);
}

// modelli glTF (Fab, Poly Haven): li mette js/models.js, qui diventano spostabili
const { loadModel, placePlants, fabPlace, placeModels, outdoorPlace, placeOutdoor } = createModels({
  manager, nextId: (k) => nextId(k), onAdd: (m, id, kind) => addMovable(m, id, kind), treeShadow: params.get('treeshadow') === '1',
});

// ---------------------------------------------------------------- modifica arredi
// Ogni modello caricato sta in un gruppo con il perno al centro della base:
// si sposta sul pavimento, ruota sul suo asse e si ridimensiona in proporzione.
// Le modifiche restano nel browser di chi le fa (localStorage).
const NAMES = {
  sofa: 'Divano', tv: 'TV', chair: 'Sedia', tap: 'Rubinetto', snake: 'Sansevieria', cereus: 'Cactus',
  pothos: 'Pothos', aloe: 'Agave', plant: 'Pianta', olive: 'Ulivo', shrub: 'Cespuglio', grass: 'Erba',
  slatConsole: 'Mobile TV a listelli', sofaModule: 'Modulo divano', openBoxTable: 'Tavolino a giorno', rug: 'Tappeto',
  coffeeTable: 'Tavolino', armchair: 'Poltrona', pottedPlant: 'Pianta', tallUnits: 'Colonne / armadio', counter: 'Cucina in pietra',
  stoneBlock: 'Isola in pietra', roundTable: 'Tavolo tondo', woodChair: 'Sedia in legno', oakTable: 'Tavolo in rovere',
  pendant: 'Lampada a sospensione', bed: 'Letto', nightstand: 'Comodino', wc: 'Sanitario', vanity: 'Mobile lavabo',
  rainShower: 'Soffione doccia', bathtub: 'Vasca', washer: 'Lavatrice', shelves: 'Scaffale', bench: 'Banco da lavoro',
  outTable: 'Tavolo del portico', outBench: 'Panca del portico', stoneBench: 'Panca in pietra', dresser: 'Cassettiera',
};
const SAVE_KEY = 'villa-mockup-arredi';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch { saved = {}; }
const movables = [];
const counters = {};
function nextId(kind) {
  counters[kind] = (counters[kind] || 0) + 1;
  return `${kind}:${counters[kind]}`;
}
// at: dove mettere il centro della base (per gli elementi presi dalla libreria)
function addMovable(m, id, kind, at = null) {
  m.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m);
  const c = box.getCenter(new THREE.Vector3());
  const g = new THREE.Group();
  g.position.set(c.x, box.min.y, c.z);
  m.position.sub(g.position);
  g.add(m);
  if (at) g.position.fromArray(at);
  g.userData = { id, kind, home: g.position.toArray() };
  const st = saved[id];
  if (st?.p) { g.position.fromArray(st.p); g.rotation.y = st.r; g.scale.setScalar(st.s); }
  if (st?.hidden) g.visible = false;
  world.add(g);
  movables.push(g);
  return g;
}
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch { /* niente salvataggio */ }
}
function remember(g) {
  saved[g.userData.id] = { ...saved[g.userData.id], p: g.position.toArray().map((v) => +v.toFixed(3)), r: +g.rotation.y.toFixed(4), s: +g.scale.x.toFixed(3) };
  persist();
}

const tc = new TransformControls(camera, renderer.domElement);
tc.setSpace('world');
tc.setSize(0.9);
tc.setRotationSnap(THREE.MathUtils.degToRad(5));
scene.add(tc.getHelper());
let editing = false, scale0 = 1;
tc.addEventListener('dragging-changed', (e) => {
  controls.enabled = !e.value;
  if (e.value) scale0 = tc.object.scale.x;
  else if (tc.object) { remember(tc.object); showSel(); }
});
tc.addEventListener('objectChange', () => {
  const o = tc.object;
  if (!o) return;
  if (tc.mode === 'scale') {
    // ridimensiono sempre in proporzione: vale l'asse che si è mosso di più
    const v = [o.scale.x, o.scale.y, o.scale.z].reduce((a, b) => (Math.abs(b - scale0) > Math.abs(a - scale0) ? b : a));
    o.scale.setScalar(THREE.MathUtils.clamp(v, 0.3, 3));
  }
  if (tc.mode === 'rotate') { o.rotation.x = 0; o.rotation.z = 0; }
  showSel();
});
function setMode(m) {
  tc.setMode(m);
  tc.showX = m !== 'rotate';
  tc.showZ = m !== 'rotate';
  tc.showY = m !== 'translate';
  tc.setSpace(m === 'scale' ? 'local' : 'world');
  document.querySelectorAll('[data-tm]').forEach((b) => b.classList.toggle('on', b.dataset.tm === m));
}
setMode('translate');
const selEl = document.getElementById('sel');
function showSel() {
  const o = tc.object;
  if (!o) { selEl.textContent = 'Clicca un arredo o una pianta per selezionarlo.'; return; }
  const sz = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
  const cm = (v) => Math.round(v * 100);
  const deg = Math.round(THREE.MathUtils.radToDeg(o.rotation.y) % 360);
  selEl.textContent = `${o.userData.label || NAMES[o.userData.kind] || o.userData.kind}: ${cm(sz.x)} × ${cm(sz.z)} cm, alto ${cm(sz.y)} cm · ruotato ${deg}° · scala ${Math.round(o.scale.x * 100)}%`;
}
function selectObj(o) {
  if (o) tc.attach(o); else tc.detach();
  if (selEl) showSel();
}
function setEditing(on) {
  editing = on;
  document.body.classList.toggle('editing', on);
  document.getElementById('edit').classList.toggle('on', on);
  if (!on) selectObj(null);
}
document.getElementById('edit').addEventListener('click', () => setEditing(!editing));
document.querySelectorAll('[data-tm]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.tm)));
// rotazioni rapide: si sommano a quella attuale
document.querySelectorAll('[data-rot]').forEach((b) => b.addEventListener('click', () => {
  const o = tc.object;
  if (!o) return;
  o.rotation.y = THREE.MathUtils.euclideanModulo(o.rotation.y + THREE.MathUtils.degToRad(Number(b.dataset.rot)) + Math.PI, Math.PI * 2) - Math.PI;
  remember(o);
  showSel();
}));
document.getElementById('resetOne').addEventListener('click', () => {
  const o = tc.object;
  if (!o) return;
  o.position.fromArray(o.userData.home); o.rotation.set(0, 0, 0); o.scale.setScalar(1);
  delete saved[o.userData.id];
  persist();
  showSel();
});
document.getElementById('resetAll').addEventListener('click', () => {
  saved = {};
  persist();
  selectObj(null);
  for (const o of [...movables]) {
    if (o.userData.lib) { removeMovable(o); continue; }
    o.position.fromArray(o.userData.home); o.rotation.set(0, 0, 0); o.scale.setScalar(1); o.visible = true;
  }
  showSel();
});
function removeMovable(o) {
  world.remove(o);
  movables.splice(movables.indexOf(o), 1);
}
document.getElementById('remove').addEventListener('click', () => {
  const o = tc.object;
  if (!o) return;
  selectObj(null);
  if (o.userData.lib) {
    saved.added = (saved.added || []).filter((a) => a.id !== o.userData.id);
    delete saved[o.userData.id];
    removeMovable(o);
  } else {
    o.visible = false;
    saved[o.userData.id] = { ...saved[o.userData.id], hidden: true };
  }
  persist();
});

// ---------------------------------------------------------------- libreria
// Tutto quello che è stato scaricato, da inserire dove si sta guardando.
// nodes: le parti da prendere da una scena intera; k: scala; h: altezza voluta.
const LIV = (...n) => n.map((x) => `i2stay00${x}`);
const GH = (...n) => n.map((x) => `mint${String(x).padStart(4, '0')}`);
const LIBRARY = {
  Soggiorno: {
    divanoL: { label: 'Divano a L', file: 'fab/lshapedsofa', k: 0.66, mirror: true },
    divanoWabi: { label: 'Divano wabi-sabi', file: 'lib/living', nodes: LIV(41, 42, 43, 44, 45, 46, 47) },
    tavolinoWabi: { label: 'Tavolino tondo', file: 'lib/living', nodes: LIV(52, 53, 57, 58, 60, 62, 63) },
    tappetoWabi: { label: 'Tappeto grande', file: 'lib/living', nodes: LIV(38) },
    sfera: { label: 'Lampada a sfera', file: 'lib/living', nodes: LIV(49, 50), keepY: true },
    rami: { label: 'Rami in vaso', file: 'lib/living', nodes: LIV(29, 30, 31, 32, 33, 34, 35, 36, 37) },
    tv: { label: 'TV', file: 'fab/tv', k: 1, rot: -Math.PI / 2 },
  },
  'Cucina e pranzo': {
    sedia: { label: 'Sedia imbottita', file: 'fab/diningchair', k: 1.05 },
    cucina: { label: 'Cucina compatta', file: 'lib/kitchen' },
    rubinetto: { label: 'Rubinetto', file: 'fab/tap', k: 0.01, y: 0.92 },
  },
  Camera: {
    letto: { label: 'Letto', file: 'lib/bedroom', nodes: ['Cube.007'] },
    comodino: { label: 'Comodino', file: 'lib/bedroom', nodes: ['Cube.003'] },
    madia: { label: 'Panca contenitore', file: 'lib/bedroom', nodes: ['Cube.011'] },
    tende: { label: 'Tende', file: 'lib/bedroom', nodes: ['3 panel curtains'] },
    plafoniera: { label: 'Lampada a soffitto', file: 'lib/bedroom', nodes: ['Cylinder.003'], keepY: true },
    applique: { label: 'Applique', file: 'lib/bedroom', nodes: ['Cylinder.002'], keepY: true },
    lampada: { label: 'Lampada da tavolo', file: 'lib/bedroom', nodes: ['Floor Lamp Table'] },
    tappetoTondo: { label: 'Tappeto tondo', file: 'lib/bedroom', nodes: ['Contemporary Round Niwa carpet'] },
    tappetoBeige: { label: 'Tappeto beige', file: 'lib/bedroom', nodes: ['Pearl Beige Carpet'] },
  },
  'Guesthouse wabi-sabi': {
    poltronaPaglia: { label: 'Poltrona in paglia', file: 'lib/guesthouse', nodes: GH(7, 8) },
    sediaPaglia: { label: 'Sedia in paglia', file: 'lib/guesthouse', nodes: GH(158) },
    poltronaBassa: { label: 'Poltrona bassa', file: 'lib/guesthouse', nodes: GH(10) },
    sediaBianca: { label: 'Sedia chiara', file: 'lib/guesthouse', nodes: GH(82, 83) },
    tavoloLungo: { label: 'Tavolo lungo', file: 'lib/guesthouse', nodes: GH(12, 14) },
    tavolinoNero: { label: 'Tavolino nero', file: 'lib/guesthouse', nodes: GH(16, 17) },
    tavolinoLegno: { label: 'Tavolino in legno', file: 'lib/guesthouse', nodes: GH(147, 148, 150, 151, 152, 153, 154) },
    fioriera: { label: 'Fioriera', file: 'lib/guesthouse', nodes: GH(106, 107, 108, 109, 110, 111, 112, 113, 114) },
  },
  Bagno: {
    wc: { label: 'WC', file: 'fab/toilet', h: 0.85 },
  },
  Piante: {
    sansevieria: { label: 'Sansevieria', file: 'fab/snake', k: 0.85 },
    cactus: { label: 'Cactus', file: 'fab/cereus', k: 1.2 },
    pothos: { label: 'Pothos', file: 'fab/pothos', k: 0.75 },
    agave: { label: 'Agave', file: 'fab/aloe', k: 1.3 },
    monstera: { label: 'Monstera piccola', file: 'lib/bedroom', nodes: ['Small Monstera plant'] },
    vaso: { label: 'Pianta in vaso', file: 'potted_plant_02', h: 1.1 },
    vaso2: { label: 'Pianta in vaso alta', file: 'potted_plant_04', h: 1.5 },
    ulivo: { label: 'Ulivo', file: 'ph/island_tree_01', h: 4.6 },
    ulivo2: { label: 'Ulivo basso', file: 'ph/island_tree_02', h: 3.6 },
    cespuglio: { label: 'Cespuglio', file: 'ph/searsia_lucida', nodes: ['searsia_lucida_b_LOD0'], h: 1.3 },
    erba: { label: 'Ciuffo d\'erba', file: 'ph/grass_medium_01', nodes: ['grass_medium_01_tall_a_LOD0'], h: 0.7 },
  },
};
const LIB = Object.fromEntries(Object.values(LIBRARY).flatMap((g) => Object.entries(g)));

async function libObject(spec) {
  const src = await loadModel(spec.file);
  src.updateMatrixWorld(true);
  const m = new THREE.Group();
  if (spec.nodes) {
    for (const name of spec.nodes) {
      const n = src.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
      if (!n) continue;
      const c = n.clone(true);
      n.matrixWorld.decompose(c.position, c.quaternion, c.scale);
      m.add(c);
    }
  } else m.add(src.clone(true));
  const k = spec.k || 1;
  m.scale.set(spec.mirror ? -k : k, k, k);
  m.rotation.y = spec.rot || 0;
  if (spec.h) {
    m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m);
    m.scale.multiplyScalar(spec.h / (box.max.y - box.min.y));
  }
  m.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.material.transparent) Object.assign(o.material, { transparent: false, alphaTest: 0.45, depthWrite: true, side: THREE.DoubleSide });
  });
  return m;
}
async function addFromLibrary(key, id, at) {
  const spec = LIB[key];
  const m = await libObject(spec);
  if (!at) {
    m.updateMatrixWorld(true);
    const y = spec.keepY ? new THREE.Box3().setFromObject(m).min.y : spec.y || 0;
    // a due metri e mezzo davanti a chi guarda
    const f = new THREE.Vector3();
    camera.getWorldDirection(f);
    f.y = 0;
    f.normalize();
    at = [camera.position.x + f.x * 2.5, y, camera.position.z + f.z * 2.5];
  }
  const g = addMovable(m, id, key, at);
  g.userData.lib = key;
  g.userData.label = spec.label;
  return g;
}
// ---------------------------------------------------------------- versioni
// Disposizioni con un nome, nel browser; si possono anche esportare in un file
// e reimportare (per passarle a qualcuno o tenerle al sicuro).
const VERS_KEY = 'villa-mockup-versioni';
let versions = {};
try { versions = JSON.parse(localStorage.getItem(VERS_KEY) || '{}'); } catch { versions = {}; }
const verSel = document.getElementById('verList');
const verName = document.getElementById('verName');
const verMsg = document.getElementById('verMsg');
function saveVersions() {
  try { localStorage.setItem(VERS_KEY, JSON.stringify(versions)); } catch { /* niente salvataggio */ }
}
function listVersions(pick) {
  verSel.innerHTML = '';
  const names = Object.keys(versions).sort((a, b) => versions[b].at - versions[a].at);
  for (const n of names) {
    const o = document.createElement('option');
    o.value = n;
    o.textContent = `${n} · ${new Date(versions[n].at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}`;
    verSel.append(o);
  }
  if (pick) verSel.value = pick;
  verSel.disabled = !names.length;
}
function loadLayout(data) {
  saved = JSON.parse(JSON.stringify(data || {}));
  persist();
  build();
}
const say = (t) => { verMsg.textContent = t; };
document.getElementById('verSave').addEventListener('click', () => {
  const n = verName.value.trim() || `Versione ${Object.keys(versions).length + 1}`;
  versions[n] = { at: Date.now(), data: JSON.parse(JSON.stringify(saved)) };
  saveVersions();
  listVersions(n);
  verName.value = '';
  say(`Salvata "${n}".`);
});
document.getElementById('verLoad').addEventListener('click', () => {
  const n = verSel.value;
  if (!versions[n]) return;
  loadLayout(versions[n].data);
  say(`Caricata "${n}".`);
});
document.getElementById('verDel').addEventListener('click', () => {
  const n = verSel.value;
  if (!versions[n]) return;
  delete versions[n];
  saveVersions();
  listVersions();
  say(`Eliminata "${n}".`);
});
document.getElementById('verExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ villa: 'arredi', current: saved, versions }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `villa-arredi-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
const verFile = document.getElementById('verFile');
document.getElementById('verImport').addEventListener('click', () => verFile.click());
verFile.addEventListener('change', async () => {
  const f = verFile.files[0];
  verFile.value = '';
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    Object.assign(versions, j.versions || {});
    saveVersions();
    listVersions();
    if (j.current) loadLayout(j.current);
    say(`Importate ${Object.keys(j.versions || {}).length} versioni.`);
  } catch { say('Il file non è una disposizione valida.'); }
});
listVersions();

function restoreAdded() {
  for (const a of saved.added || []) if (LIB[a.lib]) addFromLibrary(a.lib, a.id, a.at);
}
const libEl = document.getElementById('library');
for (const [group, items] of Object.entries(LIBRARY)) {
  const h = document.createElement('p');
  h.className = 'libhead';
  h.textContent = group;
  const row = document.createElement('div');
  row.className = 'row lib';
  for (const [key, spec] of Object.entries(items)) {
    const b = document.createElement('button');
    b.textContent = spec.label;
    b.addEventListener('click', async () => {
      b.disabled = true;
      const id = `lib:${key}:${Date.now().toString(36)}`;
      const g = await addFromLibrary(key, id);
      b.disabled = false;
      saved.added = [...(saved.added || []), { lib: key, id, at: g.userData.home }];
      remember(g);
      selectObj(g);
    });
    row.append(b);
  }
  libEl.append(h, row);
}
const ray = new THREE.Raycaster();
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = editing && tc.axis === null ? [e.clientX, e.clientY] : null; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  // il primo oggetto colpito, così non si seleziona un mobile dietro un muro
  const hit = ray.intersectObjects(world.children, true).find((h) => h.object.isMesh && h.object.visible && h.object.material.name !== 'glass');
  let o = hit?.object;
  while (o && !movables.includes(o)) o = o.parent;
  selectObj(o || null);
});
addEventListener('keydown', (e) => {
  if (!editing || /input|select|textarea/i.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'g' || k === 'w') setMode('translate');
  else if (k === 'r' || k === 'e') setMode('rotate');
  else if (k === 's') setMode('scale');
  else if (k === 'escape') selectObj(null);
  else if ((k === 'delete' || k === 'backspace') && tc.object) document.getElementById('remove').click();
});

function applyLook(hq) {
  renderer.toneMapping = hq ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = hq ? Number(params.get('exp') || 1.4) : 1.1;
  renderer.shadowMap.type = hq ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.shadowMap.needsUpdate = true;
  // sole: più forte, da sud attraverso le lamelle; ombra su un'area stretta, quindi più definita
  const sunP = params.get('sun')?.split(',').map(Number);
  const dir = hq ? new THREE.Vector3(...(sunP || [-4, 9, 20])) : new THREE.Vector3(-26, 20, 22);
  sun.position.copy(FOCUS).add(dir);
  sun.intensity = hq ? 7.5 : 3.4;
  const e = hq ? 13 : 26;
  Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 80 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = hq ? -0.00015 : -0.0004;
  sun.shadow.normalBias = hq ? 0.012 : 0.03;
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  hemi.intensity = hq ? 0.55 : 0.6;
  hemi.color.set(hq ? '#ffe2bd' : '#f6e6cc');
  sun.color.set(hq ? '#ffc285' : '#ffcd92');
  amb.intensity = hq ? 0.0 : 0.35;
  for (const l of points) l.intensity = hq ? 0.0 : 4;
  scene.environmentIntensity = hq ? 1.0 : 1.5;
  for (const m of materials.cache.values()) {
    if (m.emissive) m.emissiveIntensity = hq ? 0.15 : 1;
  }
  gtao.enabled = hq;
  document.querySelectorAll('[data-q]').forEach((b) => b.classList.toggle('on', b.dataset.q === quality));
}

// ---------------------------------------------------------------- viste
const VIEWS = {
  salotto: { pos: [6.3, 1.5, 19.7], tgt: [1.2, 0.9, 16.2], fov: 62 },
  cucina: { pos: [5.4, 1.55, 17.2], tgt: [10.8, 0.95, 19.6], fov: 62 },
  divano: { pos: [1.4, 1.45, 19.8], tgt: [5.2, 0.6, 15.8], fov: 60 },
  pietra: { pos: [4.2, 1.45, 18.6], tgt: [0.5, 1.3, 16.6], fov: 55 },
  giardino: { pos: [4.2, 1.8, 32.4], tgt: [11, 1.7, 25], fov: 60 },
};
const camP = params.get('cam')?.split(',').map(Number);
if (camP) VIEWS.custom = { pos: camP.slice(0, 3), tgt: camP.slice(3, 6), fov: 60 };
let view = camP ? 'custom' : params.get('view') || 'salotto';
function setView(v, animate = true) {
  view = v;
  const k = VIEWS[v];
  const p = new THREE.Vector3(...k.pos), t = new THREE.Vector3(...k.tgt);
  if (!animate) {
    camera.position.copy(p);
    controls.target.copy(t);
  } else {
    const p0 = camera.position.clone(), t0 = controls.target.clone();
    const t1 = performance.now();
    const step = () => {
      const u = Math.min(1, (performance.now() - t1) / 1600);
      const s = u * u * (3 - 2 * u);
      camera.position.lerpVectors(p0, p, s);
      controls.target.lerpVectors(t0, t, s);
      if (u < 1) requestAnimationFrame(step);
    };
    step();
  }
  camera.fov = k.fov;
  camera.updateProjectionMatrix();
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
document.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
  if (quality === b.dataset.q) return;
  quality = b.dataset.q;
  build();
}));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

quality = params.get('quality') === 'prima' ? 'prima' : 'dopo';
build();
setView(view, false);
let frames = 0;
manager.onLoad = () => { document.body.classList.add('ready'); };
setTimeout(() => document.body.classList.add('ready'), 20000);
renderer.setAnimationLoop(() => {
  controls.update();
  sky.position.copy(camera.position);
  composer.render();
  frames++;
});
window.__mock = { setView, movables, select: selectObj, setEditing, get frames() { return frames; }, setQuality: (q) => { quality = q; build(); } };
