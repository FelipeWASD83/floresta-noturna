// Entrada do jogador: mouse olha (ponteiro preso), WASD anda, Ctrl corre,
// Shift agacha, Espaço pula. O jogo roda em tela cheia com o teclado travado
// (Keyboard Lock): sem isso, Ctrl+W fecharia a aba no meio da corrida.
import { passo, PARAM } from './jogador-fisica.js';
import { altura } from './terreno-forma.js';

export class Jogador {
  constructor(canvas, camera, obstaculos) {
    this.canvas = canvas;
    this.camera = camera;
    this.obst = obstaculos;
    this.yaw = 0;
    this.pitch = 0.08;
    this.teclas = new Set();
    this.estado = { x: 0, y: altura(0, 0), z: 0, vx: 0, vy: 0, vz: 0, noChao: true, olho: PARAM.olhoEmPe, passo: 0 };
    this.pediuPulo = false;
    this.dYaw = 0; this.dPitch = 0;
    this.tremor = 0;
    this.fovBase = 72;
    this.fov = this.fovBase;
    this.aoMudar = () => {};
    this.tecladoTravado = false;

    document.addEventListener('pointerlockchange', () => this.aoMudar(this.ativo));
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) { this.tecladoTravado = false; this.soltar(); }
      this.aoMudar(this.ativo);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.ativo) return;
      const s = 0.0021;
      this.yaw -= e.movementX * s;
      this.pitch -= e.movementY * s;
      this.dYaw += e.movementX * s;
      this.dPitch += e.movementY * s;
      const lim = Math.PI / 2 - 0.02;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    });
    window.addEventListener('keydown', (e) => {
      if (!this.ativo) return;
      // com o teclado travado, Ctrl+W, Ctrl+S, Ctrl+D etc. chegam aqui
      e.preventDefault();
      if (e.code === 'Escape') { this.soltar(); return; }
      if (e.code === 'Space' && !e.repeat) this.pediuPulo = true;
      this.teclas.add(e.code);
    }, { capture: true });
    window.addEventListener('keyup', (e) => { this.teclas.delete(e.code); if (this.ativo) e.preventDefault(); }, { capture: true });
    window.addEventListener('blur', () => this.teclas.clear());
  }

  get ativo() { return document.pointerLockElement === this.canvas; }

  async entrar() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch { /* recusou tela cheia */ }
    try {
      if (navigator.keyboard && navigator.keyboard.lock && document.fullscreenElement) {
        await navigator.keyboard.lock();
        this.tecladoTravado = true;
      }
    } catch { this.tecladoTravado = false; }
    try { await this.canvas.requestPointerLock({ unadjustedMovement: true }); }
    catch { try { await this.canvas.requestPointerLock(); } catch { /* sem ponteiro preso */ } }
    this.aoMudar(this.ativo);
  }

  soltar() {
    this.teclas.clear();
    if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
    if (document.pointerLockElement) document.exitPointerLock();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  perto() {
    const { x, z } = this.estado;
    const lista = [];
    for (const o of this.obst) {
      if (o.tipo === 'circulo') {
        if (Math.abs(o.x - x) < 6 && Math.abs(o.z - z) < 6) lista.push(o);
      } else if (Math.min(o.ax, o.bx) - 6 < x && Math.max(o.ax, o.bx) + 6 > x && Math.min(o.az, o.bz) - 6 < z && Math.max(o.az, o.bz) + 6 > z) {
        lista.push(o);
      }
    }
    return lista;
  }

  atualizar(dt) {
    const k = this.teclas;
    const entrada = {
      frente: (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0),
      lado: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
      correr: k.has('ControlLeft') || k.has('ControlRight'),
      agachar: k.has('ShiftLeft') || k.has('ShiftRight'),
      pular: this.pediuPulo,
      yaw: this.yaw,
    };
    this.pediuPulo = false;
    const perto = this.perto();
    // passos menores que 1/120 s para a colisão não atravessar nada
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    let vel = 0, pousou = 0;
    for (let i = 0; i < n; i++) {
      const r = passo(this.estado, i === 0 ? entrada : { ...entrada, pular: false }, dt / n, altura, perto);
      vel = r.vel; pousou = Math.max(pousou, r.pousou);
    }
    if (pousou) this.tremor = Math.min(0.12, pousou * 0.02);
    this.tremor *= Math.exp(-dt * 9);

    const e = this.estado;
    const andando = vel > 0.4 && e.noChao;
    const correndo = entrada.correr && !entrada.agachar && vel > 3;
    const amp = andando ? (correndo ? 0.045 : 0.022) : 0;
    const bobY = Math.abs(Math.sin(e.passo)) * amp - amp * 0.5;
    const bobX = Math.cos(e.passo) * amp * 0.5;
    const cam = this.camera;
    cam.position.set(e.x, e.y + e.olho + bobY - this.tremor, e.z);
    cam.rotation.set(this.pitch, this.yaw, Math.sin(e.passo) * amp * 0.06, 'YXZ');
    cam.translateX(bobX * 0.3);
    const alvoFov = this.fovBase + (correndo ? 6 : 0) + (entrada.agachar ? -2 : 0);
    this.fov += (alvoFov - this.fov) * (1 - Math.exp(-dt * 5));
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }

    const dados = {
      andando, correndo, agachado: entrada.agachar, passo: e.passo,
      olhar: { dYaw: this.dYaw, dPitch: this.dPitch },
    };
    this.dYaw = 0; this.dPitch = 0;
    return dados;
  }
}
