// Pós-processamento:
//  1. névoa volumétrica em meia resolução: para cada pixel, anda pelo raio da
//     câmera e, em cada passo, pergunta ao mapa de sombra da lua se aquele
//     ponto do ar está iluminado. É isso que desenha os raios de luz (god rays)
//     entre as copas. A tocha também acende a névoa em volta dela.
//  2. borrão que respeita a profundidade, e volta para a resolução cheia;
//  3. bloom (brilho que vaza da lua, da chama e das fagulhas);
//  4. tom (ACES), visão noturna (cor some no escuro), vinheta e grão.
import * as THREE from 'three';
import { Passe, alvo } from './passe.js';

const COMUM = /* glsl */`
uniform float uPerto, uLonge;
float linear(float d) { return uPerto * uLonge / (uLonge - d * (uLonge - uPerto)); }
`;

const FRAG_VOLUME = COMUM + /* glsl */`
uniform sampler2D tProf;
uniform sampler2DShadow tSombra;
uniform mat4 uSombraMat;
uniform mat4 uProjInv, uCamMundo;
uniform vec3 uCamPos;
uniform vec3 uLuaDir, uLuaCor, uAmbiente;
uniform vec3 uTochaPos, uTochaCor;
uniform float uTochaInt;
uniform sampler3D tRuido;
uniform sampler2D tAlturas;
uniform float uTempo, uDens, uNevoaChao, uDistMax, uForaSombra;
uniform vec3 uVento;
const float PI = 3.14159265;

vec3 posMundo(vec2 uv, float d) {
  vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  v /= v.w;
  return (uCamMundo * v).xyz;
}
float densidade(vec3 p) {
  float hc = texture(tAlturas, (p.xz + 320.0) / 640.0).r;
  float acima = p.y - hc;
  float n = texture(tRuido, p * 0.035 + uVento * uTempo * 0.01).r;
  float n2 = texture(tRuido, p * 0.11 - uVento * uTempo * 0.025 + 0.5).r;
  float chao = uNevoaChao * exp(-max(acima, 0.0) / 1.6) * smoothstep(0.32, 0.72, n * 0.65 + n2 * 0.35);
  // névoa mora embaixo das copas; acima delas o ar é quase limpo, senão o
  // brilho em volta da lua lava a imagem e apaga os feixes
  float alto = exp(-max(acima - 5.0, 0.0) / 7.0);
  return uDens * (0.45 + 1.1 * n) * alto + chao;
}
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }

void main() {
  float d = texture(tProf, vUv).r;
  vec3 alvoP = posMundo(vUv, min(d, 0.9999999));
  vec3 raio = alvoP - uCamPos;
  float dist = length(raio);
  vec3 dir = raio / dist;
  if (d >= 1.0) dist = uDistMax;
  dist = min(dist, uDistMax);
  const int N = 60;
  // passos mais curtos perto (onde a luz da tocha muda rápido)
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float cosL = dot(dir, uLuaDir);
  float faseL = mix(hg(cosL, 0.76), 1.0 / (4.0 * PI), 0.3) + hg(cosL, -0.2) * 0.15;
  vec3 luz = vec3(0.0);
  float T = 1.0;
  float sAnt = 0.0;
  for (int i = 0; i < N; i++) {
    float f = (float(i) + jit) / float(N);
    float s = dist * f * f;
    float passo = s - sAnt;
    sAnt = s;
    vec3 p = uCamPos + dir * s;
    float sig = densidade(p);
    vec4 sc = uSombraMat * vec4(p, 1.0);
    float vis = uForaSombra;
    if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) vis = texture(tSombra, vec3(sc.xy, sc.z - 0.0005));
    vec3 L = uLuaCor * vis * faseL;
    vec3 dt = uTochaPos - p;
    L += uTochaCor * uTochaInt / (dot(dt, dt) + 0.35) * (1.0 / (4.0 * PI));
    L += uAmbiente;
    float tp = exp(-sig * passo);
    luz += T * L * (1.0 - tp);
    T *= tp;
    if (T < 0.01) break;
  }
  saida = vec4(luz, T);
}`;

const FRAG_BORRAO = COMUM + /* glsl */`
uniform sampler2D tVol, tProf;
uniform vec2 uDir;
void main() {
  float dc = linear(texture(tProf, vUv).r);
  vec4 soma = vec4(0.0); float pesos = 0.0;
  for (int i = -4; i <= 4; i++) {
    vec2 uv = vUv + uDir * float(i);
    float di = linear(texture(tProf, uv).r);
    float w = exp(-float(i * i) / 8.0) / (0.02 + abs(di - dc) / dc * 6.0);
    soma += texture(tVol, uv) * w; pesos += w;
  }
  saida = soma / pesos;
}`;

const FRAG_COMPOR = COMUM + /* glsl */`
uniform sampler2D tCena, tVol, tProf;
uniform vec2 uMeio; // tamanho do texel da meia resolução
void main() {
  vec3 c = texture(tCena, vUv).rgb;
  float dc = linear(texture(tProf, vUv).r);
  // junta os 4 vizinhos da meia resolução pesando pela profundidade parecida
  vec2 base = (floor(vUv / uMeio - 0.5) + 0.5) * uMeio;
  vec2 fr = (vUv - base) / uMeio;
  vec4 soma = vec4(0.0); float pesos = 0.0;
  for (int j = 0; j <= 1; j++) for (int i = 0; i <= 1; i++) {
    vec2 uv = base + vec2(i, j) * uMeio;
    float di = linear(texture(tProf, uv).r);
    float bil = (i == 0 ? 1.0 - fr.x : fr.x) * (j == 0 ? 1.0 - fr.y : fr.y);
    float w = bil / (0.002 + abs(di - dc) / dc);
    soma += texture(tVol, uv) * w; pesos += w;
  }
  vec4 v = soma / max(pesos, 1e-6);
  saida = vec4(c * v.a + v.rgb, 1.0);
}`;

const FRAG_DESCER = /* glsl */`
uniform sampler2D tFonte;
uniform vec2 uTexel;
uniform float uLimiar;
void main() {
  vec3 a = texture(tFonte, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  vec3 b = texture(tFonte, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  vec3 c = texture(tFonte, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  vec3 d = texture(tFonte, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  vec3 e = texture(tFonte, vUv).rgb;
  vec3 m = (a + b + c + d) * 0.125 + e * 0.5;
  if (uLimiar > 0.0) {
    float l = max(m.r, max(m.g, m.b));
    m *= max(l - uLimiar, 0.0) / max(l, 1e-4);
    m = min(m, vec3(60.0));
  }
  saida = vec4(m, 1.0);
}`;

const FRAG_SUBIR = /* glsl */`
uniform sampler2D tMenor, tAtual;
uniform vec2 uTexel;
void main() {
  vec3 s = vec3(0.0);
  s += texture(tMenor, vUv + uTexel * vec2(-1, -1)).rgb;
  s += texture(tMenor, vUv + uTexel * vec2(0, -1)).rgb * 2.0;
  s += texture(tMenor, vUv + uTexel * vec2(1, -1)).rgb;
  s += texture(tMenor, vUv + uTexel * vec2(-1, 0)).rgb * 2.0;
  s += texture(tMenor, vUv).rgb * 4.0;
  s += texture(tMenor, vUv + uTexel * vec2(1, 0)).rgb * 2.0;
  s += texture(tMenor, vUv + uTexel * vec2(-1, 1)).rgb;
  s += texture(tMenor, vUv + uTexel * vec2(0, 1)).rgb * 2.0;
  s += texture(tMenor, vUv + uTexel * vec2(1, 1)).rgb;
  saida = vec4(texture(tAtual, vUv).rgb + s / 16.0, 1.0);
}`;

const FRAG_FINAL = /* glsl */`
uniform sampler2D tCor, tBloom;
uniform float uExposicao, uBloom, uTempo;
uniform vec2 uRes;
vec3 aces(vec3 x) {
  const mat3 entra = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 sai = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 v = entra * x;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(sai * (a / b), 0.0, 1.0);
}
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 c = texture(tCor, vUv).rgb + texture(tBloom, vUv).rgb * uBloom;
  c *= uExposicao;
  // visão noturna: no escuro o olho perde a cor e puxa para o azul
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 escotopico = vec3(lum) * vec3(0.72, 0.86, 1.18);
  c = mix(escotopico, c, smoothstep(0.004, 0.12, lum) * 0.75 + 0.25);
  vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  c *= mix(1.0, 0.45, smoothstep(0.35, 1.25, length(q)));
  c = aces(c);
  c = srgb(c);
  float g = h12(vUv * uRes + fract(uTempo * 13.7) * 311.0) - 0.5;
  c += g * 0.018;
  saida = vec4(c, 1.0);
}`;

export class Pos {
  constructor(renderer, ruido3d, alturas) {
    this.renderer = renderer;
    this.cena = null;
    this.meio = null;
    this.uComum = { uPerto: { value: 0.05 }, uLonge: { value: 1000 } };
    this.pVol = new Passe(FRAG_VOLUME, {
      ...this.uComum,
      tProf: { value: null }, tSombra: { value: null }, uSombraMat: { value: new THREE.Matrix4() },
      uProjInv: { value: new THREE.Matrix4() }, uCamMundo: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
      uLuaDir: { value: new THREE.Vector3() }, uLuaCor: { value: new THREE.Color() }, uAmbiente: { value: new THREE.Color(0.0009, 0.0012, 0.002) },
      uTochaPos: { value: new THREE.Vector3() }, uTochaCor: { value: new THREE.Color() }, uTochaInt: { value: 0 },
      tRuido: { value: ruido3d }, tAlturas: { value: alturas },
      uTempo: { value: 0 }, uDens: { value: 0.011 }, uNevoaChao: { value: 0.05 }, uDistMax: { value: 170 }, uForaSombra: { value: 0.1 },
      uVento: { value: new THREE.Vector3(0.83, 0, 0.56) },
    });
    this.pBorrao = new Passe(FRAG_BORRAO, { ...this.uComum, tVol: { value: null }, tProf: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.pCompor = new Passe(FRAG_COMPOR, { ...this.uComum, tCena: { value: null }, tVol: { value: null }, tProf: { value: null }, uMeio: { value: new THREE.Vector2() } });
    this.pDescer = new Passe(FRAG_DESCER, { tFonte: { value: null }, uTexel: { value: new THREE.Vector2() }, uLimiar: { value: 0 } });
    this.pSubir = new Passe(FRAG_SUBIR, { tMenor: { value: null }, tAtual: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.pFinal = new Passe(FRAG_FINAL, {
      tCor: { value: null }, tBloom: { value: null }, uExposicao: { value: 1 }, uBloom: { value: 0.06 },
      uTempo: { value: 0 }, uRes: { value: new THREE.Vector2() },
    });
  }

  redimensionar(w, h) {
    for (const rt of [this.cena, this.meio, this.meio2, this.comp, ...(this.desce || []), ...(this.sobe || [])]) rt && rt.dispose();
    const prof = new THREE.DepthTexture(w, h, THREE.FloatType);
    this.cena = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, samples: 4, depthBuffer: true, depthTexture: prof,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    const mw = Math.ceil(w / 2), mh = Math.ceil(h / 2);
    this.meio = alvo(mw, mh);
    this.meio2 = alvo(mw, mh);
    this.comp = alvo(w, h);
    this.desce = []; this.sobe = [];
    let bw = mw, bh = mh;
    for (let i = 0; i < 6; i++) {
      this.desce.push(alvo(bw, bh)); this.sobe.push(alvo(bw, bh));
      bw = Math.max(1, Math.ceil(bw / 2)); bh = Math.max(1, Math.ceil(bh / 2));
    }
    this.w = w; this.h = h;
    this.pFinal.uniforms.uRes.value.set(w, h);
  }

  renderizar(cena, camera, dados) {
    const r = this.renderer;
    this.uComum.uPerto.value = camera.near;
    this.uComum.uLonge.value = camera.far;
    r.setRenderTarget(this.cena);
    r.clear();
    r.render(cena, camera);

    // no primeiro quadro o mapa de sombra da lua ainda não existe; ligar a
    // névoa nessa hora amarraria uma textura vazia no lugar dele
    if (!dados.sombra) return;
    const prof = this.cena.depthTexture;
    const v = this.pVol.uniforms;
    v.tProf.value = prof;
    v.tSombra.value = dados.sombra;
    v.uSombraMat.value.copy(dados.sombraMat);
    v.uProjInv.value.copy(camera.projectionMatrixInverse);
    v.uCamMundo.value.copy(camera.matrixWorld);
    v.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    v.uLuaDir.value.copy(dados.luaDir);
    v.uLuaCor.value.copy(dados.luaCorNevoa);
    v.uTochaPos.value.copy(dados.tochaPos);
    v.uTochaCor.value.copy(dados.tochaCor);
    v.uTochaInt.value = dados.tochaInt;
    v.uTempo.value = dados.tempo;
    this.pVol.desenhar(r, this.meio);

    const b = this.pBorrao.uniforms;
    b.tProf.value = prof;
    b.tVol.value = this.meio.texture; b.uDir.value.set(1.4 / this.meio.width, 0);
    this.pBorrao.desenhar(r, this.meio2);
    b.tVol.value = this.meio2.texture; b.uDir.value.set(0, 1.4 / this.meio.height);
    this.pBorrao.desenhar(r, this.meio);

    const c = this.pCompor.uniforms;
    c.tCena.value = this.cena.texture; c.tVol.value = this.meio.texture; c.tProf.value = prof;
    c.uMeio.value.set(1 / this.meio.width, 1 / this.meio.height);
    this.pCompor.desenhar(r, this.comp);

    // bloom
    const d = this.pDescer.uniforms;
    let fonte = this.comp;
    for (let i = 0; i < this.desce.length; i++) {
      d.tFonte.value = fonte.texture;
      d.uTexel.value.set(1 / fonte.width, 1 / fonte.height);
      d.uLimiar.value = i === 0 ? 0.35 : 0;
      this.pDescer.desenhar(r, this.desce[i]);
      fonte = this.desce[i];
    }
    const s = this.pSubir.uniforms;
    let menor = this.desce[this.desce.length - 1];
    for (let i = this.desce.length - 2; i >= 0; i--) {
      s.tMenor.value = menor.texture; s.tAtual.value = this.desce[i].texture;
      s.uTexel.value.set(1 / menor.width, 1 / menor.height);
      this.pSubir.desenhar(r, this.sobe[i]);
      menor = this.sobe[i];
    }

    const f = this.pFinal.uniforms;
    f.tCor.value = this.comp.texture;
    f.tBloom.value = this.sobe[0].texture;
    f.uExposicao.value = dados.exposicao;
    f.uTempo.value = dados.tempo;
    this.pFinal.desenhar(r, null);
  }
}
