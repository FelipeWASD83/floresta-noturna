// Monta o mundo: terreno, modelos de árvore, onde cada coisa nasce, e a lista
// de obstáculos para a física do jogador.
import * as THREE from 'three';
import { rng, fbm2, hash2 } from './ruido.js';
import { MUNDO, RES, CELULA, MEIO, gradeAlturas, altura } from './terreno-forma.js';
import { gerarArvore, montarMalha } from './arvore-forma.js';
import { formaCapim, formaSamambaia, formaPedra, formaTora } from './vegetacao-forma.js';
import { materialCasca, materialFolha, materialChao } from './materiais.js';
import { Populacao, matrizItem } from './populacao.js';

function geometria(a) {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv', 'color', 'aVento', 'aDobra', 'aFolha']) {
    if (!a[k]) continue;
    const tam = { position: 3, normal: 3, uv: 2, color: 3, aVento: 4, aDobra: 1, aFolha: 2 }[k];
    g.setAttribute(k, new THREE.BufferAttribute(a[k], tam));
  }
  g.setIndex(new THREE.BufferAttribute(a.index, 1));
  return g;
}

export function criarTerreno(texChao, macro) {
  const g = gradeAlturas();
  const n = RES + 1;
  const pos = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    const x = -MEIO + i * CELULA, z = -MEIO + j * CELULA;
    pos[k * 3] = x; pos[k * 3 + 1] = g[k]; pos[k * 3 + 2] = z;
    uv[k * 2] = x / 3.1; uv[k * 2 + 1] = -z / 3.1;
  }
  const idx = new Uint32Array(RES * RES * 6);
  let p = 0;
  for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
    const v00 = j * n + i, v10 = v00 + 1, v01 = v00 + n, v11 = v01 + 1;
    idx[p++] = v00; idx[p++] = v11; idx[p++] = v10;
    idx[p++] = v00; idx[p++] = v01; idx[p++] = v11;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const malha = new THREE.Mesh(geo, materialChao(texChao, macro));
  malha.receiveShadow = true;
  malha.castShadow = false;
  return malha;
}

// mapa de alturas pequeno para o shader da névoa (que segue o chão)
export function texturaAlturas() {
  const N = 256;
  const d = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    d[j * N + i] = altura(-MEIO + (i + 0.5) * MUNDO / N, -MEIO + (j + 0.5) * MUNDO / N);
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RedFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

const MODELOS_ARVORE = [
  { especie: 'pinheiro', semente: 1 }, { especie: 'pinheiro', semente: 2 }, { especie: 'pinheiro', semente: 3 },
  { especie: 'pinheirinho', semente: 4 }, { especie: 'pinheirinho', semente: 5 },
];

// De longe o pinheiro vira um cartão: dois planos cruzados com a "foto" da
// árvore inteira, tirada uma vez na hora de carregar.
function cartaoDeLonge(renderer, malha, tex) {
  const cena = new THREE.Scene();
  const soAO = (m) => {
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb *= vColor.r;');
    };
    return m;
  };
  const gc = geometria(malha.casca), gf = geometria(malha.folhas);
  cena.add(new THREE.Mesh(gc, soAO(new THREE.MeshBasicMaterial({ map: tex.cascas.escamosa.cor, color: new THREE.Color(0.75, 0.68, 0.62), vertexColors: true }))));
  cena.add(new THREE.Mesh(gf, soAO(new THREE.MeshBasicMaterial({ map: tex.agulhas, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true }))));
  gc.computeBoundingBox(); gf.computeBoundingBox();
  const caixa = gc.boundingBox.clone().union(gf.boundingBox);
  const raio = Math.max(Math.abs(caixa.min.x), caixa.max.x, Math.abs(caixa.min.z), caixa.max.z) * 1.04;
  const y0 = Math.max(caixa.min.y, -0.3), y1 = caixa.max.y * 1.02;
  // a textura é 1 x 2; o enquadramento abre no lado que sobrar
  let larg = raio * 2, alt = y1 - y0;
  if (larg * 2 > alt) alt = larg * 2; else larg = alt / 2;
  const cam = new THREE.OrthographicCamera(-larg / 2, larg / 2, y0 + alt, y0, 0.1, 200);
  cam.position.set(0, 0, 100);
  cam.lookAt(0, 0, 0);
  const rt = new THREE.WebGLRenderTarget(512, 1024, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  rt.texture.anisotropy = 8;
  const corAntes = renderer.getClearColor(new THREE.Color()), alfaAntes = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(new THREE.Color(0.02, 0.05, 0.03), 0);
  renderer.clear();
  renderer.render(cena, cam);
  renderer.setRenderTarget(null);
  renderer.setClearColor(corAntes, alfaAntes);
  gc.dispose(); gf.dispose();

  // dois planos cruzados do mesmo tamanho do enquadramento
  const pos = [], nor = [], uv = [], cor = [], vento = [], dobra = [], folha = [], idx = [];
  const H = y1;
  for (const a of [0, Math.PI / 2]) {
    const d = [Math.cos(a), 0, Math.sin(a)], nq = [-d[2], 0, d[0]];
    const i0 = pos.length / 3;
    for (let row = 0; row <= 4; row++) {
      const v = row / 4, y = y0 + v * alt;
      for (const col of [0, 1]) {
        const x = (col - 0.5) * larg;
        pos.push(d[0] * x, y, d[2] * x);
        const l = Math.hypot(nq[0] * 0.5, 1, nq[2] * 0.5);
        nor.push(nq[0] * 0.5 / l, 1 / l, nq[2] * 0.5 / l);
        uv.push(col, v); cor.push(0.85, 0, 1); vento.push(0, 0, 0, 0);
        const h = Math.max(y, 0) / H; dobra.push(h * h * H * 0.022); folha.push(0, 0);
      }
    }
    for (let row = 0; row < 4; row++) { const b = i0 + row * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const geo = geometria({
    position: new Float32Array(pos), normal: new Float32Array(nor), uv: new Float32Array(uv), color: new Float32Array(cor),
    aVento: new Float32Array(vento), aDobra: new Float32Array(dobra), aFolha: new Float32Array(folha), index: new Uint16Array(idx),
  });
  return { geo, mat: materialFolha(rt.texture, { translucidez: 0.35 }) };
}

export async function criarFloresta(cena, tex, progresso, renderer) {
  const mats = {
    casca: {
      sulcada: materialCasca(tex.cascas.sulcada),
      escamosa: materialCasca(tex.cascas.escamosa),
    },
    folha: { agulha: materialFolha(tex.agulhas, { translucidez: 0.55 }) },
  };
  mats.casca.escamosa.mat.color.setRGB(1.05, 0.95, 0.9);

  // pinheiro: cheio até 30 m, leve até 75 m, cartão depois. Sombra da lua com
  // o cheio até 26 m e o leve até 95 m; da tocha, só o tronco (menos nos
  // pinheirinhos, cujas placas ficam na altura da tocha)
  const modelos = [];
  const infos = [];
  for (const def of MODELOS_ARVORE) {
    const arv = gerarArvore(def.especie, def.semente);
    infos.push(arv);
    const pequeno = def.especie === 'pinheirinho';
    const dists = pequeno ? [24, 55, 130] : [30, 75, 260];
    const sombras = pequeno
      ? [{ lua: [0, 22], tocha: [0, 10] }, { lua: [22, 55] }, {}]
      : [{ lua: [0, 26] }, { lua: [26, 95], tocha: [0, 32] }, {}];
    const cheia = montarMalha(arv, 0);
    const lods = [0, 1].map((l) => {
      const m = l === 0 ? cheia : montarMalha(arv, l);
      return {
        dist: dists[l], ...sombras[l],
        partes: [
          { geo: geometria(m.casca), mat: mats.casca[arv.esp.casca], lua: true, tocha: true },
          { geo: geometria(m.folhas), mat: mats.folha[arv.esp.folha], lua: true, tocha: pequeno },
        ],
      };
    });
    const longe = cartaoDeLonge(renderer, cheia, tex);
    lods.push({ dist: dists[2], ...sombras[2], partes: [{ geo: longe.geo, mat: longe.mat }] });
    modelos.push({ lods });
    await progresso();
  }

  // onde nasce cada árvore: grade com sorteio, manchas de abeto, clareira no início
  const itens = [];
  const obst = [];
  const R = rng(4242);
  const passo = 6.6;
  const limite = MEIO - 6;
  for (let gz = -limite; gz < limite; gz += passo) {
    for (let gx = -limite; gx < limite; gx += passo) {
      const x = gx + (R() - 0.5) * passo * 0.9, z = gz + (R() - 0.5) * passo * 0.9;
      const r0 = Math.hypot(x, z);
      if (r0 < 10.5) continue;
      const densidade = fbm2(x / 60 + 3, z / 60 + 8, { oitavas: 3, semente: 91 });
      if (R() > 0.55 + densidade * 0.7) continue;
      const mi = Math.floor(R() * 3);
      const arv = infos[mi];
      const esc = 0.8 + R() * 0.42;
      const y = altura(x, z) - 0.05;
      const m = matrizItem(x, y, z, R() * Math.PI * 2, esc, (R() - 0.5) * 0.05, (R() - 0.5) * 0.05);
      itens.push({ x, y, z, m, modelo: mi, centroY: y + arv.altura * esc * 0.5, raio: arv.altura * esc * 0.62 });
      obst.push({ tipo: 'circulo', x, z, r: arv.raioTronco * esc * 1.15 + 0.05, topo: Infinity });
    }
  }
  // pinheirinhos no meio do caminho (ficam na altura do rosto)
  for (let k = 0; k < 2600; k++) {
    const x = (R() - 0.5) * 2 * limite, z = (R() - 0.5) * 2 * limite;
    const r0 = Math.hypot(x, z);
    if (r0 < 6) continue;
    if (fbm2(x / 30, z / 30, { oitavas: 2, semente: 95 }) < 0.45) continue;
    const mi = 3 + (R() < 0.5 ? 0 : 1);
    const arv = infos[mi];
    const esc = 0.65 + R() * 0.7;
    const y = altura(x, z) - 0.03;
    itens.push({ x, y, z, m: matrizItem(x, y, z, R() * Math.PI * 2, esc, (R() - 0.5) * 0.12, (R() - 0.5) * 0.12), modelo: mi, centroY: y + arv.altura * esc * 0.5, raio: arv.altura * esc * 0.7 });
    obst.push({ tipo: 'circulo', x, z, r: arv.raioTronco * esc + 0.06, topo: Infinity });
  }
  const arvores = new Populacao(cena, modelos, itens, { celula: 32 });
  await progresso();

  const vegetacao = criarVegetacao(cena, tex, mats, obst);
  await progresso();
  return { arvores, vegetacao, obst, infos, nArvores: itens.length };
}

function longeDosTroncos(obst, x, z, folga) {
  // a lista é grande; só os círculos perto importam (chamada só na montagem)
  for (const o of obst) {
    if (o.tipo !== 'circulo') continue;
    const dx = o.x - x, dz = o.z - z;
    if (dx * dx + dz * dz < (o.r + folga) * (o.r + folga)) return false;
  }
  return true;
}

function criarVegetacao(cena, tex, mats, obst) {
  const R = rng(777);
  const limite = MEIO - 6;
  const grade = new Map();
  const chave = (x, z) => Math.floor(x / 8) * 10007 + Math.floor(z / 8);
  for (const o of obst) {
    const k = chave(o.x, o.z);
    if (!grade.has(k)) grade.set(k, []);
    grade.get(k).push(o);
  }
  const livre = (x, z, folga) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const l = grade.get(chave(x + i * 8, z + j * 8));
      if (l && !longeDosTroncos(l, x, z, folga)) return false;
    }
    return true;
  };

  // samambaias
  const matSam = materialFolha(tex.samambaia, { translucidez: 1.3 });
  const matCapim = materialFolha(tex.grama, { translucidez: 0.9 });
  const modelos = [];
  for (let s = 0; s < 4; s++) {
    modelos.push({ lods: [{ dist: 48, lua: [0, 40], tocha: [0, 9], partes: [{ geo: geometria(formaSamambaia(1000 + s)), mat: matSam, lua: true, tocha: true }] }] });
  }
  for (let s = 0; s < 3; s++) {
    modelos.push({ lods: [{ dist: 34, partes: [{ geo: geometria(formaCapim(2000 + s)), mat: matCapim }] }] });
  }
  const itens = [];
  for (let gz = -limite; gz < limite; gz += 2.1) for (let gx = -limite; gx < limite; gx += 2.1) {
    const x = gx + (R() - 0.5) * 2, z = gz + (R() - 0.5) * 2;
    const mancha = fbm2(x / 22 + 7, z / 22 + 1, { oitavas: 3, semente: 97 });
    if (mancha < 0.5 || R() > (mancha - 0.5) * 3.5) continue;
    if (!livre(x, z, 0.35)) continue;
    const esc = 0.7 + R() * 0.6;
    const y = altura(x, z) - 0.02;
    itens.push({ x, y, z, m: matrizItem(x, y, z, R() * Math.PI * 2, esc), modelo: Math.floor(R() * 4), centroY: y + 0.4, raio: 1.2 * esc });
  }
  for (let gz = -limite; gz < limite; gz += 1.5) for (let gx = -limite; gx < limite; gx += 1.5) {
    const x = gx + (R() - 0.5) * 1.4, z = gz + (R() - 0.5) * 1.4;
    const mancha = fbm2(x / 16 + 2, z / 16 + 9, { oitavas: 3, semente: 99 });
    const clareira = Math.exp(-(x * x + z * z) / (2 * 12 * 12));
    if (mancha + clareira * 0.4 < 0.56 || R() > (mancha + clareira * 0.4 - 0.56) * 4) continue;
    if (!livre(x, z, 0.15)) continue;
    const esc = 0.7 + R() * 0.7;
    const y = altura(x, z) - 0.02;
    itens.push({ x, y, z, m: matrizItem(x, y, z, R() * Math.PI * 2, esc), modelo: 4 + Math.floor(R() * 3), centroY: y + 0.25, raio: 0.6 * esc });
  }
  const plantas = new Populacao(cena, modelos, itens, { celula: 16 });

  // pedras e troncos caídos
  const matPedra = { mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 }) };
  const modPedras = [];
  const geoPedra = (f) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(f.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(f.normal, 3));
    g.setAttribute('color', new THREE.BufferAttribute(f.color, 3));
    g.setIndex(new THREE.BufferAttribute(f.index, 1));
    return g;
  };
  for (let s = 0; s < 5; s++) {
    const perto = geoPedra(formaPedra(3000 + s, 4)), longe = geoPedra(formaPedra(3000 + s, 2));
    modPedras.push({ lods: [
      { dist: 22, lua: [0, 22], tocha: [0, 22], partes: [{ geo: perto, mat: matPedra, lua: true, tocha: true }] },
      { dist: 150, lua: [22, 90], partes: [{ geo: longe, mat: matPedra, lua: true, tocha: false }] },
    ] });
  }
  const matTora = mats.casca.sulcada;
  const tora = [];
  for (let s = 0; s < 3; s++) {
    const f = formaTora(4000 + s);
    tora.push(f);
    modPedras.push({ lods: [{ dist: 170, lua: [0, 90], tocha: [0, 25], partes: [{ geo: geometria(f), mat: matTora, lua: true, tocha: true }] }] });
  }
  const outros = [];
  for (let k = 0; k < 1500; k++) {
    const x = (R() - 0.5) * 2 * limite, z = (R() - 0.5) * 2 * limite;
    if (Math.hypot(x, z) < 4) continue;
    if (!livre(x, z, 0.8)) continue;
    const grande = R() < 0.15;
    const esc = grande ? 0.8 + R() * 0.9 : 0.15 + R() * 0.45;
    const y = altura(x, z) - esc * 0.18;
    outros.push({ x, y, z, m: matrizItem(x, y, z, R() * Math.PI * 2, esc), modelo: Math.floor(R() * 5), centroY: y + esc * 0.3, raio: esc * 1.3 });
    if (esc > 0.3) obst.push({ tipo: 'circulo', x, z, r: esc * 0.8, topo: y + esc * 0.62 });
  }
  for (let k = 0; k < 170; k++) {
    const x = (R() - 0.5) * 2 * limite, z = (R() - 0.5) * 2 * limite;
    if (Math.hypot(x, z) < 7) continue;
    const mi = Math.floor(R() * 3);
    const f = tora[mi];
    const ang = R() * Math.PI * 2;
    const c = Math.cos(ang), s = Math.sin(ang);
    const meio = f.comp / 2;
    const ax = x - c * meio, az = z + s * meio, bx = x + c * meio, bz = z - s * meio;
    if (!livre(ax, az, 0.6) || !livre(bx, bz, 0.6) || !livre(x, z, 0.6)) continue;
    const ya = altura(ax, az), yb = altura(bx, bz);
    const y = (ya + yb) / 2 + f.raio * 0.55;
    const inc = Math.atan2(yb - ya, f.comp);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang, inc, 'YZX')), new THREE.Vector3(1, 1, 1));
    outros.push({ x, y, z, m: Float32Array.from(m.elements), modelo: 5 + mi, centroY: y, raio: f.comp * 0.6 });
    obst.push({ tipo: 'segmento', ax, az, bx, bz, ya: ya + f.raio * 0.55, yb: yb + f.raio * 0.55, r: f.raio * 0.95 + 0.05, raio: f.raio });
  }
  const pedras = new Populacao(cena, modPedras, outros, { celula: 32 });
  return { plantas, pedras };
}
