# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versionamento semântico.

A versão que importa para a compatibilidade entre os dois lados não é esta, e sim o
`schemaVersion` do contrato (`schema/uiir.schema.json`), hoje **1.1.0**. O importador da Unity
recusa pacote de major diferente do que ele suporta.

## [Não publicado]

Autoria de componente no Figma. O designer monta o botão e a Unity gera o prefab com a arte
dele, em vez de uma caixa cinza.

### Adicionado

- **Export de componente** para pacote `.uikit` (`kit.json` + PNGs), `schemaVersion` **1.1.0**.
  Carrega nome canônico, papel, slots e a variante de origem.
- **Criar componente avulso** na aba Criar kit, com um botão por componente do catálogo, além
  do "criar tudo".
- **Componente próprio** (nome + papel) para o que não está no kit; nasce com as layers de
  slot já nomeadas.
- Convenção `$nome` para declarar slot, e `#9s(t,r,b,l)` para bordas de 9-slice explícitas.
- `asset.nineSlice` passou a ser preenchido: pela anotação em qualquer export, e derivado do
  raio dos cantos no export de componente. Sempre limitado para caber no sprite.
- Lint de dimensão de textura: `asset-not-multiple-of-4` e `asset-oversized`.
- Sample de componente (`samples/Button_Primary.uikit`), reproduzível byte a byte.

### Corrigido

- `applyFillStyle` e `applyTextStyle` engoliam a falha em silêncio, e o kit saía sem vínculo
  de token sem ninguém saber. Agora entram na lista de avisos explicando o efeito.
- A lista de componentes da UI era um `<ul>` escrito à mão que podia divergir do que o botão
  realmente cria. Agora é derivada do mesmo catálogo, com teste cobrando.

### Decisões

- **Potência de 2 não gera aviso.** Quase todo sprite de UI é NPOT e isso não é problema em
  UGUI; o que quebra compressão é não ser múltiplo de 4. Avisar em cada asset encheria o
  relatório de ruído e mataria a meta de exportar com zero avisos.
- **9-slice não é derivado em tela.** Ali `#img` marca ilustração, que fatiada sairia
  deformada. Num componente, `#img` é a pele do botão — o caso em que a borda importa.

## [0.1.0] — 2026-08-19

Primeira versão publicada. Export validado manualmente no Figma real.

### Adicionado

- Export de tela para pacote `.uiexport` (UIIR + PNGs), com `schemaVersion` 1.0.0.
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
