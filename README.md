# Arvore UI Exporter — plugin do Figma

Exporta uma tela montada no Figma para um pacote `.uiexport`, que o
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

### Por que o app desktop e não o Figma Web

Para carregar um plugin em desenvolvimento, o Figma precisa ler arquivos do seu disco, e o
navegador não permite isso. É restrição de sandbox do navegador, **não** limitação de plano — sua
conta gratuita funciona igual.

O arquivo continua o mesmo na nuvem: você pode desenhar no Web e abrir o desktop só na hora de
exportar, se preferir.

---

## 2. Criar os componentes básicos

Antes de montar telas, gere a biblioteca canônica. Abra o plugin, vá na aba **`Criar kit`** e
clique em **`Criar kit nesta página`**.

Aparece uma página chamada **UI Kit** com:

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

5. **Selecione o frame raiz** e rode o plugin. A aba `Exportar tela` mostra o relatório.

6. **Zere os erros.** Erro bloqueia o export; aviso passa. Clicar num item da lista leva a
   viewport até a layer.

7. Clique em **`Exportar`**. O navegador baixa `NomeDaTela.uiexport`. Entregue esse arquivo ao
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

## Desenvolvimento

Daqui para baixo é só para quem mexe no código do plugin.

```bash
npm ci --ignore-scripts
npm run build        # gera dist/code.js e dist/ui.html
npm run watch        # rebuild a cada save; rode o plugin de novo no Figma para recarregar
npm run check        # typecheck + testes + build
npm run sample       # regenera samples/HomeMenu.uiexport
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

O **export foi validado manualmente no Figma real**. O botão de criar kit foi adicionado depois
dessa validação e ainda não passou por teste manual — se você for o primeiro a rodar, o
[roadmap](https://github.com/VinniHashirama/ui-exporter-tool-docs-and-samples/blob/main/ROADMAP.md)
lista o que está em aberto.
