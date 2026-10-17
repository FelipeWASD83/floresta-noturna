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

function corVerde(R, tipo) {
  if (tipo === 'carvalho') return { h: 88 + R() * 18, s: 38 + R() * 18, l: 20 + R() * 9 };
  return { h: 82 + R() * 20, s: 42 + R() * 18, l: 23 + R() * 9 };
}

// Atlas 2x2: cada célula é um raminho com várias folhas, nascendo do meio de
// baixo (onde o cartão encosta no graveto).
export function gerarAtlasFolhas(tipo) {
  const S = 2048, C = S / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const R = rng(tipo === 'carvalho' ? 101 : 202);
  for (let cel = 0; cel < 4; cel++) {
    const ox = (cel % 2) * C;
    const oy = (1 - Math.floor(cel / 2)) * C; // v da UV cresce para cima
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, C, C); ctx.clip();
    ctx.translate(ox, oy);
    // graveto
    const topo = [C * 0.5 + (R() - 0.5) * C * 0.25, C * 0.12];
    const meio = [C * 0.5 + (R() - 0.5) * C * 0.2, C * 0.55];
    const ponto = (t) => {
      const a = [C * 0.5, C], u = 1 - t;
      return [u * u * a[0] + 2 * u * t * meio[0] + t * t * topo[0], u * u * a[1] + 2 * u * t * meio[1] + t * t * topo[1]];
    };
    const folhasCel = [];
    const nF = tipo === 'carvalho' ? 7 + Math.floor(R() * 4) : 8 + Math.floor(R() * 5);
    for (let k = 0; k < nF; k++) {
      const t = 0.12 + 0.86 * (k + R() * 0.5) / nF;
      const [px, py] = ponto(t);
      const [qx, qy] = ponto(Math.min(1, t + 0.02));
      const dirAng = Math.atan2(qy - py, qx - px);
      const lado = k % 2 === 0 ? 1 : -1;
      const ang = dirAng + lado * (0.6 + R() * 0.7);
      const len = (tipo === 'carvalho' ? C * 0.3 : C * 0.26) * (0.7 + R() * 0.5) * (1 - t * 0.25);
      folhasCel.push({ px, py, ang, len, larg: len * (tipo === 'carvalho' ? 0.34 : 0.32), cor: corVerde(R, tipo) });
    }
    // folha da ponta
    const [tx, ty] = ponto(1);
    folhasCel.push({ px: tx, py: ty, ang: -Math.PI / 2 + (R() - 0.5) * 0.4, len: C * 0.26, larg: C * 0.085, cor: corVerde(R, tipo) });
    // de trás para frente: as de baixo primeiro
    folhasCel.sort(() => R() - 0.5);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#3b2e1d';
    ctx.lineWidth = C * 0.012;
    ctx.beginPath(); ctx.moveTo(C * 0.5, C); ctx.quadraticCurveTo(meio[0], meio[1], topo[0], topo[1]); ctx.stroke();
    for (const f of folhasCel) {
      // pecíolo
      const pl = f.len * 0.08;
      ctx.strokeStyle = '#4b4226';
      ctx.lineWidth = C * 0.005;
      ctx.beginPath(); ctx.moveTo(f.px, f.py); ctx.lineTo(f.px + Math.cos(f.ang) * pl, f.py + Math.sin(f.ang) * pl); ctx.stroke();
      desenharFolha(ctx, f.px + Math.cos(f.ang) * pl, f.py + Math.sin(f.ang) * pl, f.ang, f.len, f.larg, tipo, f.cor, R);
    }
    ctx.restore();
  }
  return recorte(cv, tipo === 'carvalho' ? [52, 64, 30] : [56, 70, 32]);
}

export function gerarAtlasAgulhas() {
  const S = 2048, C = S / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const R = rng(303);
  ctx.lineCap = 'round';
  const raminho = (x0, y0, x1, y1, esp, nAg, compAg, tom) => {
    ctx.strokeStyle = '#3a2a1c';
    ctx.lineWidth = esp;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
    const ux = dx / l, uy = dy / l;
    for (let k = 0; k < nAg; k++) {
      const t = k / nAg;
      const px = x0 + dx * t, py = y0 + dy * t;
      const lado = k % 2 === 0 ? 1 : -1;
      const ang = Math.atan2(uy, ux) + lado * (0.75 + R() * 0.5);
      const cl = compAg * (0.75 + R() * 0.45) * (t > 0.85 ? (1 - t) / 0.15 * 0.6 + 0.4 : 1);
      const l2 = tom.l + (R() - 0.5) * 8 + (t > 0.8 ? 6 : 0);
      ctx.strokeStyle = `hsl(${tom.h + (R() - 0.5) * 10} ${tom.s}% ${l2}%)`;
      ctx.lineWidth = 2.6 + R() * 1.2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(ang) * cl, py + Math.sin(ang) * cl); ctx.stroke();
    }
  };
  for (let cel = 0; cel < 4; cel++) {
    const ox = (cel % 2) * C, oy = (1 - Math.floor(cel / 2)) * C;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, C, C); ctx.clip();
    ctx.translate(ox, oy);
    const tom = { h: 140 + R() * 20, s: 28 + R() * 10, l: 17 + R() * 6 };
    const topoX = C * 0.5 + (R() - 0.5) * C * 0.15;
    // eixo principal + 4 a 6 raminhos laterais
    const nLat = 4 + Math.floor(R() * 3);
    for (let k = 0; k < nLat; k++) {
      const t = 0.2 + 0.7 * k / nLat;
      const bx = C * 0.5 + (topoX - C * 0.5) * t, by = C - t * C * 0.88;
      const s = k % 2 === 0 ? 1 : -1;
      const comp = C * (0.32 - t * 0.12) * (0.8 + R() * 0.4);
      const ang = -Math.PI / 2 + s * (0.7 + R() * 0.35);
      raminho(bx, by, bx + Math.cos(ang) * comp, by + Math.sin(ang) * comp, C * 0.006, 60, C * 0.05, tom);
    }
    raminho(C * 0.5, C, topoX, C * 0.08, C * 0.009, 140, C * 0.058, tom);
    ctx.restore();
  }
  return recorte(cv, [30, 50, 40]);
}

// Samambaia: duas frondes lado a lado, cada uma ocupando meia largura.
export function gerarSamambaia() {
  const W = 1024, H = 1024;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const R = rng(404);
  ctx.lineCap = 'round';
  for (let f = 0; f < 2; f++) {
    const ox = f * W / 2, cx = W / 4;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, 0, W / 2, H); ctx.clip();
    ctx.translate(ox, 0);
    const tom = { h: 92 + R() * 16, s: 42 + R() * 12, l: 21 + R() * 6 };
    const nP = 26;
    for (let k = 0; k < nP; k++) {
      const t = 0.06 + 0.92 * k / nP;
      const y = H - t * H;
      const comp = (W / 4) * 0.95 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.75) * 1.02)), 0.9);
      for (const s of [-1, 1]) {
        const ang = s > 0 ? -0.35 - t * 0.3 : Math.PI + 0.35 + t * 0.3;
        // pina: folhinha lobada (pínulas)
        ctx.save();
        ctx.translate(cx, y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const nL = 9, larg = comp * 0.16;
        for (let i = 0; i <= nL; i++) { const u = i / nL; ctx.lineTo(u * comp, -larg * (1 - u * 0.85) * (0.55 + 0.45 * Math.abs(Math.sin(u * Math.PI * nL * 0.5)))); }
        for (let i = nL; i >= 0; i--) { const u = i / nL; ctx.lineTo(u * comp, larg * (1 - u * 0.85) * (0.55 + 0.45 * Math.abs(Math.sin(u * Math.PI * nL * 0.5)))); }
        ctx.closePath();
        ctx.fillStyle = `hsl(${tom.h + (R() - 0.5) * 8} ${tom.s}% ${tom.l + (R() - 0.5) * 5}%)`;
        ctx.fill();
        ctx.strokeStyle = `hsla(${tom.h} ${tom.s}% ${tom.l * 1.6}% / 0.5)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(comp * 0.95, 0); ctx.stroke();
        ctx.restore();
      }
    }
    ctx.strokeStyle = '#4a4a22';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(cx, H); ctx.lineTo(cx, H * 0.02); ctx.stroke();
    ctx.restore();
  }
  return recorte(cv, [50, 70, 30]);
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
    if (tipoR < 0.12) {
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
    } else if (tipoR < 0.42) {
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
