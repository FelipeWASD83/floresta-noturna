// Física do jogador em JS puro: andar, correr, agachar, pular, gravidade,
// colisão com troncos (círculos), pedras e troncos caídos (dá para subir em
// cima se for baixo, ou pular por cima).

export const PARAM = {
  andar: 2.3, correr: 5.4, agachado: 1.15,
  aceleracao: 14, freioAr: 2.5,
  gravidade: 9.81, pulo: 3.6,
  olhoEmPe: 1.66, olhoAgachado: 0.98,
  raio: 0.32, degrau: 0.42,
};

function sobreObstaculo(o, x, z) {
  // altura do topo do obstáculo sob (x, z), ou -Infinity se não estiver em cima
  if (o.tipo === 'circulo') {
    if (o.topo === Infinity) return -Infinity;
    const d = Math.hypot(x - o.x, z - o.z);
    if (d > o.r) return -Infinity;
    return o.topo - (d / o.r) * (d / o.r) * 0.25;
  }
  const t = projetar(o, x, z);
  if (t.d > o.raio) return -Infinity;
  const cy = o.ya + (o.yb - o.ya) * t.t;
  return cy + Math.sqrt(Math.max(0, o.raio * o.raio - t.d * t.d));
}

function projetar(o, x, z) {
  const vx = o.bx - o.ax, vz = o.bz - o.az;
  const l2 = vx * vx + vz * vz;
  let t = ((x - o.ax) * vx + (z - o.az) * vz) / l2;
  t = Math.max(0, Math.min(1, t));
  const px = o.ax + vx * t, pz = o.az + vz * t;
  return { t, px, pz, d: Math.hypot(x - px, z - pz) };
}

export function topoDoObstaculo(o, t) {
  if (o.tipo === 'circulo') return o.topo;
  return o.ya + (o.yb - o.ya) * t + o.raio;
}

// Empurra (x, z) para fora dos obstáculos mais altos que o degrau.
// pe: altura dos pés agora. Devolve [x, z].
export function resolverColisao(x, z, pe, obstaculos, raio = PARAM.raio, degrau = PARAM.degrau) {
  for (let iter = 0; iter < 3; iter++) {
    let mexeu = false;
    for (const o of obstaculos) {
      if (o.tipo === 'circulo') {
        if (o.topo !== Infinity && pe + degrau >= o.topo) continue;
        const dx = x - o.x, dz = z - o.z;
        const d = Math.hypot(dx, dz);
        const min = o.r + raio;
        if (d < min) {
          const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
          x = o.x + nx * min; z = o.z + nz * min; mexeu = true;
        }
      } else {
        const pr = projetar(o, x, z);
        if (pe + degrau >= topoDoObstaculo(o, pr.t)) continue;
        const min = o.r + raio;
        if (pr.d < min) {
          const nx = pr.d > 1e-6 ? (x - pr.px) / pr.d : 1, nz = pr.d > 1e-6 ? (z - pr.pz) / pr.d : 0;
          x = pr.px + nx * min; z = pr.pz + nz * min; mexeu = true;
        }
      }
    }
    if (!mexeu) break;
  }
  return [x, z];
}

export function alturaDoChao(x, z, alturaTerreno, obstaculos) {
  let h = alturaTerreno(x, z);
  for (const o of obstaculos) {
    const t = sobreObstaculo(o, x, z);
    if (t > h) h = t;
  }
  return h;
}

// estado: { x, y (pés), z, vx, vy, vz, noChao, olho, passo }
// entrada: { frente, lado (-1..1), correr, agachar, pular, yaw }
export function passo(estado, entrada, dt, alturaTerreno, perto, limite = 300) {
  const P = PARAM;
  const agachado = entrada.agachar;
  const vmax = agachado ? P.agachado : entrada.correr ? P.correr : P.andar;
  let fx = entrada.lado, fz = -entrada.frente;
  const l = Math.hypot(fx, fz);
  if (l > 1) { fx /= l; fz /= l; }
  const s = Math.sin(entrada.yaw), c = Math.cos(entrada.yaw);
  const alvoX = (fx * c + fz * s) * vmax;
  const alvoZ = (-fx * s + fz * c) * vmax;
  const ac = estado.noChao ? P.aceleracao : P.freioAr;
  const k = 1 - Math.exp(-ac * dt);
  estado.vx += (alvoX - estado.vx) * k;
  estado.vz += (alvoZ - estado.vz) * k;

  let nx = estado.x + estado.vx * dt, nz = estado.z + estado.vz * dt;
  [nx, nz] = resolverColisao(nx, nz, estado.y, perto);
  nx = Math.max(-limite, Math.min(limite, nx));
  nz = Math.max(-limite, Math.min(limite, nz));
  // a velocidade passa a ser o que ele andou de fato (desliza no tronco), mas
  // o empurrão da colisão nunca pode virar velocidade maior que a de antes
  const vAntes = Math.hypot(estado.vx, estado.vz);
  let vx = (nx - estado.x) / dt, vz = (nz - estado.z) / dt;
  const vDepois = Math.hypot(vx, vz);
  if (vDepois > vAntes && vDepois > 1e-9) { vx *= vAntes / vDepois; vz *= vAntes / vDepois; }
  estado.vx = vx; estado.vz = vz;
  estado.x = nx; estado.z = nz;

  const chao = alturaDoChao(nx, nz, alturaTerreno, perto);
  if (entrada.pular && estado.noChao && !agachado) { estado.vy = P.pulo; estado.noChao = false; }
  estado.vy -= P.gravidade * dt;
  estado.y += estado.vy * dt;
  let pousou = 0;
  if (estado.y <= chao) {
    if (!estado.noChao && estado.vy < -2) pousou = -estado.vy;
    estado.y = chao; estado.vy = 0; estado.noChao = true;
  } else if (estado.y - chao > 0.06 || estado.vy > 0) {
    // degrau para baixo pequeno: cola no chão; maior: cai
    if (estado.noChao && estado.y - chao < P.degrau && estado.vy <= 0) { estado.y = chao; estado.vy = 0; }
    else estado.noChao = false;
  }
  const alvoOlho = agachado ? P.olhoAgachado : P.olhoEmPe;
  estado.olho += (alvoOlho - estado.olho) * (1 - Math.exp(-10 * dt));
  const vel = Math.hypot(estado.vx, estado.vz);
  if (estado.noChao) estado.passo += vel * dt * (entrada.correr && !agachado ? 2.2 : 2.6);
  return { vel, pousou };
}
