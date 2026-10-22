import { WALLS_A, WALLS_B } from './walls-data.js';

// Le due soluzioni proposte. Tutto in metri, x verso est, z verso sud.
// I muri vengono dal PDF; aperture, stanze e arredi sono letti dalla pianta.

export const H = 3.0; // altezza interna

// Locali interni: servono per i nomi in pianta, per decidere quali facce dei
// muri sono intonaco (dentro) e quali pietra (fuori), e per la rivelazione dei
// materiali stanza per stanza.
const ROOMS = [
  { id: 'garage', name: 'Autorimessa', note: '7,35 × 6,25', floor: 'garage',
    rects: [[3.514, 0.301, 10.863, 4.356], [4.111, 4.356, 10.863, 6.549], [10.863, 4.453, 12.696, 6.549]],
    label: [7.2, 3.0] },
  { id: 'cantina', name: 'Cantina', note: '2,70 × 4,06', floor: 'garage',
    rects: [[0.601, 0.301, 3.306, 4.356]], label: [1.95, 2.4] },
  { id: 'lavanderia', name: 'Lavanderia', note: '3,40 × 3,40', floor: 'stone',
    rects: [[0.453, 4.606, 3.861, 8.048]], label: [2.45, 6.35] },
  { id: 'disimpegno', name: 'Disimpegno', note: '', floor: 'stone', revealFrom: [5.25, 15.5],
    rects: [[3.861, 6.799, 5.8, 8.048], [4.699, 8.048, 5.8, 14.973]], label: null },
  { id: 'bagno', name: 'Bagno', note: 'mq 10,42', floor: 'stone',
    rects: [[0.453, 8.175, 4.449, 10.774]], label: [2.3, 9.6] },
  { id: 'camera', name: 'Camera', note: 'mq 15,20', floor: 'oak',
    rects: [[0.453, 10.897, 4.449, 14.698]], label: [2.45, 13.65] },
  { id: 'guardaroba', name: 'Guardaroba', note: '', floor: 'oak',
    rects: [[5.927, 6.849, 9.927, 8.898]], label: [7.9, 7.75] },
  { id: 'padronale', name: 'Camera padronale', note: 'mq 14,40', floor: 'oak', revealFrom: [5.9, 11.5],
    rects: [[5.927, 9.025, 9.927, 12.624]], label: [7.9, 11.75] },
  { id: 'bagno2', name: 'Bagno', note: 'mq 7,64', floor: 'stone',
    rects: [[5.927, 12.772, 9.927, 14.842]], label: [7.2, 13.85] },
  { id: 'soggiorno', name: 'Soggiorno', note: '', floor: 'stone', revealFrom: [9.9, 15.5],
    rects: [[0.453, 14.973, 6.9, 20.074]], label: [3.45, 19.65] },
  { id: 'cucina', name: 'Cucina e pranzo', note: '', floor: 'stone', revealFrom: [9.9, 15.5],
    rects: [[6.9, 14.973, 9.927, 16.535], [6.9, 16.535, 12.543, 20.87], [5.55, 20.523, 6.9, 20.87], [7.256, 14.372, 8.255, 14.973]],
    label: [7.6, 17.62] },
  { id: 'deposito', name: 'Deposito', note: '', floor: 'garage',
    rects: [[0.301, 20.523, 1.348, 22.919]], label: null },
];

// Aperture nei muri: davanzale e architrave in metri.
const OPEN_COMMON = [
  { r: [0.301, 1.516, 0.601, 2.417], sill: 0.9, head: 2.3, kind: 'window' },
  { r: [0.0, 5.203, 0.453, 6.303], sill: 1.0, head: 2.3, kind: 'window' },
  { r: [0.0, 8.945, 0.453, 10.046], sill: 1.3, head: 2.3, kind: 'window' },
  { r: [0.0, 11.692, 0.453, 12.653], sill: 0.5, head: 2.4, kind: 'window' },
  { r: [4.936, 0.0, 9.936, 0.301], sill: 0, head: 2.6, kind: 'garage' },
  { r: [10.863, 1.651, 11.159, 2.451], sill: 1.0, head: 2.3, kind: 'window' },
  { r: [11.045, 6.549, 12.048, 6.849], sill: 0, head: 2.4, kind: 'door' },
  { r: [9.927, 7.497, 10.376, 8.2], sill: 1.0, head: 2.3, kind: 'window' },
  { r: [9.927, 10.875, 10.376, 11.972], sill: 0, head: 2.6, kind: 'glass' },
  { r: [9.927, 13.271, 10.376, 13.944], sill: 1.3, head: 2.3, kind: 'window' },
  { r: [9.927, 14.973, 10.376, 16.087], sill: 0, head: 2.7, kind: 'entry' },
  { r: [1.448, 20.074, 4.449, 20.523], sill: 0, head: 2.5, kind: 'glass' },
  { r: [7.497, 20.87, 10.494, 21.319], sill: 0, head: 2.5, kind: 'glass' },
  { r: [1.348, 20.523, 1.448, 22.919], sill: 0, head: 2.4, kind: 'panel' },
];

// Solaio piano sopra le stanze (il soffitto); sopra stanno i tetti a padiglione.
const ROOF_COMMON = [
  [0.301, 0.0, 11.159, 4.153],
  [0.0, 4.153, 12.996, 6.849],
  [0.0, 6.849, 12.996, 20.523],
  [5.101, 20.523, 12.996, 21.319],
  [0.0, 20.523, 1.448, 23.169],
];

// Tetti a padiglione (rettangoli di gronda prima della sporgenza)
const HIPS = [
  [0.301, 0.0, 11.159, 6.849],
  [11.159, 4.153, 12.996, 6.849],
  [0.0, 6.849, 12.996, 21.319],
  [0.0, 21.319, 1.448, 23.169],
];

// Lotto, letto dalle quote 28,06 / 39,13 / 18,13 / 22,46.
const LOT = [[-5.0, -6.8], [13.0, -6.8], [20.9, 9.6], [22.0, 32.1], [-5.0, 32.3]];

export const VARIANTS = {
  a: {
    id: 'a', code: '3-A', title: 'Soluzione 3-A',
    walls: WALLS_A,
    rooms: ROOMS,
    openings: [
      ...OPEN_COMMON,
      { r: [0.0, 18.284, 0.453, 19.126], sill: 0.5, head: 2.5, kind: 'window' },
      { r: [12.543, 18.284, 12.996, 19.126], sill: 1.05, head: 2.3, kind: 'window' },
    ],
    roofs: ROOF_COMMON,
    hips: HIPS,
    portico: { x1: 12.996, area: 'mq 66,02', table: [6.45, 23.05, 11.45, 23.95] },
    livingArea: 'mq 63,17',
    kitchen: 'island',
    lot: LOT,
    summary: 'Cucina con isola, finestra sul lato ovest del soggiorno, portico a sud largo tutta la casa (66 mq).',
  },
  b: {
    id: 'b', code: '3-B', title: 'Soluzione 3-B',
    walls: WALLS_B,
    rooms: ROOMS,
    openings: [
      ...OPEN_COMMON,
      { r: [12.543, 19.101, 12.996, 19.943], sill: 1.05, head: 2.3, kind: 'window' },
    ],
    roofs: ROOF_COMMON,
    hips: HIPS,
    portico: { x1: 11.151, area: 'mq 53,57', table: [3.38, 23.1, 8.38, 24.0] },
    livingArea: 'mq 63,17',
    kitchen: 'linear',
    lot: LOT,
    summary: 'Cucina lineare senza isola e tavolo lungo, soggiorno chiuso a ovest, portico più compatto (53,57 mq).',
  },
};
