// Passe de tela cheia: um triângulo, um shader GLSL 3, um alvo.
import * as THREE from 'three';

const VERT = /* glsl */`
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const triangulo = new THREE.BufferGeometry();
triangulo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
const cameraTela = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export const CABECALHO = /* glsl */`
precision highp float;
precision highp sampler2D;
precision highp sampler3D;
precision highp sampler2DShadow;
in vec2 vUv;
out vec4 saida;
`;

export class Passe {
  constructor(frag, uniforms, extra = {}) {
    this.material = new THREE.RawShaderMaterial({
      vertexShader: VERT, fragmentShader: CABECALHO + frag, uniforms,
      glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false, ...extra,
    });
    this.uniforms = this.material.uniforms;
    this.malha = new THREE.Mesh(triangulo, this.material);
    this.malha.frustumCulled = false;
    this.cena = new THREE.Scene();
    this.cena.add(this.malha);
  }

  desenhar(renderer, alvo) {
    renderer.setRenderTarget(alvo);
    renderer.render(this.cena, cameraTela);
  }
}

export function alvo(w, h, op = {}) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false, generateMipmaps: false, ...op,
  });
  rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
  return rt;
}
