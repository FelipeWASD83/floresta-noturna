# AGENTS.md: floresta-noturna

As regras deste projeto estão em **`CLAUDE.md`**, nesta mesma pasta. Ler antes de mexer.

Resumo do que não pode ser esquecido:

- Controles fechados por ele: WASD, Ctrl corre, Espaço pula, Shift agacha. Ctrl só funciona porque o jogo entra em tela cheia com Keyboard Lock; não tirar isso.
- Na sombra ortográfica, `isPerspectiveCamera` é `undefined`: comparar com `=== true` (`js/populacao.js`).
- Direção dele: joguinho bonito e leve, não simulação. Só pinheiros; folhagem, grama e plantas em cartão com textura.
- Já testados e mais lentos: pré-passada de profundidade nas folhas e sombra da lua fixa do mundo inteiro.
- Não baixar resolução nem multisample sem ele pedir. Medido: ~50 qps em 3440 × 1440 (versão 1.1.0).
- Não abre por `file://`: usar `abrir.bat` ou o preview na porta 4352. Teste: `node --test "testes/*.test.js"`.
