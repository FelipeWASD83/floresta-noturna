import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rng, ruido2, fbm2, celular2 } from '../js/ruido.js';
import { altura, gradeAlturas, MEIO, RES } from '../js/terreno-forma.js';
import { gerarArvore, montarMalha, ESPECIES } from '../js/arvore-forma.js';
import { formaCapim, formaSamambaia, formaPedra, formaTora } from '../js/vegetacao-forma.js';

test('ruído é determinístico e fica entre 0 e 1', () => {
  const a = rng(5), b = rng(5);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
  for (let i = 0; i < 2000; i++) {
    const v = fbm2(i * 0.137, i * 0.071);
    assert.ok(v >= 0 && v < 1, `fbm fora do intervalo: ${v}`);
  }
});

test('ruído periódico emenda na borda (textura sem costura)', () => {
  for (const y of [0.1, 1.7, 3.3]) {
    assert.ok(Math.abs(ruido2(0, y, 3, 8) - ruido2(8, y, 3, 8)) < 1e-12);
    const [a1, a2] = celular2(0.001, y, 3, 8);
    const [b1, b2] = celular2(8.001, y, 3, 8);
    assert.ok(Math.abs(a1 - b1) < 1e-9 && Math.abs(a2 - b2) < 1e-9);
  }
});

test('a altura do chão bate com a grade nos vértices e é contínua', () => {
  const g = gradeAlturas();
  const n = RES + 1;
  for (const [i, j] of [[0, 0], [320, 320], [17, 401], [639, 5]]) {
    assert.ok(Math.abs(altura(-MEIO + i, -MEIO + j) - g[j * n + i]) < 1e-5);
  }
  // sem degrau: dois pontos a 1 cm têm quase a mesma altura
  for (let k = 0; k < 500; k++) {
    const x = (k * 1.37) % 600 - 300, z = (k * 2.11) % 600 - 300;
    assert.ok(Math.abs(altura(x, z) - altura(x + 0.01, z + 0.01)) < 0.02);
  }
  // a clareira do começo é quase plana
  assert.ok(Math.abs(altura(0, 0) - altura(3, 3)) < 0.5);
});

test('toda espécie gera árvore com malha válida nos três níveis de detalhe', () => {
  for (const esp of Object.keys(ESPECIES)) {
    const arv = gerarArvore(esp, 1);
    assert.ok(arv.altura > 2, `${esp}: altura ${arv.altura}`);
    let triAnt = Infinity;
    for (let l = 0; l < 3; l++) {
      const m = montarMalha(arv, l);
      for (const k of ['position', 'normal', 'uv', 'aVento']) {
        for (const v of m.casca[k]) assert.ok(Number.isFinite(v), `${esp} L${l} ${k} com NaN`);
      }
      const nVert = m.casca.position.length / 3;
      for (const i of m.casca.index) assert.ok(i < nVert, `${esp} L${l}: índice fora`);
      const tri = m.casca.index.length / 3 + (m.folhas ? m.folhas.index.length / 3 : 0);
      assert.ok(tri <= triAnt, `${esp}: nível ${l} mais pesado que o anterior`);
      triAnt = tri;
    }
    if (ESPECIES[esp].folhas) assert.ok(arv.cartoes.length > 100, `${esp}: poucas folhas`);
  }
});

test('folha e galho do mesmo ponto recebem o mesmo peso de vento (balançam juntos)', () => {
  const arv = gerarArvore('carvalho', 2);
  const ramos = arv.ramos.filter((r) => r.nivel === 3);
  const fasesGalho = new Set(ramos.map((r) => r.f1));
  const fora = arv.cartoes.filter((c) => !fasesGalho.has(c.f1));
  assert.equal(fora.length, 0, 'cartão com fase de galho que não existe');
});

test('vegetação pequena sai sem NaN', () => {
  for (const f of [formaCapim(1), formaSamambaia(1), formaPedra(1, 2), formaTora(1)]) {
    for (const v of f.position) assert.ok(Number.isFinite(v));
    const nVert = f.position.length / 3;
    for (const i of f.index) assert.ok(i < nVert);
  }
});
