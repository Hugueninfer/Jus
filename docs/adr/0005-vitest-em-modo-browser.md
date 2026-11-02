# 0005. Vitest em modo browser para os Web Components

- **Status:** Aceita

## Contexto

Os Web Components dependem de APIs reais do navegador:

- `DataTransfer`, com que o `<jus-upload>` escreve no `input type="file"` a lista de arquivos depois de soltar ou remover;
- `ResizeObserver`, com que o comportamento de regiões de rolagem decide se a região é uma parada de Tab;
- constructable stylesheets e `adoptedStyleSheets`, que a classe base `JusElement` usa para dar estilo ao Shadow DOM;
- a validação nativa de formulário (`setCustomValidity`, `validity`, os eventos `invalid`, `submit` e `reset`);
- o foco e a ordem de Tab, que fazem parte do contrato de acessibilidade, e o cálculo real de estilos e de contraste, de que o axe-core precisa.

Um ambiente simulado como o jsdom não implementa essas APIs ou as implementa só em parte. Um teste que as substitui por mocks confere o mock, não o componente.

## Decisão

Rodar os testes dos Web Components **dentro de um navegador de verdade**, com o Vitest em modo browser.

- `vitest.config.ts` ativa `browser` (headless) com o provedor Playwright e uma instância `chromium`, e inclui `assets/**/*.test.ts`. Cada componente, utilitário compartilhado e comportamento de layout tem o seu `.test.ts` ao lado do código.
- **Localmente** os testes usam o Google Chrome instalado (canal `chrome` do Playwright), sem baixar navegador. **No CI** (variável `CI` ou `TF_BUILD`) usam o Chromium do Playwright (canal `chromium`, o navegador completo em modo headless novo), que o pipeline instala com `npx playwright install --with-deps chromium` (`azure-pipelines.yml`). O comando é `npm test` nos dois casos.
- `assets/test-support/` reúne as ajudas: `axe.ts` (`expectNoAxeViolations`, que falha listando a regra e o seletor, também dentro de um Shadow DOM), `tokens.ts` (`installTokens`, que põe no documento os `--jus-*` compilados do mesmo Sass da página, para o contraste ser medido com a paleta real; ADR [0002](0002-design-tokens-como-css-custom-properties.md)) e `required.ts`.
- Todo teste de componente roda o axe-core.

## Consequências

**Positivas**

- O que o teste prova é o comportamento no navegador: foco, ordem de Tab, validação nativa, `DataTransfer`, Shadow DOM, contraste.
- O envio de formulário, o `reset` e os eventos de teclado são exercitados com o fluxo real do navegador, e não com uma simulação deles.
- As regras de acessibilidade ficam no mesmo teste do comportamento.

**Negativas**

- Os testes pedem um navegador instalado (Chrome, localmente) e são mais lentos que os de um ambiente simulado.
- Só o Chromium é exercitado (há uma instância); Firefox e Safari ficam sem cobertura automática.
- O Chrome local e o Chromium do CI podem ter versões diferentes. A configuração aproxima os dois usando o headless novo no CI, mas a diferença existe.

## Alternativas consideradas

- **jsdom (ou happy-dom) com mocks.** Rápido e sem navegador, mas não cobre as APIs acima, e um teste com mocks delas não provaria nada.
- **Um executor de testes de ponta a ponta à parte, sobre a aplicação inteira.** Cobriria o navegador, mas exigiria subir servidor e banco para testar uma peça isolada, e mistura a falha do componente com a da página; a auditoria das páginas (`npm run audit:pages`) já cumpre esse papel, fora do ciclo de teste.
