import * as THREE from 'three';

// Ogni materiale nasce come disegno: carta piatta, con le linee a inchiostro
// sopra. Quando la camera entra in una stanza i materiali veri si allargano a
// cerchio da un punto della stanza. Le facce interne dei muri tagliati
// (backface) restano inchiostro: è il "pieno" della sezione.

export const MAX_RECTS = 24;

export const reveal = {
  rects: Array.from({ length: MAX_RECTS }, () => new THREE.Vector4(1e5, 1e5, -1e5, -1e5)),
  centers: Array.from({ length: MAX_RECTS }, () => new THREE.Vector3(0, 0, 1)),
  progress: new Array(MAX_RECTS).fill(0),
  outCenter: new THREE.Vector3(0, 0, 40),
  outProgress: { value: 0 },
  paper: new THREE.Color('#f3efe7'),
  ink: new THREE.Color('#24221f'),
};

// uniform condivise: lo stesso oggetto va in tutti i materiali
const shared = {
  uRect: { value: reveal.rects },
  uCen: { value: reveal.centers },
  uProg: { value: reveal.progress },
  uOutC: { value: reveal.outCenter },
  uOutP: reveal.outProgress,
  uPaper: { value: new THREE.Vector3(0.953, 0.937, 0.906) },
  uInk: { value: new THREE.Vector3(0.141, 0.133, 0.122) },
};

const GLSL_HEAD = /* glsl */`
varying vec3 vRevW;
uniform vec4 uRect[${MAX_RECTS}];
uniform vec3 uCen[${MAX_RECTS}];
uniform float uProg[${MAX_RECTS}];
uniform vec3 uOutC;
uniform float uOutP;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform float uMode;   // 0 interno, 1 esterno, 2 entrambi
uniform float uCap;    // 1: il disegno di questa faccia è inchiostro
float revealAmount(vec3 p) {
  float r = 0.0;
  if (uMode != 1.0) {
    for (int i = 0; i < ${MAX_RECTS}; i++) {
      vec4 R = uRect[i];
      if (p.x > R.x - 0.06 && p.x < R.z + 0.06 && p.z > R.y - 0.06 && p.z < R.w + 0.06) {
        float d = length(p.xz - uCen[i].xy) / uCen[i].z;
        r = max(r, clamp((uProg[i] * 1.25 - d) / 0.25, 0.0, 1.0));
      }
    }
  }
  if (uMode != 0.0) {
    float d = length(p.xz - uOutC.xy) / uOutC.z;
    r = max(r, clamp((uOutP * 1.25 - d) / 0.25, 0.0, 1.0));
  }
  return r;
}
`;

function patchVertex(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vRevW;')
    .replace('#include <project_vertex>', `#include <project_vertex>
#ifdef USE_INSTANCING
  vRevW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vRevW = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`);
}

function addUniforms(shader, mode, cap) {
  Object.assign(shader.uniforms, shared);
  shader.uniforms.uMode = { value: mode };
  shader.uniforms.uCap = { value: cap };
}

// Materiale di superficie (MeshStandard/Physical)
export function revealSurface(mat, { mode = 0, cap = 0, sketchShade = 0.08 } = {}) {
  mat.onBeforeCompile = (shader) => {
    addUniforms(shader, mode, cap);
    patchVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_HEAD)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  float rv = revealAmount(vRevW);
  vec3 drawC = (gl_FrontFacing && uCap < 0.5) ? uPaper : uInk;
  float lum = clamp(dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11)) * 1.6, 0.0, 1.0);
  vec3 sketch = drawC * (1.0 - ${sketchShade.toFixed(3)} + ${sketchShade.toFixed(3)} * lum);
  if (!gl_FrontFacing) rv = 0.0;
  gl_FragColor.rgb = mix(sketch, gl_FragColor.rgb, rv);
  gl_FragColor.a = mix(1.0, gl_FragColor.a, rv);`);
  };
  mat.customProgramCacheKey = () => `rev-${mode}-${cap}-${sketchShade}`;
  return mat;
}

// Linee del disegno: spariscono dove la stanza è già rivelata
export function revealLines(mat, { mode = 0, keep = 0.0 } = {}) {
  mat.onBeforeCompile = (shader) => {
    addUniforms(shader, mode, 0);
    patchVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_HEAD)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
  float rv = revealAmount(vRevW);
  gl_FragColor.a *= mix(1.0, ${keep.toFixed(3)}, rv);`);
  };
  mat.customProgramCacheKey = () => `revl-${mode}-${keep}`;
  mat.transparent = true;
  return mat;
}

// Assegna i rettangoli delle stanze agli slot dello shader.
export function setupRooms(rooms) {
  const slots = [];
  let i = 0;
  for (const room of rooms) {
    room.slots = [];
    // centro della rivelazione: il punto da cui la stanza "si colora"
    let minx = 1e9, minz = 1e9, maxx = -1e9, maxz = -1e9;
    for (const r of room.rects) {
      minx = Math.min(minx, r[0]); minz = Math.min(minz, r[1]);
      maxx = Math.max(maxx, r[2]); maxz = Math.max(maxz, r[3]);
    }
    const c = room.revealFrom || [(minx + maxx) / 2, (minz + maxz) / 2];
    let rad = 0;
    for (const [x, z] of [[minx, minz], [maxx, minz], [minx, maxz], [maxx, maxz]]) {
      rad = Math.max(rad, Math.hypot(x - c[0], z - c[1]));
    }
    for (const r of room.rects) {
      if (i >= MAX_RECTS) break;
      reveal.rects[i].set(r[0], r[1], r[2], r[3]);
      reveal.centers[i].set(c[0], c[1], rad + 0.6);
      room.slots.push(i);
      slots.push(i);
      i++;
    }
  }
  return slots;
}

export function setRoomProgress(room, p) {
  for (const s of room.slots) reveal.progress[s] = p;
}
