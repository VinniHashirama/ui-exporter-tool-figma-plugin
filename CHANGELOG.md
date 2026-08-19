# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versionamento semântico.

A versão que importa para a compatibilidade entre os dois lados não é esta, e sim o
`schemaVersion` do contrato (`schema/uiir.schema.json`), hoje **1.0.0**. O importador da Unity
recusa pacote de major diferente do que ele suporta.

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
