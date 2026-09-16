# Arvore UI Exporter — plugin do Figma

Exporta uma tela montada no Figma para um pacote `.uiscreen`, que o
[pacote da Unity](https://github.com/VinniHashirama/ui-exporter-tool-unity-package) importa e
transforma em interface UGUI pronta.

Também cria a biblioteca de componentes canônicos dentro do Figma, com um botão.

> Ferramenta interna da Arvore. Documentação completa e roadmap em
> [ui-exporter-tool-docs-and-samples](https://github.com/VinniHashirama/ui-exporter-tool-docs-and-samples).

---

## 1. Instalar no Figma

**Você não precisa de Node, terminal, nem conta paga.** O plugin já vem buildado no
repositório.

1. Baixe o código: botão verde **`Code`** → **`Download ZIP`** → descompacte numa pasta que você
   vá manter. Se mover a pasta depois, o Figma perde o plugin e você reimporta.
   Com git: `git clone https://github.com/VinniHashirama/ui-exporter-tool-figma-plugin.git`
2. Abra o **app desktop do Figma** — não o navegador. O porquê está abaixo.
3. Menu **`Plugins`** → **`Development`** → **`Import plugin from manifest…`**
4. Selecione o arquivo **`manifest.json`** da pasta que você descompactou.

Pronto. O plugin aparece em `Plugins` → `Development` → **Arvore UI Exporter**.

### Os dois modos do plugin

O plugin abre com uma fileira de **modo** no topo, e dentro de cada um a fileira de aba de
sempre:

| Modo | Abas | Para quê |
|---|---|---|
| **Criação** | Tela, Componentes, Cores | Gerar coisas dentro do arquivo do Figma |
| **Exportação** | Tela, Componente, Kit completo | Empacotar o que já existe para a Unity |

Escolher um modo volta para a aba onde você parou nele da última vez. Selecionar uma tela ou um
componente no canvas pula sozinho para a aba certa dentro de **Exportação** — até você clicar
numa aba na mão, aí o plugin para de trocar por conta própria.

### Por que o app desktop e não o Figma Web

Para carregar um plugin em desenvolvimento, o Figma precisa ler arquivos do seu disco, e o
navegador não permite isso. É restrição de sandbox do navegador, **não** limitação de plano — sua
conta gratuita funciona igual.

O arquivo continua o mesmo na nuvem: você pode desenhar no Web e abrir o desktop só na hora de
exportar, se preferir.

---

## 2. Criar os componentes básicos

Antes de montar telas, gere a biblioteca canônica. Abra o plugin no modo **Criação** → aba
**Componentes**.

O normal é ir **componente por componente**: dentro de "Componentes do kit" (recolhido, clique
para abrir) tem um botão **Criar** por item do catálogo — cria só aquele, com os mesmos estilos
de cor e texto garantidos, sem mexer no que já existe na página.

Precisa do kit inteiro de uma vez — por exemplo, começando um arquivo do zero? Abra "Avançado:
criar kit completo" e clique em **`Criar kit nesta página`**. Isso cria tudo de uma vez:

| O que | Detalhe |
|---|---|
| **14 componentes** | `Panel`, `Window/Modal`, `ScrollView`, `Button/Primary`, `Button/Secondary`, `Button/Icon`, `Toggle/Checkbox`, `Slider`, `InputField`, `Label`, `Icon`, `Image`, `ProgressBar`, `Tabs` |
| **Variantes de estado** | Nos três botões: `Default`, `Hover`, `Pressed`, `Disabled` |
| **Propriedades de componente** | `label`, `iconLeft`, `iconRight`, `title`, já ligadas aos elementos certos |
| **Estilos de cor e texto** | `color/primary`, `text/h1`… — usar eles é o que evita avisos no export |
| **`screen/Exemplo`** | Frame de 1080×1920 com `SafeArea`, para duplicar e renomear |

Rodar de novo é seguro: componente que já existe na página não é tocado.

**Use esses componentes em vez de montar botão com retângulo mais texto.** Uma instância de
`Button/Primary` vira, na Unity, o botão real do jogo — com som de clique, animação de press e
navegação por gamepad já funcionando. Um retângulo vira um retângulo.

Os nomes são exatamente os que o importador da Unity procura, e existe teste garantindo que as
duas listas não divergem.

Não está no catálogo? Na mesma aba, **Componente próprio** (no topo do painel) cria um a partir
de nome + papel (botão, toggle, container, exibição, ícone, imagem) — nasce com as layers de
slot já nomeadas, prontas para o importador escrever conteúdo nelas.

### Criar uma tela

Não precisa passar pelo kit para começar uma tela. Modo **Criação** → aba **Tela**: dê um nome e
clique em **`Criar tela`**. Sai um frame comum `screen/Nome` na página atual, pronto para montar
— tela não é componente neste fluxo, é só a convenção de nome que o exportador reconhece.

### Editar a paleta

Modo **Criação** → aba **Cores**. As 8 cores centrais do kit (fundo, superfície, primária…) e
qualquer cor própria que você adicionar vivem como Paint Styles `color/<chave>` no arquivo —
clique no quadrado para abrir o seletor de cor do sistema, ou digite o hex direto, e clique em
**Salvar**. Qualquer componente já vinculado ao estilo muda de cor sozinho, sem precisar recriar
nada. As 8 centrais só recolorem — não dá para remover, porque os componentes do kit dependem
delas pelo nome; cores próprias podem ser removidas.

---

## 3. Exportar uma tela

1. **Nomeie o frame da tela** como `screen/NomeDaTela` — PascalCase, sem espaço. Ex.:
   `screen/HomeMenu`, `screen/RewardPopup`. O tamanho desse frame é a resolução de referência;
   combine um valor com o time e não varie entre telas do mesmo jogo.

2. **Monte com instâncias** dos componentes do kit.

3. **Use Auto Layout** onde faz sentido — listas, HUDs, botões que crescem com o texto — e
   **constraints** no que está posicionado livremente: fundo estica, HUD de canto cola na borda,
   conteúdo principal centraliza.

4. **Marque os nomes das layers**:

   | Convenção | Para que serve |
   |---|---|
   | `@PlayButton` | O programador precisa acessar por código |
   | `_notes` | Andaime de design: anotações, réguas, versões antigas. Não vai para a Unity |
   | `hero#img` | Achatar em PNG: ilustrações, logos, e tudo com gradiente, sombra ou blur |
   | `title:loc.menu.title` | Texto que será traduzido |

5. **Selecione o frame raiz** e rode o plugin. Modo **Exportação** → aba **Tela** mostra o
   relatório.

6. **Zere os erros.** Erro bloqueia o export; aviso passa. Clicar num item da lista leva a
   viewport até a layer.

7. Clique em **`Exportar`**. O navegador baixa `NomeDaTela.uiscreen`. Entregue esse arquivo ao
   programador.

O alvo é exportar com **zero avisos**, não com poucos avisos.

### Erros e avisos mais comuns

| Mensagem | O que fazer |
|---|---|
| Frame raiz fora do padrão | Renomeie para `screen/NomeDaTela`, sem espaço |
| `@Nome` aparece mais de uma vez | Cada bind precisa ser único na tela |
| Componente não está no kit v1 | Use um componente do kit, ou peça um novo ao dono da biblioteca |
| Gradiente, sombra ou blur não é reconstruído | Marque a layer com `#img` |
| Cor ou texto fora de token | Use os estilos da página UI Kit |
| Nome automático (`Frame 42`) | Dê um nome de verdade: ele vira o nome do objeto na Unity |
| Texto com formatações diferentes | Separe em layers, ou aceite a formatação do primeiro trecho |

A referência completa das convenções está em
[figma-conventions.md](https://github.com/VinniHashirama/ui-exporter-tool-docs-and-samples/blob/main/docs/figma-conventions.md).

---

## 4. Exportar um componente avulso

Modo **Exportação** → aba **Componente**. Selecione um `Component` ou `Component Set` (não
precisa ter sido criado pelo kit — qualquer componente com nome canônico válido serve), confira
os slots e os avisos, escolha o **papel na Unity** se o plugin não inferiu certo pelo nome, e
clique em **`Exportar`**. Sai um pacote `<Nome>.uicomponent`, que o importador da Unity gera ou
atualiza como prefab em `Assets/UI/Generated/Kit`.

## 5. Exportar o kit completo

Modo **Exportação** → aba **Kit completo**. Empacota **todo componente de primeiro nível** já
criado na página atual — o kit inteiro, ou só os componentes próprios que você foi criando — num
único arquivo `.uikit`. Do lado da Unity, esse arquivo atualiza todos os prefabs do kit de uma
vez, em vez de importar um `.uicomponent` por vez, o que é o jeito de manter a Unity em sincronia
com o Figma depois de uma leva de ajustes visuais.

Componente que falhar ao exportar (nome inválido, erro bloqueante) não trava os outros: ele
aparece listado como ignorado no arquivo, e o resto do kit sai normalmente.

---

## Desenvolvimento

Daqui para baixo é só para quem mexe no código do plugin.

```bash
npm ci --ignore-scripts
npm run build        # gera dist/code.js e dist/ui.html
npm run watch        # rebuild a cada save; rode o plugin de novo no Figma para recarregar
npm run check        # typecheck + testes + build
npm run sample       # regenera samples/HomeMenu.uiscreen
```

### Por que `dist/` é commitado

Para o designer não precisar de Node nem de terminal: ele baixa o ZIP e importa. O bundle é
gerado **sem minificar** para o diff continuar legível, e o CI roda `git diff --exit-code dist/`
depois de buildar — se o `dist` estiver defasado do `src`, o CI falha. É essa checagem que evita
o problema clássico de artefato de build versionado envelhecendo em silêncio.

**Ao mudar código, rode `npm run build` e commite o `dist/` junto.**

### Arquitetura

O Figma roda plugins em duas metades que só trocam mensagens:

| Arquivo | Onde roda | Pode |
|---|---|---|
| `src/code.ts` | sandbox | Acessa o documento. Sem DOM, sem Blob, sem download |
| `src/ui.ts` | iframe | Tem DOM, zipa e entrega o arquivo. Não vê o documento |
| `src/messages.ts` | — | O protocolo entre as duas |

Daí a divisão de trabalho: o sandbox atravessa a árvore e rasteriza os PNGs, manda tudo para o
iframe, e o iframe compacta com `fflate` e dispara o download.

| Módulo | Responsabilidade |
|---|---|
| `traverse.ts` | Percorre a árvore e monta o UIIR. O núcleo |
| `kit-builder.ts` | Cria a biblioteca canônica dentro do Figma |
| `palette.ts` | Lê/edita a paleta como Paint Styles `color/<chave>` do arquivo |
| `kit-batch.ts` | Monta o manifesto `kit.json` do export em lote (`.uikit`), puro e testado |
| `naming.ts` | Convenções de nome (`_`, `@`, `#img`, `:loc`) e sanitização |
| `kit.ts` | Vocabulário canônico do kit |
| `diagnostics.ts` | Acumula o lint; erro bloqueia o export |
| `tokens.ts` | Resolve estilos em tokens |
| `mappers/` | Um arquivo por eixo: geometria, layout, texto, fill, componente |
| `schema/uiir.schema.json` | **O contrato.** Fronteira única com a Unity |

A varredura roda a cada troca de seleção **sem** rasterizar imagem; só o clique em Exportar paga
esse custo.

### Segurança

`manifest.json` declara `networkAccess: { allowedDomains: ["none"] }`: o plugin não faz nenhuma
chamada de rede, e isso é verificável. Não há token do Figma em nenhum ponto do fluxo, e o pacote
não carrega identidade de quem exportou.

Nome de layer e conteúdo de texto são tratados como dado não confiável: passam por
`sanitizeName` (whitelist Unicode) antes de virar nome de arquivo ou de objeto, e a UI renderiza
tudo com `textContent`, nunca `innerHTML`.

### Testes

`tests/figma-mock.ts` imita a superfície da API do Figma que o plugin realmente usa, o que
permite testar a travessia inteira fora do Figma. Os dois que mais importam:

- **`build.test.ts`** valida a saída contra `schema/uiir.schema.json` — é o que garante que os
  dois lados continuam falando a mesma língua.
- **`kit.test.ts`** verifica que os nomes canônicos que o gerador cria não divergiram do kit da
  Unity.

### Estado

O **export de tela, o export de componente e a reorganização de abas (Criação/Exportação) foram
validados manualmente no Figma real**. `loadPalette`/`upsertPaletteColor` (aba Cores) e o laço de
`exportKitBatch` sobre `figma.currentPage` (`.uikit`) dependem de Paint Style e de
`buildComponent` de verdade — caros demais para simular em `figma-mock.ts` — e por isso só têm
cobertura de teste na parte pura (`hexToRgb`/`rgbToHex`, montagem do `kit.json`); a parte que
toca a API do Figma foi validada manualmente, não por teste automatizado. Se você for o primeiro
a notar algo estranho nelas, o
[roadmap](https://github.com/VinniHashirama/ui-exporter-tool-docs-and-samples/blob/main/ROADMAP.md)
lista o que está em aberto.
