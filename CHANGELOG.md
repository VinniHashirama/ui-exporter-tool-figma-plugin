# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versionamento semântico.

A versão que importa para a compatibilidade entre os dois lados não é esta, e sim o
`schemaVersion` do contrato (`schema/uiir.schema.json`), hoje **2.0.0**. O importador da Unity
recusa pacote de major diferente do que ele suporta.

## [Não publicado]

Autoria de componente no Figma. O designer monta o botão e a Unity gera o prefab com a arte
dele, em vez de uma caixa cinza. Nesta leva também a UI do plugin foi reorganizada: criar e
exportar viraram dois modos separados, em vez de uma fileira só de abas misturando os dois.

### Adicionado

- **Criar tela**: cria um frame `screen/Nome` avulso na página atual, sem passar pelo "criar
  kit inteiro" — tela não é componente neste fluxo, e o antigo único caminho era duplicar o
  template `screen/Exemplo` da página `UI Kit`.
- **Aba Cores**: paleta do kit editável, com a verdade nos Paint Styles `color/<chave>` do
  arquivo em vez de constante do código. Editar uma cor aqui reflete sozinho em qualquer
  componente já vinculado ao estilo — Paint Style propaga por conta própria. Dá para recolorir
  as 8 cores centrais e adicionar/remover cores próprias; as centrais só recolorem, não somem.
- **Exportar kit completo** (`.uikit`): empacota todo componente de primeiro nível da página
  atual num zip só, com `kit.json` na raiz listando cada um e seus `skipped[]`. Complementa
  o `.uicomponent` avulso — este é para sincronizar o kit inteiro de uma vez do lado da Unity.
- **Export de componente** para pacote `.uicomponent` (`component.json` + PNGs), `schemaVersion`
  **2.0.0**. Carrega nome canônico, papel, slots e a variante de origem.
- **Criar componente avulso** na aba Criar kit, com um botão por componente do catálogo, além
  do "criar tudo".
- **Componente próprio** (nome + papel) para o que não está no kit; nasce com as layers de
  slot já nomeadas.
- Convenção `$nome` para declarar slot, e `#9s(t,r,b,l)` para bordas de 9-slice explícitas.
- `asset.nineSlice` passou a ser preenchido: pela anotação em qualquer export, e derivado do
  raio dos cantos no export de componente. Sempre limitado para caber no sprite.
- Lint de dimensão de textura: `asset-not-multiple-of-4` e `asset-oversized`.
- Sample de componente (`samples/Button_Primary.uicomponent`), reproduzível byte a byte.

### Alterado

- **Renomeadas as extensões e entradas JSON dos pacotes**, porque os nomes antigos tinham o
  "kit" no lugar errado: `.uiexport` (tela) virou `.uiscreen`; `.uikit` (componente avulso)
  virou `.uicomponent`; `.uikitset` (lote de componentes da página) virou `.uikit` — agora o
  nome "kit" cai onde sempre devia estar, no pacote que representa o kit inteiro. Junto, as
  entradas JSON dentro do zip: `ui.json` → `screen.json`, `kit.json` (componente avulso e cada
  entrada `components/<slug>/...` do lote) → `component.json`, e `kitset.json` (manifesto do
  lote) → `kit.json`, que ficou livre com a mudança anterior. No contrato
  (`schema/uiir.schema.json`), o bloco `kit` do pacote de componente virou `component`. Campo
  renomeado é MAJOR pela regra do contrato: `schemaVersion` foi de **1.1.0** para **2.0.0**. Um
  importador da geração anterior não abre mais estes pacotes.

- **Abas viraram dois modos.** Criar e exportar são tarefas diferentes, e misturadas numa
  fileira só de abas uma bagunçava a outra. Agora tem uma fileira de modo (**Criação** /
  **Exportação**) e, dentro de cada um, a fileira de aba de sempre: Criação = Tela, Componentes,
  Cores; Exportação = Tela, Componente, Kit completo. Escolher um modo volta pra aba onde o
  designer parou nele.
- Aba **Criar kit** virou **Componentes**, dentro do modo Criação: o botão "Criar kit nesta
  página" saiu do rodapé, perdeu o destaque `.primary` e foi para um `<details>` recolhido
  ("Avançado: criar kit completo") no fim do painel. O uso real é ir componente por componente —
  o botão de criação individual continua igual, e é ele que fica em destaque agora.
- **Criar tela** e **Exportar kit completo** ganharam aba própria (Criação > Tela e Exportação >
  Kit completo, respectivamente) em vez de morarem dentro do painel de outra coisa.
- Dentro de **Criação > Componentes**, **Componente próprio** subiu para o topo do painel — é o
  caminho mais usado — e **Componentes do kit** (a lista do catálogo, um "Criar" por item) virou
  um `<details>` recolhido, junto do "Avançado: criar kit completo".
- **Paleta com seletor de cor nativo**: cada linha da aba Cores, e o formulário de cor nova, têm
  um `input[type=color]` de verdade ao lado do campo de hex — clique abre o seletor do sistema, e
  os dois campos ficam sincronizados nos dois sentidos. Salvar continua exigindo o botão
  explícito; escolher a cor só atualiza o preview.
- `ensureColorStyles` (`kit-builder.ts`) parou de sobrescrever `color/<chave>` a partir de uma
  constante a cada build; agora lê a paleta de verdade (`palette.ts`) e só cria o que falta —
  o que o designer editou na aba Cores fica de pé.

### Corrigido

- `applyFillStyle` e `applyTextStyle` engoliam a falha em silêncio, e o kit saía sem vínculo
  de token sem ninguém saber. Agora entram na lista de avisos explicando o efeito.
- A lista de componentes da UI era um `<ul>` escrito à mão que podia divergir do que o botão
  realmente cria. Agora é derivada do mesmo catálogo, com teste cobrando.
- **Esconder a fileira de sub-abas errada não funcionava.** `.tabs` fixa `display: flex`, e essa
  regra de autor empata em especificidade com o `display: none` padrão do atributo `hidden` do
  navegador — e regra de autor sempre ganha da regra padrão. As duas fileiras de sub-aba
  (Criação/Exportação) ficavam empilhadas visíveis ao trocar de modo. Adicionado `.tabs[hidden]`.
- **Formulário de cor nova estourava a linha.** `.custom-form input { width: 100% }` alcança
  qualquer input dentro do form, inclusive o `input[type=color]` novo — o quadrado de cor
  esticava para a largura da fileira toda, empurrando o campo de hex para fora e abrindo rolagem
  horizontal. Corrigido dando a cada campo da fileira (cor, nome, hex) uma regra própria e mais
  específica dizendo o que é fixo e o que cresce.

### Decisões

- **Potência de 2 não gera aviso.** Quase todo sprite de UI é NPOT e isso não é problema em
  UGUI; o que quebra compressão é não ser múltiplo de 4. Avisar em cada asset encheria o
  relatório de ruído e mataria a meta de exportar com zero avisos.
- **9-slice não é derivado em tela.** Ali `#img` marca ilustração, que fatiada sairia
  deformada. Num componente, `#img` é a pele do botão — o caso em que a borda importa.
- **`.uikit` não tem teste com Figma real.** `hexToRgb`/`rgbToHex` e a montagem do
  `kit.json` (`kit-batch.ts`) são puros e têm teste; `loadPalette`/`upsertPaletteColor` e o
  laço de `exportKitBatch` sobre `figma.currentPage` dependem de Paint Style e de
  `buildComponent` de verdade, caros demais para simular em `figma-mock.ts` — cobertos por QA
  manual no Figma.

## [0.1.0] — 2026-08-19

Primeira versão publicada. Export validado manualmente no Figma real.

### Adicionado

- Export de tela para pacote `.uiexport` (UIIR + PNGs, nome de pacote da época — hoje
  `.uiscreen`), com `schemaVersion` 1.0.0.
- Linter com 19 regras; erro bloqueia o export, aviso passa e reaparece no import.
- Aba **Criar kit**: gera 14 componentes canônicos, estilos de cor e texto, e o frame
  `screen/Exemplo`. Idempotente. **Ainda não validado manualmente.**
- Convenções de nome: `_ignorar`, `@bind`, `#img`, `:loc.chave`.
- Auto Layout, constraints, texto, fills sólidos e cantos arredondados no IR.
- `dist/` commitado sem minificar, para o designer não precisar de Node.

### Limitações conhecidas

- Gradiente vira cor chapada do primeiro stop, com aviso; use `#img` para fidelidade.
- Sombra, blur e blend mode não são reconstruídos.
- Texto com formatação mista usa a do primeiro trecho.
- Ordem do array `fills` assume último elemento no topo — marcado no código para revisão.
