import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VARIANTS } from './plans.js';
import { Materials } from './materials.js';
import { reveal, setupRooms, setRoomProgress } from './reveal.js';
import { buildHouse } from './house.js';
import { buildNature } from './nature.js';
import { buildSheet } from './sheet.js';

const params = new URLSearchParams(location.search);
// la soluzione si sceglie con #a / #b (o ?v=b)
const vid = (location.hash.replace('#', '') || params.get('v')) === 'b' ? 'b' : 'a';
addEventListener('hashchange', () => {
  const h = location.hash.replace('#', '');
  if ((h === 'a' || h === 'b') && h !== vid) location.reload();
});
const variant = VARIANTS[vid];
document.documentElement.dataset.variant = vid;

const isSmall = Math.min(innerWidth, innerHeight) < 700 || params.get('q') === 'low';

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(params.get('q') === 'low' ? 1 : Math.min(devicePixelRatio, isSmall ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 8000);

// ---------------------------------------------------------------- caricamento
const manager = new THREE.LoadingManager();
const fill = document.getElementById('loadFill');
const pct = document.getElementById('loadPct');
manager.onProgress = (_u, done, total) => {
  const p = Math.round((done / total) * 100);
  fill.style.width = p + '%';
  pct.textContent = p + '%';
};

const materials = new Materials(manager);
materials.loadTextures();

// piano di taglio: tutto quello che sta sopra "clip.constant" sparisce
const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.2);

// ---------------------------------------------------------------- cielo
const skyUniforms = {
  uMap: { value: null },
  uMix: { value: 0 },
  uPaper: { value: new THREE.Color('#f3efe7') },
  uShift: { value: 0.287 }, // allinea il sole del cielo con la luce diretta
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(4000, 48, 24),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform float uMix; uniform vec3 uPaper; uniform float uShift;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec2 uv = vec2(fract(atan(d.z, d.x) / 6.2831853 + 0.5 - uShift), asin(clamp(d.y, -1.0, 1.0)) / 3.1415926 + 0.5);
        vec3 c = texture2D(uMap, uv).rgb;
        gl_FragColor = vec4(mix(uPaper, c, uMix), 1.0);
      }`,
  }),
);
sky.renderOrder = -1;
scene.add(sky);

// cielo del tardo pomeriggio (Poly Haven, qwantani late afternoon), già tonemappato in JPG
new THREE.TextureLoader(manager).load('assets/sky/late_afternoon.jpg', (tex) => {
  skyUniforms.uMap.value = tex;
  const env = tex.clone();
  env.mapping = THREE.EquirectangularReflectionMapping;
  env.colorSpace = THREE.SRGBColorSpace;
  env.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(env).texture;
  scene.environmentIntensity = 1.5;
  scene.environmentRotation.y = 0.287 * Math.PI * 2;
});

// ---------------------------------------------------------------- luci
const sun = new THREE.DirectionalLight('#ffd7ad', 3.2);
sun.position.set(-26, 20, 22).add(new THREE.Vector3(6.5, 0, 13));
sun.target.position.set(6.5, 0, 13);
sun.castShadow = true;
sun.shadow.mapSize.set(isSmall ? 2048 : 4096, isSmall ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight('#f4ede2', '#c9b89a', 0.6));
scene.add(new THREE.AmbientLight('#fff4e6', 0.35));
// luce calda d'interni
for (const [x, z] of [[3.0, 17.2], [9.4, 18.8], [7.6, 10.8], [5.25, 10]]) {
  const l = new THREE.PointLight('#ffc98f', 4, 8, 1.4);
  l.position.set(x, 2.6, z);
  scene.add(l);
}

// ---------------------------------------------------------------- modello
const world = new THREE.Group();
scene.add(world);
setupRooms(variant.rooms);
reveal.outCenter.set(11.7, 15.5, 48);
const house = buildHouse(variant, materials, world);
const roofMats = [];
const nature = buildNature(variant, materials, world);
for (const [k, m] of [...materials.cache.entries(), ...materials.lineCache.entries()]) {
  if (k.startsWith('leaves') || k.startsWith('bark')) continue;
  if (k.endsWith('|r')) {
    // coperture: niente taglio, entrano scendendo e sfumando
    m.transparent = true;
    m.userData.baseOpacity = m.opacity;
    roofMats.push(m);
    continue;
  }
  m.clippingPlanes = [clip];
  m.clipShadows = true;
}
const sheet = await buildSheet(variant, variant.rooms);
scene.add(sheet);

// ---------------------------------------------------------------- percorso della camera
const deg = Math.PI / 180;
const PLAN_T = new THREE.Vector3(6.5, 0, 13.2);
function planDistance(fov) {
  const aspect = innerWidth / innerHeight;
  const need = Math.max(32, 19 / aspect);
  return (need / 2) / Math.tan((fov / 2) * deg);
}

// chiavi: orbit = (target, distanza, inclinazione, azimut); look = (posizione, punto guardato)
const walkA = [
  { t: 0.42, pos: [19.5, 1.65, 18.8], tgt: [11.0, 1.4, 15.5], fov: 50 },
  { t: 0.48, pos: [14.2, 1.62, 15.5], tgt: [6.0, 1.3, 16.4], fov: 58 },
  { t: 0.545, pos: [9.2, 1.6, 15.75], tgt: [2.5, 1.0, 18.2], fov: 58 },
  { t: 0.605, pos: [7.2, 1.6, 16.3], tgt: [11.8, 1.15, 19.4], fov: 58 },
  { t: 0.67, pos: [9.45, 1.6, 20.15], tgt: [9.0, 1.2, 26.5], fov: 62 },
  { t: 0.735, pos: [5.25, 1.62, 16.6], tgt: [5.25, 1.5, 9.0], fov: 55 },
  { t: 0.79, pos: [5.25, 1.6, 11.5], tgt: [9.5, 1.3, 10.6], fov: 58 },
  { t: 0.85, pos: [9.6, 1.65, 12.45], tgt: [6.9, 0.7, 9.6], fov: 72 },
  { t: 0.905, pos: [8.9, 1.6, 11.42], tgt: [16, 1.3, 11.6], fov: 58 },
  { t: 0.95, pos: [14.8, 1.7, 11.42], tgt: [20, 1.6, 12.4], fov: 55 },
];
const KEYS = [
  { t: 0.0, orbit: { tgt: PLAN_T.toArray(), r: 'plan', pol: 0.002, az: 0 }, fov: 5.5 },
  { t: 0.16, orbit: { tgt: PLAN_T.toArray(), r: 'plan', pol: 0.002, az: 0 }, fov: 5.5 },
  { t: 0.30, orbit: { tgt: [6.5, 0, 13.5], r: 54, pol: 54 * deg, az: 32 * deg }, fov: 32 },
  ...walkA.map((k, i) => (i === 0 ? { ...k, interp: 'orbit' } : k)),
  { t: 1.0, orbit: { tgt: [2.5, 0.5, 10.4], r: 50, pol: 58 * deg, az: -38 * deg }, fov: 34, interp: 'orbit' },
];

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
function keyPos(k) {
  if (k.pos) return { pos: new THREE.Vector3(...k.pos), tgt: new THREE.Vector3(...k.tgt) };
  const o = k.orbit;
  const r = o.r === 'plan' ? planDistance(k.fov) : o.r;
  const tgt = new THREE.Vector3(...o.tgt);
  if (o.r === 'plan') {
    // su schermi larghi la pianta si sposta a destra, lascia spazio al testo
    const aspect = innerWidth / innerHeight;
    const visW = 2 * r * Math.tan((k.fov / 2) * deg) * aspect;
    if (aspect > 1.15) tgt.x -= Math.min(visW * 0.16, 9);
  }
  const pos = new THREE.Vector3(Math.sin(o.pol) * Math.sin(o.az), Math.cos(o.pol), Math.sin(o.pol) * Math.cos(o.az)).multiplyScalar(r).add(tgt);
  return { pos, tgt };
}
function toOrbit(pos, tgt) {
  const d = tmpA.subVectors(pos, tgt);
  const r = d.length();
  return { r, pol: Math.acos(THREE.MathUtils.clamp(d.y / r, -1, 1)), az: Math.atan2(d.x, d.z) };
}
const smooth = (u) => u * u * (3 - 2 * u);
function catmull(p0, p1, p2, p3, u, out) {
  const u2 = u * u, u3 = u2 * u;
  return out.set(
    0.5 * ((2 * p1.x) + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
    0.5 * ((2 * p1.y) + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
    0.5 * ((2 * p1.z) + (-p0.z + p2.z) * u + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * u2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * u3));
}

function cameraAt(t) {
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
  const k0 = KEYS[i], k1 = KEYS[i + 1];
  const u = smooth(THREE.MathUtils.clamp((t - k0.t) / (k1.t - k0.t), 0, 1));
  const a = keyPos(k0), b = keyPos(k1);
  const fov = Math.exp(THREE.MathUtils.lerp(Math.log(k0.fov), Math.log(k1.fov), u));
  const pos = new THREE.Vector3(), tgt = new THREE.Vector3();
  if (k1.orbit || k1.interp === 'orbit') {
    const oa = toOrbit(a.pos, a.tgt), ob = toOrbit(b.pos, b.tgt);
    let daz = ob.az - oa.az;
    while (daz > Math.PI) daz -= Math.PI * 2;
    while (daz < -Math.PI) daz += Math.PI * 2;
    tgt.lerpVectors(a.tgt, b.tgt, u);
    const r = Math.exp(THREE.MathUtils.lerp(Math.log(oa.r), Math.log(ob.r), u));
    const pol = THREE.MathUtils.lerp(oa.pol, ob.pol, u);
    const az = oa.az + daz * u;
    pos.set(Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az)).multiplyScalar(r).add(tgt);
  } else {
    const kp = KEYS[Math.max(0, i - 1)], kn = KEYS[Math.min(KEYS.length - 1, i + 2)];
    // vicini per la spline; un vicino in volo (orbit) non deve tirare la curva
    const p = (i > 0 && kp.pos) ? keyPos(kp) : a;
    const n = (kn !== k1 && kn.pos && !kn.interp) ? keyPos(kn) : b;
    catmull(p.pos, a.pos, b.pos, n.pos, u, pos);
    catmull(p.tgt, a.tgt, b.tgt, n.tgt, u, tgt);
  }
  return { pos, tgt, fov };
}

// ---------------------------------------------------------------- linea del tempo
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const win = (t, a, b) => clamp01((t - a) / (b - a));
const ROOM_T = {
  soggiorno: [0.49, 0.56], cucina: [0.49, 0.57], disimpegno: [0.70, 0.76], bagno2: [0.74, 0.80],
  padronale: [0.775, 0.84], guardaroba: [0.82, 0.88],
};
const DEFAULT_T = [0.93, 0.995];

// coperture: scendono di qualche metro e sfumano dentro
function setRoof(p) {
  const g = house.roofGroup;
  g.visible = p > 0.001;
  g.position.y = (1 - p) * (1 - p) * 7;
  for (const m of roofMats) {
    m.opacity = m.userData.baseOpacity * p;
    m.depthWrite = p > 0.98;
  }
}

function applyTimeline(t) {
  // muri che crescono, poi il tetto
  let h = 1.2;
  h += smooth(win(t, 0.03, 0.15)) * (2.97 - 1.2);
  // poi il taglio sparisce: sopra i muri c'è solo il gruppo delle coperture
  h += win(t, 0.30, 0.31) * 60;
  clip.constant = h;
  setRoof(smooth(win(t, 0.31, 0.40)));
  sheet.material.opacity = 1 - smooth(win(t, 0.03, 0.12));
  sheet.visible = sheet.material.opacity > 0.002;
  skyUniforms.uMix.value = smooth(win(t, 0.27, 0.40));
  // gli ulivi crescono mentre la camera si alza
  nature.trees.forEach((g, i) => {
    const s = smooth(win(t, 0.13 + i * 0.012, 0.27 + i * 0.012));
    g.scale.setScalar(Math.max(s, 0.0001));
    g.visible = s > 0.001;
  });
  const out = win(t, 0.29, 0.42);
  reveal.outProgress.value = out >= 1 ? 1000 : out;
  for (const r of variant.rooms) {
    const [a, b] = ROOM_T[r.id] || DEFAULT_T;
    const p = win(t, a, b);
    setRoomProgress(r, p >= 1 ? 1000 : p);
  }
}

// ---------------------------------------------------------------- testi
const caps = [...document.querySelectorAll('[data-in]')];
function applyCaptions(t) {
  for (const el of caps) {
    const a = +el.dataset.in, b = +el.dataset.out;
    const fade = 0.012;
    let o = Math.min(clamp01((t - a) / fade + (a <= 0 ? 1 : 0)), clamp01((b - t) / fade + (b >= 1 ? 1 : 0)));
    el.style.opacity = o;
    el.style.transform = `translateY(${(1 - o) * 14}px)`;
    el.style.pointerEvents = o > 0.5 ? 'auto' : 'none';
  }
  const chapters = document.querySelectorAll('.chapters [data-t]');
  let active = null;
  for (const c of chapters) if (t >= +c.dataset.t - 0.005) active = c;
  for (const c of chapters) c.classList.toggle('on', c === active);
  document.getElementById('bar').style.transform = `scaleX(${t})`;
}

// ---------------------------------------------------------------- scroll
const state = { t: 0, shown: 0 };
const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
gsap.registerPlugin(ScrollTrigger);
gsap.to(state, {
  t: 1, ease: 'none',
  scrollTrigger: { trigger: '#track', start: 'top top', end: 'bottom bottom', scrub: 0.6 },
});

const scrollToT = (t, immediate = false) => {
  const track = document.getElementById('track');
  const max = track.offsetHeight - innerHeight;
  lenis.scrollTo(t * max, immediate ? { immediate: true, force: true } : { duration: 2.2 });
};
document.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', (e) => {
  e.preventDefault();
  scrollToT(+el.dataset.go);
}));

// ---------------------------------------------------------------- esplora
let controls = null;
const exploreBtns = document.querySelectorAll('[data-explore]');
function setExplore(on) {
  document.body.classList.toggle('exploring', on);
  if (on) {
    lenis.stop();
    controls = new OrbitControls(camera, canvas);
    controls.target.set(6.5, 1, 13.5);
    controls.enableDamping = true;
    controls.maxPolarAngle = 88 * deg;
    controls.minDistance = 2;
    controls.maxDistance = 140;
    camera.fov = 40;
    camera.updateProjectionMatrix();
    applyTimeline(1);
  } else {
    controls?.dispose();
    controls = null;
    lenis.start();
  }
}
exploreBtns.forEach((b) => b.addEventListener('click', () => setExplore(!document.body.classList.contains('exploring'))));
const roofBtn = document.getElementById('roofToggle');
roofBtn?.addEventListener('click', () => {
  const off = roofBtn.classList.toggle('off');
  roofBtn.textContent = off ? 'Rimetti il tetto' : 'Togli il tetto';
  clip.constant = off ? 2.97 : 61;
  setRoof(off ? 0 : 1);
});

// ---------------------------------------------------------------- ciclo
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);

const look = new THREE.Vector3();
function frame() {
  if (controls) {
    controls.update();
    camera.near = 0.05;
  } else {
    const t = state.t;
    applyTimeline(t);
    applyCaptions(t);
    const c = cameraAt(t);
    camera.position.copy(c.pos);
    look.copy(c.tgt);
    camera.lookAt(look);
    camera.fov = c.fov;
    const dist = c.pos.distanceTo(c.tgt);
    camera.near = THREE.MathUtils.clamp((dist - 40) * 0.3, 0.05, 80);
  }
  camera.updateProjectionMatrix();
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
}

manager.onLoad = () => {
  document.body.classList.add('ready');
  setTimeout(() => document.getElementById('loader')?.remove(), 1200);
};
// se tutte le risorse erano già in cache
if (manager.itemsLoaded !== undefined) setTimeout(() => { if (!document.body.classList.contains('ready')) manager.onLoad(); }, 15000);

renderer.setAnimationLoop(frame);

// per i test
window.__villa = { state, applyTimeline, cameraAt, scrollToT, setExplore };
