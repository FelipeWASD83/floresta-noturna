// Muitas cópias de poucos modelos (árvores, samambaias, capim, pedras), com
// nível de detalhe por distância. Cada parte de cada nível tem até três malhas
// instanciadas:
//  - a visível: só o que está na frente da câmera, não projeta sombra;
//  - a de sombra da lua e a de sombra da tocha: tudo em volta (até o alcance
//    de cada uma), somem no desenho normal e só entram no mapa de sombra.
// A sombra escolhe o próprio nível de detalhe (pode ser mais leve que o
// visível), não pisca quando ele vira a cabeça, e o desenho normal não paga
// pelo que está atrás dele.
import * as THREE from 'three';

const _esfera = new THREE.Sphere();

function soNaSombra(malha, luz) {
  let salvo = 0;
  malha.onBeforeRender = () => { salvo = malha.count; malha.count = 0; };
  malha.onAfterRender = () => { malha.count = salvo; };
  let salvoS = -1;
  malha.onBeforeShadow = (r, o, c, camSombra) => {
    const ehTocha = camSombra.isPerspectiveCamera === true; // na ortográfica vem undefined
    if (ehTocha !== (luz === 'tocha')) { salvoS = malha.count; malha.count = 0; } else salvoS = -1;
  };
  malha.onAfterShadow = () => { if (salvoS >= 0) malha.count = salvoS; };
}

function novaMalha(cena, geo, mat, cap, luz) {
  const m = new THREE.InstancedMesh(geo, mat.mat, cap);
  m.frustumCulled = false;
  m.count = 0;
  if (luz) {
    m.castShadow = true;
    if (mat.prof) { m.customDepthMaterial = mat.prof; m.customDistanceMaterial = mat.dist; }
    soNaSombra(m, luz);
  } else m.receiveShadow = true;
  cena.add(m);
  return m;
}

export class Populacao {
  // modelos: [{ lods: [{ dist, lua?: [de, ate], tocha?: [de, ate],
  //              partes: [{ geo, mat: {mat, prof, dist}, lua: bool, tocha: bool }] }] }]
  // itens: [{ x, z, m: Float32Array(16), raio, centroY, modelo }]
  constructor(cena, modelos, itens, { celula = 24 } = {}) {
    this.modelos = modelos;
    this.celula = celula;
    this.grade = new Map();
    this.distMax = 0;
    const porModelo = modelos.map(() => 0);
    for (const it of itens) {
      porModelo[it.modelo]++;
      const k = this.chave(Math.floor(it.x / celula), Math.floor(it.z / celula));
      if (!this.grade.has(k)) this.grade.set(k, []);
      this.grade.get(k).push(it);
    }
    this.malhas = [];
    for (let mi = 0; mi < modelos.length; mi++) {
      const mod = modelos[mi];
      const cap = Math.max(1, porModelo[mi]);
      for (const lod of mod.lods) {
        this.distMax = Math.max(this.distMax, lod.dist, lod.lua ? lod.lua[1] : 0, lod.tocha ? lod.tocha[1] : 0);
        lod.dist2 = lod.dist * lod.dist;
        for (const p of lod.partes) {
          p.vis = novaMalha(cena, p.geo, p.mat, cap);
          this.malhas.push(p.vis);
          if (lod.lua && p.lua) { p.somLua = novaMalha(cena, p.geo, p.mat, cap, 'lua'); this.malhas.push(p.somLua); }
          if (lod.tocha && p.tocha) { p.somTocha = novaMalha(cena, p.geo, p.mat, cap, 'tocha'); this.malhas.push(p.somTocha); }
        }
      }
    }
  }

  chave(i, j) { return i * 73856093 ^ j * 19349663; }

  set visivel(v) { for (const m of this.malhas) m.visible = v; }

  atualizar(cam, frustum) {
    for (const mod of this.modelos) for (const lod of mod.lods) for (const p of lod.partes) {
      p.nVis = 0; p.nLua = 0; p.nTocha = 0;
    }
    const c = this.celula;
    const r = this.distMax;
    const i0 = Math.floor((cam.x - r) / c), i1 = Math.floor((cam.x + r) / c);
    const j0 = Math.floor((cam.z - r) / c), j1 = Math.floor((cam.z + r) / c);
    const dentro = (faixa, d2) => faixa && d2 >= faixa[0] * faixa[0] && d2 < faixa[1] * faixa[1];
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const lista = this.grade.get(this.chave(i, j));
        if (!lista) continue;
        for (const it of lista) {
          const dx = it.x - cam.x, dz = it.z - cam.z;
          const d2 = dx * dx + dz * dz;
          const mod = this.modelos[it.modelo];
          let visivel = null;
          for (const lod of mod.lods) {
            if (d2 < lod.dist2) {
              if (visivel === null) {
                _esfera.center.set(it.x, it.centroY, it.z);
                _esfera.radius = it.raio;
                visivel = frustum.intersectsSphere(_esfera);
              }
              if (visivel) for (const p of lod.partes) { p.vis.instanceMatrix.array.set(it.m, p.nVis * 16); p.nVis++; }
              break;
            }
          }
          for (const lod of mod.lods) {
            const lua = dentro(lod.lua, d2), tocha = dentro(lod.tocha, d2);
            if (!lua && !tocha) continue;
            for (const p of lod.partes) {
              if (lua && p.somLua) { p.somLua.instanceMatrix.array.set(it.m, p.nLua * 16); p.nLua++; }
              if (tocha && p.somTocha) { p.somTocha.instanceMatrix.array.set(it.m, p.nTocha * 16); p.nTocha++; }
            }
          }
        }
      }
    }
    for (const mod of this.modelos) for (const lod of mod.lods) for (const p of lod.partes) {
      enviar(p.vis, p.nVis);
      if (p.somLua) enviar(p.somLua, p.nLua);
      if (p.somTocha) enviar(p.somTocha, p.nTocha);
    }
  }
}

function enviar(malha, n) {
  malha.count = n;
  const at = malha.instanceMatrix;
  at.clearUpdateRanges();
  if (n > 0) { at.addUpdateRange(0, n * 16); at.needsUpdate = true; }
}

export function matrizItem(x, y, z, rotY, escala, incX = 0, incZ = 0) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(incX, rotY, incZ, 'YXZ'));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(escala, escala, escala));
  return Float32Array.from(m.elements);
}
