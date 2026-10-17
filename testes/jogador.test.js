import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passo, PARAM, resolverColisao, alturaDoChao } from '../js/jogador-fisica.js';

const plano = () => 0;
const novo = () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, noChao: true, olho: PARAM.olhoEmPe, passo: 0 });
const entrada = (e = {}) => ({ frente: 0, lado: 0, correr: false, agachar: false, pular: false, yaw: 0, ...e });
const rodar = (est, ent, seg, obst = []) => { for (let i = 0; i < seg * 120; i++) passo(est, ent, 1 / 120, plano, obst); };

test('W anda para frente (-z) na velocidade de andar; Ctrl corre; Shift agacha', () => {
  const a = novo(); rodar(a, entrada({ frente: 1 }), 2);
  assert.ok(a.z < -3.5 && Math.abs(a.x) < 1e-6);
  const c = novo(); rodar(c, entrada({ frente: 1, correr: true }), 2);
  assert.ok(-c.z > -a.z * 2, 'correr não é bem mais rápido');
  const g = novo(); rodar(g, entrada({ frente: 1, agachar: true }), 2);
  assert.ok(-g.z < -a.z * 0.6, 'agachado não é mais lento');
  assert.ok(Math.abs(g.olho - PARAM.olhoAgachado) < 0.02, 'olho não baixou');
});

test('A e D andam de lado, e o yaw gira o movimento', () => {
  const d = novo(); rodar(d, entrada({ lado: 1 }), 1);
  assert.ok(d.x > 1.5 && Math.abs(d.z) < 1e-6);
  const v = novo(); rodar(v, entrada({ frente: 1, yaw: Math.PI / 2 }), 1);
  assert.ok(v.x < -1.5, 'olhando para a esquerda, W vai para -x');
});

test('pulo sobe uns 60 cm e volta ao chão; agachado não pula', () => {
  const e = novo();
  passo(e, entrada({ pular: true }), 1 / 120, plano, []);
  let pico = 0;
  for (let i = 0; i < 240; i++) { passo(e, entrada(), 1 / 120, plano, []); pico = Math.max(pico, e.y); }
  assert.ok(pico > 0.5 && pico < 0.8, `pico ${pico}`);
  assert.ok(e.noChao && e.y === 0);
  const g = novo();
  passo(g, entrada({ pular: true, agachar: true }), 1 / 120, plano, []);
  assert.equal(g.vy <= 0, true);
});

test('tronco segura o jogador e o empurrão não vira velocidade (não sai disparado)', () => {
  const tronco = { tipo: 'circulo', x: 0, z: -3, r: 0.4, topo: Infinity };
  const e = novo();
  let vmax = 0;
  for (let i = 0; i < 4 * 120; i++) {
    passo(e, entrada({ frente: 1, lado: 0.15 }), 1 / 120, plano, [tronco]);
    vmax = Math.max(vmax, Math.hypot(e.vx, e.vz));
  }
  assert.ok(vmax <= PARAM.andar + 1e-6, `velocidade disparou: ${vmax}`);
  // contornou ou parou encostado, nunca atravessou por dentro
  assert.ok(Math.hypot(e.x - tronco.x, e.z - tronco.z) >= tronco.r + PARAM.raio - 1e-6);
});

test('tronco caído baixo dá para subir; pedra alta só pulando', () => {
  const tora = { tipo: 'segmento', ax: -3, az: -2, bx: 3, bz: -2, ya: 0.1, yb: 0.1, r: 0.3, raio: 0.25 };
  assert.ok(Math.abs(alturaDoChao(0, -2, plano, [tora]) - 0.35) < 1e-6);
  const e = novo(); rodar(e, entrada({ frente: 1 }), 3, [tora]);
  assert.ok(e.z < -3, 'não passou pela tora baixa');
  const pedra = { tipo: 'circulo', x: 0, z: -2, r: 0.8, topo: 1.2 };
  const [x, z] = resolverColisao(0, -1.6, 0, [pedra]);
  assert.ok(Math.hypot(x - 0, z + 2) >= 0.8 + PARAM.raio - 1e-6, 'atravessou a pedra alta');
});
