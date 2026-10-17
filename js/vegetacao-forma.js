// Formas pequenas em JS puro: touceira de capim, samambaia, pedra e tronco
// caído. Saem nos mesmos arrays das árvores (posição, normal, uv, cor, vento),
// para usar os mesmos materiais.
import { rng, fbm3, ruido3 } from './ruido.js';

function novo() { return { pos: [], nor: [], uv: [], cor: [], vento: [], dobra: [], folha: [], idx: [] }; }
function vert(g, p, n, u, v, ao, musgo, vento, fl) {
  g.pos.push(p[0], p[1], p[2]); g.nor.push(n[0], n[1], n[2]); g.uv.push(u, v);
  g.cor.push(ao, musgo, 1); g.vento.push(...vento); g.dobra.push(0); g.folha.push(fl[0], fl[1]);
}
function fechar(g) {
  const n = g.pos.length / 3;
  return {
    position: new Float32Array(g.pos), normal: new Float32Array(g.nor), uv: new Float32Array(g.uv),
    color: new Float32Array(g.cor), aVento: new Float32Array(g.vento), aDobra: new Float32Array(g.dobra),
    aFolha: new Float32Array(g.folha), index: n > 65535 ? new Uint32Array(g.idx) : new Uint16Array(g.idx),
  };
}
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Cartões cruzados: n planos em pé girados em volta do centro, cada um com
// meia textura (duas variações lado a lado). Três linhas de vértices para o
// vento poder curvar a planta, não só inclinar.
function formaCruzada(semente, { n, larg, alt, vento }) {
  const R = rng(semente);
  const g = novo();
  const metade = R() < 0.5 ? 0 : 0.5;
  const giro0 = R() * Math.PI;
  for (let k = 0; k < n; k++) {
    const a = giro0 + (k / n) * Math.PI + (R() - 0.5) * 0.3;
    const d = [Math.cos(a), 0, Math.sin(a)];
    const nq = [-d[2], 0, d[0]];
    const fase = R() * 6.283;
    const w = larg * (0.85 + R() * 0.3), h = alt * (0.85 + R() * 0.3);
    const i0 = g.pos.length / 3;
    for (let row = 0; row <= 2; row++) {
      const v = row / 2;
      // a parte de cima abre um pouco para fora, como planta de verdade
      const abre = 1 + v * 0.12;
      for (const col of [0, 1]) {
        const x = (col - 0.5) * w * abre;
        const nrm = norm([nq[0] * 0.35, 1, nq[2] * 0.35]);
        vert(g, [d[0] * x, v * h, d[2] * x], nrm, metade + col * 0.5, v, 0.4 + 0.6 * v, 0,
          [0, 0, v * h * vento, fase], [v * 0.05, fase]);
      }
    }
    for (let row = 0; row < 2; row++) {
      const a0 = i0 + row * 2;
      g.idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
  }
  return fechar(g);
}

export function formaCapim(semente) {
  return formaCruzada(semente, { n: 3, larg: 0.62, alt: 0.42, vento: 1.4 });
}

export function formaSamambaia(semente) {
  return formaCruzada(semente, { n: 3, larg: 1.35, alt: 0.72, vento: 0.9 });
}

// Pedra: icosaedro subdividido, deformado por ruído, com base achatada.
// Cor por vértice: rocha, líquen e musgo em cima.
export function formaPedra(semente, subdiv = 5) {
  const R = rng(semente);
  // icosaedro
  const t = (1 + Math.sqrt(5)) / 2;
  let vs = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
  let fs = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < subdiv; s++) {
    const meio = new Map();
    const m = (a, b) => {
      const k = a < b ? a * 1e6 + b : b * 1e6 + a;
      if (!meio.has(k)) { vs.push(norm([(vs[a][0] + vs[b][0]) / 2, (vs[a][1] + vs[b][1]) / 2, (vs[a][2] + vs[b][2]) / 2])); meio.set(k, vs.length - 1); }
      return meio.get(k);
    };
    const nf = [];
    for (const [a, b, c] of fs) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    fs = nf;
  }
  const off = R() * 100;
  const esc = [1, 0.55 + R() * 0.35, 0.7 + R() * 0.4];
  const pos = vs.map((v) => {
    const n1 = fbm3(v[0] * 1.2 + off, v[1] * 1.2, v[2] * 1.2, { oitavas: 4, semente: 801 });
    const n2 = ruido3(v[0] * 7 + off, v[1] * 7, v[2] * 7, 803);
    let r = 1 + (n1 - 0.5) * 0.7 + (n2 - 0.5) * 0.05;
    let p = [v[0] * r * esc[0], v[1] * r * esc[1], v[2] * r * esc[2]];
    if (p[1] < -0.25 * esc[1]) p[1] = -0.25 * esc[1] + (p[1] + 0.25 * esc[1]) * 0.15;
    return p;
  });
  // normais por média das faces
  const nor = vs.map(() => [0, 0, 0]);
  for (const [a, b, c] of fs) {
    const u = [pos[b][0] - pos[a][0], pos[b][1] - pos[a][1], pos[b][2] - pos[a][2]];
    const w = [pos[c][0] - pos[a][0], pos[c][1] - pos[a][1], pos[c][2] - pos[a][2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    for (const i of [a, b, c]) { nor[i][0] += n[0]; nor[i][1] += n[1]; nor[i][2] += n[2]; }
  }
  const cor = [];
  pos.forEach((p, i) => {
    const n = norm(nor[i]);
    nor[i] = n;
    const base = 0.24 + 0.18 * fbm3(p[0] * 3 + off, p[1] * 3, p[2] * 3, { oitavas: 4, semente: 805 });
    const liquen = Math.max(0, Math.min(1, (fbm3(p[0] * 6 + off, p[1] * 6, p[2] * 6, { oitavas: 3, semente: 807 }) - 0.6) * 8));
    const musgo = Math.max(0, Math.min(1, (n[1] - 0.25) * 2.2)) * Math.max(0, Math.min(1, (fbm3(p[0] * 2.5 + off, p[1] * 2.5, p[2] * 2.5, { oitavas: 3, semente: 809 }) - 0.35) * 4));
    const ao = 0.45 + 0.55 * Math.min(1, Math.max(0, (p[1] + 0.25) / 0.6));
    let c = [base * 1.02, base, base * 0.94];
    c = c.map((x, k) => x + ([0.52, 0.54, 0.42][k] - x) * liquen * 0.6);
    c = c.map((x, k) => x + ([0.08, 0.13, 0.03][k] - x) * musgo * 0.9);
    cor.push(c[0] * ao, c[1] * ao, c[2] * ao);
  });
  return {
    position: new Float32Array(pos.flat()), normal: new Float32Array(nor.flat()), color: new Float32Array(cor),
    index: new Uint32Array(fs.flat()),
  };
}

// Tronco caído: cilindro torto, casca, musgo no lado de cima, pontas
// quebradas (fechadas com madeira escura).
export function formaTora(semente) {
  const R = rng(semente);
  const g = novo();
  const comp = 5 + R() * 5;
  const raio = 0.28 + R() * 0.2;
  const anel = 24, segs = 30;
  const curva = (R() - 0.5) * 0.6;
  const repU = Math.max(1, Math.round(2 * Math.PI * raio / 0.9));
  const centroEm = (t) => [(t - 0.5) * comp, Math.sin(t * Math.PI) * 0.05, Math.sin(t * Math.PI) * curva];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const c = centroEm(t);
    let r = raio * (1 - 0.18 * t);
    for (let j = 0; j <= anel; j++) {
      const a = (j / anel) * Math.PI * 2;
      const rr = r * (1 + 0.06 * (ruido3(t * comp * 1.5, Math.cos(a) * 2, Math.sin(a) * 2, 901) - 0.5));
      const n = [0, Math.cos(a), Math.sin(a)];
      const p = [c[0], c[1] + n[1] * rr, c[2] + n[2] * rr];
      const musgo = Math.max(0, Math.min(1, (n[1] - 0.1) * 1.6 * (0.6 + 0.8 * ruido3(t * comp, j * 0.3, 1, 903))));
      const ao = 0.5 + 0.5 * Math.min(1, Math.max(0, n[1] + 0.6));
      vert(g, p, n, (j / anel) * repU, (t * comp) / 0.9, ao, musgo, [0, 0, 0, 0], [0, 0]);
    }
  }
  for (let s = 0; s < segs; s++) for (let j = 0; j < anel; j++) {
    const a = s * (anel + 1) + j, b = a + 1, c = a + anel + 1, d = c + 1;
    g.idx.push(a, b, c, b, d, c);
  }
  // pontas: leque com o miolo afundado (madeira podre)
  for (const ponta of [0, 1]) {
    const c = centroEm(ponta);
    const r = raio * (1 - 0.18 * ponta);
    const sx = ponta ? 1 : -1;
    const ic = g.pos.length / 3;
    vert(g, [c[0] - sx * 0.05, c[1], c[2]], [sx, 0, 0], 0.5, 0.5, 0.25, 0, [0, 0, 0, 0], [0, 0]);
    for (let j = 0; j <= anel; j++) {
      const a = (j / anel) * Math.PI * 2;
      const quebra = (ruido3(j * 0.5, ponta * 10, 3, 905) - 0.5) * r * 0.8;
      vert(g, [c[0] + sx * quebra * 0.5, c[1] + Math.cos(a) * r * 0.97, c[2] + Math.sin(a) * r * 0.97], [sx, 0, 0], 0.5 + Math.cos(a) * 0.1, 0.5 + Math.sin(a) * 0.1, 0.35, 0, [0, 0, 0, 0], [0, 0]);
    }
    for (let j = 0; j < anel; j++) {
      if (ponta) g.idx.push(ic, ic + 1 + j, ic + 2 + j); else g.idx.push(ic, ic + 2 + j, ic + 1 + j);
    }
  }
  const geo = fechar(g);
  return { ...geo, comp, raio };
}
