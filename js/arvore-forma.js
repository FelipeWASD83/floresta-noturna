// Forma das árvores, em JS puro (testável no Node). Cada árvore é um esqueleto
// de galhos crescidos por recursão (tronco, galho, ramo, graveto), com os
// cachos de folha presos nos gravetos. Daqui sai a malha em arrays: casca em
// tubos com transporte paralelo do referencial (sem torção) e folhas em
// cartões dobrados ao meio. Cada vértice leva os pesos do vento do galho a que
// pertence, então folha e galho balançam juntos.
import { rng, ruido2 } from './ruido.js';

const GRAU = Math.PI / 180;

const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

// gira v em volta do eixo k (unitário), fórmula de Rodrigues
function girar(v, k, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const kxv = v3.cross(k, v);
  const kdv = v3.dot(k, v);
  return [
    v[0] * c + kxv[0] * s + k[0] * kdv * (1 - c),
    v[1] * c + kxv[1] * s + k[1] * kdv * (1 - c),
    v[2] * c + kxv[2] * s + k[2] * kdv * (1 - c),
  ];
}

function perpendicular(d) {
  const ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return v3.norm(v3.cross(d, ref));
}

// ---------------------------------------------------------------- espécies
// comp dos filhos é fração do comprimento do pai; raio é fração do raio do
// pai no ponto onde o filho nasce (modelo de cano: filho mais fino que o pai).
export const ESPECIES = {
  carvalho: {
    casca: 'sulcada', folha: 'carvalho', tronco: [9.5, 11.5], raio: [0.38, 0.5],
    raizes: 7, sapata: 0.5,
    niveis: [
      { segs: 20, radial: 26, curva: 0.13, tropismo: 0.035, ponta: 0.32,
        filhos: { qtd: 8, de: 0.36, ate: 1.0, ang: 50, angVar: 14, comp: 0.66, raio: 0.6, perfil: 'decorrente' } },
      { segs: 11, radial: 12, curva: 0.34, tropismo: 0.05, ponta: 0.18,
        filhos: { qtd: 6, de: 0.18, ate: 1.0, ang: 44, angVar: 16, comp: 0.5, raio: 0.62 } },
      { segs: 6, radial: 7, curva: 0.42, tropismo: 0.02, ponta: 0.22,
        filhos: { qtd: 7, de: 0.12, ate: 1.0, ang: 46, angVar: 18, comp: 0.42, raio: 0.58 } },
      { segs: 3, radial: 4, curva: 0.5, tropismo: 0.0, ponta: 0.35 },
    ],
    folhas: { densidade: { 2: 2.2, 3: 10.5 }, inicio: 0.3, tamanho: 0.58, modo: 'cacho', subir: 0.5 },
  },
  faia: {
    casca: 'lisa', folha: 'faia', tronco: [14, 17], raio: [0.32, 0.42],
    raizes: 5, sapata: 0.35,
    niveis: [
      { segs: 22, radial: 24, curva: 0.08, tropismo: 0.04, ponta: 0.3,
        filhos: { qtd: 10, de: 0.5, ate: 1.0, ang: 36, angVar: 12, comp: 0.42, raio: 0.52, perfil: 'decorrente' } },
      { segs: 10, radial: 11, curva: 0.26, tropismo: 0.075, ponta: 0.18,
        filhos: { qtd: 6, de: 0.2, ate: 1.0, ang: 40, angVar: 14, comp: 0.5, raio: 0.6 } },
      { segs: 6, radial: 6, curva: 0.36, tropismo: 0.03, ponta: 0.22,
        filhos: { qtd: 6, de: 0.15, ate: 1.0, ang: 44, angVar: 16, comp: 0.45, raio: 0.58 } },
      { segs: 3, radial: 4, curva: 0.45, tropismo: 0.0, ponta: 0.35 },
    ],
    folhas: { densidade: { 2: 2.0, 3: 11 }, inicio: 0.25, tamanho: 0.52, modo: 'cacho', subir: 0.65 },
  },
  abeto: {
    casca: 'escamosa', folha: 'agulha', tronco: [20, 25], raio: [0.3, 0.38],
    raizes: 6, sapata: 0.4, lodNivelMax: [9, 1, 0],
    niveis: [
      { segs: 26, radial: 18, curva: 0.035, tropismo: 0.05, ponta: 0.03,
        filhos: { qtd: 52, de: 0.17, ate: 0.97, ang: 86, angVar: 10, comp: 0.25, raio: 0.3, perfil: 'conico', verticilo: 4 } },
      { segs: 8, radial: 6, curva: 0.16, tropismo: -0.03, ponta: 0.1,
        filhos: { qtd: 12, de: 0.1, ate: 0.95, ang: 52, angVar: 10, comp: 0.3, raio: 0.5, plano: true } },
      { segs: 3, radial: 3, curva: 0.2, tropismo: 0.0, ponta: 0.3 },
    ],
    folhas: { densidade: { 1: 2.6, 2: 8.5 }, inicio: 0.0, tamanho: 0.5, modo: 'ramo', secoAte: 0.3 },
  },
  muda: {
    casca: 'lisa', folha: 'faia', tronco: [2.4, 3.6], raio: [0.035, 0.055],
    raizes: 0, sapata: 0.15,
    niveis: [
      { segs: 8, radial: 8, curva: 0.18, tropismo: 0.03, ponta: 0.2,
        filhos: { qtd: 7, de: 0.3, ate: 1.0, ang: 52, angVar: 14, comp: 0.46, raio: 0.65, perfil: 'decorrente' } },
      { segs: 5, radial: 5, curva: 0.35, tropismo: 0.04, ponta: 0.25,
        filhos: { qtd: 5, de: 0.15, ate: 1.0, ang: 46, angVar: 16, comp: 0.45, raio: 0.6 } },
      { segs: 3, radial: 3, curva: 0.4, tropismo: 0.0, ponta: 0.35 },
    ],
    folhas: { densidade: { 1: 3.5, 2: 13 }, inicio: 0.2, tamanho: 0.3, modo: 'cacho', subir: 0.6 },
  },
  morta: {
    casca: 'sulcada', folha: null, tronco: [8, 11], raio: [0.3, 0.42],
    raizes: 6, sapata: 0.5, quebrada: true,
    niveis: [
      { segs: 16, radial: 22, curva: 0.16, tropismo: 0.02, ponta: 0.55,
        filhos: { qtd: 6, de: 0.35, ate: 0.95, ang: 55, angVar: 18, comp: 0.5, raio: 0.55, perfil: 'decorrente' } },
      { segs: 9, radial: 10, curva: 0.4, tropismo: 0.03, ponta: 0.25,
        filhos: { qtd: 4, de: 0.2, ate: 0.9, ang: 48, angVar: 18, comp: 0.45, raio: 0.6 } },
      { segs: 5, radial: 5, curva: 0.5, tropismo: -0.01, ponta: 0.3 },
    ],
    folhas: null,
  },
};

// ------------------------------------------------------------------ geração
export function gerarArvore(nomeEspecie, semente) {
  const esp = ESPECIES[nomeEspecie];
  const R = rng(semente * 7919 + 13);
  const entre = (a) => a[0] + (a[1] - a[0]) * R();
  const comp0 = entre(esp.tronco);
  const raio0 = entre(esp.raio);
  const ramos = [];
  const cartoes = [];

  function crescer(nivel, origem, dir, comp, raioBase, vento, morto = false) {
    const cfg = esp.niveis[nivel];
    const nSeg = cfg.segs;
    const raioPonta = raioBase * cfg.ponta;
    const pts = [];
    let p = origem, d = dir;
    let acum = 0;
    for (let i = 0; i <= nSeg; i++) {
      const t = i / nSeg;
      const r = raioBase + (raioPonta - raioBase) * Math.pow(t, nivel === 0 ? 0.85 : 1);
      // pesos do vento ao longo do galho: crescem com a distância até a base
      const w = nivel === 0 ? [0, 0] :
        nivel === 1 ? [vento.w1 + t * comp, 0] :
        [vento.w1 + t * comp * 0.35, vento.w2 + t * comp];
      pts.push({ p, r, t, d, comp: acum, w1: w[0], w2: w[1] });
      if (i === nSeg) break;
      const torto = [(R() - 0.5) * cfg.curva, (R() - 0.5) * cfg.curva * 0.5, (R() - 0.5) * cfg.curva];
      d = v3.norm(v3.add(v3.add(d, torto), [0, cfg.tropismo * (nivel === 0 ? 1 : 1 + t), 0]));
      const passo = comp / nSeg;
      p = v3.add(p, v3.mul(d, passo));
      acum += passo;
    }
    const ramo = { nivel, pts, f1: vento.f1, f2: vento.f2, raioBase, comp, morto };
    ramos.push(ramo);

    // filhos
    const fc = cfg.filhos;
    if (fc && nivel + 1 < esp.niveis.length) {
      const n = Math.max(1, Math.round(fc.qtd * (0.8 + R() * 0.4)));
      let azimute = R() * Math.PI * 2;
      for (let k = 0; k < n; k++) {
        let t;
        if (fc.verticilo) {
          const nVert = Math.ceil(n / fc.verticilo);
          const v = Math.floor(k / fc.verticilo);
          t = fc.de + (fc.ate - fc.de) * (v + 0.15 * R()) / nVert;
        } else {
          t = fc.de + (fc.ate - fc.de) * (k + R() * 0.8) / n;
        }
        t = Math.min(t, 0.995);
        const pp = pontoEm(pts, t);
        let filhoComp = comp * fc.comp * (0.78 + R() * 0.44);
        if (fc.perfil === 'decorrente') filhoComp *= 1 - 0.35 * t;
        if (fc.perfil === 'conico') filhoComp *= Math.pow(1 - t, 0.9) * 0.95 + 0.07;
        const ang = (fc.ang + (R() - 0.5) * 2 * fc.angVar) * GRAU;
        let fdir;
        if (fc.plano) {
          const lado = v3.norm(v3.cross(pp.d, [0, 1, 0]));
          const s = k % 2 === 0 ? 1 : -1;
          fdir = v3.norm(v3.add(v3.mul(pp.d, Math.cos(ang)), v3.mul(lado, Math.sin(ang) * s)));
          fdir = v3.norm(v3.add(fdir, [0, (R() - 0.5) * 0.2, 0]));
        } else {
          if (fc.verticilo) azimute = (k % fc.verticilo) * (Math.PI * 2 / fc.verticilo) + Math.floor(k / fc.verticilo) * 0.7 + (R() - 0.5) * 0.6;
          else azimute += 137.5 * GRAU + (R() - 0.5) * 0.5;
          const s = girar(perpendicular(pp.d), pp.d, azimute);
          fdir = v3.norm(v3.add(v3.mul(pp.d, Math.cos(ang)), v3.mul(s, Math.sin(ang))));
        }
        const filhoMorto = morto || !!(esp.folhas && esp.folhas.secoAte && nivel === 0 && t < esp.folhas.secoAte);
        if (filhoMorto && !morto) filhoComp *= 0.4;
        const filhoRaio = Math.min(pp.r * fc.raio, pp.r * 0.9) * (filhoMorto && !morto ? 0.6 : 1);
        // nasce um pouco para dentro do pai, para não abrir fresta na junta
        const origemFilho = v3.sub(pp.p, v3.mul(fdir, pp.r * 0.6));
        const vf = nivel === 0
          ? { w1: 0, f1: R() * 6.283, w2: 0, f2: R() * 6.283 }
          : nivel === 1
            ? { w1: pp.w1, f1: vento.f1, w2: 0, f2: R() * 6.283 }
            : { w1: pp.w1, f1: vento.f1, w2: pp.w2, f2: vento.f2 + (R() - 0.5) * 1.5 };
        crescer(nivel + 1, origemFilho, fdir, filhoComp, filhoRaio, vf, filhoMorto);
      }
    }

    // folhas
    const fo = esp.folhas;
    const dens = fo && fo.densidade[nivel];
    if (dens && !morto) {
      const ini = nivel === esp.niveis.length - 1 ? fo.inicio : 0.5;
      const n = Math.round(dens * comp * (1 - ini) * (0.8 + R() * 0.4));
      for (let k = 0; k < n; k++) {
        const t = ini + (1 - ini) * R();
        const pp = pontoEm(pts, t);
        const c = fazerCartao(pp, fo, R, nivel);
        c.f1 = vento.f1; c.f2 = vento.f2 + (R() - 0.5) * 0.8;
        cartoes.push(c);
      }
    }
    return ramo;
  }

  crescer(0, [0, -0.6, 0], v3.norm([(R() - 0.5) * 0.06, 1, (R() - 0.5) * 0.06]), comp0 + 0.6, raio0, { w1: 0, f1: 0, w2: 0, f2: 0 });

  // galhos de árvore morta: os de cima quebrados (pontas grossas, curtas)
  if (esp.quebrada) for (const r of ramos) if (r.nivel > 0 && R() < 0.35) r.pts.length = Math.max(2, Math.ceil(r.pts.length * (0.4 + R() * 0.4)));

  // limites e copa
  let ymax = 0;
  for (const r of ramos) for (const q of r.pts) ymax = Math.max(ymax, q.p[1]);
  for (const c of cartoes) ymax = Math.max(ymax, c.p[1] + c.tam);
  let centro = [0, ymax * 0.7, 0], raioCopa = ymax * 0.3;
  if (cartoes.length) {
    centro = [0, 0, 0];
    for (const c of cartoes) centro = v3.add(centro, c.p);
    centro = v3.mul(centro, 1 / cartoes.length);
    let s = 0;
    for (const c of cartoes) s += v3.len(v3.sub(c.p, centro));
    raioCopa = (s / cartoes.length) * 1.35;
  }
  // embaralha: os N primeiros cartões são uma amostra justa da copa (LOD)
  for (let i = cartoes.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [cartoes[i], cartoes[j]] = [cartoes[j], cartoes[i]];
  }
  return { especie: nomeEspecie, esp, ramos, cartoes, altura: ymax, raioTronco: raio0, centroCopa: centro, raioCopa, semente };
}

function pontoEm(pts, t) {
  const f = t * (pts.length - 1);
  const i = Math.min(Math.floor(f), pts.length - 2);
  const u = f - i;
  const a = pts[i], b = pts[i + 1];
  return {
    p: v3.lerp(a.p, b.p, u), r: a.r + (b.r - a.r) * u, d: v3.norm(v3.lerp(a.d, b.d, u)),
    w1: a.w1 + (b.w1 - a.w1) * u, w2: a.w2 + (b.w2 - a.w2) * u,
  };
}

function fazerCartao(pp, fo, R, nivel) {
  const tam = fo.tamanho * (0.75 + R() * 0.5) * (nivel < 2 && fo.modo === 'cacho' ? 1.15 : 1);
  const fora = v3.norm([pp.p[0] + (R() - 0.5) * 0.3, 0.0001, pp.p[2] + (R() - 0.5) * 0.3]);
  let eixo;
  if (fo.modo === 'ramo') {
    // agulhas: o cartão segue o graveto, quase deitado
    eixo = v3.norm(v3.add(pp.d, [(R() - 0.5) * 0.4, (R() - 0.5) * 0.25 + 0.05, (R() - 0.5) * 0.4]));
  } else {
    eixo = v3.norm(v3.add(v3.add(v3.mul(pp.d, 0.7), v3.mul(fora, 0.45)),
      [(R() - 0.5) * 0.9, (R() - 0.5) * 0.6 + (fo.subir ?? 0) * 0.4, (R() - 0.5) * 0.9]));
  }
  let lado = v3.norm(v3.cross(eixo, [R() - 0.5, R() - 0.5, R() - 0.5]));
  let nor = v3.cross(lado, eixo);
  if (nor[1] < 0) nor = v3.mul(nor, -1);
  // folha vira a cara para o céu
  nor = v3.norm(v3.add(nor, [0, fo.modo === 'ramo' ? 1.6 : 0.7, 0]));
  lado = v3.norm(v3.cross(eixo, nor));
  nor = v3.norm(v3.cross(lado, eixo));
  const desloc = v3.mul(perpendicular(pp.d), (R() - 0.5) * pp.r * 2);
  return {
    p: v3.add(pp.p, desloc), eixo, lado, nor, tam,
    celula: Math.floor(R() * 4), w1: pp.w1, w2: pp.w2, fase: R() * 6.283,
  };
}

// --------------------------------------------------------------- malha
export const LODS = [
  { nivelMax: 9, radial: 1, anel: 1, folhaFrac: 1, folhaEsc: 1 },
  { nivelMax: 2, radial: 0.5, anel: 1, folhaFrac: 0.38, folhaEsc: 1.55 },
  { nivelMax: 1, radial: 0.3, anel: 2, folhaFrac: 0.13, folhaEsc: 2.6 },
];

class Montador {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.cor = []; this.vento = []; this.dobra = []; this.folha = []; this.idx = []; }
  get n() { return this.pos.length / 3; }
  vertice(p, nrm, u, v, ao, musgo, w1, f1, w2, f2, dobra, fl0 = 0, fl1 = 0, raio = 1) {
    this.pos.push(p[0], p[1], p[2]); this.nor.push(nrm[0], nrm[1], nrm[2]);
    this.uv.push(u, v); this.cor.push(ao, musgo, raio);
    this.vento.push(w1, f1, w2, f2); this.dobra.push(dobra); this.folha.push(fl0, fl1);
  }
  arrays() {
    const n = this.n;
    return {
      position: new Float32Array(this.pos), normal: new Float32Array(this.nor), uv: new Float32Array(this.uv),
      color: new Float32Array(this.cor), aVento: new Float32Array(this.vento), aDobra: new Float32Array(this.dobra),
      aFolha: new Float32Array(this.folha), index: n > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx),
    };
  }
}

const ESCALA_CASCA = 0.9; // metros de casca por repetição da textura

export function montarMalha(arv, lod = 0) {
  const L = LODS[lod];
  const H = arv.altura;
  const dobraEm = (y) => { const h = Math.max(y, 0) / H; return h * h * H * 0.022; };
  const casca = new Montador();
  const esp = arv.esp;

  // a espécie pode cortar mais fundo (no abeto os galhos somem sob as agulhas)
  const nivelMax = Math.min(L.nivelMax, esp.lodNivelMax ? esp.lodNivelMax[lod] : 9);
  for (const ramo of arv.ramos) {
    if (ramo.nivel > nivelMax) continue;
    const cfg = esp.niveis[ramo.nivel];
    const radial = Math.max(3, Math.round(cfg.radial * L.radial));
    const pts = L.anel > 1 ? ramo.pts.filter((q, i, a) => i % L.anel === 0 || i === a.length - 1) : ramo.pts;
    const repU = Math.max(1, Math.round((2 * Math.PI * ramo.raioBase) / ESCALA_CASCA));
    // referencial por transporte paralelo
    let N = perpendicular(pts[0].d);
    const base = casca.n;
    for (let i = 0; i < pts.length; i++) {
      const q = pts[i];
      const T = v3.norm(i === 0 ? v3.sub(pts[1].p, pts[0].p) : i === pts.length - 1 ? v3.sub(q.p, pts[i - 1].p) : v3.sub(pts[i + 1].p, pts[i - 1].p));
      N = v3.norm(v3.sub(N, v3.mul(T, v3.dot(N, T))));
      const B = v3.cross(T, N);
      const hTronco = q.p[1] + 0.6;
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const dirR = v3.add(v3.mul(N, Math.cos(a)), v3.mul(B, Math.sin(a)));
        let r = q.r;
        if (ramo.nivel === 0) {
          // sapata e raízes de apoio no pé; casca irregular em volta
          const raizes = esp.raizes ? Math.pow(Math.max(0, Math.cos(a * esp.raizes + arv.semente)), 4) : 0;
          r *= 1 + esp.sapata * Math.exp(-hTronco / 0.55) + 0.55 * raizes * Math.exp(-hTronco / 0.75);
          r *= 1 + 0.07 * (ruido2((j / radial) * 7, hTronco * 1.3, arv.semente, 7) - 0.5);
        }
        const p = v3.add(q.p, v3.mul(dirR, r));
        const ao = ramo.nivel === 0
          ? 0.42 + 0.58 * Math.min(1, Math.max(0, (p[1] + 0.2) / 1.6))
          : 0.62 + 0.38 * Math.min(1, ramo.nivel / 3 + q.t * 0.3);
        // musgo no pé do tronco e no lado de cima dos galhos grossos
        let musgo = 0;
        if (ramo.nivel === 0) musgo = Math.max(0, 1 - p[1] / 2.2) * (0.55 + 0.45 * dirR[0]);
        else if (ramo.nivel === 1) musgo = Math.max(0, dirR[1]) * 0.55 * (1 - q.t);
        casca.vertice(p, dirR, (j / radial) * repU, q.comp / ESCALA_CASCA, ao, Math.min(1, musgo), q.w1, ramo.f1, q.w2, ramo.f2, dobraEm(p[1]), 0, 0, Math.min(1, q.r / 0.12));
      }
    }
    const anel = radial + 1;
    for (let i = 0; i < pts.length - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = base + i * anel + j, b = a + 1, c = a + anel, d = c + 1;
        casca.idx.push(a, b, c, b, d, c);
      }
    }
    // ponta fechada num cone curto
    const ult = pts[pts.length - 1];
    const tip = v3.add(ult.p, v3.mul(ult.d, ult.r * 1.5));
    const iTip = casca.n;
    casca.vertice(tip, ult.d, 0.5, (ult.comp + ult.r) / ESCALA_CASCA, 0.8, 0, ult.w1, ramo.f1, ult.w2, ramo.f2, dobraEm(tip[1]), 0, 0, Math.min(1, ult.r / 0.12));
    const ini = base + (pts.length - 1) * anel;
    for (let j = 0; j < radial; j++) casca.idx.push(ini + j, ini + j + 1, iTip);
  }

  // folhas
  const folhas = new Montador();
  if (arv.cartoes.length) {
    const nUsar = Math.max(1, Math.round(arv.cartoes.length * L.folhaFrac));
    const centro = arv.centroCopa;
    const dobra = 0.32;
    for (let k = 0; k < nUsar; k++) {
      const c = arv.cartoes[k];
      const tam = c.tam * L.folhaEsc;
      const larg = tam * 0.5;
      const rad = v3.norm(v3.sub(c.p, centro));
      const dist = v3.len(v3.sub(c.p, centro)) / arv.raioCopa;
      const ao = Math.min(1, 0.3 + 0.7 * Math.min(1, Math.max(0, (dist - 0.15) / 0.85)) * (0.7 + 0.3 * Math.min(1, Math.max(0, (c.p[1] - centro[1]) / arv.raioCopa + 0.6))));
      const cu = (c.celula % 2) * 0.5, cv = Math.floor(c.celula / 2) * 0.5;
      const base = folhas.n;
      const f1 = c.f1, f2 = c.f2;
      for (let row = 0; row <= 1; row++) {
        for (let col = -1; col <= 1; col++) {
          const p = v3.add(v3.add(v3.add(c.p, v3.mul(c.lado, col * larg)), v3.mul(c.nor, -Math.abs(col) * larg * dobra)), v3.mul(c.eixo, row * tam));
          const nCartao = v3.norm(v3.add(c.nor, v3.mul(c.lado, col * 0.35)));
          const nrm = v3.norm(v3.lerp(nCartao, rad, 0.55));
          folhas.vertice(p, nrm, cu + (col + 1) * 0.25, cv + row * 0.5, ao, 0, c.w1, f1, c.w2 + 0.15, f2, dobraEm(p[1]), row * tam * 0.6 + Math.abs(col) * 0.1, c.fase);
        }
      }
      folhas.idx.push(base, base + 1, base + 4, base, base + 4, base + 3, base + 1, base + 2, base + 5, base + 1, base + 5, base + 4);
    }
  }
  return { casca: casca.arrays(), folhas: arv.cartoes.length ? folhas.arrays() : null };
}
