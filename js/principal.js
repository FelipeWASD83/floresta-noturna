// Liga tudo: gera texturas e mundo (com barra de progresso), monta luzes,
// roda o laço de desenho.
import * as THREE from 'three';
import * as TX from './texturas.js';
import { criarTerreno, criarFloresta, texturaAlturas } from './floresta.js';
import { criarCeu } from './ceu.js';
import { Tocha } from './tocha.js';
import { Jogador } from './jogador.js';
import { Pos } from './pos.js';
import { U } from './materiais.js';

const $ = (id) => document.getElementById(id);
const canvas = $('tela');
const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(0x000000, 1);

const cena = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 1000);
cena.add(camera);

// lua: 26° acima do horizonte, um pouco à direita de quem começa olhando para -z
const EL = 26 * Math.PI / 180, AZ = 24 * Math.PI / 180;
const luaDir = new THREE.Vector3(Math.cos(EL) * Math.sin(AZ), Math.sin(EL), -Math.cos(EL) * Math.cos(AZ)).normalize();
const luaCor = new THREE.Color(0.64, 0.74, 1.0);

const passos = [];
let feitos = 0;
const barra = $('barra');
const rotulo = $('carregando-texto');
async function etapa(nome, fn) {
  rotulo.textContent = nome;
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const v = fn();
  feitos++;
  barra.style.width = `${Math.min(100, (feitos / 16) * 100)}%`;
  return v;
}
const progresso = async () => { feitos++; barra.style.width = `${Math.min(100, (feitos / 16) * 100)}%`; await new Promise((r) => setTimeout(r, 0)); };

async function iniciar() {
  const tex = {};
  tex.cascas = await etapa('Descascando troncos', () => TX.gerarCascas());
  tex.agulhas = await etapa('Contando agulhas de pinheiro', () => TX.gerarAtlasAgulhas());
  tex.grama = await etapa('Deixando a grama crescer', () => TX.gerarGrama());
  tex.samambaia = await etapa('Abrindo samambaias', () => TX.gerarSamambaia());
  tex.chao = await etapa('Espalhando folhas secas', () => TX.gerarChao());
  tex.macro = await etapa('Misturando musgo', () => TX.gerarMacro());
  const ruido3d = await etapa('Soltando a névoa', () => TX.gerarRuido3D());
  for (const t of [tex.cascas.sulcada.cor, tex.cascas.lisa.cor, tex.cascas.escamosa.cor, tex.chao.cor, tex.agulhas, tex.grama, tex.samambaia]) {
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }

  const terreno = await etapa('Levantando o chão', () => criarTerreno(tex.chao, tex.macro));
  cena.add(terreno);
  const alturas = await etapa('Medindo o relevo', () => texturaAlturas());
  rotulo.textContent = 'Plantando a floresta';
  const mundo = await criarFloresta(cena, tex, progresso, renderer);

  const ceu = criarCeu(tex.macro);
  ceu.material.uniforms.uLuaDir.value.copy(luaDir);
  cena.add(ceu);

  // luzes
  const lua = new THREE.DirectionalLight(luaCor, 0.55);
  lua.castShadow = true;
  // Sombra da lua num quadrado de 184 m que acompanha o jogador, refeita a
  // cada quadro. Uma sombra fixa do mundo inteiro, desenhada uma vez só, foi
  // medida em 16/10/2026 e ficou MAIS lenta (39 contra 49 qps em 3440x1440):
  // o desenho some, mas todo pixel até o horizonte passa a consultar o mapa.
  lua.shadow.mapSize.set(2048, 2048);
  const S = 92;
  Object.assign(lua.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 600 });
  lua.shadow.camera.updateProjectionMatrix();
  lua.shadow.bias = -0.0004;
  lua.shadow.normalBias = 0.05;
  lua.shadow.radius = 1.5;
  cena.add(lua, lua.target);
  const ambiente = new THREE.HemisphereLight(new THREE.Color(0.05, 0.065, 0.11), new THREE.Color(0.012, 0.01, 0.008), 0.8);
  cena.add(ambiente);

  const tocha = new Tocha(cena, camera, tex);
  const jogador = new Jogador(canvas, camera, mundo.obst);
  const pos = new Pos(renderer, ruido3d, alturas);

  // tamanho
  let escalaPixel = 800;
  function redimensionar() {
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(window.innerWidth * pr), h = Math.floor(window.innerHeight * pr);
    renderer.setPixelRatio(pr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    pos.redimensionar(w, h);
    escalaPixel = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }
  window.addEventListener('resize', redimensionar);
  redimensionar();

  // telas
  const capa = $('capa');
  const aviso = $('aviso-teclado');
  jogador.aoMudar = (ativo) => {
    capa.classList.toggle('oculta', ativo);
    document.body.classList.toggle('jogando', ativo);
    if (ativo) aviso.hidden = jogador.tecladoTravado;
  };
  $('entrar').addEventListener('click', () => jogador.entrar());
  $('carregando').classList.add('oculta');
  capa.classList.remove('oculta');
  $('entrar').focus();

  // laço
  const frustum = new THREE.Frustum();
  const mProj = new THREE.Matrix4();
  const eixoX = new THREE.Vector3(), eixoY = new THREE.Vector3();
  const centro = new THREE.Vector3();
  const tochaV = new THREE.Vector3();
  let anterior = performance.now();
  let tempo = 0;
  const medidor = $('qps');
  const mostrarQps = params.has('qps');
  if (mostrarQps) medidor.hidden = false;
  let qQuadros = 0, qTempo = 0;

  function quadro(agora) {
    requestAnimationFrame(quadro);
    let dt = (agora - anterior) / 1000;
    anterior = agora;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.05);
    tempo += dt;
    U.uTempo.value = tempo;
    ceu.material.uniforms.uTempo.value = tempo;

    let dados;
    if (jogador.ativo) dados = jogador.atualizar(dt);
    else {
      // parado na capa: só respira
      dados = jogador.atualizar(0.0001);
      dados.olhar = { dYaw: Math.sin(tempo * 0.4) * 0.0004, dPitch: 0 };
    }
    camera.updateMatrixWorld(true);
    tocha.atualizar(dt, dados, escalaPixel);

    // sombra da lua segue o jogador, presa à grade dos texels (não tremeluz)
    const texel = (2 * S) / lua.shadow.mapSize.x;
    eixoX.crossVectors(new THREE.Vector3(0, 1, 0), luaDir).normalize();
    eixoY.crossVectors(luaDir, eixoX).normalize();
    const p = camera.position;
    const fx = Math.round(p.dot(eixoX) / texel) * texel, fy = Math.round(p.dot(eixoY) / texel) * texel, fz = p.dot(luaDir);
    centro.copy(eixoX).multiplyScalar(fx).addScaledVector(eixoY, fy).addScaledVector(luaDir, fz);
    lua.target.position.copy(centro);
    lua.position.copy(centro).addScaledVector(luaDir, 300);
    lua.target.updateMatrixWorld();

    // população por distância
    mProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(mProj);
    mundo.arvores.atualizar(camera.position, frustum);
    mundo.vegetacao.plantas.atualizar(camera.position, frustum);
    mundo.vegetacao.pedras.atualizar(camera.position, frustum);

    // uniformes das folhas em espaço de vista
    tochaV.copy(tocha.luz.position).applyMatrix4(camera.matrixWorldInverse);
    U.uTochaPosV.value.copy(tochaV);
    U.uTochaCor.value.copy(tocha.luz.color);
    U.uLuaDirV.value.copy(luaDir).transformDirection(camera.matrixWorldInverse);
    U.uLuaCor.value.copy(luaCor).multiplyScalar(lua.intensity);

    pos.renderizar(cena, camera, {
      sombra: lua.shadow.map ? lua.shadow.map.depthTexture : null,
      sombraMat: lua.shadow.matrix,
      luaDir, luaCorNevoa: luaCor.clone().multiplyScalar(1.1),
      tochaPos: tocha.luz.position, tochaCor: tocha.luz.color, tochaInt: tocha.luz.intensity,
      tempo, exposicao: 3.0,
    });

    if (mostrarQps) {
      qQuadros++; qTempo += dt;
      if (qTempo > 0.5) { medidor.textContent = `${Math.round(qQuadros / qTempo)} qps`; qQuadros = 0; qTempo = 0; }
    }
  }
  requestAnimationFrame(quadro);
  window.__floresta = { renderer, cena, camera, jogador, mundo, tocha, pos, lua };
}

iniciar().catch((e) => {
  console.error(e);
  rotulo.textContent = `Deu erro ao montar a floresta: ${e.message}`;
});
