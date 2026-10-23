import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VARIANTS, H } from './plans.js';
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
const sun = new THREE.DirectionalLight('#ffcd92', 3.4);
sun.position.set(-26, 20, 22).add(new THREE.Vector3(6.5, 0, 13));
sun.target.position.set(6.5, 0, 13);
sun.castShadow = true;
sun.shadow.mapSize.set(isSmall ? 2048 : 4096, isSmall ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight('#f6e6cc', '#c6a982', 0.6));
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
// pass: punto di passaggio (porte, vetrate), la camera non si ferma
const walkA = [
  { t: 0.42, pos: [19.5, 1.65, 18.8], tgt: [11.0, 1.4, 15.5], fov: 50 },
  { t: 0.455, pos: [14.2, 1.62, 15.5], tgt: [6.0, 1.3, 16.4], fov: 58 },
  { t: 0.49, pos: [9.2, 1.6, 15.75], tgt: [2.5, 1.0, 18.2], fov: 58, room: 'soggiorno' },
  { t: 0.525, pos: [7.2, 1.6, 16.3], tgt: [11.8, 1.15, 19.4], fov: 58, room: 'cucina' },
  { t: 0.56, pos: [9.75, 1.6, 21.7], tgt: [7.6, 1.1, 26.5], fov: 62 },
  { t: 0.575, pos: [8.6, 1.6, 22.6], tgt: [3.0, 1.2, 22.4], fov: 62, pass: true },
  { t: 0.595, pos: [4.2, 1.6, 22.1], tgt: [0.4, 0.9, 21.6], fov: 66, room: 'deposito' },
  { t: 0.615, pos: [3.0, 1.62, 19.4], tgt: [5.0, 1.5, 15.0], fov: 60, pass: true },
  { t: 0.64, pos: [5.25, 1.62, 16.4], tgt: [5.25, 1.5, 9.0], fov: 55, room: 'disimpegno' },
  { t: 0.67, pos: [5.25, 1.6, 13.7], tgt: [9.6, 1.0, 13.9], fov: 72, room: 'bagno2' },
  { t: 0.70, pos: [5.2, 1.6, 12.0], tgt: [1.0, 0.9, 13.2], fov: 72, room: 'camera' },
  { t: 0.73, pos: [5.2, 1.6, 9.55], tgt: [0.9, 1.0, 9.4], fov: 72, room: 'bagno' },
  { t: 0.76, pos: [5.3, 1.6, 7.6], tgt: [1.0, 1.1, 5.9], fov: 68, room: 'lavanderia' },
  { t: 0.79, pos: [1.9, 1.6, 5.4], tgt: [1.9, 0.9, 1.0], fov: 66, room: 'cantina' },
  { t: 0.81, pos: [5.3, 1.6, 7.9], tgt: [5.3, 1.5, 12.0], fov: 60, pass: true },
  { t: 0.825, pos: [5.3, 1.6, 11.4], tgt: [9.5, 1.3, 10.6], fov: 60, pass: true },
  { t: 0.845, pos: [9.6, 1.65, 12.45], tgt: [6.9, 0.7, 9.6], fov: 72, room: 'padronale' },
  { t: 0.875, pos: [9.6, 1.6, 8.0], tgt: [6.0, 1.0, 7.9], fov: 74, room: 'guardaroba' },
  { t: 0.90, pos: [8.9, 1.6, 11.42], tgt: [16, 1.3, 11.6], fov: 58 },
  { t: 0.915, pos: [11.4, 1.6, 10.8], tgt: [11.5, 1.3, 5.0], fov: 58, pass: true },
  { t: 0.93, pos: [11.55, 1.6, 8.4], tgt: [11.5, 1.2, 4.0], fov: 60 },
  { t: 0.955, pos: [11.6, 1.6, 5.7], tgt: [5.0, 0.8, 2.4], fov: 70, room: 'garage' },
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
  // la camera si ferma un attimo su ogni inquadratura prima di ripartire
  const HOLD = k0.pass ? 0 : 0.22;
  const u = smooth(THREE.MathUtils.clamp(((t - k0.t) / (k1.t - k0.t) - HOLD) / (1 - HOLD), 0, 1));
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
  soggiorno: [0.44, 0.50], cucina: [0.44, 0.51], deposito: [0.565, 0.60], disimpegno: [0.615, 0.65],
  bagno2: [0.645, 0.68], camera: [0.675, 0.71], bagno: [0.705, 0.74], lavanderia: [0.735, 0.77],
  cantina: [0.765, 0.80], padronale: [0.82, 0.855], guardaroba: [0.85, 0.885], garage: [0.915, 0.955],
};
const DEFAULT_T = [0.93, 0.995];

// coperture: scendono di qualche metro e sfumano dentro
function setRoof(p) {
  const g = house.roofGroup;
  g.visible = p > 0.001;
  g.position.y = (1 - p) * (1 - p) * 7;
  for (const m of roofMats) {
    m.opacity = m.userData.baseOpacity * p;
    m.depthWrite = true;
  }
}

function applyTimeline(t) {
  // muri che crescono, poi il tetto
  let h = 1.2;
  h += smooth(win(t, 0.03, 0.15)) * (2.97 - 1.2);
  // il pieno nero della sezione sbiadisce in carta, poi il taglio sparisce:
  // sopra i muri c'è solo il gruppo delle coperture
  reveal.capK.value = 1 - smooth(win(t, 0.24, 0.30));
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
    const fade = 0.02;
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
// come Casa Serra: Lenis con inerzia lunga, poi la camera insegue lo scroll
// con uno smorzamento esponenziale
const state = { t: 0, target: 0, shown: 0 };
const CAM_WEIGHT = 2.2;
const lenis = new Lenis({ duration: 1.6, easing: (e) => Math.min(1, 1.001 - Math.pow(2, -10 * e)), smoothWheel: true });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
gsap.registerPlugin(ScrollTrigger);
// lo scroll non è lineare: la pianta e il volume restano al ritmo di prima,
// il giro delle stanze prende più del doppio dello spazio
const SPLIT_P = 0.266, SPLIT_T = 0.42;
const pToT = (p) => (p < SPLIT_P ? (p / SPLIT_P) * SPLIT_T : SPLIT_T + ((p - SPLIT_P) / (1 - SPLIT_P)) * (1 - SPLIT_T));
const tToP = (t) => (t < SPLIT_T ? (t / SPLIT_T) * SPLIT_P : SPLIT_P + ((t - SPLIT_T) / (1 - SPLIT_T)) * (1 - SPLIT_P));
ScrollTrigger.create({
  trigger: '#track', start: 'top top', end: 'bottom bottom',
  onUpdate: (st) => { state.target = pToT(st.progress); },
});

const scrollToT = (t, immediate = false) => {
  const track = document.getElementById('track');
  const max = track.offsetHeight - innerHeight;
  const y = tToP(t) * max;
  if (immediate) {
    lenis.scrollTo(y, { immediate: true, force: true });
    state.target = state.t = t;
  } else {
    lenis.scrollTo(y, { duration: 4, easing: (e) => 1 - Math.pow(1 - e, 4) });
  }
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
// esplora: salto diretto in ogni locale, con le stesse inquadrature del racconto
const roomJump = document.getElementById('roomJump');
const OVERVIEW = { pos: [6.5 + 30, 34, 13.5 + 30], tgt: [6.5, 1, 13.5], fov: 40 };
function flyTo(v) {
  if (!controls) return;
  const p = new THREE.Vector3(...v.pos), q = new THREE.Vector3(...v.tgt);
  // dentro una stanza il target sta a un metro e mezzo: si ruota sul posto
  if (v.room) q.sub(p).setLength(1.5).add(p);
  gsap.to(camera.position, { x: p.x, y: p.y, z: p.z, duration: 2.4, ease: 'power3.inOut' });
  gsap.to(controls.target, { x: q.x, y: q.y, z: q.z, duration: 2.4, ease: 'power3.inOut' });
  gsap.to(camera, { fov: v.fov, duration: 2.4, ease: 'power3.inOut' });
  controls.minDistance = v.room ? 0.3 : 2;
}
if (roomJump) {
  const add = (label, v) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = label;
    b.addEventListener('click', () => flyTo(v));
    roomJump.appendChild(b);
  };
  add('Vista d’insieme', OVERVIEW);
  for (const k of walkA) {
    if (!k.room) continue;
    const r = variant.rooms.find((x) => x.id === k.room);
    if (r) add(r.name, k);
  }
  add('Portico', { pos: [10.4, 1.6, 25.2], tgt: [4.0, 1.0, 22.0], fov: 66, room: 'portico' });
}

const roofBtn = document.getElementById('roofToggle');
roofBtn?.addEventListener('click', () => {
  const off = roofBtn.classList.toggle('off');
  roofBtn.textContent = off ? 'Rimetti il tetto' : 'Togli il tetto';
  clip.constant = off ? 2.97 : 61;
  reveal.capK.value = off ? 1 : 0;
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
let last = performance.now();
function frame(now = performance.now()) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (controls) {
    controls.update();
    // piano vicino proporzionato alla distanza: più precisione nel depth buffer
    camera.near = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * 0.02, 0.05, 30);
  } else {
    state.t += (state.target - state.t) * (1 - Math.exp(-dt * CAM_WEIGHT));
    if (Math.abs(state.target - state.t) < 1e-5) state.t = state.target;
    const t = state.t;
    applyTimeline(t);
    applyCaptions(t);
    const c = cameraAt(t);
    camera.position.copy(c.pos);
    look.copy(c.tgt);
    camera.lookAt(look);
    camera.fov = c.fov;
    const dist = c.pos.distanceTo(c.tgt);
    camera.near = Math.max(THREE.MathUtils.clamp(dist * 0.02, 0.05, 30), THREE.MathUtils.clamp((dist - 40) * 0.3, 0.05, 80));
  }
  reveal.cutOn.value = clip.constant < H + 0.5 ? 1 : 0;
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
window.__villa = {
  state, applyTimeline, cameraAt, scrollToT, setExplore,
  look: ([x, y, z, tx, ty, tz]) => { camera.position.set(x, y, z); controls?.target.set(tx, ty, tz); },
};
