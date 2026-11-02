# Decisões de arquitetura (ADRs)

Cada registro conta uma decisão do projeto: o contexto, o que foi decidido, as consequências e as alternativas descartadas. Todos citam os arquivos do código que materializam a decisão. O [documento de design](../design.md) (seções 4 a 6) descreve o sistema; estes registros explicam por que ele é assim.

| ADR | Decisão | Status |
|---|---|---|
| [0001](0001-abordagem-hibrida-twig-e-web-components.md) | Abordagem híbrida: Twig Components + Web Components | Aceita |
| [0002](0002-design-tokens-como-css-custom-properties.md) | Design tokens como CSS custom properties, para atravessar o Shadow DOM | Aceita |
| [0003](0003-webpack-encore-em-vez-de-assetmapper.md) | Webpack Encore em vez de AssetMapper | Aceita |
| [0004](0004-servidor-como-fonte-da-verdade.md) | Servidor como fonte da verdade; regra CNJ duplicada com contrato de testes compartilhado; prazo e autorização só no servidor | Aceita |
| [0005](0005-vitest-em-modo-browser.md) | Vitest em modo browser para os Web Components | Aceita |
| [0006](0006-sqlite-como-banco-padrao.md) | SQLite como banco padrão, com as regras de chaves estrangeiras e de migrations | Aceita |
| [0007](0007-campo-cnj-aprimora-o-input-nativo.md) | Campo do número CNJ: aprimorar o input nativo, sem Shadow DOM nem `ElementInternals` | Aceita |

Veja também os [diagramas](../diagrams/README.md).

## Formato

Título `# 000N. <Decisão>`, **Status**, **Contexto**, **Decisão**, **Consequências** (positivas e negativas) e **Alternativas consideradas**. Uma decisão nova ganha o próximo número; uma decisão revista não é apagada: o registro antigo passa a **Substituída** e aponta para o novo.
