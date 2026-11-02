# 0001. Abordagem híbrida: Twig Components + Web Components

- **Status:** Aceita

## Contexto

O projeto é uma biblioteca de componentes reutilizáveis aplicada a um painel de processo eletrônico ([design](../design.md), seção 1). Quase tudo o que a interface mostra é conteúdo que o servidor já sabe: selos de status, cartões, tabelas, prazos, abas, mensagens. Só três coisas precisam do navegador: a máscara e a validação do número CNJ enquanto a pessoa digita, o filtro da linha do tempo por tipo de movimentação e o campo de envio de PDFs, com arrastar e soltar e a lista dos arquivos escolhidos.

Duas exigências pesam na escolha: a página tem de continuar funcionando com o JavaScript desligado (critério de aceite 3) e os controles têm de ser acessíveis por teclado e por leitor de tela.

## Decisão

O servidor renderiza tudo; o JavaScript só aprimora.

- **Twig Components** (Symfony UX TwigComponent) produzem o HTML estrutural. São sete: `StatusBadge` e `Alert`, anônimos (só template), e `CaseCard`, `Timeline`, `DataTable`, `DeadlineIndicator` e `Pagination`, com classe PHP.
- **Web Components**, escritos em Custom Elements puros (sem biblioteca), entram **apenas** onde há comportamento no navegador: `<jus-numero-processo>`, `<jus-filtro-timeline>` e `<jus-upload>`. Cada um envolve um controle nativo que o servidor já entregou (o `input` do número, a lista da timeline, o `input type="file"`) e o aprimora; sem JavaScript, o controle nativo e a validação do servidor continuam valendo.
- Os dois lados se encontram no HTML. O Twig escreve os atributos que o componente lê: o `data-event-type` e o `data-event-label` de cada item da `Timeline`, e os atributos `max-files` e `max-size` do `<jus-upload>`, que vêm das opções do campo.

Onde está no código:

- `templates/components/*.html.twig` e `src/Twig/Components/*.php`; o diretório dos componentes anônimos e o namespace das classes estão em `config/packages/twig_component.yaml`.
- `assets/components/` (`jus-numero-processo.ts`, `jus-filtro-timeline.ts`, `jus-upload.ts`, a classe base `jus-element.ts` e o `index.ts`, que registra os três).
- `templates/form/jus_theme.html.twig`, que desenha o `input` nativo dentro de `<jus-numero-processo>` e de `<jus-upload>`; `templates/case/show.html.twig`, que coloca a `Timeline` dentro de `<jus-filtro-timeline>`.
- O catálogo público `/design-system` (`templates/design_system/`) mostra cada componente com o exemplo vivo.

## Consequências

**Positivas**

- Com o JavaScript desligado, a consulta, a página do processo e o peticionamento funcionam; a auditoria `npm run audit:pages` confere isso com os scripts realmente desligados.
- Os controles são os nativos do navegador, o que dá teclado, foco e semântica sem trabalho extra. A superfície de JavaScript é pequena: três Web Components e três comportamentos de layout (`assets/behaviours/`).
- Cada camada tem a sua suíte: os Twig Components são testados no PHPUnit (`tests/Component/`) e os Web Components no Vitest, em modo browser (ADR [0005](0005-vitest-em-modo-browser.md)).

**Negativas**

- Há dois modelos de componente e duas suítes de teste para quem for mexer.
- O contrato entre o Twig e o Web Component é um acordo sobre o HTML (nomes de atributos, marcação esperada). Só os testes dos dois lados o mantêm; um Web Component não funciona sozinho, sem a marcação que o servidor renderiza.
- Sem Live Components, o que depende de dados novos (ordenação, paginação, troca de aba) é uma nova navegação, por link comum, e não uma atualização parcial da página.

## Alternativas consideradas

- **Tudo como Web Components, inclusive os estáticos.** Exigiria JavaScript para ver qualquer conteúdo, ou renderizar Shadow DOM no servidor; abre mão do "funciona sem JavaScript" sem ganho para peças que não têm comportamento.
- **Só Twig e Bootstrap, sem JavaScript.** Tiraria a máscara, a validação antecipada do número, o filtro da timeline e a lista de arquivos do envio, que são justamente o que o navegador faz melhor que o servidor.
- **Aplicação de página única (React, Vue) sobre uma API.** Duplicaria rotas, validação e autorização no cliente, o oposto de tratar o servidor como fonte da verdade (ADR [0004](0004-servidor-como-fonte-da-verdade.md)), e está fora do objetivo do projeto.
- **Symfony UX Live Components ou Stimulus.** Os Live Components ficaram fora do MVP (design, seção 2.2). Custom Elements são um padrão da plataforma e não pedem framework.
