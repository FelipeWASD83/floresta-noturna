# AGENTS.md: floresta-noturna

As regras deste projeto estão em **`CLAUDE.md`**, nesta mesma pasta. Ler antes de mexer.

Resumo do que não pode ser esquecido:

- Controles fechados por ele: WASD, Ctrl corre, Espaço pula, Shift agacha. Ctrl só funciona porque o jogo entra em tela cheia com Keyboard Lock; não tirar isso.
- Na sombra ortográfica, `isPerspectiveCamera` é `undefined`: comparar com `=== true` (`js/populacao.js`).
- Pré-passada de profundidade nas folhas já foi testada e ficou mais lenta.
- Não baixar resolução nem multisample sem ele pedir. Medido: ~32 qps em 3440 × 1440.
- Não abre por `file://`: usar `abrir.bat` ou o preview na porta 4352. Teste: `node --test "testes/*.test.js"`.
