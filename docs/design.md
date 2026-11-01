# Jus — Design System e Painel de Processo Eletrônico

- **Documento de design** (2026-10-26)
- **Status:** em implementação
- **Repositório:** [Hugueninfer/Jus](https://github.com/Hugueninfer/Jus)

## 1. Objetivo

Monolito **PHP + Symfony + Twig com foco em componentes de interface**: uma biblioteca de componentes reutilizáveis (Twig Components + Web Components) aplicada a um sistema jurídico **fictício** inspirado em processo eletrônico.

Nenhum nome, marca ou identidade visual de sistema real é usado. Todos os dados são fictícios.

## 2. Escopo

### 2.1 MVP

- Login com dois perfis (advogado e servidor).
- 3 telas: consulta processual, página do processo e peticionamento.
- 7 Twig Components, 3 Web Components (mais dois pequenos comportamentos de layout em JavaScript), form theme e extensão Twig.
- Catálogo público `/design-system`.
- Páginas de erro 403, 404 e 500 com o Design System.
- Testes, análise estática, pipeline no Azure DevOps e documentação.

### 2.2 Fora do MVP

Deploy público (Azure App Service), modo escuro, Live Components, PostgreSQL, i18n.

## 3. Stack e ambiente

### 3.1 Stack

| Camada | Tecnologia |
|---|---|
| Linguagem | PHP 8.4 (`declare(strict_types=1)` em todos os arquivos) |
| Framework | Symfony 7.4 LTS |
| Templates | Twig 3 + Symfony UX TwigComponent |
| Persistência | Doctrine ORM + SQLite |
| Front-end | Webpack Encore, TypeScript, Sass, Bootstrap 5.3, Custom Elements puros (sem biblioteca de componentes) |
| Testes | PHPUnit, Vitest 5 em modo browser (Playwright: Chrome instalado localmente, Chromium no CI), axe-core |
| Qualidade | PHPStan (nível max + extensões Symfony/Doctrine), PHP-CS-Fixer (`@Symfony`), ESLint (typescript-eslint `strictTypeChecked`), Stylelint, `tsc --noEmit` |
| Dados fictícios | DoctrineFixturesBundle + Faker (`pt_BR`) |

### 3.2 Ambiente de desenvolvimento

- PHP 8.4 (x64) com as extensões `intl`, `pdo_sqlite`, `sqlite3`, `fileinfo`, `mbstring`, `openssl`, `curl`, `zip`.
- Composer 2, Git e Node.js 24 LTS.
- Servidor de desenvolvimento: `php -S localhost:8000 -t public` (Symfony CLI é opcional).
- Um `Dockerfile` não faz parte do MVP; o ambiente é reproduzível pelas instruções do README e pelo CI.

### 3.3 Como rodar (meta do README)

```bash
composer install
npm ci && npm run build
composer setup        # cria o banco SQLite, roda migrations e carrega fixtures
php -S localhost:8000 -t public
```

## 4. Arquitetura

### 4.1 Abordagem híbrida

- **Twig Components** cuidam da estrutura e do HTML renderizado no servidor.
- **Web Components** entram apenas onde há comportamento no navegador.
- Web Components são escritos em **Custom Elements puro** (sem Lit). Os que desenham controles próprios (o filtro da timeline e o upload) usam Shadow DOM, sobre uma classe base própria (`JusElement`); o campo do número CNJ aprimora o input nativo no lugar, sem Shadow DOM (seção 6.5).
- A página chega completa do servidor; o JavaScript só aprimora. Sem JS, tudo continua funcionando.

### 4.2 Estrutura de pastas

```
src/
  Controller/              # finos: request → domínio → template
  Domain/                  # PHP puro (sem Symfony nem Doctrine), 100% coberto por testes unitários
    LegalCase/             # enums do processo: CaseStatus, PartySide, EventType, FilingType
    Text/                  # SearchText: forma de busca dos nomes (minúsculas, sem acentos)
    CnjNumber.php          # value object do número CNJ
    InvalidCnjNumber.php
    Deadline/              # DeadlineCalculator, HolidayCalendar, NationalHolidayCalendar, Easter
  Entity/                  # entidades Doctrine: LegalCase, Party, CaseEvent, Document, Deadline, User
  Doctrine/Type/           # CnjNumberDoctrineType (tipo Doctrine `cnj_number`)
  Form/                    # CnjNumberType (form type), CaseSearchType, FilingFormType, transformers
  Presentation/            # EnumLabels (rótulos em português dos enums), CaseDeadlines e CaseDocumentsTable (dados da página do processo)
  DesignSystem/            # SampleData: entidades em memória para o catálogo /design-system
  Repository/
  Security/                # LegalCaseVoter
  Service/                 # FilingService, DocumentStorage
  Twig/
    Components/            # classes dos Twig Components
    Extension/             # filtros cnj, brl, bytes e label
  ValueResolver/           # CnjNumberValueResolver
  DataFixtures/
templates/
  base.html.twig
  components/              # templates dos Twig Components (inclui anônimos)
  form/jus_theme.html.twig
  design_system/           # catálogo + examples/<componente>/<exemplo>.html.twig
  case/                    # busca (search) e página do processo (show)
  filing/ security/
  bundles/TwigBundle/Exception/   # error403, error404, error
assets/
  app.ts                   # entrada do Encore: estilos, Bootstrap (alert, offcanvas, tab), Web Components e comportamentos de layout
  styles/
    tokens/                # _tokens.scss, _bootstrap-config.scss, _custom-properties.scss
    base/                  # _focus.scss: anel de foco do teclado
    components/            # estilos próprios dos componentes (_timeline.scss, _data-table.scss, _case-card.scss)
    app.scss
  components/              # os Web Components; cada arquivo tem um .test.ts ao lado
    jus-element.ts         # JusElement: Shadow DOM + folha base compartilhada; sheet()
    jus-numero-processo.ts # aprimora o input nativo no lugar (sem Shadow DOM)
    jus-filtro-timeline.ts
    jus-upload.ts
    index.ts               # define(): customElements.define com guarda, para os três
  shared/                  # lógica sem DOM compartilhada pelos componentes (cada arquivo com seu .test.ts)
    cnj.ts                 # regra do CNJ e máscara (mesmos casos do PHP)
    bytes.ts               # formatBytes (mesmos casos do filtro Twig bytes)
    validity.ts            # setInvalid (aria-invalid + is-invalid juntos), setFieldError (o motivo como texto, ligado ao input) e retireServerErrors
  behaviours/              # comportamentos de layout, sem custom elements (+ .test.ts)
    alert-focus.ts         # foco em main#conteudo depois de fechar um alerta
    scroll-regions.ts      # região rolável só é parada de Tab enquanto transborda
    index.ts               # instala os dois quando o documento está pronto
  test-support/            # ajudas dos testes: axe.ts (axe-core), tokens.ts (paleta real), required.ts
tests/
  Unit/                    # domínio, entidades, voter, form types e extensão Twig, sem kernel
  Component/               # Twig Components renderizados (InteractsWithTwigComponents)
  Integration/             # kernel e banco: persistência, busca (inclusive a paridade de visibilidade com o Voter), fixtures, form theme, filtros, mensagens em pt-BR
  Functional/              # requests HTTP: login, layout, catálogo, busca, página do processo, páginas de erro
  Support/                 # TestCases (usuários e processos de teste), QueryRecorder (conta as consultas SQL)
  fixtures/cnj-numbers.json    # casos compartilhados entre PHPUnit e Vitest
  fixtures/sample.pdf
docs/
  design.md                # este documento
  adr/
  diagrams/
azure-pipelines.yml
vitest.config.ts           # Vitest em modo browser (seção 9)
```

### 4.3 Princípios

- Regra de negócio (CNJ, prazo) vive em `Domain/`, em **PHP puro, sem depender do Symfony nem do Doctrine**, testável isoladamente.
- Controllers só orquestram; não têm regra de negócio nem checagem de permissão inline (usam o Voter).
- O servidor é a **fonte da verdade**. Validações no JS apenas antecipam feedback ao usuário.
- O tempo é injetado via `Psr\Clock\ClockInterface` (Symfony Clock), para testes determinísticos.

### 4.4 Fluxo de uma request

```
Request → Controller → Voter → Repository / Domain → template Twig
        → Twig Components → HTML completo → navegador → Web Components aprimoram
```

## 5. Domínio

### 5.1 Entidades

| Entidade | Campos principais |
|---|---|
| `User` | email, name, password (hash), roles, oabNumber (nullable) |
| `LegalCase` | number (`CnjNumber`, único), caseClass, subject, court, status (`CaseStatus`), confidential (bool), claimValueInCents (int), filedAt, parties, events |
| `Party` | legalCase, name, searchName (nome normalizado para a busca), taxId (fictício), side (`PartySide`), lawyers (ManyToMany `User`) |
| `CaseEvent` | legalCase, type (`EventType`), description, occurredAt, createdBy (nullable), filingType (`FilingType`, nullable; só nas juntadas de petição), documents |
| `Document` | event, title, originalFilename, storedFilename (UUID + `.pdf`), sizeInBytes, uploadedBy, uploadedAt |
| `Deadline` | party, summons (`CaseEvent` do tipo intimação), startDate, businessDays, fulfilledAt (nullable) |

```
User ──(advogado de)──► Party ◄── LegalCase ──► CaseEvent ──► Document
                          │
                          └──► Deadline (gerado por uma intimação)
```

As entidades Doctrine (`User`, `LegalCase`, `Party`, `CaseEvent`, `Document` e `Deadline`) ficam em `src/Entity/`, seguindo a convenção do Symfony. Assim `src/Domain/` continua PHP puro, sem Doctrine, e pode manter 100% de cobertura de linhas.

As petições são registradas com `LegalCase::file()`, que exige um advogado que represente alguma parte do processo e grava o tipo da petição no `CaseEvent`; as demais movimentações usam `LegalCase::record()`.

`Party.searchName` é o nome sem acentos, em minúsculas e com espaços simples (`SearchText::normalize()`, em `src/Domain/Text/`), calculado no construtor. Existe porque o SQLite só ignora maiúsculas nas letras ASCII (`LIKE` e `lower()`) e nunca ignora acentos: a busca por nome de parte compara o termo, normalizado do mesmo jeito, com esse campo, e "joao" encontra "João".

As coleções do processo já vêm ordenadas pelo mapeamento: partes por id, movimentações da mais recente para a mais antiga (empate pelo maior id) e advogados da parte por nome. Por isso a primeira movimentação da coleção é sempre a última.

### 5.2 Enums

- `CaseStatus`: `ACTIVE` (em andamento), `SUSPENDED` (suspenso), `ARCHIVED` (arquivado).
- `PartySide`: `PLAINTIFF` (polo ativo), `DEFENDANT` (polo passivo).
- `EventType`: `DECISION` (decisão), `ORDER` (despacho), `FILING` (juntada de petição), `SUMMONS` (intimação), `HEARING` (audiência).
- `FilingType`: `INITIAL_PETITION` (petição inicial — usada na distribuição, nunca oferecida no formulário de peticionamento), `STATEMENT` (manifestação), `ANSWER` (contestação), `APPEAL` (recurso), `EXHIBITS` (juntada de documentos).

Os enums são PHP puro e ficam em `src/Domain/LegalCase/`; as entidades de `src/Entity/` os referenciam.

O sigilo é o campo booleano `LegalCase.confidential`, independente do status.

### 5.3 Número CNJ (`CnjNumber`)

- Formato: `NNNNNNN-DD.AAAA.J.TR.OOOO` (20 dígitos: sequencial, dígito verificador, ano, segmento, tribunal, origem).
- Geração do DV (ISO 7064 Mod 97-10): `DD = 98 − (NNNNNNN AAAA J TR OOOO 00 mod 97)`, que sempre resulta em um valor de 02 a 98.
- Validação: exige o DV **canônico**. O DV é recalculado a partir dos outros 18 dígitos pela fórmula acima e comparado com o informado. Testar apenas "resto 1 na divisão por 97" no número `NNNNNNN AAAA J TR OOOO DD` também aceitaria os DVs 00, 01 e 99 (apelidos de 97, 98 e 02), que passam nesse teste mas nunca são gerados pela fórmula; por isso são rejeitados.
- O módulo é calculado **dígito a dígito** (`r = (r * 10 + d) % 97`), porque 20 dígitos estouram o inteiro de 64 bits do PHP e o `Number` do JavaScript.
- Espaços nas pontas são removidos com o **mesmo conjunto de caracteres do `String.prototype.trim()` do JavaScript** (os 25 pontos de código de espaço em branco e de fim de linha do ECMAScript, inclusive o espaço sem quebra U+00A0 e o BOM U+FEFF; não inclui NUL, U+0085 nem U+180E), para que a implementação em TypeScript concorde em qualquer entrada. Texto que não seja UTF-8 válido é rejeitado como mal formatado.
- API: `CnjNumber::fromString(string)` (aceita com ou sem máscara; lança `InvalidCnjNumber`), `CnjNumber::tryFromString(string): ?self`, `CnjNumber::compose(sequencial, ano, segmento, tribunal, origem)`, `digits()`, `formatted()`, `equals()`.
- `compose()` monta um número válido calculando o DV e **valida cada parte** (7, 4, 1, 2 e 4 dígitos, sem espaços); qualquer parte malformada lança `InvalidCnjNumber`.
- Persistido por um **tipo Doctrine customizado** (`cnj_number`) como string de 20 dígitos.
- A mesma regra existe em `assets/shared/cnj.ts`. As duas implementações são testadas contra `tests/fixtures/cnj-numbers.json` (casos válidos, DV errado, tamanho errado, caracteres inválidos, com e sem máscara, DV nas bordas 02 e 98, DVs não canônicos 00, 01 e 99, cada um dos 25 pontos de código que o `trim()` do JavaScript remove nas pontas, e três que ele não remove: NUL, U+0085 e U+180E).

### 5.4 Cálculo de prazo (`DeadlineCalculator`)

- Entrada: data de início (data da intimação) e quantidade de dias úteis.
- O dia do começo é excluído (CPC, art. 224): a contagem começa no primeiro dia útil seguinte.
- Dia útil = não é sábado nem domingo, não é feriado e não está no recesso forense.
- **Recesso forense:** 20/12 a 20/01, inclusive (CPC, art. 220).
- **Feriados:** interface `HolidayCalendar`; implementação `NationalHolidayCalendar` com:
  - Fixos: 01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11, 25/12.
  - Móveis, a partir da Páscoa: Carnaval (segunda e terça, Páscoa − 48 e − 47), Sexta-feira Santa (Páscoa − 2), Corpus Christi (Páscoa + 60).
  - Páscoa calculada pelo algoritmo gregoriano anônimo (Meeus/Jones/Butcher), sem depender da extensão `calendar`.
- O calendário é **ilustrativo** (tribunais têm calendários próprios); isso fica explícito no README e no ADR. A interface permite trocar o calendário.
- A data de vencimento é sempre **calculada**, nunca armazenada.
- As datas são tratadas como datas de calendário: a hora do dia é ignorada, e o "hoje" é lido no próprio fuso e comparado no fuso da data de início.
- Dias úteis restantes: contados de hoje (exclusive) até o vencimento (inclusive).
- Estados de urgência:

| Estado | Condição | Variante visual |
|---|---|---|
| `FULFILLED` | `fulfilledAt` preenchido | secondary |
| `OVERDUE` | hoje > vencimento | danger |
| `DUE_TODAY` | hoje = vencimento | danger |
| `WARNING` | 1 a 3 dias úteis restantes | warning |
| `ON_TRACK` | mais de 3 dias úteis restantes | success |

### 5.5 Autorização (`LegalCaseVoter`)

| Permissão | Regra |
|---|---|
| `VIEW` | Servidor (`ROLE_CLERK`): sempre. Advogado (`ROLE_LAWYER`): se o processo não for sigiloso **ou** se for advogado de alguma parte. |
| `FILE` | Apenas advogado de alguma parte do processo, e o processo não pode estar `ARCHIVED`. |

- O download de documento exige `VIEW` no processo do documento.
- **Uma regra para toda rota de um processo** (a página, o peticionamento e o download de documento): quem não tem `VIEW` recebe o mesmo 404 de um número inexistente ou inválido. O 403 só vale quando o usuário **pode ver** o processo mas não pode agir sobre ele: `FILE` num processo arquivado, num processo público em que ele não representa nenhuma parte, ou o servidor, que vê tudo mas nunca peticiona. Por isso a checagem vem em duas etapas: primeiro `VIEW` (404), depois `FILE` (403). Se o 403 viesse antes, ou no lugar do 404, a resposta revelaria que o processo sigiloso existe (quem não vê o processo também não tem `FILE`). O peticionamento e o download chegam na etapa 8 da seção 13.
- A busca aplica a regra do `VIEW` **na própria consulta ao banco** (`LegalCaseRepository::onlyVisibleTo()`), sem passar pelo Voter, e um teste de integração mantém as duas iguais: para servidor, advogado de cada polo e advogado sem relação, em processo público e sigiloso, a busca e a consulta por número decidem como o Voter.
- A página do processo carrega o processo e então consulta o Voter. Quem não pode ver um sigiloso recebe 404, exatamente como para um número inexistente ou inválido: o sistema nunca revela que um processo sigiloso existe (seção 8).

### 5.6 Peticionamento (`FilingService`)

1. Grava cada PDF via `DocumentStorage` em `var/uploads/` (fora de `public/`).
2. Em transação: cria o `CaseEvent` do tipo `FILING`, os `Document` e marca como cumpridos (`fulfilledAt = agora`) os prazos em aberto das partes que o advogado representa.
3. Se a transação falhar: rollback, remove os arquivos gravados no passo 1 e relança a exceção.

## 6. Design System

### 6.1 Design tokens

- `_tokens.scss`: mapas SCSS de cores, tipografia, espaçamento, bordas, sombras e foco. É a única fonte dos valores.
- `_bootstrap-config.scss`: variáveis do Bootstrap 5.3 (`$primary`, `$font-family-base`, …) derivadas dos tokens, inclusive o anel de foco (sólido, em vez do primário a 25 % do Bootstrap).
- `_custom-properties.scss`: emite os tokens como CSS custom properties em `:root` (`--jus-color-primary`, `--jus-space-3`, …).
- Tokens de foco (`--jus-focus-width`, `--jus-focus-offset`, `--jus-focus-color`, `--jus-focus-color-inverse`): o anel do teclado tem pelo menos 3:1 com as cores ao redor, na cor primária sobre superfícies claras e em branco sobre as escuras (navbar e menu lateral). `base/_focus.scss` aplica o anel ao que o Bootstrap deixa para o navegador (links, `<summary>`) e aos botões.
- Web Components só usam `var(--jus-*)`, que atravessa o Shadow DOM.
- Estilos escritos mobile-first (`min-width` nos breakpoints).

### 6.2 Layout base

- `base.html.twig` com link "Pular para o conteúdo", navbar responsiva (offcanvas no celular), área de mensagens flash (`<twig:Alert>`) e `<main id="conteudo">`.
- A navbar mostra "Processos" (só com login; marcado com `aria-current` em toda a seção de processos, inclusive na página de um processo) e "Design System", mais "Entrar" para visitantes ou o nome do usuário e "Sair" para quem está logado.
- As páginas de erro (seção 8) estendem o mesmo layout.
- Dois pequenos comportamentos em JavaScript (`assets/behaviours/`, instalados quando o documento está pronto) cuidam do foco e da rolagem; sem eles a página funciona do mesmo jeito:
  - **Foco depois de fechar um alerta.** Se o alerta dispensável (`<twig:Alert dismissible>`) tinha o foco, no botão de fechar ou num link da mensagem, o foco vai para `main#conteudo` (`tabindex="-1"`) quando ele some, em vez de cair no topo do documento e obrigar a percorrer o cabeçalho de novo. O foco é lido em `close.bs.alert`, e não em `closed.bs.alert`: o Bootstrap 5.3 dispara o segundo depois de remover o elemento, num nó que já saiu do documento. Se a pessoa levou o foco para outro lugar enquanto o alerta esmaecia, ele fica onde está.
  - **Regiões de rolagem.** O servidor renderiza `tabindex="0"` nas regiões marcadas com `data-jus-scroll-region` (`role="region"` com `aria-label`; hoje, as tabelas de referência do catálogo, com `overflow-y-hidden`, porque a legenda oculta ultrapassa a tabela em 1 px e faria de toda região uma rolagem vertical). O script (um `ResizeObserver` na região e no que ela contém) tira o `tabindex` das que cabem na largura e o devolve quando passam a transbordar (janela mais estreita, fonte maior, conteúdo novo): uma parada de Tab só existe onde há o que rolar. Uma região que está com o foco mantém o `tabindex` até perdê-lo.

### 6.3 Twig Components

| Componente | Tipo | Props | Comportamento |
|---|---|---|---|
| `StatusBadge` | anônimo | `status: CaseStatus` | Mapeia o status para variante, ícone e rótulo; o rótulo é sempre texto (não só cor) |
| `Alert` | anônimo | `type` (success, danger, warning, info; `error` vira danger), `dismissible` | Mensagem de feedback: `role="alert"` para danger e warning, `role="status"` para as demais. A gravidade não depende só da cor: ícone decorativo e prefixo oculto para leitores de tela ("Erro:", "Atenção:", "Sucesso:", "Informação:") |
| `CaseCard` | classe | `case: LegalCase`, `href` (opcional), `latestEvent` (opcional), `latestEventKnown` | Número formatado, classe, partes por polo (rótulos do `PartySide`, uma linha por parte, "—" no polo vazio, com "Nenhuma parte." oculto para leitores de tela; o agrupamento é o de `LegalCase::getPartiesBySide()`, o mesmo da página do processo), órgão, status, selo "Sigiloso" e último evento. Com `href`, o número vira um link que cobre o cartão. Quem monta uma lista passa `latestEvent` com `latestEventKnown` verdadeiro: então `latestEvent` nulo significa "sem movimentações" e o cartão não toca na coleção de eventos do processo. A busca carrega os últimos eventos da página inteira numa consulta só, e os cartões nunca carregam nada sob demanda. Sem essas props, o cartão lê o primeiro evento da coleção (a mais recente) |
| `Timeline` | classe | `events: list<CaseEvent>`, `emptyMessage` | `<ol>` agrupada por data; cada item tem `data-event-type`, `data-event-label` (rótulo em português, usado pelo filtro) e ícone por tipo |
| `DataTable` | classe | `columns`, `rows`, `sort`, `direction`, `caption`, `anchor`, `emptyMessage` | Ordenação no servidor por links com query string (só colunas com `sortable`), com `Collator` `pt_BR` e números no texto pelo valor. Opções de coluna: `sortable`, `format` (`date`, `datetime`, `bytes`, `brl`, `label`) e `href` (chave da linha com a URL; a célula vira link). Cada `<td>` tem `data-label`; abaixo de `md` vira lista de cards só com CSS, e uma navegação "Ordenar por" repete os links de ordenação que o cabeçalho escondido levava |
| `DeadlineIndicator` | classe | `deadline: Deadline` | Usa `DeadlineCalculator` e `ClockInterface`; exibe "Vence em N dias úteis (dd/mm)" com a variante do estado |
| `Pagination` | classe | `page`, `pages`, `parameter` (padrão `pagina`), `label` (padrão "Paginação"), `anchor` (opcional) | `<nav>` com links entre páginas; nada é renderizado quando há uma página só. A página atual é limitada ao intervalo 1..`pages`, de modo que nenhum link aponta para fora, e aparece como texto com `aria-current="page"`. "Anterior" e "Próxima" só existem quando há para onde ir. Até 7 páginas, mostra todas; acima disso, mostra a primeira, a última e as vizinhas da atual, com reticências (ocultas para leitores de tela) quando ficam duas ou mais páginas escondidas. Se ficaria escondida uma página só, mostra essa página em vez das reticências. Os links são relativos (`?…`), mantêm a query string da request (só o `parameter` muda) e levam o `anchor`, quando há, para que a navegação continue na lista |

### 6.4 Extensão Twig e formulários

- Extensão Twig com filtros registrados por atributo (`#[AsTwigFilter]`):
  - `cnj`: formata um `CnjNumber` ou string de 20 dígitos.
  - `brl`: centavos → `R$ 1.234,56` via `NumberFormatter` (`pt_BR`).
  - `bytes`: tamanho de arquivo → `180 KB`, `1,5 MB` (uma casa decimal, `pt_BR`).
  - `label`: rótulo em português de um enum do processo (`EnumLabels`).
- Form theme `form/jus_theme.html.twig`, estendendo `bootstrap_5_layout.html.twig`, configurado globalmente. A ligação de acessibilidade é a nativa do Symfony: campos com erro recebem `aria-invalid="true"`, e `aria-describedby` aponta para a ajuda e para cada mensagem de erro.
- As mensagens da interface são em português: os textos da aplicação são escritos em pt-BR, e as mensagens do próprio Symfony (restrições de validação sem mensagem própria, CSRF) vêm do tradutor, com `pt_BR` como locale padrão e de fallback.
- `CnjNumberType` (form type): DataTransformer `string ↔ CnjNumber`; o bloco do tema renderiza o input nativo (o campo enviado, com rótulo, ajuda e erros do servidor) dentro de `<jus-numero-processo>`, que o aprimora no lugar (seção 6.5).
- `FilingFormType` (formulário de peticionamento, etapa 8 da seção 13): tipo (`EnumType` de `FilingType`, sem a petição inicial), descrição (até 2000 caracteres), arquivos (`FileType` múltiplo; cada arquivo `application/pdf` até 10 MB; de 1 a 5 arquivos), com o input de arquivos dentro de `<jus-upload max-size="10485760" max-files="5">` (seção 6.5).

### 6.5 Web Components

Os três componentes são Custom Elements puros, em `assets/components/`, registrados em `index.ts` por `define()`, que só chama `customElements.define` quando o nome está livre (carregar o bundle duas vezes não lança erro). São aprimoramento progressivo: sem JavaScript viram elementos desconhecidos e o controle nativo que cada um envolve (o input do número, a lista da timeline, o input de arquivos) funciona sozinho, com o servidor validando. O catálogo (seção 6.6) documenta atributos, comportamento e acessibilidade de cada um, com o exemplo vivo.

**Classe base `JusElement`:** `attachShadow({ mode: 'open' })` e `adoptedStyleSheets` com uma folha base compartilhada (constructable stylesheet, criada uma vez e adotada por todos os componentes) seguida das folhas do próprio componente (`styles()`, criadas com `sheet()`). A folha base traz `:host`, `[hidden]`, `.visually-hidden`, o botão `.jus-button` (com o estado `aria-pressed`) e o anel de foco; as cores e os espaços vêm só de `var(--jus-*)`, e um teste confere que não há cor literal e que os tokens usados são os que a página define. Usam a classe base os componentes que desenham controles próprios: `<jus-filtro-timeline>` e `<jus-upload>`.

**`<jus-numero-processo>`**
- Aprimora, **no próprio lugar**, o `<input>` nativo que o form theme renderiza dentro do elemento. Não usa Shadow DOM nem `ElementInternals`, ou seja, não é um campo form-associated que assume o lugar do input: o input do servidor já é acessível (rótulo, ajuda e erros ligados por `aria-describedby`) e já é o campo enviado. Assim nada é duplicado, não há segundo campo para sincronizar nem input para desabilitar, e nada depende do JavaScript: sem ele, o input e a validação do servidor continuam iguais.
- Máscara do número CNJ (`maskPartial`, de `shared/cnj.ts`) ao digitar, colar ou apagar: só dígitos, no máximo 20, e cada separador entra quando um dígito vem depois dele. Não define `maxlength`; a máscara é o limite. O cursor é preservado: continua depois dos mesmos dígitos, e um Backspace ou Delete que apaga um separador passa por cima dele, para que o apagamento seguinte alcance o dígito. Ao conectar, o valor renderizado pelo servidor também é mascarado, a não ser que tenha algo além de dígitos e separadores ou mais de 20 dígitos (uma entrada recusada, devolvida pelo servidor, fica como o servidor a devolveu).
- Validação nativa: o componente chama `setCustomValidity` com "Informe os 20 dígitos do número do processo." (incompleto) ou "Dígito verificador inválido." (`assessCnj`, da mesma regra do PHP). Um campo vazio fica por conta do `required`, e um opcional vazio é válido. O navegador mostra a mensagem e barra o envio; o servidor continua validando.
- Estado inválido e motivo em texto: o componente só marca e escreve o motivo do erro que é dele (`validity.customError`: número incompleto ou dígito verificador inválido); um estado nativo, como um `required` vazio, fica com o navegador. Quando a pessoa sai do campo (`blur`) com um número assim, o input recebe `aria-invalid="true"` e a classe `is-invalid` do Bootstrap, sempre juntos (`setInvalid`, em `shared/validity.ts`), e o motivo aparece como texto num `div.invalid-feedback.d-block` logo depois do elemento, onde o Symfony renderiza os erros do servidor (`setFieldError`, no mesmo arquivo). O bloco tem o id `<id do input>-client-error`, que entra no `aria-describedby` do input enquanto houver mensagem, e assim o motivo não fica só na cor da borda nem no balão do navegador (WCAG 3.3.1). Quando o navegador declara o campo inválido ao enviar ou conferir o formulário (`invalid`), o campo é marcado em qualquer estado inválido, mas o texto só é escrito para o erro do componente: um `required` vazio é marcado sem texto, e não é marcado ao sair do campo. Nada é marcado enquanto a pessoa ainda digita; com o campo já marcado, o texto acompanha o número e diz o que falta agora. As marcas e o texto saem assim que o número é válido ou que o campo opcional fica vazio, a marca que o servidor renderizou inclusive; enquanto o valor continua inválido, a do servidor permanece.
- Erros do servidor: o form theme os renderiza como blocos `.invalid-feedback` cujos ids (`<id>_error1`) estão no `aria-describedby` do input. Eles descrevem o valor enviado, não o atual, então no primeiro `input` depois do carregamento (`retireServerErrors`) recebem `hidden` (e perdem a classe `d-block`, que sozinha venceria o `hidden`) e saem do `aria-describedby`; a ajuda fica. Ao conectar, nada neles é alterado.
- Ao limpar o formulário (`reset`), o valor padrão é mascarado e conferido de novo.

**`<jus-filtro-timeline>`**
- Envolve a `<twig:Timeline>` já renderizada, que continua no light DOM e aparece num `<slot>` do Shadow DOM. Não tem atributos nem propriedades: lê o `data-event-type` e o `data-event-label` de cada `.jus-timeline-event` (os rótulos vêm do servidor).
- Cria no Shadow DOM um grupo nomeado (`role="group"`, "Filtrar movimentações por tipo") com o botão "Todas" e um botão por tipo presente, na ordem da primeira aparição, cada um com `aria-pressed`. Os botões só existem quando há dois ou mais tipos para escolher.
- Seleção única: um tipo por vez, e "Todas" mostra tudo. Os eventos dos outros tipos recebem o atributo `hidden` (nunca são removidos) e o dia que fica sem eventos visíveis some com o seu título. A folha da própria timeline também esconde `.jus-timeline-event[hidden]`, porque o `display` dos eventos venceria o `[hidden]` do navegador. Sem JavaScript, a lista inteira aparece.
- O resultado é anunciado numa região `aria-live="polite"` visualmente oculta ("Mostrando 1 de 4 movimentações." ou "Mostrando todas as 4 movimentações."), nunca ao carregar a página nem ao escolher de novo o botão já pressionado.
- A lista é lida ao conectar e de novo quando é trocada (`slotchange`): os botões são refeitos se os tipos mudaram (e mantidos, com o foco, se são os mesmos), a escolha é mantida enquanto o tipo existe e volta para "Todas" quando ele some ou quando sobra um tipo só.

**`<jus-upload>`**
- Envolve, num `<slot>`, o `<input type="file" multiple accept="application/pdf">` nativo, que continua visível, operável e sendo o campo enviado. O input é o único estado: a lista de arquivos é desenhada a partir de `input.files`. Hoje o elemento aparece no catálogo; entra no formulário de peticionamento na etapa 8 da seção 13.
- Atributos `max-files` (quantidade) e `max-size` (bytes, por arquivo): inteiros positivos; qualquer outro valor é ignorado e não há limite.
- Área de arrastar e soltar (que ganha borda contínua e fundo claro durante o arraste) e lista dos arquivos escolhidos, cada um com nome, tamanho (`formatBytes`, de `shared/bytes.ts`, igual ao filtro Twig `bytes`) e um botão "Remover" cujo nome acessível diz de qual arquivo se trata.
- Escolher no diálogo substitui a seleção, como no input sem o componente; soltar arquivos **soma** à seleção. Só PDFs entram (os outros são ignorados e anunciados), e um arquivo de mesmo nome e tamanho não entra duas vezes. Soltar e remover escrevem a lista nova no input com `DataTransfer` e disparam `input` e depois `change`, como o diálogo faz. Depois de remover, o foco vai para o próximo botão "Remover" ou, se não houver outro, para o input.
- Validação antecipada com `setCustomValidity` no próprio input, na ordem: mais arquivos que `max-files` ("Envie no máximo 5 arquivos."), arquivo maior que `max-size` ("O arquivo contrato.pdf passa do limite de 10 MB.") e arquivo que não é PDF ("Envie apenas arquivos PDF."; o `accept` só orienta o diálogo). A mensagem do componente marca o input (`aria-invalid` e `is-invalid`), é escrita como texto num `div.invalid-feedback.d-block` logo depois do elemento, no light DOM e não no Shadow DOM, para que o `aria-describedby` do input a alcance (o mesmo auxiliar `setFieldError` do campo de número, com o id `<id do input>-client-error`), e é anunciada depois da contagem ("6 arquivos selecionados. Envie no máximo 5 arquivos."); sai quando a escolha volta a ser válida, e mudar um atributo de limite atualiza ou tira, sem anunciar, um erro que já está à mostra. Os erros que o servidor renderizou descrevem o que foi enviado: na primeira mudança (`change`) da escolha são escondidos e saem do `aria-describedby` (`retireServerErrors`); ao conectar, não são tocados. O que o navegador diz por conta própria, como um `required` sem arquivo, fica com o navegador (balão no envio; o input é marcado, sem texto na página).
- Com o input desabilitado, ou dentro de um `fieldset` desabilitado, a soltura é ignorada (sem deixar o navegador abrir o arquivo no lugar da página) e os botões "Remover" ficam desabilitados.
- A validade personalizada do input é do componente: a página não deve passar mensagens próprias por `setCustomValidity` nele. Os erros do servidor são renderizados pelo form theme.
- Cada mudança é anunciada numa região `aria-live="polite"` ("3 arquivos selecionados."), nunca ao conectar; ao limpar o formulário a lista é refeita e só se anuncia quando havia algo nela.

### 6.6 Catálogo `/design-system`

- Página **pública** (sem login), para que qualquer visitante veja os componentes direto.
- Cada exemplo é um arquivo em `templates/design_system/examples/<componente>/<exemplo>.html.twig`.
- A página renderiza o exemplo com `include()` e mostra o código-fonte do **mesmo arquivo** com `source()`, então a documentação não tem como divergir do código.
- Cada componente tem: descrição, tabela de props/atributos, exemplos de cada variante e notas de acessibilidade.

### 6.7 Acessibilidade

- Status nunca depende só de cor (sempre há texto).
- Timeline como lista ordenada; foco visível; tudo operável por teclado.
- Erros de formulário ligados aos campos por `aria-describedby`.
- Web Components: os controles são nativos (`input`, `button`), todos com nome acessível; os botões do filtro usam `aria-pressed`; os anúncios vão para regiões `aria-live="polite"` visualmente ocultas e só depois de uma ação, nunca ao carregar a página; o anel de foco vem dos tokens de foco; o estado inválido é `aria-invalid` junto com `is-invalid`, e o motivo (do número CNJ e do upload) é texto num bloco `invalid-feedback` ligado ao input por `aria-describedby`, não só cor; os erros do servidor, que descrevem o valor enviado, saem do `aria-describedby` na primeira mudança.
- O foco não se perde: ao remover um arquivo vai para o próximo botão "Remover" (ou para o input), ao fechar um alerta que o tinha vai para `main#conteudo`, e uma região rolável só é parada de Tab enquanto transborda (seção 6.2).
- Checagem com axe-core em todo teste de componente, com a paleta real dos tokens (seção 9).

## 7. Telas e rotas

| Método | Rota | Nome | Acesso |
|---|---|---|---|
| GET, POST | `/login` | `app_login` | público |
| GET | `/logout` | `app_logout` | autenticado, com token CSRF |
| GET | `/` | `app_home` | redireciona para `/processos` |
| GET | `/processos` | `case_search` | autenticado |
| GET | `/processos/{numero}` | `case_show` | `VIEW` (sem `VIEW`: 404) |
| GET, POST | `/processos/{numero}/peticionar` | `case_file` | `FILE` (sem `VIEW`: 404; com `VIEW` e sem `FILE`: 403) |
| GET | `/documentos/{id}` | `document_download` | `VIEW` no processo (sem `VIEW` no processo: 404) |
| GET | `/design-system` | `design_system` | público |

- O logout exige o token CSRF: o link "Sair" é gerado com `logout_path('main')`, e um `/logout` sem token responde 403 sem encerrar a sessão.
- `{numero}` usa o formato mascarado como forma canônica; o `CnjNumberValueResolver` aceita com ou sem máscara e responde 404 se o número for inválido, antes de consultar o banco.

**Consulta (`/processos`)**
- Formulário GET (`role="search"`) com parâmetros opcionais: `numero` (número CNJ, com ou sem máscara), `parte` (nome da parte, busca parcial sem diferenciar maiúsculas nem acentos), `status` e `pagina` (a partir de 1). Os filtros ficam na URL, que pode ser compartilhada e recarregada.
- Número CNJ inválido → erro ao lado do campo, na própria página (status 200, sem exceção). Com JavaScript, o `<jus-numero-processo>` antecipa a regra e o navegador barra o envio de um número incompleto ou de DV inválido; o servidor continua decidindo.
- Número válido que corresponde a um processo **que o usuário pode ver** → redireciona direto para `case_show`, na URL mascarada; os demais filtros (`parte`, `status`) são ignorados nesse redirect. Um `status` inválido mostra um erro ao lado do campo, na própria página, e não lista processos. Se o processo não existe ou é um sigiloso do qual o usuário não participa, a resposta é a mesma: "Nenhum processo encontrado." A busca nunca revela a existência de um processo sigiloso.
- Resultados: um `h2` com o total, os `<twig:CaseCard>` ordenados por `filedAt` decrescente (empate pelo maior id), 10 por página (Doctrine Paginator) e a `<twig:Pagination>` com os filtros preservados; sem resultados, um `<twig:Alert>` com o estado vazio. Um nome de parte sem nada pesquisável (só um acento, por exemplo) não encontra ninguém, em vez de listar tudo.
- `pagina` malformada (texto, vazia, decimal, lista) vale a primeira página; além da última, a resposta é um redirect para a última página, com os demais parâmetros.
- Número fixo de consultas, qualquer que seja o tamanho da página, para uma página **com resultados**: 5 (atualização do usuário, contagem e ids do paginador, processos com partes, últimas movimentações). Um teste confere. Sem resultados rodam menos: 3 (atualização do usuário, contagem e ids do paginador) ou, com o filtro `numero`, 4 (a consulta do processo por número entra antes); com um filtro inválido, só a atualização do usuário.

**Processo (`/processos/{numero}`)**
- Número sem máscara → redirect 301 para a URL mascarada, mantendo a query string (`aba`, `sort`, `direction`). Número inválido ou sem processo → 404, e o número digitado nunca é repetido na página. Sigiloso de outro advogado → o mesmo 404 e a mesma página, sem dado algum do processo: nada diferencia um sigiloso que o usuário não pode ver de um número que não existe (seção 8).
- Capa: número, classe, assunto, órgão julgador, valor da causa (`|brl`), data de distribuição, selo "Sigiloso" e `<twig:StatusBadge>`.
- Partes por polo: "Polo ativo" e depois "Polo passivo", na ordem em que as partes foram cadastradas, cada polo com um `h3` e cada parte como `h4` (o `h2` é "Partes"), com advogados (nome e OAB) ou "Sem advogado constituído." Um polo sem partes mostra "—" (com o texto "Nenhuma parte." oculto, para leitores de tela).
- Prazos com `<twig:DeadlineIndicator>`: os em aberto primeiro (por vencimento), depois os cumpridos.
- Abas por link, `?aba=movimentacoes|documentos#andamento`, com `aria-current="page"` na ativa: só o painel ativo é renderizado, então funcionam sem JavaScript. Movimentações (`<twig:Timeline>` dentro de `<jus-filtro-timeline>`, que acrescenta o filtro por tipo e, sem JavaScript, não faz nada) e Documentos (`<twig:DataTable>`, colunas título, tipo, data e tamanho; a ordenação por `sort` e `direction` mantém a aba, e o link de download entra na etapa 8 da seção 13). `aba`, `sort` ou `direction` desconhecidos ou malformados caem nos valores padrão (Movimentações, ordem natural), sem erro.
- Número fixo de consultas: 3 (atualização do usuário, o processo com tudo o que possui, os prazos), em qualquer aba. Um teste confere.
- Botão "Peticionar" visível apenas com permissão `FILE`; chega junto com o peticionamento, na etapa 8 da seção 13.

**Peticionamento (`/processos/{numero}/peticionar`)**
- Formulário `FilingFormType`. Em caso de sucesso: `FilingService`, mensagem flash de sucesso e redirect para `case_show` (padrão PRG).

**Dados fictícios (fixtures)**
- 4 usuários de teste, todos com a senha `jus-demo`: os advogados (`ROLE_LAWYER`) `advogado@jus.test` (Ana Ribeiro), `advogada2@jus.test` (Carla Mendes) e `advogado3@jus.test` (Bruno Teixeira), e o servidor (`ROLE_CLERK`) `servidor@jus.test` (João Almeida).
- 30 processos com todos os status, 3 deles sigilosos, com partes, movimentações e documentos (usando `tests/fixtures/sample.pdf`).
- Toda parte tem advogado: o polo ativo é representado por Ana, exceto em um a cada três processos (Bruno), e o polo passivo por Carla. Assim Ana não atua em todos os processos e não vê os sigilosos em que não atua.
- Petições e documentos vêm sempre do advogado de uma das partes.
- As datas caem em dias úteis forenses (sem fins de semana, feriados nem recesso) e seguem a ordem do processo: distribuição, despacho, decisão e, depois, intimação.
- Prazos gerados **relativos à data atual** e só em processos em andamento (`ACTIVE`), para que a demo mostre todos os estados de urgência que o calendário permite; "vence hoje" só aparece quando a data atual é dia útil.

## 8. Tratamento de erros

| Situação | Comportamento |
|---|---|
| URL que não existe | 404 "Página não encontrada", também para visitantes (o roteador responde antes do login) |
| Número CNJ inválido na URL | 404 pelo ValueResolver, antes de consultar o banco; o número não é repetido na página |
| Número CNJ válido, sem máscara, na URL | Redirect 301 para a URL mascarada |
| Número CNJ válido sem processo na URL | 404 "Página não encontrada" (a mesma página) |
| Número CNJ inválido na busca | Erro no campo do formulário, sem exceção |
| Número válido não encontrado na busca (ou sigiloso de outro advogado) | Estado vazio "Nenhum processo encontrado." |
| Sigiloso de outro advogado na URL | 404 "Página não encontrada", a mesma página de um número inexistente: o sistema nunca revela que um processo sigiloso existe |
| Ação que o usuário não pode executar num processo que **pode ver** (depois: peticionar com `VIEW` e sem `FILE`) ou ação recusada pelo sistema (hoje: o logout sem token CSRF) | 403 "Acesso negado", sem detalhes da exceção. Quem não tem `VIEW` nunca chega ao 403: recebe o 404 da linha acima, em qualquer rota do processo |
| Não autenticado | Redirect para `/login`, nas rotas que existem |
| `pagina`, `aba`, `sort` ou `direction` malformados | Valor padrão, sem erro |
| `pagina` além da última página | Redirect para a última página |
| Upload inválido | Erros do formulário via form theme (com JavaScript, o `<jus-upload>` antecipa no navegador os limites e o tipo PDF) |
| Falha ao gravar petição | Rollback + remoção dos arquivos (seção 5.6) |
| JS não carrega ou falha | Elementos nativos continuam funcionando |
| Erro inesperado (500) e demais códigos | Página "Algo deu errado"; detalhes só no log |

**Páginas de erro**
- Ficam em `templates/bundles/TwigBundle/Exception/` (`error404`, `error403` e `error`, a página dos demais códigos), estendem `base.html.twig` e usam o layout do Design System, em português. Com `APP_DEBUG` ligado, o Symfony mostra a própria página de depuração; as do projeto são as que o visitante vê em produção.
- Cada página tem um `h1`, um texto curto e um caminho de volta:

| Código | `h1` | Caminho de volta |
|---|---|---|
| 404 | Página não encontrada | "Ir para a busca" (logado) ou "Entrar" (visitante) |
| 403 | Acesso negado | "Ir para a busca" |
| demais (500, 405…) | Algo deu errado | "Voltar ao início" |

- As páginas não mostram a mensagem da exceção, o texto do status HTTP, a pilha de chamadas nem a URL pedida; o detalhe só vai para o log. Os testes conferem isso com `debug` desligado: uma URL inexistente, um número de processo inválido, um número válido sem processo, um sigiloso de outro advogado (a mesma página do inexistente), o logout sem token (403), um 405 e a página genérica renderizada sem request.
- Um 404 de rota inexistente é respondido pelo roteador antes de o firewall rodar. Nesse caso a página não conhece o usuário: a barra de navegação e o botão mostram "Entrar", mesmo para quem está logado (o login manda quem já entrou de volta para a busca). Os 404 e 403 lançados dentro de uma rota ou do firewall, como o 404 da página do processo e o 403 do logout sem token, já conhecem o usuário.

## 9. Testes

**PHPUnit — Unit (`tests/Unit/`)**
- `CnjNumber` com `tests/fixtures/cnj-numbers.json`.
- `DeadlineCalculator`: fim de semana, feriado fixo, feriados móveis, recesso, virada de ano, fusos diferentes.
- `Easter`: anos de referência, incluindo os que exercitam a correção do algoritmo.
- `LegalCaseVoter`: todas as combinações da tabela 5.5.
- `FilingService`: rollback remove os arquivos gravados.

**PHPUnit — Component (`tests/Component/`)**
- Cada Twig Component com `InteractsWithTwigComponents`: variantes, HTML e atributos ARIA.
- `DeadlineIndicator` com `MockClock` para cada estado de urgência.

**PHPUnit — Integration (`tests/Integration/`)**
- Visibilidade: para servidor, advogado do polo ativo, advogado do polo passivo e advogado sem relação, em processo público e sigiloso, a busca e a consulta por número decidem exatamente como o `VIEW` do Voter (seção 5.5).

**PHPUnit — Functional (`tests/Functional/`, `WebTestCase`)**
- Login e logout; busca (filtros, redirect por número exato, filtro de sigilosos, paginação com parâmetros malformados); página do processo (200, 404 para número inválido, inexistente ou sigiloso de outro advogado, partes por polo, abas e ordenação sem JavaScript); páginas de erro com `debug` desligado; peticionamento completo com upload; download com e sem permissão; catálogo público.
- O número de consultas de cada tela é fixo e verificado com `QueryRecorder`: 5 na busca (com 10 cartões, metade sem movimentações) e 3 na página do processo, em qualquer aba.

**Vitest 5 em modo browser (Playwright)**
- Localmente os testes rodam no Google Chrome instalado (canal `chrome` do Playwright), sem baixar navegador; no CI (variável `CI` ou `TF_BUILD`) rodam no Chromium do Playwright, que o pipeline instala. A configuração está em `vitest.config.ts`, e `npm test` é o comando nos dois casos.
- `shared/cnj.ts` com o mesmo JSON do PHPUnit, inclusive os 25 pontos de código que o `trim()` do JavaScript remove (seção 5.3); `shared/bytes.ts` com os mesmos casos do filtro Twig `bytes`; `shared/validity.ts`.
- Cada Web Component: comportamento, integração com o `<form>` (envio, validação nativa, `reset`), foco, ciclo de vida (mover, remover da página, reconectar) e acessibilidade. Os comportamentos de layout são testados com o Bootstrap e o `ResizeObserver` reais.
- **axe-core em todo teste de componente**, com a paleta real: `installTokens()` (`test-support/tokens.ts`) compila o `_custom-properties.scss` com os mesmos arquivos Sass da página e o coloca no documento, de modo que o contraste é medido com os tokens verdadeiros e os testes não mantêm uma segunda cópia da paleta. `expectNoAxeViolations()` (`test-support/axe.ts`) falha listando a regra e o seletor de cada violação, também dentro de um Shadow DOM.
- Motivo do modo browser: os componentes dependem de APIs reais do navegador (`DataTransfer`, `ResizeObserver`, constructable stylesheets, validação nativa de formulário, foco e ordem de Tab), que o jsdom não implementa ou só simula em parte; um teste com mocks destas APIs não provaria nada (ADR 0005).
- O ESLint roda com o `strictTypeChecked` do typescript-eslint sobre todo o TypeScript do repositório, testes inclusive; sem `any`, `@ts-ignore` nem `eslint-disable`.

**Meta de cobertura:** 100% de linhas em `src/Domain/`; no restante, cobertura por fluxos.

## 10. Qualidade e CI

`azure-pipelines.yml`, executado em push e PR para `main`, agente `ubuntu-latest`:

```
Stage Quality
  job PHP quality:        PHP 8.4 + composer install, composer validate --strict, php-cs-fixer --dry-run,
                          lints (container, YAML, Twig, schema do Doctrine), phpstan
  job Front-end quality:  npm ci, npm run ci:quality
                          (eslint, stylelint, tsc --noEmit, build de produção do Encore)
Stage Test (depois do Quality)
  job PHPUnit:            phpunit com cobertura (SQLite), src/Domain com 100%
  job Web Components:     npm ci, playwright install --with-deps chromium, npm test
                          (Vitest em modo browser, axe-core incluído)
```

- O job "Web Components" é o único que precisa de navegador: instala o Chromium do Playwright e roda `npm test`, que no pipeline (`TF_BUILD` definida) usa esse Chromium. O job de qualidade do front-end roda `npm run ci:quality`, a mesma sequência de `npm run ci` sem os testes.
- Localmente, `composer ci` reúne as verificações dos dois estágios, com `npm run ci` (lint, tipos, testes no Chrome instalado e build) no fim.
- PHPStan no nível max **sem baseline** e sem `ignoreErrors`. A única exceção de configuração é tirar da análise os stubs dos polyfills `intl` do Symfony (`vendor/symfony/polyfill-intl-*/Resources/stubs/`): o projeto exige a extensão `intl`, e esses stubs em PHP puro, no classmap do Composer, esconderiam dela os tipos reais (por exemplo, `NumberFormatter::formatCurrency()` como `string|false`).
- O repositório fica no GitHub (público) com o Azure Pipelines conectado; o badge de status vai no README.

## 11. Documentação e fluxo de Git

- **README (pt-BR):** o que é, prints de desktop e celular, como rodar (seção 3.3), usuários de teste, destaques técnicos e links para ADRs e diagramas.
- **Diagramas Mermaid (`docs/diagrams/`):** contexto e containers, entidades, sequência do peticionamento.
- **Código e commits em inglês**; interface e documentação em português.
- **Git:** Conventional Commits; uma branch e um PR por funcionalidade.

## 12. Decisões a registrar (ADRs)

| ADR | Decisão |
|---|---|
| 0001 | Abordagem híbrida: Twig Components + Web Components |
| 0002 | Design tokens como CSS custom properties para atravessar o Shadow DOM |
| 0003 | Webpack Encore em vez de AssetMapper |
| 0004 | Servidor como fonte da verdade; regra CNJ duplicada com contrato de testes compartilhado; prazo só no servidor |
| 0005 | Vitest em modo browser para Web Components: os componentes dependem de APIs reais do navegador (`DataTransfer`, `ResizeObserver`, constructable stylesheets, validação nativa, foco), que o jsdom não cobre |
| 0006 | SQLite como banco padrão |
| 0007 | Campo do número CNJ: aprimorar o input nativo em vez de assumir o campo por Shadow DOM (sem `ElementInternals`) |

## 13. Ordem de implementação

1. Ambiente, esqueleto Symfony, ferramentas de qualidade e pipeline.
2. Domínio com TDD: `CnjNumber`, `Easter`, `NationalHolidayCalendar`, `DeadlineCalculator`.
3. Entidades, tipo Doctrine, migrations, fixtures, login e Voter.
4. Encore, tokens, layout base, form theme, extensão Twig e catálogo `/design-system`.
5. Twig Components.
6. Telas de consulta e processo.
7. Web Components (classe base + 3 componentes) e comportamentos de layout.
8. Peticionamento (`FilingService`, `DocumentStorage`, download).
9. Páginas de erro e revisão de acessibilidade.
10. README, ADRs e diagramas.

## 14. Critérios de aceite

1. Clone limpo roda com os comandos da seção 3.3 (PHP 8.4 + Node 24).
2. Login, 3 telas e catálogo funcionam em 375 px de largura sem rolagem horizontal e em desktop.
3. Com JavaScript desativado, consulta, visualização e peticionamento continuam funcionando.
4. Pipeline do Azure DevOps verde em todas as etapas.
5. PHPStan nível max sem erros e sem baseline.
6. 100% de cobertura de linhas em `src/Domain/`.
7. Nenhuma violação do axe-core nos testes dos Web Components.
8. README, 7 ADRs e 3 diagramas publicados.
