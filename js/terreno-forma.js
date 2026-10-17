// Altura do chão. Uma grade de 1 m sobre um quadrado de 640 m; a malha do
// terreno e a física do jogador usam a mesma grade e a mesma triangulação,
// então o pé nunca flutua nem afunda.
import { fbm2 } from './ruido.js';

export const MUNDO = 640;
export const RES = 640;
export const CELULA = MUNDO / RES;
export const MEIO = MUNDO / 2;

function alturaContinua(x, z) {
  const morros = fbm2(x / 140 + 31.7, z / 140 + 12.3, { oitavas: 4, semente: 7 });
  const ondas = fbm2(x / 26 + 5.1, z / 26 + 9.4, { oitavas: 3, semente: 13 });
  const miudo = fbm2(x / 4.5, z / 4.5, { oitavas: 2, semente: 29 });
  let h = (morros - 0.5) * 18 + (ondas - 0.5) * 2.4 + (miudo - 0.5) * 0.35;
  // a clareira onde ele começa é quase plana
  const r = Math.hypot(x, z);
  const plano = Math.exp(-(r * r) / (2 * 14 * 14));
  return h * (1 - plano * 0.85);
}

let grade = null;

export function gradeAlturas() {
  if (grade) return grade;
  const n = RES + 1;
  grade = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const z = -MEIO + j * CELULA;
    for (let i = 0; i < n; i++) grade[j * n + i] = alturaContinua(-MEIO + i * CELULA, z);
  }
  return grade;
}

// Os dois triângulos de cada célula dividem pela diagonal (0,0)-(1,1),
// igual aos índices da malha em terreno.js.
export function altura(x, z) {
  const g = gradeAlturas();
  const n = RES + 1;
  let fx = (x + MEIO) / CELULA, fz = (z + MEIO) / CELULA;
  fx = Math.min(Math.max(fx, 0), RES - 1e-6);
  fz = Math.min(Math.max(fz, 0), RES - 1e-6);
  const i = Math.floor(fx), j = Math.floor(fz);
  const u = fx - i, v = fz - j;
  const h00 = g[j * n + i], h10 = g[j * n + i + 1];
  const h01 = g[(j + 1) * n + i], h11 = g[(j + 1) * n + i + 1];
  if (u >= v) return h00 + (h10 - h00) * u + (h11 - h10) * v;
  return h00 + (h11 - h01) * u + (h01 - h00) * v;
}

export function normal(x, z) {
  const e = 0.5;
  const dx = altura(x + e, z) - altura(x - e, z);
  const dz = altura(x, z + e) - altura(x, z - e);
  const l = Math.hypot(dx, 2 * e, dz);
  return [-dx / l, (2 * e) / l, -dz / l];
}
