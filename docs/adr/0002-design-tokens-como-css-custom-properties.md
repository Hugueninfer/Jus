# 0002. Design tokens como CSS custom properties

- **Status:** Aceita

## Contexto

Os valores do Design System (cores, tipografia, espaçamento, bordas, sombras, foco) precisam chegar a dois lugares: ao Bootstrap, que é configurado por variáveis Sass antes de ser compilado, e aos Web Components que desenham controles próprios (`<jus-filtro-timeline>` e `<jus-upload>`), cujo HTML vive num Shadow DOM.

O Shadow DOM isola os estilos: as regras da página, o Bootstrap inclusive, não entram nele. Uma variável Sass só existe na compilação e não chega ao navegador. A única coisa que a plataforma deixa atravessar a fronteira são as propriedades herdadas, e as CSS custom properties são herdadas.

## Decisão

Os tokens têm **uma fonte só**, e dela saem os dois destinos.

- `assets/styles/tokens/_tokens.scss` define os mapas Sass (cores, famílias de fonte, espaços, raios, sombras e foco). É o único arquivo com os valores.
- `assets/styles/tokens/_bootstrap-config.scss` deriva dos mapas as variáveis do Bootstrap (`$primary`, `$font-family-base`, o anel de foco…), e `assets/styles/app.scss` o importa antes do Bootstrap.
- `assets/styles/tokens/_custom-properties.scss` emite os mesmos mapas como propriedades em `:root` (`--jus-color-primary`, `--jus-space-3`, `--jus-focus-width`…).
- Os Web Components só usam `var(--jus-*)`. A classe base `assets/components/jus-element.ts` adota uma folha compartilhada (constructable stylesheet) cujas cores, espaços, raios e foco vêm só de tokens, e as folhas de cada componente seguem a mesma regra. Valores que dependem do lugar na página também passam por propriedades herdadas: `assets/styles/base/_focus.scss` troca `--jus-focus-ring` para a cor inversa nas superfícies escuras, e o anel dentro do Shadow DOM a herda.

Testes que impõem a regra, em `assets/components/jus-element.test.ts`: as folhas dos componentes não têm cor literal (hex, `rgb`, `hsl`), os `--jus-*` que elas usam existem no `:root` da página, e nenhum `var()` aponta para propriedade de outra família. E `assets/test-support/tokens.ts` compila o próprio `_custom-properties.scss` para os testes, de modo que o contraste do axe-core é medido com a paleta real, sem uma segunda cópia dela.

## Consequências

**Positivas**

- Um valor muda num lugar só e muda no Bootstrap, nas folhas da página e dentro dos Shadow DOMs.
- Os componentes não conhecem as classes do Bootstrap nem a paleta; trocar o tema é trocar `_tokens.scss`.
- A fronteira do Shadow DOM continua isolando o resto: só os tokens a atravessam.

**Negativas**

- Uma propriedade que não existe falha em silêncio (o navegador ignora a declaração). Por isso os testes conferem que cada `--jus-*` usado existe.
- O componente depende de a página definir os tokens em `:root`; fora da página, ou num teste sem `installTokens()`, ele fica sem cores.
- O fluxo é de um sentido só (Sass para CSS), e as contas feitas em tempo de compilação, como a do contraste mínimo do Bootstrap, não se aplicam a valores resolvidos no navegador.

## Alternativas consideradas

- **Repetir os valores no CSS de cada componente.** É simples, mas os valores divergem aos poucos e uma mudança de paleta vira uma busca em vários arquivos.
- **Só variáveis Sass.** Não atravessam o Shadow DOM: cada componente precisaria ter o Sass compilado dentro do próprio JavaScript.
- **Levar o CSS do Bootstrap para dentro de cada Shadow DOM.** Pesado, e acopla os componentes às classes do Bootstrap.
- **`::part()` e `exportparts`.** Servem para a página estilizar peças específicas de um componente, não para distribuir um tema inteiro; os tokens resolvem isso sem abrir a estrutura interna.
- **Uma ferramenta de tokens (Style Dictionary, por exemplo).** Acrescentaria uma etapa de build para três mapas pequenos; o próprio Sass já gera os dois formatos.
