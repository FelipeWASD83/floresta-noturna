// A tocha na mão: cabo de madeira, cabeça de pano enrolado com brasa, chama
// em shader (dois véus de ruído subindo), fagulhas, fumaça e a luz que
// tremula e projeta sombra.
import * as THREE from 'three';
import { U } from './materiais.js';

const VERT_CHAMA = /* glsl */`
attribute vec2 canto;
uniform vec3 uCentro;
uniform vec2 uTam;
varying vec2 vUv;
void main() {
  vec4 c = viewMatrix * vec4(uCentro, 1.0);
  vec3 cimaV = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  vec2 up = cimaV.xy;
  float lu = length(up);
  up = lu > 1e-3 ? up / lu : vec2(0.0, 1.0);
  vec2 rt = vec2(up.y, -up.x);
  float alt = uTam.y * (0.3 + 0.7 * lu);
  vec3 off = vec3(rt * canto.x * uTam.x + up * (canto.y - 0.1) * alt, 0.0);
  vUv = canto;
  gl_Position = projectionMatrix * vec4(c.xyz + off, 1.0);
}`;

const FRAG_CHAMA = /* glsl */`
uniform float uTempo;
uniform float uBrilho;
uniform float uSemente;
uniform sampler2D uRuido;
varying vec2 vUv;
void main() {
  float y = vUv.y;
  float t = uTempo + uSemente;
  float n1 = texture2D(uRuido, vec2(vUv.x * 0.18 + uSemente, y * 0.28 - t * 0.55)).r;
  float n2 = texture2D(uRuido, vec2(vUv.x * 0.42 + 0.3 + uSemente, y * 0.6 - t * 1.25)).g;
  float n3 = texture2D(uRuido, vec2(vUv.x * 0.9 + 0.7, y * 1.3 - t * 2.4)).b;
  float n = n1 * 0.5 + n2 * 0.33 + n3 * 0.17;
  float x = vUv.x + (n - 0.5) * 1.1 * y + sin(t * 3.1 + y * 4.0) * 0.06 * y;
  float largura = 0.85 * pow(max(1.0 - y, 0.0), 0.8) * smoothstep(0.0, 0.12, y) + 0.05;
  float forma = 1.0 - smoothstep(largura * 0.15, largura * 1.15, abs(x));
  forma *= smoothstep(1.0, 0.35 + n * 0.4, y);
  float calor = clamp(forma * (1.15 - y * 0.8 + (n - 0.5) * 0.9), 0.0, 1.0);
  vec3 cor = mix(vec3(0.75, 0.07, 0.01), vec3(1.0, 0.36, 0.05), smoothstep(0.12, 0.45, calor));
  cor = mix(cor, vec3(1.0, 0.72, 0.32), smoothstep(0.5, 0.8, calor));
  cor = mix(cor, vec3(1.0, 0.92, 0.75), smoothstep(0.82, 1.0, calor));
  float a = smoothstep(0.0, 0.45, calor);
  // base um pouco azulada, onde o pano solta gás
  cor += vec3(0.05, 0.1, 0.4) * smoothstep(0.12, 0.0, y) * forma * 0.6;
  gl_FragColor = vec4(cor * uBrilho * (0.35 + calor * 1.9) * a, 1.0);
}`;

const VERT_PART = /* glsl */`
attribute float tamanho;
attribute float vida;
uniform float uEscala;
varying float vVida;
void main() {
  vVida = vida;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = tamanho * uEscala / max(-mv.z, 0.05);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG_FAGULHA = /* glsl */`
varying float vVida;
void main() {
  if (vVida <= 0.0) discard;
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q);
  float a = smoothstep(0.5, 0.0, d);
  vec3 cor = mix(vec3(1.0, 0.2, 0.02), vec3(1.0, 0.65, 0.25), vVida);
  gl_FragColor = vec4(cor * a * 14.0 * vVida, 1.0);
}`;

const FRAG_FUMACA = /* glsl */`
uniform vec3 uLuz;
varying float vVida;
void main() {
  if (vVida <= 0.0) discard;
  vec2 q = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.1, length(q)) * 0.07 * vVida * (1.0 - vVida * 0.5);
  gl_FragColor = vec4(uLuz * 0.5 + vec3(0.003), a);
}`;

export class Tocha {
  constructor(cena, camera, tex) {
    this.camera = camera;
    this.tempo = 0;
    // modelo preso à câmera
    this.modelo = new THREE.Group();
    camera.add(this.modelo);
    const madeira = new THREE.MeshStandardMaterial({
      map: tex.cascas.lisa.cor, normalMap: tex.cascas.lisa.normal, color: new THREE.Color(0.55, 0.36, 0.22), roughness: 0.8,
    });
    // a luz da tocha fica a poucos centímetros do cabo e do pano: de verdade a
    // própria chama cobre a cabeça; aqui a luz direta neles é quase toda cortada
    // e trocada por um brilho quente que desce pelo cabo
    const abafar = (m, quente) => {
      m.onBeforeCompile = (s) => {
        s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vAltL;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAltL = position.y;');
        s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAltL;')
          .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
            reflectedLight.directDiffuse *= 0.025;
            reflectedLight.directSpecular *= 0.02;
            reflectedLight.directDiffuse += material.diffuseColor * vec3(1.0, 0.5, 0.2) * ${quente};`);
      };
    };
    abafar(madeira, '(0.04 + 0.55 * pow(smoothstep(-0.45, 0.32, vAltL), 2.0))');
    const cabo = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.015, 0.62, 20, 1), madeira);
    cabo.position.y = -0.21;
    this.modelo.add(cabo);
    // pano enrolado em espiral
    const gCab = new THREE.CylinderGeometry(0.036, 0.03, 0.13, 40, 26, false);
    const p = gCab.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      const faixa = Math.sin(a + y * 140) * 0.5 + 0.5;
      const k = (r + 0.004 * faixa + 0.002 * Math.sin(a * 7 + y * 60)) / r;
      p.setXYZ(i, x * k, y, z * k);
    }
    gCab.computeVertexNormals();
    this.uBrasa = { value: 1 };
    const pano = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.035, 0.026, 0.02), roughness: 1 });
    pano.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directDiffuse *= 0.03;
        reflectedLight.directSpecular *= 0.0;
        reflectedLight.directDiffuse += material.diffuseColor * vec3(1.0, 0.5, 0.2) * (0.15 + 0.5 * max(normal.y, 0.0));`);
      s.uniforms.uTempo = U.uTempo;
      s.uniforms.uBrasa = this.uBrasa;
      s.uniforms.uRuido = { value: tex.macro };
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocal;\nuniform float uTempo;\nuniform float uBrasa;\nuniform sampler2D uRuido;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            float a = atan(vLocal.z, vLocal.x);
            vec2 q = vec2(a * 0.25, vLocal.y * 3.0);
            float n = texture2D(uRuido, q + vec2(0.0, -uTempo * 0.05)).r * 0.6 + texture2D(uRuido, q * 2.7 + vec2(uTempo * 0.03, 0.0)).g * 0.4;
            float topo = smoothstep(-0.04, 0.065, vLocal.y);
            float brasa = pow(smoothstep(0.42, 0.85, n), 2.2) * topo;
            totalEmissiveRadiance += vec3(3.0, 0.62, 0.09) * brasa * uBrasa;
          }`);
    };
    const cabeca = new THREE.Mesh(gCab, pano);
    cabeca.position.y = 0.13;
    this.modelo.add(cabeca);
    // amarração de corda
    const corda = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.004, 8, 24), new THREE.MeshStandardMaterial({ color: 0x2a2015, roughness: 1 }));
    corda.rotation.x = Math.PI / 2;
    corda.position.y = 0.06;
    this.modelo.add(corda);
    this.modelo.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    this.topo = new THREE.Object3D();
    this.topo.position.y = 0.2;
    this.modelo.add(this.topo);

    // chama: dois véus no mundo, sempre de pé
    const gq = new THREE.BufferGeometry();
    gq.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    gq.setAttribute('canto', new THREE.BufferAttribute(new Float32Array([-1, 0, 1, 0, 1, 1, -1, 1]), 2));
    gq.setIndex([0, 1, 2, 0, 2, 3]);
    this.chamas = [];
    for (const [sem, esc] of [[0.0, 1.0], [0.37, 0.72]]) {
      const m = new THREE.ShaderMaterial({
        vertexShader: VERT_CHAMA, fragmentShader: FRAG_CHAMA,
        uniforms: {
          uCentro: { value: new THREE.Vector3() }, uTam: { value: new THREE.Vector2(0.07 * esc, 0.27 * esc) },
          uTempo: U.uTempo, uBrilho: { value: 7 }, uSemente: { value: sem }, uRuido: { value: tex.macro },
        },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const q = new THREE.Mesh(gq, m);
      q.frustumCulled = false;
      q.renderOrder = 10;
      cena.add(q);
      this.chamas.push(q);
    }

    // fagulhas e fumaça
    this.fag = this.criarParticulas(cena, 160, FRAG_FAGULHA, THREE.AdditiveBlending);
    this.fum = this.criarParticulas(cena, 70, FRAG_FUMACA, THREE.NormalBlending);
    this.fum.mesh.material.uniforms.uLuz = { value: new THREE.Vector3() };

    // luz
    this.luz = new THREE.PointLight(0xff8a3d, 6, 34, 2);
    this.luz.color.setRGB(1.0, 0.5, 0.19);
    this.luz.castShadow = true;
    this.luz.shadow.mapSize.set(1024, 1024);
    this.luz.shadow.camera.near = 0.08;
    this.luz.shadow.camera.far = 34;
    this.luz.shadow.bias = -0.002;
    this.luz.shadow.normalBias = 0.02;
    this.luz.shadow.radius = 2;
    cena.add(this.luz);

    this.posChama = new THREE.Vector3();
    this.anterior = new THREE.Vector3();
    this.balanco = { x: 0, y: 0, vx: 0, vy: 0 };
    this.intensidade = 8;
  }

  criarParticulas(cena, n, frag, blending) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), tam = new Float32Array(n), vida = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tamanho', new THREE.BufferAttribute(tam, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('vida', new THREE.BufferAttribute(vida, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT_PART, fragmentShader: frag, uniforms: { uEscala: { value: 800 } },
      transparent: true, depthWrite: false, blending,
    });
    const mesh = new THREE.Points(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = blending === THREE.AdditiveBlending ? 11 : 9;
    cena.add(mesh);
    const st = { mesh, n, vel: new Float32Array(n * 3), vidaMax: new Float32Array(n), idade: new Float32Array(n).fill(1e9), prox: 0, acum: 0 };
    return st;
  }

  emitir(st, taxa, dt, fn) {
    st.acum += taxa * dt;
    while (st.acum >= 1) {
      st.acum -= 1;
      const i = st.prox; st.prox = (st.prox + 1) % st.n;
      fn(i);
    }
  }

  // dados: { andando, correndo, agachado, passo, olhar:{dYaw, dPitch}, alturaTela }
  atualizar(dt, dados, escalaPixel) {
    this.tempo += dt;
    const t = this.tempo;
    // balanço: mola que atrasa o movimento do olhar
    const b = this.balanco;
    const k = 60, amort = 11;
    b.vx += (-k * b.x - amort * b.vx) * dt - dados.olhar.dYaw * 0.9;
    b.vy += (-k * b.y - amort * b.vy) * dt + dados.olhar.dPitch * 0.9;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.x = Math.max(-0.08, Math.min(0.08, b.x)); b.y = Math.max(-0.08, Math.min(0.08, b.y));
    const ritmo = dados.passo;
    const amp = dados.andando ? (dados.correndo ? 0.022 : 0.011) : 0.002;
    const bobX = Math.sin(ritmo) * amp;
    const bobY = -Math.abs(Math.cos(ritmo)) * amp * 1.2 + Math.sin(t * 1.3) * 0.003;
    const baixo = dados.agachado ? 0.02 : 0;
    // em tela em pé (monitor de 1080x1920) a tocha chega mais para o meio
    const lado = 0.31 * Math.min(1, this.camera.aspect / 1.5);
    this.modelo.position.set(lado + bobX + b.x, -0.36 + bobY + b.y - baixo, -0.56);
    this.modelo.rotation.set(-0.3 + b.y * 1.5, 0.1, 0.2 - b.x * 2 + bobX * 2);
    this.camera.updateMatrixWorld(true);
    this.topo.getWorldPosition(this.posChama);
    const velChama = this.posChama.clone().sub(this.anterior).divideScalar(Math.max(dt, 1e-3));
    this.anterior.copy(this.posChama);

    // tremulação: soma de senos em frequências que não batem
    const trem = 0.82 + 0.1 * Math.sin(t * 9.1) + 0.06 * Math.sin(t * 15.7 + 1.3) + 0.05 * Math.sin(t * 23.3 + 2.1) + 0.04 * Math.sin(t * 3.3);
    this.luz.intensity = this.intensidade * trem;
    this.luz.position.copy(this.posChama).add(new THREE.Vector3(Math.sin(t * 7.3) * 0.02, 0.08 + Math.sin(t * 5.1) * 0.015, Math.cos(t * 6.7) * 0.02));
    this.uBrasa.value = 0.7 + 0.3 * trem;
    for (const q of this.chamas) {
      q.material.uniforms.uCentro.value.copy(this.posChama);
      q.material.uniforms.uBrilho.value = 1.5 * trem;
    }
    U.uTochaInt.value = this.luz.intensity;

    // fagulhas
    const fg = this.fag;
    this.emitir(fg, 14, dt, (i) => {
      fg.mesh.geometry.attributes.position.setXYZ(i, this.posChama.x + (Math.random() - 0.5) * 0.04, this.posChama.y + 0.1 + Math.random() * 0.1, this.posChama.z + (Math.random() - 0.5) * 0.04);
      fg.vel[i * 3] = (Math.random() - 0.5) * 0.4 + velChama.x * 0.3;
      fg.vel[i * 3 + 1] = 0.5 + Math.random() * 0.7;
      fg.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.4 + velChama.z * 0.3;
      fg.idade[i] = 0; fg.vidaMax[i] = 0.5 + Math.random() * 1.1;
      fg.mesh.geometry.attributes.tamanho.setX(i, 0.006 + Math.random() * 0.01);
    });
    this.passoParticulas(fg, dt, (i, x, y, z) => {
      fg.vel[i * 3] += (Math.sin(t * 4 + y * 9 + i) * 1.6) * dt;
      fg.vel[i * 3 + 2] += (Math.cos(t * 3.7 + x * 8 + i) * 1.6) * dt;
      fg.vel[i * 3 + 1] += 0.15 * dt;
      for (let c = 0; c < 3; c++) fg.vel[i * 3 + c] *= 1 - 0.9 * dt;
    });
    // fumaça
    const fm = this.fum;
    this.emitir(fm, 14, dt, (i) => {
      fm.mesh.geometry.attributes.position.setXYZ(i, this.posChama.x, this.posChama.y + 0.3, this.posChama.z);
      fm.vel[i * 3] = (Math.random() - 0.5) * 0.1 + velChama.x * 0.2;
      fm.vel[i * 3 + 1] = 0.35 + Math.random() * 0.3;
      fm.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.1 + velChama.z * 0.2;
      fm.idade[i] = 0; fm.vidaMax[i] = 2.5 + Math.random() * 2;
    });
    this.passoParticulas(fm, dt, (i, x, y, z, vida) => {
      fm.vel[i * 3] += Math.sin(t * 0.7 + y * 2 + i) * 0.12 * dt;
      fm.vel[i * 3 + 2] += Math.cos(t * 0.6 + x * 2 + i) * 0.12 * dt;
      fm.mesh.geometry.attributes.tamanho.setX(i, 0.08 + (1 - vida) * 0.5);
    });
    fm.mesh.material.uniforms.uLuz.value.set(1.0, 0.5, 0.19).multiplyScalar(trem * 0.02);
    fg.mesh.material.uniforms.uEscala.value = escalaPixel;
    fm.mesh.material.uniforms.uEscala.value = escalaPixel;
  }

  passoParticulas(st, dt, extra) {
    const p = st.mesh.geometry.attributes.position, v = st.mesh.geometry.attributes.vida;
    for (let i = 0; i < st.n; i++) {
      st.idade[i] += dt;
      const vida = 1 - st.idade[i] / st.vidaMax[i];
      if (vida <= 0) { v.setX(i, 0); continue; }
      const x = p.getX(i) + st.vel[i * 3] * dt, y = p.getY(i) + st.vel[i * 3 + 1] * dt, z = p.getZ(i) + st.vel[i * 3 + 2] * dt;
      p.setXYZ(i, x, y, z);
      v.setX(i, vida);
      extra(i, x, y, z, vida);
    }
    p.needsUpdate = true; v.needsUpdate = true;
    st.mesh.geometry.attributes.tamanho.needsUpdate = true;
  }
}
