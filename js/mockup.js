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
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
  for (const o of [...world.children]) {
    world.remove(o);
    o.traverse?.((m) => m.geometry?.dispose());
  }
  const hq = quality === 'dopo';
  setQuality(hq ? 3 : 1);
  const plantSpots = hq ? [] : null;
  const house = buildHouse(variant, materials, world, {
    featureStone: hq ? 'ashlar|0' : 'stoneIn|0', plantSpots, modelSofa: hq, place: hq ? fabPlace : null,
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
  }
  house.roofGroup.position.y = 0;
  const nature = buildNature(variant, materials, world);
  nature.trees.forEach((g) => g.scale.setScalar(1));
  const natureMeshes = new Set();
  if (params.get('treeshadow') !== '1') nature.trees.forEach((g) => g.traverse((o) => natureMeshes.add(o)));
  world.traverse((o) => {
    if (o.isMesh) { o.castShadow = o.material.name !== 'glass' && !o.material.transparent && !natureMeshes.has(o); o.receiveShadow = true; }
    if (o.isLineSegments) o.visible = false;
  });
  setQuality(1);
  applyLook(hq);
}

// piante e vasi veri da Poly Haven (CC0), scalati all'altezza prevista
const gltf = new GLTFLoader(manager);
const modelCache = {};
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
  const url = name.startsWith('fab/') ? `assets/models/${name}.json` : `assets/models/${name}/${name}.json`;
  modelCache[name] ||= fetchGlb(url).then((glb) => new Promise((ok, ko) => gltf.parse(glb, url.slice(0, url.lastIndexOf('/') + 1), (g) => ok(g.scene), ko)));
  modelCache[name].catch((e) => console.error('modello', name, e));
  return modelCache[name];
}
const PLANT_PICK = ['potted_plant_02', 'potted_plant_04', 'potted_plant_02'];
function placePlants(spots) {
  spots.forEach(([x, z, h], i) => loadModel(PLANT_PICK[i % PLANT_PICK.length]).then((src) => {
    const m = src.clone(true);
    const box = new THREE.Box3().setFromObject(m);
    const s = h / (box.max.y - box.min.y);
    m.scale.setScalar(s);
    m.position.set(x, -box.min.y * s, z);
    m.rotation.y = i * 2.1;
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    world.add(m);
  }));
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
    loadModel(spec.file).then((src) => {
      const m = src.clone(true);
      const k = spec.k;
      m.scale.set(spec.mirror ? -k : k, k, k);
      m.rotation.y = rot + (spec.rot || 0);
      m.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(m);
      m.position.set(x - (box.min.x + box.max.x) / 2, y - box.min.y, z - (box.min.z + box.max.z) / 2);
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      world.add(m);
    });
  }
}

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
window.__mock = { setView, get frames() { return frames; }, setQuality: (q) => { quality = q; build(); } };
