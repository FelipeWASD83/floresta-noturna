// Materiais do three.js com remendos de shader: vento (tronco, galho, graveto,
// folha), musgo e oclusão da casca, translucidez das folhas contra a tocha e a
// lua, chão que varia em escala grande. Os materiais de sombra recebem o mesmo
// vento, senão a sombra fica parada embaixo da folha que mexe.
import * as THREE from 'three';

// uniformes compartilhados por todos os materiais
export const U = {
  uTempo: { value: 0 },
  uVentoDir: { value: new THREE.Vector3(0.83, 0, 0.56).normalize() },
  uVentoForca: { value: 1 },
  uTochaPosV: { value: new THREE.Vector3() },
  uTochaCor: { value: new THREE.Color(1, 0.5, 0.2) },
  uTochaInt: { value: 6 },
  uLuaDirV: { value: new THREE.Vector3(0, 1, 0) },
  uLuaCor: { value: new THREE.Color(0.5, 0.6, 1) },
  uMusgo: { value: new THREE.Color(0.09, 0.13, 0.035) },
};

const GLSL_VENTO = /* glsl */`
uniform float uTempo;
uniform vec3 uVentoDir;
uniform float uVentoForca;
attribute vec4 aVento;
attribute float aDobra;
#ifdef VENTO_FOLHA
attribute vec2 aFolha;
#endif
varying float vVarInst;

vec3 ventoDeslocar(vec3 p) {
  #ifdef USE_INSTANCING
  mat3 R = mat3(instanceMatrix);
  vec3 base = instanceMatrix[3].xyz;
  #else
  mat3 R = mat3(modelMatrix);
  vec3 base = modelMatrix[3].xyz;
  #endif
  vVarInst = fract(sin(dot(base.xz, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 vd = normalize(transpose(R) * uVentoDir);
  vec3 cima = normalize(transpose(R) * vec3(0.0, 1.0, 0.0));
  vec3 lado = normalize(cross(cima, vd));
  float t = uTempo;
  float onda = dot(base.xz, uVentoDir.xz);
  // rajada que atravessa a floresta na direção do vento
  float rajada = 0.5 + 0.5 * sin(t * 0.31 - onda * 0.045) * sin(t * 0.117 - onda * 0.021 + 1.3);
  float f = uVentoForca * (0.3 + rajada);
  float fase0 = base.x * 0.37 + base.z * 0.61;
  float balanco = 0.6 + 0.3 * sin(t * 0.9 + fase0) + 0.12 * sin(t * 2.1 + fase0 * 1.7);
  p += vd * aDobra * f * balanco + lado * aDobra * f * 0.22 * sin(t * 0.7 + fase0 * 1.3);
  float o1 = sin(t * 1.6 + aVento.y) * 0.65 + sin(t * 2.7 + aVento.y * 1.31) * 0.35;
  p += (vd * 0.5 + cima * 0.6 + lado * 0.3) * aVento.x * f * 0.024 * o1;
  float o2 = sin(t * 3.3 + aVento.w) * 0.6 + sin(t * 5.7 + aVento.w * 1.7) * 0.4;
  p += (cima + lado * 0.6) * aVento.z * f * 0.032 * o2;
  #ifdef VENTO_FOLHA
  float o3 = sin(t * 8.3 + aFolha.y + onda * 0.3) * 0.6 + sin(t * 13.1 + aFolha.y * 2.3) * 0.4;
  p += normal * aFolha.x * f * (0.09 + 0.05 * rajada) * o3;
  #endif
  return p;
}
`;

function remendarVento(shader, folha) {
  shader.uniforms.uTempo = U.uTempo;
  shader.uniforms.uVentoDir = U.uVentoDir;
  shader.uniforms.uVentoForca = U.uVentoForca;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${folha ? '#define VENTO_FOLHA\n' : ''}${GLSL_VENTO}`)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = ventoDeslocar(transformed);');
}

// o mipmap come o alfa das folhas ao longe (e no mapa de sombra, onde cada
// cartão ocupa poucos texels); compensa pelo nível do mip
const ALFA_MIP = /* glsl */`
  #ifdef USE_MAP
    vec2 tamTex = vec2(textureSize(map, 0));
    vec2 ddx = dFdx(vMapUv * tamTex), ddy = dFdy(vMapUv * tamTex);
    float nivelMip = max(0.5 * log2(max(dot(ddx, ddx), dot(ddy, ddy))), 0.0);
    diffuseColor.a *= 1.0 + nivelMip * 0.3;
  #endif`;

function materiaisDeSombra(mat, folha, chave) {
  const prof = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  const dist = new THREE.MeshDistanceMaterial();
  for (const m of [prof, dist]) {
    if (folha) { m.map = mat.map; m.alphaTest = 0.5; }
    m.onBeforeCompile = (s) => {
      remendarVento(s, folha);
      if (folha) s.fragmentShader = s.fragmentShader.replace('#include <alphatest_fragment>', ALFA_MIP + '\n#include <alphatest_fragment>');
    };
    m.customProgramCacheKey = () => chave + (m.isMeshDepthMaterial ? 'p' : 'd');
  }
  return { prof, dist };
}

export function materialCasca(casca) {
  const mat = new THREE.MeshStandardMaterial({
    map: casca.cor, normalMap: casca.normal, normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.93, metalness: 0, vertexColors: true,
  });
  mat.onBeforeCompile = (s) => {
    remendarVento(s, false);
    s.uniforms.uMusgo = U.uMusgo;
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uMusgo;\nvarying float vVarInst;')
      .replace('#include <color_fragment>', `
        #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
          float lumC = dot(diffuseColor.rgb, vec3(0.333));
          diffuseColor.rgb = mix(diffuseColor.rgb, uMusgo * (0.5 + 2.2 * lumC), clamp(vColor.g * 1.35, 0.0, 1.0));
          // graveto fino: a textura de casca grossa não cabe nele; vira um marrom liso
          float fino = 1.0 - smoothstep(0.06, 0.4, vColor.b);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lumC) * vec3(0.95, 0.8, 0.66) * 0.9, fino * 0.8);
          diffuseColor.rgb *= vColor.r * (0.85 + 0.3 * vVarInst);
        #endif`);
  };
  mat.customProgramCacheKey = () => 'casca';
  const s = materiaisDeSombra(mat, false, 'casca');
  return { mat, prof: s.prof, dist: s.dist };
}

export function materialFolha(mapa, { translucidez = 1, tom = new THREE.Color(1, 1, 1), semMapa = false } = {}) {
  // Lambert: folha à noite não tem reflexo especular que se veja, e o
  // sombreamento sai bem mais barato com dezenas de camadas de folha
  const mat = new THREE.MeshLambertMaterial({
    map: semMapa ? null : mapa, color: tom, side: THREE.DoubleSide,
    alphaTest: semMapa ? 0 : 0.5, alphaToCoverage: !semMapa, vertexColors: true,
  });
  const uTrans = { value: translucidez };
  mat.onBeforeCompile = (s) => {
    remendarVento(s, true);
    Object.assign(s.uniforms, {
      uTochaPosV: U.uTochaPosV, uTochaCor: U.uTochaCor, uTochaInt: U.uTochaInt,
      uLuaDirV: U.uLuaDirV, uLuaCor: U.uLuaCor, uTransluc: uTrans,
    });
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uTochaPosV; uniform vec3 uTochaCor; uniform float uTochaInt;
        uniform vec3 uLuaDirV; uniform vec3 uLuaCor; uniform float uTransluc;
        varying float vVarInst;`)
      // a normal da copa é "redonda" (feita na geração); não pode virar no verso
      .replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;')
      .replace('#include <color_fragment>', `
        #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
          diffuseColor.rgb *= vColor.r;
        #endif
        diffuseColor.rgb *= vec3(0.9 + 0.2 * vVarInst, 0.92 + 0.16 * fract(vVarInst * 7.3), 0.9);`)
      .replace('#include <alphatest_fragment>', ALFA_MIP + '\n#include <alphatest_fragment>')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          // luz atravessando a folha: tocha (perto) e lua (atrás da copa)
          vec3 pv = -vViewPosition;
          vec3 Lt = uTochaPosV - pv;
          float d2 = dot(Lt, Lt);
          Lt *= inversesqrt(d2);
          float atrasT = max(dot(-normal, Lt), 0.0);
          vec3 trans = uTochaCor * uTochaInt * atrasT / (d2 + 0.3);
          #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
          float aoT = vColor.r;
          #else
          float aoT = 1.0;
          #endif
          trans += uLuaCor * pow(max(dot(-normal, uLuaDirV), 0.0), 2.0) * 0.55 * aoT * aoT;
          reflectedLight.directDiffuse += material.diffuseColor * vec3(1.0, 1.05, 0.55) * trans * uTransluc * RECIPROCAL_PI;
        }`);
  };
  const chave = semMapa ? 'folhaSemMapa' : 'folha';
  mat.customProgramCacheKey = () => chave;
  const s = materiaisDeSombra(mat, !semMapa, chave);
  return { mat, prof: s.prof, dist: s.dist };
}

export function materialChao(chao, macro) {
  const mat = new THREE.MeshStandardMaterial({
    map: chao.cor, normalMap: chao.normal, normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.9, metalness: 0,
  });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uMacro = { value: macro };
    s.uniforms.uMusgo = U.uMusgo;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPosM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPosM = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPosM;\nuniform sampler2D uMacro;\nuniform vec3 uMusgo;')
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec2 wp = vPosM.xz;
          vec4 m1 = texture2D(uMacro, wp / 97.0);
          vec4 m2 = texture2D(uMacro, wp / 23.0);
          vec4 c1 = texture2D(map, vMapUv);
          const float an = 0.9;
          vec4 c2 = texture2D(map, mat2(cos(an), -sin(an), sin(an), cos(an)) * vMapUv * 0.73 + 0.31);
          vec4 c = mix(c1, c2, smoothstep(0.4, 0.6, m2.g));
          float musgo = smoothstep(0.55, 0.72, m1.b) * (0.55 + 0.45 * m2.r);
          float brilho = dot(c.rgb, vec3(0.333));
          c.rgb = mix(c.rgb, uMusgo * (0.6 + 3.0 * brilho), musgo * 0.8);
          c.rgb *= 0.68 + 0.64 * m1.r;
          diffuseColor *= c;
        #endif`);
  };
  mat.customProgramCacheKey = () => 'chao';
  return mat;
}
