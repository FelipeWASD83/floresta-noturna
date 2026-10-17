# CLAUDE.md: floresta-noturna

Jogo de andar numa floresta à noite, em primeira pessoa, com uma tocha na mão. É só para ver os gráficos: sem objetivo, sem inimigo, sem som. Pessoal, sem deploy, roda só no PC dele (RTX 3060, ultrawide 3440 × 1440). Regras gerais da pasta valem; aqui só o que é deste projeto. Criado em 16/10/2026.

## Como rodar
`abrir.bat` (porta 4352) ou o preview `floresta-noturna`. Não abre por `file://` (módulos ES). `?qps` mostra o contador de quadros.

Controles (pedido dele): WASD anda, **Ctrl corre**, Espaço pula, **Shift agacha**, Esc sai. O jogo entra em tela cheia e trava o teclado (Keyboard Lock) ao clicar em "Entrar na mata": sem isso, Ctrl+W (correr para a frente) fecharia a aba. Se o navegador recusar a trava, aparece um aviso no topo.

Teste: `node --test "testes/*.test.js"` (ruído, terreno, forma das árvores, física do jogador).

## Arquivos
- `js/principal.js`: gera tudo com barra de progresso (~5 s), luzes, laço de desenho. Expõe `window.__floresta` para depurar.
- `js/ruido.js`, `js/terreno-forma.js`, `js/arvore-forma.js`, `js/vegetacao-forma.js`, `js/jogador-fisica.js`: JS puro, sem three.js, testáveis no Node.
- `js/arvore-forma.js`: árvores crescidas por recursão (5 espécies: carvalho, faia, abeto, muda, árvore morta; 9 modelos). Tronco com sapata e raízes de apoio, galhos em até 4 níveis, cachos de folha em cartões dobrados. Cada vértice leva os pesos de vento do galho dele (`aVento`, `aDobra`, `aFolha`), então folha e galho balançam juntos. Três níveis de detalhe.
- `js/texturas.js`: todas as texturas são geradas na hora (cascas, atlas de folhas, agulhas, samambaia, serapilheira, ruído grande, ruído 3D da névoa). Nenhuma imagem baixada.
- `js/materiais.js`: remendos de shader do three (vento, musgo, translucidez da folha contra a tocha e a lua, chão que varia em escala grande). Os materiais de sombra recebem o mesmo vento.
- `js/populacao.js`: instâncias por distância. Cada parte tem a malha visível (só o que está na frente) e malhas só de sombra, uma da lua e outra da tocha, cada uma com o próprio nível de detalhe.
- `js/floresta.js`: terreno, onde nasce cada coisa, lista de obstáculos.
- `js/ceu.js`: céu, estrelas, Via Láctea, nuvens finas, lua cheia.
- `js/tocha.js`: modelo preso à câmera, chama em shader, fagulhas, fumaça, luz que tremula e projeta sombra.
- `js/pos.js`: névoa volumétrica (os god rays: marcha pelo raio lendo o mapa de sombra da lua), borrão que respeita profundidade, bloom, ACES, visão noturna, vinheta e grão.
- `capturas/`: prints em 3440 × 1440 para o README.

## Decisões que não se desfazem sem motivo
- Três.js r185 em `vendor/` (cópia do `campo-aberto`).
- Os raios de lua vêm do mapa de sombra da lua, não de borrão radial na tela: aparecem para qualquer lado que ele olhe, não só com a lua na tela.
- A névoa mora embaixo das copas (cai rápido acima de 5 m do chão). Névoa alta iluminada pela lua lava a imagem e apaga os feixes.
- Sombra da lua: detalhe cheio até 26 m, modelo leve até 95 m. Sombra da tocha: só troncos (folha alta não faz sombra que se veja), menos nas mudas.
- Folhas em Lambert (sem especular). Uma pré-passada de profundidade para as folhas foi testada e ficou **mais lenta**: não tentar de novo.
- Multisample 4x com alpha-to-coverage nas folhas.

## Armadilhas
- `camera.isPerspectiveCamera` vem `undefined` (não `false`) na câmera ortográfica da sombra da lua. Comparar com `=== true`, senão as árvores somem do mapa de sombra e os raios viram névoa lisa (foi o bug do primeiro dia).
- O mipmap come o alfa das folhas, no desenho e no mapa de sombra: o `ALFA_MIP` de `materiais.js` compensa nos dois. Tirar de um deles faz a copa ficar rala de longe ou deixar a luz passar.
- O empurrão da colisão não pode virar velocidade (`jogador-fisica.js`): sem o limite, encostar num tronco atirava ele a 30 m/s. Há teste.
- O painel do navegador do app, mesmo escondido, continua rodando a página e disputa a GPU (pegava 69% da placa). Para medir qps, deixar a aba do painel em outra página. Medição no chrome-devtools com a janela emulada em 3440 × 1440.
- Remendos de shader escritos por script Python com `\n` dentro de string viraram quebra de linha de verdade e quebraram o JS duas vezes. Conferir com `node --check js/*.js`.

## Desempenho medido (16/10/2026, RTX 3060 dele, Chrome)
- 3440 × 1440: **~31 a 33 qps**. 1720 × 720: ~53 qps.
- Custo em 3440 × 1440: árvores ~18 ms (folhas em camadas), multisample 4x ~6 ms, névoa ~4 ms, sombra da lua ~4 ms, sombra da tocha ~1 ms. CPU ~2 ms por quadro.
- Não baixei resolução nem multisample (regra da pasta: só com ele mandando).
