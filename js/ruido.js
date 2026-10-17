// Ruído determinístico em JS puro (sem three.js), para o terreno, as texturas
// geradas e a forma das árvores. Mesma semente, mesmo mundo.

export function rng(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, semente = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((semente | 0) + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hash3(x, y, z, semente = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2246822519) ^ Math.imul((semente | 0) + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const suave = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const envolver = (i, p) => (p ? ((i % p) + p) % p : i);

// Ruído de valor 2D em [0, 1). periodo > 0 deixa o ruído repetir a cada
// `periodo` células (textura que emenda sem costura).
export function ruido2(x, y, semente = 0, periodo = 0, periodoY = periodo) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = suave(x - xi), v = suave(y - yi);
  const x0 = envolver(xi, periodo), x1 = envolver(xi + 1, periodo);
  const y0 = envolver(yi, periodoY), y1 = envolver(yi + 1, periodoY);
  const a = hash2(x0, y0, semente), b = hash2(x1, y0, semente);
  const c = hash2(x0, y1, semente), d = hash2(x1, y1, semente);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function ruido3(x, y, z, semente = 0, periodo = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = suave(x - xi), v = suave(y - yi), w = suave(z - zi);
  const x0 = envolver(xi, periodo), x1 = envolver(xi + 1, periodo);
  const y0 = envolver(yi, periodo), y1 = envolver(yi + 1, periodo);
  const z0 = envolver(zi, periodo), z1 = envolver(zi + 1, periodo);
  const l = (a, b, t) => a + (b - a) * t;
  const c00 = l(hash3(x0, y0, z0, semente), hash3(x1, y0, z0, semente), u);
  const c10 = l(hash3(x0, y1, z0, semente), hash3(x1, y1, z0, semente), u);
  const c01 = l(hash3(x0, y0, z1, semente), hash3(x1, y0, z1, semente), u);
  const c11 = l(hash3(x0, y1, z1, semente), hash3(x1, y1, z1, semente), u);
  return l(l(c00, c10, v), l(c01, c11, v), w);
}

export function fbm2(x, y, { oitavas = 5, ganho = 0.5, semente = 0, periodo = 0, periodoY = periodo } = {}) {
  let soma = 0, amp = 0.5, f = 1, norma = 0;
  for (let i = 0; i < oitavas; i++) {
    soma += amp * ruido2(x * f, y * f, semente + i * 101, periodo ? periodo * f : 0, periodoY ? periodoY * f : 0);
    norma += amp; amp *= ganho; f *= 2;
  }
  return soma / norma;
}

export function fbm3(x, y, z, { oitavas = 4, ganho = 0.5, semente = 0, periodo = 0 } = {}) {
  let soma = 0, amp = 0.5, f = 1, norma = 0;
  for (let i = 0; i < oitavas; i++) {
    soma += amp * ruido3(x * f, y * f, z * f, semente + i * 101, periodo ? periodo * f : 0);
    norma += amp; amp *= ganho; f *= 2;
  }
  return soma / norma;
}

// Ruído celular (Worley): distância ao ponto mais perto (f1) e ao segundo (f2),
// em unidades de célula. Periódico como os outros.
export function celular2(x, y, semente = 0, periodo = 0, periodoY = periodo) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const hx = envolver(cx, periodo), hy = envolver(cy, periodoY);
      const px = cx + hash2(hx, hy, semente), py = cy + hash2(hx, hy, semente + 7);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
  }
  return [f1, f2];
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const suavizar = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
