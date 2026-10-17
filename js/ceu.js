// Céu da noite: gradiente, estrelas que cintilam, Via Láctea fraca, nuvens
// finas que passam, e a lua cheia com mares e halo.
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */`
uniform vec3 uLuaDir;
uniform vec3 uLuaCor;
uniform float uTempo;
uniform sampler2D uMacro;
varying vec3 vDir;

float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float rv3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * rv3(p); p *= 2.03; a *= 0.5; } return s; }

vec3 camadaEstrelas(vec3 d, float escala, float limiar, float semente) {
  vec3 p = d * escala;
  vec3 c = floor(p);
  vec3 f = fract(p) - 0.5;
  float h = h13(c + semente);
  if (h < limiar) return vec3(0.0);
  vec3 o = (vec3(h13(c + 1.7 + semente), h13(c + 3.1 + semente), h13(c + 5.3 + semente)) - 0.5) * 0.55;
  float dist = length(f - o);
  float k = (h - limiar) / (1.0 - limiar);
  float brilho = pow(k, 4.0) * 9.0 + 0.25;
  float cintila = 0.75 + 0.25 * sin(uTempo * (2.0 + h * 5.0) + h * 300.0);
  vec3 cor = mix(vec3(1.0, 0.78, 0.58), vec3(0.7, 0.82, 1.0), h13(c + 9.1));
  return cor * brilho * cintila * smoothstep(0.2, 0.0, dist) * 0.06;
}

void main() {
  vec3 d = normalize(vDir);
  float alt = d.y;
  vec3 zenite = vec3(0.0016, 0.0028, 0.0075);
  vec3 horizonte = vec3(0.0075, 0.011, 0.02);
  vec3 cor = mix(horizonte, zenite, pow(max(alt, 0.0), 0.45));

  // Via Láctea: faixa num grande círculo, com poeira escura no meio
  vec3 nVia = normalize(vec3(0.42, 0.55, 0.72));
  float faixa = exp(-pow(dot(d, nVia) / 0.2, 2.0));
  float nuvemVia = fbm3(d * 6.0);
  float poeira = smoothstep(0.45, 0.7, fbm3(d * 11.0 + 4.0));
  cor += vec3(0.006, 0.0065, 0.009) * faixa * nuvemVia * (1.0 - poeira * 0.7) * 1.4;

  float vis = smoothstep(-0.02, 0.22, alt);
  vec3 estrelas = camadaEstrelas(d, 380.0, 0.975, 0.0) + camadaEstrelas(d, 820.0, 0.985, 17.0) * 0.6
                + camadaEstrelas(d, 1600.0, 0.99, 41.0) * faixa * 0.8;
  cor += estrelas * vis * (1.0 + faixa * 1.5);

  // lua
  float cosA = dot(d, uLuaDir);
  float ang = acos(clamp(cosA, -1.0, 1.0));
  cor += uLuaCor * (0.05 * exp(-ang * 7.0) + 0.012 * exp(-ang * 2.0) + 0.6 * exp(-ang * 45.0));
  const float raioLua = 0.0115;
  if (ang < raioLua * 1.2) {
    vec3 e1 = normalize(cross(uLuaDir, vec3(0.0, 1.0, 0.0)));
    vec3 e2 = cross(e1, uLuaDir);
    vec2 q = vec2(dot(d, e1), dot(d, e2)) / raioLua;
    float r = length(q);
    float z = sqrt(max(0.0, 1.0 - r * r));
    vec3 sup = vec3(q, z);
    float mares = smoothstep(0.5, 0.62, fbm3(sup * 1.8 + 3.0));
    float crateras = fbm3(sup * 9.0);
    float albedo = mix(1.0, 0.58, mares) * (0.82 + 0.3 * crateras);
    float borda = smoothstep(1.0, 0.96, r);
    vec3 disco = vec3(1.0, 0.97, 0.9) * albedo * (0.82 + 0.18 * pow(z, 0.4)) * 26.0;
    cor = mix(cor, disco, borda);
  }

  // nuvens finas, prateadas perto da lua
  if (alt > 0.0) {
    vec2 pc = d.xz / (alt + 0.12) * 0.55 + vec2(uTempo * 0.0035, uTempo * 0.0012);
    float n = texture2D(uMacro, pc * 0.35).r * 0.65 + texture2D(uMacro, pc * 1.1 + 0.3).g * 0.35;
    float dens = smoothstep(0.5, 0.78, n) * smoothstep(0.0, 0.25, alt) * 0.75;
    vec3 corNuvem = vec3(0.006, 0.008, 0.013) + uLuaCor * (0.6 * exp(-ang * 9.0) + 0.03 * exp(-ang * 2.0));
    cor = mix(cor, corNuvem, dens * (ang < raioLua * 1.2 ? 0.55 : 1.0));
  }
  gl_FragColor = vec4(cor, 1.0);
}`;

export function criarCeu(macro) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      uLuaDir: { value: new THREE.Vector3() },
      uLuaCor: { value: new THREE.Color(0.85, 0.9, 1.0) },
      uTempo: { value: 0 },
      uMacro: { value: macro },
    },
    side: THREE.BackSide, depthWrite: false, depthTest: true,
  });
  const malha = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat);
  malha.frustumCulled = false;
  malha.renderOrder = -10;
  return malha;
}
