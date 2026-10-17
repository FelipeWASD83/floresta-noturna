# CLAUDE.md: floresta-noturna

Jogo de andar numa floresta à noite, em primeira pessoa, com uma tocha na mão. É só para ver os gráficos: sem objetivo, sem inimigo, sem som. **Direção dele (16/10/2026, depois de testar a 1.0.0): joguinho bonito e leve, não simulação.** Só pinheiros; folhagem, grama e plantas em cartão com textura (não lâmina nem folha 3D). Não voltar ao realismo pesado sem ele pedir. Pessoal, sem deploy, **repositório público (MIT)** desde a criação, por escolha dele; roda só no PC dele (RTX 3060, ultrawide 3440 × 1440). Regras gerais da pasta valem; aqui só o que é deste projeto. Criado em 16/10/2026.

## Como rodar
`abrir.bat` (porta 4352) ou o preview `floresta-noturna`. Não abre por `file://` (módulos ES). `?qps` mostra o contador de quadros.

Controles (pedido dele): WASD anda, **Ctrl corre**, Espaço pula, **Shift agacha**, Esc sai. O jogo entra em tela cheia e trava o teclado (Keyboard Lock) ao clicar em "Entrar na mata": sem isso, Ctrl+W (correr para a frente) fecharia a aba. Se o navegador recusar a trava, aparece um aviso no topo.

Teste: `node --test "testes/*.test.js"` (ruído, terreno, forma das árvores, física do jogador).

## Arquivos
- `js/principal.js`: gera tudo com barra de progresso (~2 s), luzes, laço de desenho. Expõe `window.__floresta` para depurar.
- `js/ruido.js`, `js/terreno-forma.js`, `js/arvore-forma.js`, `js/vegetacao-forma.js`, `js/jogador-fisica.js`: JS puro, sem three.js, testáveis no Node.
- `js/arvore-forma.js`: pinheiros crescidos por recursão (espécies `pinheiro` e `pinheirinho`; 5 modelos). Tronco com sapata, galhos em verticilos e a folhagem em ~190 placas de agulha por árvore (modo `placa`: segue o galho, girada em volta dele), mais placas em pé na ponta. Cada vértice leva os pesos de vento do galho dele (`aVento`, `aDobra`, `aFolha`). Dois níveis de detalhe geométricos.
- `js/floresta.js`: além de espalhar tudo, tira a "foto" de cada pinheiro ao carregar (`cartaoDeLonge`) e usa dois planos cruzados com ela como terceiro nível de detalhe.
- `js/vegetacao-forma.js`: grama e samambaia são 3 planos cruzados com textura (`formaCruzada`); pedras e troncos caídos continuam em 3D.
- `js/texturas.js`: todas as texturas são geradas na hora em canvas (cascas, placas de agulha, touceira de grama, samambaia inteira, serapilheira, ruído grande, ruído 3D da névoa). Para a placa de vídeo é o mesmo que PNG; nenhuma imagem baixada.
- `js/materiais.js`: remendos de shader do three (vento, musgo, translucidez da folha contra a tocha e a lua, chão que varia em escala grande). Os materiais de sombra recebem o mesmo vento.
- `js/populacao.js`: instâncias por distância. Cada parte tem a malha visível (só o que está na frente) e malhas só de sombra, uma da lua e outra da tocha, cada uma com o próprio nível de detalhe.
- `js/ceu.js`: céu, estrelas, Via Láctea, nuvens finas, lua cheia.
- `js/tocha.js`: modelo preso à câmera, chama em shader, fagulhas, fumaça, luz que tremula e projeta sombra.
- `js/pos.js`: névoa volumétrica (os god rays: marcha pelo raio lendo o mapa de sombra da lua), borrão que respeita profundidade, bloom, ACES, visão noturna, vinheta e grão.
- `capturas/`: prints em 3440 × 1440 para o README.

## Decisões que não se desfazem sem motivo
- Três.js r185 em `vendor/` (cópia do `campo-aberto`).
- Os raios de lua vêm do mapa de sombra da lua, não de borrão radial na tela: aparecem para qualquer lado que ele olhe, não só com a lua na tela.
- A névoa mora embaixo das copas (cai rápido acima de 5 m do chão). Névoa alta iluminada pela lua lava a imagem e apaga os feixes.
- Sombra da lua: mapa de 2048 num quadrado de 184 m que segue o jogador, refeito a cada quadro (detalhe cheio até 26 m, leve até 95 m). Sombra da tocha: 512 por face, só troncos, menos nos pinheirinhos.
- **Sombra da lua fixa (o mundo todo num mapa desenhado uma vez só) foi testada a pedido dele e ficou mais lenta**: 39 contra 49 qps em 3440 × 1440, igual em 8192, 4096 ou 2048 e mesmo limitando a névoa a 95 m. O desenho some, mas todo pixel até o horizonte passa a consultar o mapa com filtro. Não refazer sem motivo novo.
- Folhas em Lambert (sem especular). Uma pré-passada de profundidade para as folhas foi testada e ficou **mais lenta**: não tentar de novo.
- Multisample 4x com alpha-to-coverage nas folhas.

## Armadilhas
- `camera.isPerspectiveCamera` vem `undefined` (não `false`) na câmera ortográfica da sombra da lua. Comparar com `=== true`, senão as árvores somem do mapa de sombra e os raios viram névoa lisa (foi o bug do primeiro dia).
- O mipmap come o alfa das folhas, no desenho e no mapa de sombra: o `ALFA_MIP` de `materiais.js` compensa nos dois. Tirar de um deles faz a copa ficar rala de longe ou deixar a luz passar.
- O empurrão da colisão não pode virar velocidade (`jogador-fisica.js`): sem o limite, encostar num tronco atirava ele a 30 m/s. Há teste.
- O painel do navegador do app, mesmo escondido, continua rodando a página e disputa a GPU (pegava 69% da placa). Para medir qps, deixar a aba do painel em outra página. Medição no chrome-devtools com a janela emulada em 3440 × 1440.
- Remendos de shader escritos por script Python com `\n` dentro de string viraram quebra de linha de verdade e quebraram o JS duas vezes. Conferir com `node --check js/*.js`.

## Desempenho medido (16/10/2026, RTX 3060 dele, Chrome, 3440 × 1440)
- 1.0.0 (realista: carvalho, faia, folhas em cacho): ~32 qps.
- 1.1.0 (pinhal em placas, grama em cartão): ~49 a 52 qps. Pinheiros na tela custam pouco (0,3 milhão de triângulos); o que sobra é sombra da tocha, névoa, multisample 4x e o custo fixo da resolução. Sem nenhuma árvore: ~70 a 80 qps.
- A medição oscila com o que mais usa a placa (Wallpaper Engine, o próprio app do Claude): comparar sempre A/B no mesmo minuto.
- Não baixei resolução nem multisample (regra da pasta: só com ele mandando).
