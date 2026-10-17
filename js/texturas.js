// Todas as texturas nascem aqui, na hora, sem baixar imagem nenhuma:
// casca (três tipos), cachos de folha, agulhas de abeto, folha de samambaia,
// serapilheira do chão, um ruído grande para variar o chão e um ruído 3D
// para a névoa.
import * as THREE from 'three';
import { rng, fbm2, fbm3, celular2, ruido2, suavizar } from './ruido.js';

const ANISO = 16;

function texDados(dados, w, h, { srgb = false } = {}) {
  const t = new THREE.DataTexture(dados, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function texCanvas(canvas, { srgb = true, repetir = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = repetir ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// mapa de normal a partir de um mapa de altura que emenda nas bordas
function normalDeAltura(alt, w, h, forca) {
  const out = new Uint8Array(w * h * 4);
  const at = (x, y) => alt[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * forca, ny = -dy * forca, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      // DataTexture não vira de cabeça para baixo: o y da imagem é o v da UV,
      // então o verde segue +v (convenção OpenGL que o three espera)
      out[i] = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (-ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

const mix = (a, b, t) => a + (b - a) * t;

// Folha recortada: o canvas guarda a cor dos pixels transparentes como preto,
// e o mipmap puxaria esse preto para a borda das folhas ao longe. Aqui os
// transparentes ganham a cor média da folha (com alfa zero) antes de subir.
function recorte(canvas, fundo) {
  const { width: w, height: h } = canvas;
  const src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const ys = (h - 1 - y) * w * 4, yd = y * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      const a = src[ys + x + 3];
      if (a === 0) { d[yd + x] = fundo[0]; d[yd + x + 1] = fundo[1]; d[yd + x + 2] = fundo[2]; d[yd + x + 3] = 0; }
      else { d[yd + x] = src[ys + x]; d[yd + x + 1] = src[ys + x + 1]; d[yd + x + 2] = src[ys + x + 2]; d[yd + x + 3] = a; }
    }
  }
  const t = texDados(d, w, h, { srgb: true });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ------------------------------------------------------------------ cascas
export function gerarCascas() {
  const N = 1024;
  const res = {};
  for (const tipo of ['sulcada', 'lisa', 'escamosa']) {
    const cor = new Uint8Array(N * N * 4);
    const alt = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      const v = y / N;
      for (let x = 0; x < N; x++) {
        const u = x / N;
        let h, r, g, b;
        if (tipo === 'sulcada') {
          // carvalho: cristas verticais compridas separadas por sulcos fundos,
          // cortadas de vez em quando na horizontal; fibra fina por cima
          const warp = (fbm2(u * 3, v * 1, { oitavas: 4, periodo: 3, periodoY: 1, semente: 3 }) - 0.5) * 2.2;
          const [f1, f2] = celular2(u * 14 + warp, v * 2 + warp * 0.2, 11, 14, 2);
          const sulco = suavizar(0.0, 0.42, f2 - f1);
          const fibra = fbm2(u * 96, v * 12, { oitavas: 4, periodo: 96, periodoY: 12, semente: 5 });
          const grao = fbm2(u * 160, v * 160, { oitavas: 3, periodo: 160, semente: 7 });
          const placa = fbm2(u * 14 + warp, v * 2, { oitavas: 3, periodo: 14, periodoY: 2, semente: 9 });
          h = Math.pow(sulco, 0.75) * (0.55 + 0.3 * placa) + fibra * 0.18 + grao * 0.08;
          const tom = 0.75 + 0.5 * fbm2(u * 2, v * 2, { oitavas: 3, periodo: 2, semente: 13 });
          const claro = (0.15 + 0.12 * placa + 0.08 * fibra) * tom * (0.85 + 0.3 * grao);
          const fundo = 0.06 + 0.05 * grao;
          const k = Math.pow(sulco, 0.9);
          r = mix(fundo * 1.05, claro * 1.08, k); g = mix(fundo * 0.9, claro, k); b = mix(fundo * 0.75, claro * 0.88, k);
          const liquen = suavizar(0.62, 0.72, fbm2(u * 5, v * 5, { oitavas: 5, periodo: 5, semente: 21 })) * k * (grao > 0.45 ? 1 : 0.6);
          r = mix(r, 0.44 * (0.8 + 0.4 * grao), liquen * 0.55); g = mix(g, 0.47 * (0.8 + 0.4 * grao), liquen * 0.55); b = mix(b, 0.38, liquen * 0.55);
        } else if (tipo === 'lisa') {
          const manchas = fbm2(u * 6, v * 6, { oitavas: 5, periodo: 6, semente: 41 });
          const lenticela = Math.pow(ruido2(u * 24, v * 160, 43, 24, 160), 10);
          const det = fbm2(u * 64, v * 64, { oitavas: 3, periodo: 64, semente: 45 });
          const ruga = Math.pow(Math.abs(Math.sin((v * 7 + fbm2(u * 3, v * 3, { oitavas: 2, periodo: 3, semente: 47 }) * 1.5) * Math.PI * 2)), 18);
          h = 0.5 + det * 0.1 - lenticela * 0.5 - ruga * 0.15;
          const base = 0.47 + (manchas - 0.5) * 0.35;
          const verde = suavizar(0.58, 0.72, fbm2(u * 4, v * 4, { oitavas: 4, periodo: 4, semente: 49 }));
          r = base * (1 - lenticela * 0.5); g = base * 0.98 * (1 - lenticela * 0.5); b = base * 0.92 * (1 - lenticela * 0.5);
          r = mix(r, 0.3, verde * 0.6); g = mix(g, 0.38, verde * 0.6); b = mix(b, 0.25, verde * 0.6);
        } else {
          // abeto: lascas finas e irregulares que soltam pela borda
          const warp = (fbm2(u * 4, v * 2, { oitavas: 3, periodo: 4, periodoY: 2, semente: 61 }) - 0.5) * 1.4;
          const [f1, f2] = celular2(u * 12 + warp, v * 6 + warp, 63, 12, 6);
          const borda = suavizar(0.0, 0.3, f2 - f1);
          const grao = fbm2(u * 128, v * 128, { oitavas: 3, periodo: 128, semente: 65 });
          const lasca = fbm2(u * 12 + warp, v * 6 + warp, { oitavas: 2, periodo: 12, periodoY: 6, semente: 67 });
          const levanta = Math.pow(Math.max(0, 1 - f1), 1.5);
          h = Math.pow(borda, 0.8) * (0.4 + 0.4 * levanta + 0.2 * lasca) + grao * 0.12;
          const tom = 0.8 + 0.4 * fbm2(u * 2, v * 2, { oitavas: 3, periodo: 2, semente: 69 });
          const claro = (0.27 + 0.14 * lasca + 0.06 * levanta) * tom * (0.85 + 0.3 * grao);
          const k = Math.pow(borda, 0.85);
          r = mix(0.1, claro * 1.12, k); g = mix(0.065, claro * 0.86, k); b = mix(0.05, claro * 0.72, k);
        }
        const i = (y * N + x) * 4;
        cor[i] = Math.min(255, r * 255); cor[i + 1] = Math.min(255, g * 255); cor[i + 2] = Math.min(255, b * 255); cor[i + 3] = 255;
        alt[y * N + x] = h;
      }
    }
    res[tipo] = {
      cor: texDados(cor, N, N, { srgb: true }),
      normal: texDados(normalDeAltura(alt, N, N, tipo === 'lisa' ? 2.5 : 3), N, N),
    };
  }
  return res;
}

// ------------------------------------------------------------------ folhas
function contornoFolha(ctx, tipo, len, larg, R) {
  const n = 40;
  const lado = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let w;
    if (tipo === 'carvalho') {
      w = larg * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.8);
      w *= 0.62 + 0.38 * Math.pow(Math.abs(Math.sin(t * Math.PI * 4.5 + 0.3)), 0.7);
    } else if (tipo === 'faia') {
      w = larg * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.85) * (1 - 0.2 * t);
      w *= 1 + 0.035 * Math.sin(t * Math.PI * 16);
    } else {
      w = larg * Math.pow(Math.sin(Math.PI * t), 0.9);
    }
    lado.push([t * len, w]);
  }
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (const [x, w] of lado) ctx.lineTo(x, -w * (1 + (R() - 0.5) * 0.04));
  for (let i = lado.length - 1; i >= 0; i--) ctx.lineTo(lado[i][0], lado[i][1] * (1 + (R() - 0.5) * 0.04));
  ctx.closePath();
}

function desenharFolha(ctx, x, y, ang, len, larg, tipo, cor, R, { nervuras = true, borda = true } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  contornoFolha(ctx, tipo, len, larg, R);
  const grad = ctx.createLinearGradient(0, 0, len, 0);
  grad.addColorStop(0, `hsl(${cor.h} ${cor.s}% ${cor.l * 0.85}%)`);
  grad.addColorStop(0.6, `hsl(${cor.h + 3} ${cor.s}% ${cor.l}%)`);
  grad.addColorStop(1, `hsl(${cor.h + 6} ${cor.s * 0.9}% ${cor.l * 0.92}%)`);
  ctx.fillStyle = grad;
  ctx.fill();
  if (borda) {
    ctx.strokeStyle = `hsla(${cor.h} ${cor.s}% ${cor.l * 0.55}% / 0.55)`;
    ctx.lineWidth = Math.max(1, len * 0.008);
    ctx.stroke();
  }
  if (nervuras) {
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = `hsla(${cor.h + 10} ${cor.s * 0.7}% ${Math.min(80, cor.l * 1.6)}% / 0.75)`;
    ctx.lineWidth = Math.max(1, len * 0.014);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.97, 0); ctx.stroke();
    ctx.lineWidth = Math.max(0.6, len * 0.006);
    ctx.strokeStyle = `hsla(${cor.h + 10} ${cor.s * 0.7}% ${Math.min(80, cor.l * 1.45)}% / 0.45)`;
    const nv = tipo === 'carvalho' ? 5 : 8;
    for (let k = 1; k <= nv; k++) {
      const t = k / (nv + 1);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(t * len, 0);
        ctx.quadraticCurveTo((t + 0.08) * len, s * larg * 0.45, (t + 0.16) * len, s * larg * 0.95);
        ctx.stroke();
      }
    }
    // sombra suave do lado de baixo da folha (dá volume)
    const g2 = ctx.createLinearGradient(0, -larg, 0, larg);
    g2.addColorStop(0, 'rgba(0,0,0,0)');
    g2.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, -larg, len, larg * 2);
    ctx.restore();
  }
  ctx.restore();
}

// Placa de pinheiro: um ramo em leque, eixo do meio de baixo até em cima,
// raminhos dos dois lados e agulhas bem cheias. Atlas 2x2 (quatro variações).
export function gerarAtlasAgulhas() {
  const S = 2048, C = S / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const R = rng(303);
  ctx.lineCap = 'round';
  const agulhas = (x0, y0, x1, y1, n, comp, tom, espessura) => {
    const dx = x1 - x0, dy = y1 - y0;
    const base = Math.atan2(dy, dx);
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const px = x0 + dx * t, py = y0 + dy * t;
      for (const lado of [-1, 1]) {
        const ang = base + lado * (0.55 + R() * 0.45);
        const cl = comp * (0.7 + R() * 0.5) * (t > 0.8 ? 0.55 + (1 - t) * 2.2 : 1);
        const ponta = t > 0.75 ? 10 : 0;
        ctx.strokeStyle = `hsl(${tom.h + (R() - 0.5) * 14} ${tom.s + ponta}% ${tom.l + (R() - 0.5) * 8 + ponta}%)`;
        ctx.lineWidth = espessura * (0.8 + R() * 0.4);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(ang) * cl, py + Math.sin(ang) * cl); ctx.stroke();
      }
    }
  };
  for (let cel = 0; cel < 4; cel++) {
    const ox = (cel % 2) * C, oy = (1 - Math.floor(cel / 2)) * C;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, C, C); ctx.clip();
    ctx.translate(ox, oy);
    const tom = { h: 138 + R() * 14, s: 36 + R() * 10, l: 21 + R() * 6 };
    const topoX = C * 0.5 + (R() - 0.5) * C * 0.1;
    const ponto = (t) => [C * 0.5 + (topoX - C * 0.5) * t + Math.sin(t * 3.1) * C * 0.02, C - t * C * 0.93];
    // raminhos: do fundo para a frente, em leque
    const nLat = 14 + Math.floor(R() * 5);
    const lats = [];
    for (let k = 0; k < nLat; k++) {
      const t = 0.04 + 0.9 * (k + R() * 0.4) / nLat;
      for (const lado of [-1, 1]) {
        const comp = C * 0.44 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.75))), 0.9) * (0.8 + R() * 0.35);
        const ang = -Math.PI / 2 + lado * (0.75 + R() * 0.35 + t * 0.25);
        lats.push({ t, comp, ang, z: R() });
      }
    }
    lats.sort((a, b) => a.z - b.z);
    for (const l of lats) {
      const [bx, by] = ponto(l.t);
      const ex = bx + Math.cos(l.ang) * l.comp, ey = by + Math.sin(l.ang) * l.comp + l.comp * 0.12;
      ctx.strokeStyle = '#3b2b1c';
      ctx.lineWidth = C * 0.004;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
      const escuro = { ...tom, l: tom.l - 4 + l.z * 7 };
      agulhas(bx, by, ex, ey, Math.max(8, Math.round(l.comp / (C * 0.011))), C * 0.05, escuro, 3.2);
    }
    // eixo do meio por cima
    ctx.strokeStyle = '#3f2d1c';
    ctx.lineWidth = C * 0.009;
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) { const [x, y] = ponto(i / 20); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
    for (let i = 0; i < 20; i++) {
      const [ax, ay] = ponto(i / 20), [bx, by] = ponto((i + 1) / 20);
      agulhas(ax, ay, bx, by, 9, C * 0.055, tom, 3.4);
    }
    ctx.restore();
  }
  return recorte(cv, [30, 52, 38]);
}

// Touceira de grama: duas variações lado a lado, lâminas com degradê do pé
// escuro para a ponta clara.
export function gerarGrama() {
  const W = 1024, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const R = rng(909);
  for (let v = 0; v < 2; v++) {
    const ox = v * W / 2, L = W / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, 0, L, H); ctx.clip();
    ctx.translate(ox, 0);
    const laminas = [];
    for (let k = 0; k < 75; k++) laminas.push({ z: R() });
    laminas.sort((a, b) => a.z - b.z);
    for (const lam of laminas) {
      const bx = L * (0.12 + R() * 0.76);
      const alt = H * (0.4 + R() * 0.55) * (1 - Math.abs(bx / L - 0.5) * 0.7);
      const curva = (bx / L - 0.5) * L * 0.5 + (R() - 0.5) * L * 0.25;
      const larg = 5 + R() * 9;
      const seca = R() < 0.12;
      const g = ctx.createLinearGradient(0, H, 0, H - alt);
      g.addColorStop(0, `hsl(${seca ? 50 : 88} 35% ${8 + lam.z * 4}%)`);
      g.addColorStop(1, seca ? `hsl(${45 + R() * 10} 40% ${32 + R() * 10}%)` : `hsl(${82 + R() * 18} ${42 + R() * 15}% ${26 + R() * 14 + lam.z * 6}%)`);
      ctx.fillStyle = g;
      const tx = bx + curva, ty = H - alt;
      const cx = bx + curva * 0.15, cy = H - alt * 0.55;
      ctx.beginPath();
      ctx.moveTo(bx - larg / 2, H);
      ctx.quadraticCurveTo(cx - larg * 0.35, cy, tx, ty);
      ctx.quadraticCurveTo(cx + larg * 0.35, cy, bx + larg / 2, H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  return recorte(cv, [40, 52, 22]);
}

// Samambaia inteira (uma touceira de frondes em arco), duas variações.
export function gerarSamambaia() {
  const W = 1024, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const R = rng(404);
  ctx.lineCap = 'round';
  for (let v = 0; v < 2; v++) {
    const ox = v * W / 2, L = W / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, 0, L, H); ctx.clip();
    ctx.translate(ox, 0);
    const frondes = [];
    const n = 9 + Math.floor(R() * 4);
    for (let k = 0; k < n; k++) frondes.push({ ang: (R() - 0.5) * 2.5, comp: H * (0.6 + R() * 0.35), z: R() });
    // as do meio (mais em pé) ficam atrás
    frondes.sort((a, b) => Math.abs(b.ang) - Math.abs(a.ang) + (a.z - b.z) * 0.3);
    frondes.reverse();
    for (const f of frondes) {
      const bx = L / 2, by = H;
      const dx = Math.sin(f.ang), dy = -Math.cos(f.ang);
      const ponta = [bx + dx * f.comp * 0.95, by + dy * f.comp * 0.55 + Math.abs(dx) * f.comp * 0.25];
      const ctrl = [bx + dx * f.comp * 0.45, by + dy * f.comp * 1.0];
      const pt = (t) => {
        const u = 1 - t;
        return [u * u * bx + 2 * u * t * ctrl[0] + t * t * ponta[0], u * u * by + 2 * u * t * ctrl[1] + t * t * ponta[1]];
      };
      const tom = { h: 98 + R() * 16, s: 42 + R() * 12, l: 20 + R() * 6 + f.z * 6 };
      const nP = 22;
      for (let k = 1; k < nP; k++) {
        const t = k / nP;
        const [px, py] = pt(t), [qx, qy] = pt(Math.min(1, t + 0.02));
        const dir = Math.atan2(qy - py, qx - px);
        const comp = f.comp * 0.17 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.7) * 1.02)), 0.9);
        for (const lado of [-1, 1]) {
          const a = dir + lado * 1.15;
          ctx.save();
          ctx.translate(px, py); ctx.rotate(a);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(comp * 0.5, -comp * 0.16, comp, 0);
          ctx.quadraticCurveTo(comp * 0.5, comp * 0.16, 0, 0);
          ctx.fillStyle = `hsl(${tom.h + (R() - 0.5) * 8} ${tom.s}% ${tom.l + (R() - 0.5) * 5 + t * 6}%)`;
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.strokeStyle = `hsl(${tom.h - 20} 35% ${tom.l * 0.8}%)`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(bx, by);
      for (let i = 1; i <= 16; i++) { const [x, y] = pt(i / 16); ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.restore();
  }
  return recorte(cv, [44, 62, 28]);
}

// ------------------------------------------------------------------ chão
// Serapilheira: folhas secas, agulhas e gravetos, em camadas, com sombra de
// contato. Um segundo desenho em tons de cinza dá a altura (folha de cima mais
// alta) e vira o mapa de normal.
export function gerarChao() {
  const S = 2048;
  const cor = document.createElement('canvas');
  cor.width = cor.height = S;
  const cc = cor.getContext('2d');
  const altC = document.createElement('canvas');
  altC.width = altC.height = S;
  const ca = altC.getContext('2d');
  const R = rng(505);

  cc.fillStyle = '#261c14'; cc.fillRect(0, 0, S, S);
  ca.fillStyle = '#000'; ca.fillRect(0, 0, S, S);
  for (let i = 0; i < 26000; i++) {
    const x = R() * S, y = R() * S, s = 1 + R() * 4;
    cc.fillStyle = `hsl(${20 + R() * 20} ${20 + R() * 25}% ${6 + R() * 12}%)`;
    cc.fillRect(x, y, s, s);
    ca.fillStyle = `rgb(${20 + R() * 30},0,0)`; ca.fillRect(x, y, s, s);
  }

  // repete o desenho nas bordas para emendar sem costura
  const emTodaParte = (x, y, raio, fn) => {
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      const px = x + dx, py = y + dy;
      if (px + raio < 0 || px - raio > S || py + raio < 0 || py - raio > S) continue;
      fn(px, py);
    }
  };

  const N = 4200;
  for (let i = 0; i < N; i++) {
    const x = R() * S, y = R() * S;
    const nivel = 60 + (i / N) * 180;
    const tipoR = R();
    if (tipoR < 0.1) {
      // graveto
      const len = 120 + R() * 320, ang = R() * Math.PI * 2, esp = 3 + R() * 5;
      const cx = x + Math.cos(ang) * len * 0.5 + (R() - 0.5) * 40, cy = y + Math.sin(ang) * len * 0.5 + (R() - 0.5) * 40;
      const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
      const tom = `hsl(${22 + R() * 10} ${20 + R() * 15}% ${12 + R() * 12}%)`;
      emTodaParte(x, y, len, (px, py) => {
        const ox = px - x, oy = py - y;
        cc.save();
        cc.shadowColor = 'rgba(0,0,0,0.6)'; cc.shadowBlur = 6; cc.shadowOffsetY = 3;
        cc.strokeStyle = tom; cc.lineWidth = esp; cc.lineCap = 'round';
        cc.beginPath(); cc.moveTo(px, py); cc.quadraticCurveTo(cx + ox, cy + oy, ex + ox, ey + oy); cc.stroke();
        cc.restore();
        ca.strokeStyle = `rgb(${nivel + 30},0,0)`; ca.lineWidth = esp; ca.lineCap = 'round';
        ca.beginPath(); ca.moveTo(px, py); ca.quadraticCurveTo(cx + ox, cy + oy, ex + ox, ey + oy); ca.stroke();
      });
    } else if (tipoR < 0.78) {
      // agulhas caídas, em montinhos
      const n = 8 + Math.floor(R() * 14);
      for (let k = 0; k < n; k++) {
        const ax = x + (R() - 0.5) * 70, ay = y + (R() - 0.5) * 70;
        const ang = R() * Math.PI * 2, len = 22 + R() * 26;
        const tom = `hsl(${18 + R() * 14} ${35 + R() * 25}% ${14 + R() * 16}%)`;
        emTodaParte(ax, ay, len, (px, py) => {
          cc.strokeStyle = tom; cc.lineWidth = 2; cc.lineCap = 'round';
          cc.beginPath(); cc.moveTo(px, py); cc.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len); cc.stroke();
          ca.strokeStyle = `rgb(${nivel},0,0)`; ca.lineWidth = 2;
          ca.beginPath(); ca.moveTo(px, py); ca.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len); ca.stroke();
        });
      }
    } else {
      // folha seca
      const tipo = R() < 0.55 ? 'carvalho' : 'faia';
      const len = 70 + R() * 70, larg = len * (tipo === 'carvalho' ? 0.33 : 0.3);
      const ang = R() * Math.PI * 2;
      const seca = R();
      const tom = seca < 0.12
        ? { h: 55 + R() * 25, s: 25 + R() * 15, l: 16 + R() * 8 }
        : { h: 18 + R() * 22, s: 30 + R() * 30, l: 11 + R() * 18 };
      const Rf = rng(i * 31 + 7);
      emTodaParte(x, y, len, (px, py) => {
        cc.save();
        cc.shadowColor = 'rgba(0,0,0,0.55)'; cc.shadowBlur = 8; cc.shadowOffsetX = 2; cc.shadowOffsetY = 3;
        desenharFolha(cc, px, py, ang, len, larg, tipo, tom, rng(i * 31 + 7), { nervuras: false, borda: false });
        cc.restore();
        desenharFolha(cc, px, py, ang, len, larg, tipo, tom, rng(i * 31 + 7), { borda: false });
        ca.save();
        ca.translate(px, py); ca.rotate(ang);
        contornoFolha(ca, tipo, len, larg, Rf);
        ca.fillStyle = `rgb(${nivel},0,0)`; ca.fill();
        ca.restore();
      });
    }
  }

  // altura -> normal
  const img = ca.getImageData(0, 0, S, S).data;
  const alt = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) alt[i] = img[i * 4] / 255;
  // canvas tem y para baixo; a textura vai com flipY (CanvasTexture), então o
  // mapa de normal sai como DataTexture já virado para casar
  const altV = new Float32Array(S * S);
  for (let y = 0; y < S; y++) altV.set(alt.subarray((S - 1 - y) * S, (S - y) * S), y * S);
  const normal = texDados(normalDeAltura(altV, S, S, 1.1), S, S);
  return { cor: texCanvas(cor), normal };
}

// três canais de fbm independentes, para variar cor e musgo em escala grande
export function gerarMacro() {
  const N = 512;
  const d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      const i = (y * N + x) * 4;
      d[i] = fbm2(u * 4, v * 4, { oitavas: 5, periodo: 4, semente: 601 }) * 255;
      d[i + 1] = fbm2(u * 8, v * 8, { oitavas: 4, periodo: 8, semente: 607 }) * 255;
      d[i + 2] = fbm2(u * 6, v * 6, { oitavas: 5, periodo: 6, semente: 613 }) * 255;
      d[i + 3] = 255;
    }
  }
  return texDados(d, N, N);
}

// ruído 3D que emenda nas bordas, para a névoa
export function gerarRuido3D() {
  const N = 64;
  const d = new Uint8Array(N * N * N);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    d[(z * N + y) * N + x] = fbm3(x / N * 4, y / N * 4, z / N * 4, { oitavas: 4, periodo: 4, semente: 701 }) * 255;
  }
  const t = new THREE.Data3DTexture(d, N, N, N);
  t.format = THREE.RedFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}
