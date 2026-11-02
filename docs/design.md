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
| Documentos | PDFs em disco, fora de `public/`, com nome UUID v7 (Symfony Uid) e cópia pelo Symfony Filesystem (seção 5.6) |
| Front-end | Webpack Encore, TypeScript, Sass, Bootstrap 5.3, Custom Elements puros (sem biblioteca de componentes) |
| Testes | PHPUnit, Vitest 5 em modo browser (Playwright: Chrome instalado localmente, Chromium no CI), axe-core |
| Qualidade | PHPStan (nível max + extensões Symfony/Doctrine), PHP-CS-Fixer (`@Symfony`), ESLint (typescript-eslint `strictTypeChecked`), Stylelint, `tsc --noEmit` |
| Dados fictícios | DoctrineFixturesBundle + Faker (`pt_BR`) |

### 3.2 Ambiente de desenvolvimento

- PHP 8.4 (x64) com as extensões `intl`, `pdo_sqlite`, `sqlite3`, `fileinfo`, `mbstring`, `openssl`, `curl`, `zip`.
- Composer 2, Git e Node.js 24 LTS.
- Google Chrome instalado: `npm test` (e, portanto, `composer ci`) roda os testes do front-end nele, em modo headless, e não baixa navegador nenhum. No CI o pipeline instala o Chromium do Playwright (seção 10).
- Servidor de desenvolvimento: o servidor embutido do PHP, com os limites de upload da seção 3.3 (Symfony CLI é opcional).
- Um `Dockerfile` não faz parte do MVP; o ambiente é reproduzível pelas instruções do README e pelo CI.

### 3.3 Como rodar (meta do README)

```bash
composer install
npm ci && npm run build
composer setup        # cria o banco SQLite, roda migrations e carrega fixtures (e os PDFs dos documentos de exemplo)
php -d upload_max_filesize=10M -d post_max_size=60M -S localhost:8000 -t public
```

**Limites de upload do PHP.** O peticionamento aceita até 5 PDFs de 10 MB cada (seção 6.4), e os padrões do PHP são menores (2 MB por arquivo e 8 MB por requisição). Por isso o comando acima passa os limites com `-d`, e quem usar outro `php.ini` ou outro servidor precisa de valores equivalentes:

- `upload_max_filesize` de pelo menos `10M`, o tamanho de um arquivo (10M são exatamente os 10 MB que a aplicação aceita);
- `post_max_size` grande o bastante para 5 × 10 MB mais os campos do formulário (`60M`).

Com limites menores nada quebra: um arquivo acima do `upload_max_filesize` recebe o erro "O arquivo é muito grande…" e uma requisição acima do `post_max_size` recebe o aviso da seção 8. Mas um envio que o formulário anuncia como permitido seria recusado.

**Diretório dos documentos.** Os PDFs ficam em `var/uploads/<ambiente>/` (parâmetro `app.documents_dir`, em `config/services.yaml`), fora de `public/` e fora do Git; cada ambiente tem o seu, para que os testes nunca toquem os arquivos de desenvolvimento. Quem grava primeiro cria o diretório (o `composer setup`, ao carregar as fixtures, ou o servidor web, no primeiro peticionamento), com o modo `0750`: o dono lê e escreve, o grupo só lê e entra, e os demais não têm acesso (a umask do processo só pode restringir mais; no Windows o modo é ignorado). Numa implantação em servidor:

- o processo web precisa poder **escrever** nesse diretório (para peticionar) e ler (para os downloads);
- o modo `0750` supõe que o CLI que carrega as fixtures e o processo web rodem com o mesmo usuário. Com usuários diferentes, o diretório precisa de um grupo em comum com permissão de escrita (por exemplo, `chmod 2770`), que o `0750` não dá;
- recarregar as fixtures apaga o banco e também os PDFs do diretório (seção 7), então os dois andam juntos.

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
  EventListener/           # SecurityHeadersListener: os cabeçalhos de segurança de toda resposta
  Filing/                  # peticionamento: FilingService, DocumentStorage (a única classe que toca o disco), StoredDocument e FilingLimits (os limites de um envio, em um lugar só)
  Form/                    # form types (CnjNumberType, CaseSearchType, FilingFormType, UploadType), FilingData (o que o formulário de peticionamento coleta) e transformers
  Presentation/            # EnumLabels (rótulos em português dos enums), CaseDeadlines e CaseDocumentsTable (dados da página do processo)
  DesignSystem/            # SampleData: entidades em memória para o catálogo /design-system
  Repository/
  Security/                # LegalCaseVoter
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
  case/                    # busca (search), página do processo (show) e peticionamento (file)
  security/                # login
  bundles/TwigBundle/Exception/   # error403, error404, error
assets/
  app.ts                   # entrada do Encore: estilos, Bootstrap (alert, offcanvas, tab), Web Components e comportamentos de layout
  styles/
    tokens/                # _tokens.scss, _bootstrap-config.scss, _custom-properties.scss
    base/                  # _focus.scss: anel de foco do teclado
    components/            # estilos próprios dos componentes (_timeline.scss, _data-table.scss, _case-card.scss)
    app.scss
  components/              # os Web Components; cada arquivo tem um .test.ts ao lado, menos o index.ts (que só registra)
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
    alert-focus.ts         # foco no alvo mais próximo depois de fechar um alerta
    scroll-regions.ts      # região rolável só é parada de Tab enquanto transborda
    submit-once.ts         # formulário marcado com data-jus-submit-once não é enviado duas vezes
    index.ts               # instala os três quando o documento está pronto
  test-support/            # ajudas dos testes: axe.ts (axe-core), tokens.ts (paleta real), required.ts
tests/
  Unit/                    # domínio, entidades, voter, form types, extensão Twig e o listener de cabeçalhos, sem kernel
  Component/               # Twig Components renderizados (InteractsWithTwigComponents)
  Integration/             # kernel e banco: persistência, busca (inclusive a paridade de visibilidade com o Voter), peticionamento (FilingService, DocumentStorage, FilingData), fixtures, form theme, filtros, mensagens em pt-BR
  Functional/              # requests HTTP: login, layout, catálogo, busca, página do processo, peticionamento, download, páginas de erro, cabeçalhos de segurança
  Support/                 # TestCases (usuários e processos de teste), QueryRecorder (conta as consultas SQL)
  fixtures/cnj-numbers.json    # casos compartilhados entre PHPUnit e Vitest
  fixtures/sample.pdf          # PDF mínimo (menos de 2 KB): o arquivo dos testes de envio e download e dos documentos das fixtures de demonstração
var/
  uploads/<env>/           # os PDFs dos documentos, um diretório por ambiente (seção 3.3): fora de public/ e do Git
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

Toda resposta da requisição principal passa pelo `SecurityHeadersListener` (`kernel.response`) antes de sair, e leva quatro cabeçalhos: `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY` e `Content-Security-Policy: frame-ancestors 'none'` (a política tem só essa diretiva: nenhuma regra de script ou de estilo, que seria uma decisão à parte). O que a resposta já definiu não é sobrescrito: o download, por exemplo, define o próprio `X-Content-Type-Options`. Páginas, redirects, páginas de erro e o download levam os mesmos cabeçalhos; testes funcionais conferem uma amostra de cada um.

## 5. Domínio

### 5.1 Entidades

| Entidade | Campos principais |
|---|---|
| `User` | email, name, password (hash), roles, oabNumber (nullable) |
| `LegalCase` | number (`CnjNumber`, único), caseClass, subject, court, status (`CaseStatus`), confidential (bool), claimValueInCents (int), filedAt, parties, events |
| `Party` | legalCase, name, searchName (nome normalizado para a busca), taxId (fictício), side (`PartySide`), lawyers (ManyToMany `User`) |
| `CaseEvent` | legalCase, type (`EventType`), description, occurredAt, createdBy (nullable), filingType (`FilingType`, nullable; só nas juntadas de petição, e obrigatório nelas), documents |
| `Document` | event, title, originalFilename (o nome com que o arquivo foi enviado), storedFilename (UUID v7 + `.pdf`, único; o nome em disco), sizeInBytes, uploadedBy, uploadedAt |
| `Deadline` | party, summons (`CaseEvent` do tipo intimação), startDate, businessDays, fulfilledAt (nullable) |

```
User ──(advogado de)──► Party ◄── LegalCase ──► CaseEvent ──► Document
                          │
                          └──► Deadline (gerado por uma intimação)
```

As entidades Doctrine (`User`, `LegalCase`, `Party`, `CaseEvent`, `Document` e `Deadline`) ficam em `src/Entity/`, seguindo a convenção do Symfony. Assim `src/Domain/` continua PHP puro, sem Doctrine, e pode manter 100% de cobertura de linhas.

As regras que o modelo não deixa quebrar ficam nas próprias entidades (quem as viola recebe uma `\InvalidArgumentException`):

- `LegalCase::file()` registra uma petição e grava o tipo dela no `CaseEvent`. Exige um advogado que represente alguma parte do processo, e só aceita a petição inicial enquanto o processo não tem nenhuma movimentação (é ela que o abre). As demais movimentações usam `LegalCase::record()`.
- `CaseEvent`: só a juntada de petição (`FILING`) tem tipo de petição, e toda juntada tem. Por isso `record()` recusa uma juntada, e as petições só entram por `file()`. `CaseEvent::attach()` cria os `Document` da movimentação.
- `Deadline`: nasce de uma intimação (`SUMMONS`) do mesmo processo da parte e com pelo menos um dia útil. `Deadline::fulfil()` recusa um momento anterior ao início do prazo e, se o prazo já foi cumprido, mantém a primeira data.
- `Party::addLawyer()` só aceita usuário com perfil de advogado (e ignora um advogado que a parte já tem).

`Party.searchName` é o nome sem acentos, em minúsculas e com espaços simples (`SearchText::normalize()`, em `src/Domain/Text/`), calculado no construtor. Existe porque o SQLite só ignora maiúsculas nas letras ASCII (`LIKE` e `lower()`) e nunca ignora acentos: a busca por nome de parte compara o termo, normalizado do mesmo jeito, com esse campo, e "joao" encontra "João".

As coleções do processo já vêm ordenadas pelo mapeamento: partes por id, movimentações da mais recente para a mais antiga (empate pelo maior id) e advogados da parte por nome. Por isso a primeira movimentação da coleção é sempre a última.

### 5.2 Enums

- `CaseStatus`: `ACTIVE` (em andamento), `SUSPENDED` (suspenso), `ARCHIVED` (arquivado).
- `PartySide`: `PLAINTIFF` (polo ativo), `DEFENDANT` (polo passivo).
- `EventType`: `DECISION` (decisão), `ORDER` (despacho), `FILING` (juntada de petição), `SUMMONS` (intimação), `HEARING` (audiência).
- `FilingType`: `INITIAL_PETITION` (petição inicial — usada na distribuição, nunca oferecida no formulário de peticionamento e recusada pelo domínio depois da primeira movimentação, seção 5.1), `STATEMENT` (manifestação), `ANSWER` (contestação), `APPEAL` (recurso), `EXHIBITS` (juntada de documentos).

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
- A data de vencimento é sempre **calculada**, nunca armazenada. Quem preenche `fulfilledAt` (o cumprimento) é o peticionamento (seção 5.6).
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

- O download de documento exige `VIEW` no processo do documento, e só `VIEW`: quem vê o processo baixa os documentos, inclusive o servidor e o advogado que não representa nenhuma parte de um processo público.
- **Uma regra para toda rota de um processo** (a página, o peticionamento e o download de documento): quem não tem `VIEW` recebe o mesmo 404 de um número inexistente ou inválido. O 403 só vale quando o usuário **pode ver** o processo mas não pode agir sobre ele: `FILE` num processo arquivado, num processo público em que ele não representa nenhuma parte, ou o servidor, que vê tudo mas nunca peticiona. Por isso a checagem vem em duas etapas: primeiro `VIEW` (404), depois `FILE` (403). Se o 403 viesse antes, ou no lugar do 404, a resposta revelaria que o processo sigiloso existe (quem não vê o processo também não tem `FILE`). A página do processo, o peticionamento (em `GET` e em `POST`) e o download seguem essa ordem, e os testes de cada rota conferem que a resposta a quem não vê o processo é a mesma de um número ou documento que não existe. No peticionamento a checagem vem antes de o formulário ser construído ou a requisição ser lida.
- A busca aplica a regra do `VIEW` **na própria consulta ao banco** (`LegalCaseRepository::onlyVisibleTo()`), sem passar pelo Voter, e um teste de integração mantém as duas iguais: para servidor, advogado de cada polo e advogado sem relação, em processo público e sigiloso, a busca e a consulta por número decidem como o Voter.
- A página do processo carrega o processo e então consulta o Voter. Quem não pode ver um sigiloso recebe 404, exatamente como para um número inexistente ou inválido: o sistema nunca revela que um processo sigiloso existe (seção 8).

### 5.6 Peticionamento (`FilingService`)

`FilingService::file(processo, advogado, tipo, descrição, arquivos)` só roda depois de duas decisões que não são dele: quem pode peticionar (o Voter, seção 5.5) e o que cada arquivo precisa ser (tipo, tamanho e quantidade, no formulário, seção 6.4). O domínio ainda recusa o que lhe cabe (seção 5.1).

1. **Grava** cada PDF com o `DocumentStorage`, em `var/uploads/<ambiente>/` (fora de `public/`), com o nome `<uuid v7>.pdf`. Nenhum caminho vem do usuário. O `DocumentStorage` é a única classe que toca o disco: só copia de arquivo local (o `Filesystem::copy()` baixaria uma URL), cria o diretório com o modo `0750` e, se a cópia falha, não deixa arquivo pela metade. `pathOf()` só resolve um nome no formato exato `<uuid>.pdf` e que exista; qualquer outro (`../x.pdf`, por exemplo) é tratado como arquivo inexistente, o que torna a leitura imune a travessia de diretórios. O PDF original (o temporário do envio) é copiado, não movido.
2. **Em uma transação** (`wrapInTransaction`), com a hora do `ClockInterface`:
   - `LegalCase::file()` cria o `CaseEvent` `FILING` com o tipo, a descrição, o advogado e o momento;
   - `CaseEvent::attach()` cria um `Document` por arquivo, com o advogado como autor e o tamanho do arquivo gravado. O `originalFilename` é o nome que o navegador enviou (o `UploadedFile` já o reduz ao último segmento, sem diretórios), cortado em 255 caracteres, o tamanho da coluna. O `title` é esse nome sem espaços nas pontas e sem a extensão `.pdf` (em qualquer caixa), também cortado em 255, ou, se não sobrar nada (um arquivo chamado só `.pdf`), o rótulo do tipo da petição ("Contestação");
   - cada prazo **em aberto** das partes que o advogado representa no processo recebe `fulfil(agora)`: `fulfilledAt = agora`. Eles vêm de `DeadlineRepository::findOpenForLawyer()`, uma consulta que casa o advogado em SQL, sem carregar as partes nem os advogados, e que só traz os prazos que já começaram no momento da juntada (`startDate <= agora`): `Deadline::fulfil()` recusa um prazo que começa depois, e uma intimação com data no futuro não pode travar a petição com um erro 500; esse prazo continua em aberto. Os prazos da parte contrária, os de outros processos e os já cumpridos (que mantêm a data) não mudam.
3. **Se algo falhar** (um arquivo que não pode ser gravado, a recusa do domínio, um prazo que começa depois da petição ou o banco), os arquivos já gravados são removidos, o erro original é relançado (se a própria limpeza falhar, é ele que sobe) e nada fica no banco. Uma falha dentro da transação fecha o `EntityManager`, como o Doctrine faz ao desfazê-la, então quem chamou não o usa mais; uma falha no passo 1 acontece antes da transação e o deixa aberto. O controlador não tenta se recuperar: a exceção chega à página de erro 500 (seção 8).

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
- A navbar mostra "Processos" (só com login; marcado com `aria-current` em toda a seção de processos, inclusive nas páginas de um processo e do peticionamento) e "Design System", mais "Entrar" para visitantes ou o nome do usuário e "Sair" para quem está logado.
- Sem JavaScript o offcanvas não abre (quem o abre é um script do Bootstrap), e no celular os links da navbar ficariam fora de alcance. Um `<noscript><style>` no `<head>` de `base.html.twig` mostra então o painel onde ele está, como um bloco sob a marca, e esconde o botão que não faria nada (a partir de `md` o Bootstrap já mostra o painel em linha, ao lado da marca, e nunca o abre). A auditoria das páginas (seção 10.1) confere, com os scripts realmente desligados, que os links do menu estão dentro da janela a 375 px.
- As páginas de erro (seção 8) estendem o mesmo layout.
- Três pequenos comportamentos em JavaScript (`assets/behaviours/`, instalados quando o documento está pronto) cuidam do foco, da rolagem e do envio duplo; sem eles a página funciona do mesmo jeito:
  - **Foco depois de fechar um alerta.** Se o alerta dispensável (`<twig:Alert dismissible>`) tinha o foco, no botão de fechar ou num link da mensagem, o foco vai, quando ele some, para o alvo de foco mais próximo antes dele, em vez de cair no topo do documento e obrigar a percorrer o cabeçalho de novo. O alvo é o último elemento marcado com `data-jus-focus-target` (e com `tabindex`, `-1`: focável por script, fora da ordem de Tab) dentro de `main#conteudo` que vem antes do alerta (ou o contém) e está visível; se não há nenhum, é o próprio `main#conteudo`, que o layout marca, e é o caso das mensagens do alto da página. A marca é opt-in: só as páginas sabem em que lugares vale pousar, e um `tabindex="-1"` qualquer (o painel do menu, um item de lista com `tabindex` móvel) não é alvo. A confirmação de um peticionamento fica abaixo das abas do processo, que a página marca (`nav#andamento`): fechá-la leva o foco para as abas, onde o redirect tinha parado, e não para o alto da página. (Foi essa a escolha, em vez de tirar o `dismissible` da confirmação: a mensagem continua podendo ser dispensada, e qualquer outro alerta dentro de uma seção com alvo de foco ganha o mesmo comportamento.) O foco é lido, e o alvo escolhido, em `close.bs.alert`, e não em `closed.bs.alert`: o Bootstrap 5.3 dispara o segundo depois de remover o elemento, num nó que já saiu do documento. Se o alvo saiu da página enquanto o alerta esmaecia, o foco vai para `main#conteudo`. Se a pessoa levou o foco para outro lugar enquanto o alerta esmaecia, ele fica onde está.
  - **Regiões de rolagem.** O servidor renderiza `tabindex="0"` nas regiões marcadas com `data-jus-scroll-region` (`role="region"` com `aria-label`; hoje, as tabelas de referência do catálogo, com `overflow-y-hidden`, porque a legenda oculta ultrapassa a tabela em 1 px e faria de toda região uma rolagem vertical). O script (um `ResizeObserver` na região e no que ela contém) tira o `tabindex` das que cabem na largura e o devolve quando passam a transbordar (janela mais estreita, fonte maior, conteúdo novo): uma parada de Tab só existe onde há o que rolar. Uma região que está com o foco mantém o `tabindex` até perdê-lo.
  - **Envio uma vez só.** Num formulário marcado com `data-jus-submit-once` (hoje, o do peticionamento), um envio que chegou a acontecer (o navegador só dispara `submit` depois da sua própria validação, e nenhum tratador o cancelou) desabilita os botões de envio e marca o formulário com `aria-busy="true"`, para que um segundo clique não junte a mesma petição de novo enquanto os PDFs ainda sobem. Os botões são desabilitados numa tarefa logo depois do evento, não dentro dele: só ali já se sabe se alguém cancelou o envio, e o botão apertado ainda faz parte dos dados enviados. Quando a página volta do cache de avançar e voltar (`pageshow` com `persisted`), os botões que o comportamento desabilitou voltam a funcionar e o `aria-busy` sai. Um envio **abortado** (a pessoa interrompe o carregamento, ou a conexão cai antes da resposta) deixa os botões desabilitados até a página ser carregada de novo: o navegador não dispara evento algum para uma navegação abortada, e reabri-los depois de um tempo deixaria passar o segundo clique justamente no envio lento que o comportamento protege. É uma troca aceita: a pessoa carrega a página de novo e, como depois de qualquer envio interrompido, confere a linha do tempo do processo antes de peticionar outra vez (o servidor pode ter recebido tudo). Sem JavaScript o formulário é enviado como sempre.

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
- `FilingLimits` (`src/Filing/`) é a **fonte única** dos limites de um envio: no máximo 5 arquivos (`MAX_FILES`), 10 MB por arquivo (`MAX_FILE_SIZE`, em bytes, contados em 1024 × 1024, e `MAX_FILE_SIZE_IN_MEGABYTES`, para os textos), tipo `application/pdf` e descrição de até 2000 caracteres. As restrições de `FilingData`, as opções do campo de arquivos (os atributos do `<jus-upload>`), o `maxlength` da descrição e os textos de ajuda leem as mesmas constantes, então não têm como divergir. (A constante em megabytes é inteira: se o limite deixar de ser um número inteiro de megabytes, o PHP recusa a declaração.)
- `FilingFormType` (formulário de peticionamento, tela da seção 7) preenche um `FilingData`:
  - `type`: `EnumType` de `FilingType` sem a petição inicial, com os rótulos de `EnumLabels` e o item vazio "Selecione o tipo". É obrigatório ("Selecione o tipo da petição."); um valor fora da lista dá "Selecione um tipo de petição válido.".
  - `description`: textarea obrigatória, em que só espaços não valem ("Informe a descrição da petição."), de até 2000 caracteres ("A descrição passa do limite de 2000 caracteres."). O navegador também limita (`maxlength`), mas quem decide é o servidor. Uma quebra de linha vale um caractere nos dois lados: o navegador a conta como um e a envia como CR LF, e o Symfony a normaliza para LF antes de contar.
  - `files`: `UploadType`, um `FileType` múltiplo com `accept="application/pdf"` e as opções `max_files` e `max_size`, que o tema transforma nos atributos do `<jus-upload>`. No servidor, de 1 a 5 arquivos ("Anexe pelo menos um arquivo PDF.", "Envie no máximo 5 arquivos.") e, em cada um, até 10 MB (`O arquivo "contrato.pdf" passa do limite de 10 MB.`) e tipo PDF, conferido pelo **conteúdo** do arquivo, e não pelo nome nem pelo tipo que o navegador declarou ("Envie apenas arquivos PDF."). A ajuda do campo diz "Até 5 arquivos PDF, de até 10 MB cada.". As mensagens de quantidade, de tamanho e de tipo dizem o mesmo no servidor e no `<jus-upload>`, com o nome do arquivo entre aspas duplas, e os números vêm de `FilingLimits`.
  - Um arquivo acima do `upload_max_filesize` do PHP chega como erro de envio, sem conteúdo. A restrição `File` o relata com o limite do próprio servidor, escrito nas unidades de 1024 que o resto da página usa (`binaryFormat`), e não em "kB" de 1000: "O arquivo é muito grande. O tamanho máximo permitido é de 2 MiB.".
  - Uma requisição acima do `post_max_size` perde o corpo inteiro; a mensagem desse caso é a opção `post_max_size_message` do formulário (seção 7).
- `UploadType` e o bloco `upload_widget` do tema: o tema desenha o `<input type="file">` nativo (a classe `form-control`, a ajuda ligada por `aria-describedby`, os erros) dentro de `<jus-upload max-files="5" max-size="10485760">` (seção 6.5), com os valores vindos das opções do campo; sem a opção, o atributo não é escrito. Nenhum número do limite fica no tema. O formulário é `multipart/form-data` e leva o token CSRF.

### 6.5 Web Components

Os três componentes são Custom Elements puros, em `assets/components/`, registrados em `index.ts` por `define()`, que só chama `customElements.define` quando o nome está livre (carregar o bundle duas vezes não lança erro). São aprimoramento progressivo: sem JavaScript viram elementos desconhecidos e o controle nativo que cada um envolve (o input do número, a lista da timeline, o input de arquivos) funciona sozinho, com o servidor validando. O catálogo (seção 6.6) documenta atributos, comportamento e acessibilidade de cada um, com o exemplo vivo.

**Classe base `JusElement`:** `attachShadow({ mode: 'open' })` e `adoptedStyleSheets` com uma folha base compartilhada (constructable stylesheet, criada uma vez e adotada por todos os componentes) seguida das folhas do próprio componente (`styles()`, criadas com `sheet()`). A folha base traz `:host`, `[hidden]`, `.visually-hidden`, o botão `.jus-button` (borda na cor `muted`, para ser reconhecido como controle; estado `aria-pressed`; estado `:disabled`, com cursor `not-allowed`, texto `muted` sobre o fundo claro e a borda discreta) e o anel de foco; as cores e os espaços vêm só de `var(--jus-*)`, e um teste confere, na folha base e nas folhas de cada componente, que não há cor literal nem propriedade personalizada de outra família e que os tokens usados são os que a página define. Usam a classe base os componentes que desenham controles próprios: `<jus-filtro-timeline>` e `<jus-upload>`.

**`<jus-numero-processo>`**
- Aprimora, **no próprio lugar**, o `<input>` nativo que o form theme renderiza dentro do elemento. Não usa Shadow DOM nem `ElementInternals`, ou seja, não é um campo form-associated que assume o lugar do input: o input do servidor já é acessível (rótulo, ajuda e erros ligados por `aria-describedby`) e já é o campo enviado. Assim nada é duplicado, não há segundo campo para sincronizar nem input para desabilitar, e nada depende do JavaScript: sem ele, o input e a validação do servidor continuam iguais.
- Máscara do número CNJ (`maskPartial`, de `shared/cnj.ts`) ao digitar, colar ou apagar: só dígitos, no máximo 20, e cada separador entra quando um dígito vem depois dele. Não define `maxlength`; a máscara é o limite. O cursor é preservado: continua depois dos mesmos dígitos, e um Backspace ou Delete que apaga um separador passa por cima dele, para que o apagamento seguinte alcance o dígito. Ao conectar, o valor renderizado pelo servidor também é mascarado, a não ser que tenha algo além de dígitos e separadores ou mais de 20 dígitos (uma entrada recusada, devolvida pelo servidor, fica como o servidor a devolveu).
- Validação nativa: o componente chama `setCustomValidity` com "Informe os 20 dígitos do número do processo." (incompleto) ou "Dígito verificador inválido." (`assessCnj`, da mesma regra do PHP). Um campo vazio fica por conta do `required`, e um opcional vazio é válido. O navegador mostra a mensagem e barra o envio; o servidor continua validando.
- Estado inválido e motivo em texto: o componente só marca e escreve o motivo do erro que é dele (`validity.customError`: número incompleto ou dígito verificador inválido); um estado nativo, como um `required` vazio, fica com o navegador. Quando a pessoa sai do campo (`blur`) com um número assim, o input recebe `aria-invalid="true"` e a classe `is-invalid` do Bootstrap, sempre juntos (`setInvalid`, em `shared/validity.ts`), e o motivo aparece como texto num `div.invalid-feedback.d-block` logo depois do elemento, onde o Symfony renderiza os erros do servidor (`setFieldError`, no mesmo arquivo). O bloco tem o id `<id do input>-client-error`, que entra no `aria-describedby` do input enquanto houver mensagem, e assim o motivo não fica só na cor da borda nem no balão do navegador (WCAG 3.3.1). Quando o navegador declara o campo inválido ao enviar ou conferir o formulário (`invalid`), o campo é marcado em qualquer estado inválido, mas o texto só é escrito para o erro do componente: um `required` vazio é marcado sem texto, e não é marcado ao sair do campo. Nada é marcado enquanto a pessoa ainda digita; com o campo já marcado, o texto acompanha o número e diz o que falta agora. As marcas e o texto saem assim que o número é válido ou que o campo fica vazio, a marca que o servidor renderizou inclusive: um campo obrigatório que volta a ficar vazio não guarda uma borda vermelha sem motivo (o navegador o aponta de novo ao enviar); enquanto o valor continua inválido, a do servidor permanece.
- Erros do servidor: o form theme os renderiza como blocos `.invalid-feedback` cujos ids (`<id>_error1`) estão no `aria-describedby` do input. Eles descrevem o valor enviado, não o atual, então no primeiro `input` depois do carregamento (`retireServerErrors`) recebem `hidden` (e perdem a classe `d-block`, que sozinha venceria o `hidden`) e saem do `aria-describedby`; a ajuda fica. Se o valor devolvido pelo servidor não for mudado e o componente tiver um motivo próprio para ele (ao sair do campo ou ao enviar um número incompleto ou de dígito verificador inválido), o texto do servidor é aposentado do mesmo modo antes de o do componente ser escrito, para que o campo nunca mostre dois textos de erro; um número bem formado que o servidor recusou por outro motivo mantém o texto do servidor. Ao conectar, nada neles é alterado.
- Ao limpar o formulário (`reset`), o valor padrão é mascarado e conferido de novo.

**`<jus-filtro-timeline>`**
- Envolve a `<twig:Timeline>` já renderizada, que continua no light DOM e aparece num `<slot>` do Shadow DOM. Não tem atributos nem propriedades: lê o `data-event-type` e o `data-event-label` de cada `.jus-timeline-event` (os rótulos vêm do servidor).
- Cria no Shadow DOM um grupo nomeado (`role="group"`, "Filtrar movimentações por tipo") com o botão "Todas" e um botão por tipo presente, na ordem da primeira aparição, cada um com `aria-pressed`. Os botões só existem quando há dois ou mais tipos para escolher.
- Seleção única: um tipo por vez, e "Todas" mostra tudo. Os eventos dos outros tipos recebem o atributo `hidden` (nunca são removidos) e o dia que fica sem eventos visíveis some com o seu título. A folha da própria timeline também esconde `.jus-timeline-event[hidden]`, porque o `display` dos eventos venceria o `[hidden]` do navegador. Sem JavaScript, a lista inteira aparece.
- O resultado é anunciado numa região `aria-live="polite"` visualmente oculta ("Mostrando 1 de 4 movimentações." ou "Mostrando todas as 4 movimentações."), nunca ao carregar a página nem ao escolher de novo o botão já pressionado.
- A lista é lida ao conectar e de novo quando é trocada (`slotchange`): os botões são refeitos se os tipos mudaram (e mantidos, com o foco, se são os mesmos), a escolha é mantida enquanto o tipo existe e volta para "Todas" quando ele some ou quando sobra um tipo só.

**`<jus-upload>`**
- Envolve, num `<slot>`, o `<input type="file" multiple accept="application/pdf">` nativo, que continua visível, operável e sendo o campo enviado. O input é o único estado: a lista de arquivos é desenhada a partir de `input.files`. O elemento aparece no catálogo e no formulário de peticionamento (seção 6.4), onde recebe os limites de `FilingLimits`.
- Atributos `max-files` (quantidade) e `max-size` (bytes, por arquivo): inteiros positivos; qualquer outro valor é ignorado e não há limite.
- Área de arrastar e soltar (que ganha borda contínua e fundo claro durante o arraste) e lista dos arquivos escolhidos, cada um com nome, tamanho (`formatBytes`, de `shared/bytes.ts`, igual ao filtro Twig `bytes`) e um botão "Remover" cujo nome acessível diz de qual arquivo se trata.
- Escolher no diálogo substitui a seleção, como no input sem o componente; soltar arquivos **soma** à seleção. Só PDFs entram (os outros são ignorados e anunciados), e um arquivo de mesmo nome e tamanho não entra duas vezes. Soltar e remover escrevem a lista nova no input com `DataTransfer` e disparam `input` e depois `change`, como o diálogo faz. Depois de remover, o foco vai para o próximo botão "Remover" ou, se não houver outro, para o input.
- Validação antecipada com `setCustomValidity` no próprio input, na ordem: mais arquivos que `max-files` ("Envie no máximo 5 arquivos."), arquivo maior que `max-size` (`O arquivo "contrato.pdf" passa do limite de 10 MB.`) e arquivo que não é PDF ("Envie apenas arquivos PDF."; o `accept` só orienta o diálogo). A mensagem do componente marca o input (`aria-invalid` e `is-invalid`), é escrita como texto num `div.invalid-feedback.d-block` logo depois do elemento, no light DOM e não no Shadow DOM, para que o `aria-describedby` do input a alcance (o mesmo auxiliar `setFieldError` do campo de número, com o id `<id do input>-client-error`), e é anunciada depois da contagem ("6 arquivos selecionados. Envie no máximo 5 arquivos."); sai quando a escolha volta a ser válida, e mudar um atributo de limite atualiza ou tira, sem anunciar, um erro que já está à mostra. Os erros que o servidor renderizou descrevem o que foi enviado: na primeira mudança (`change`) da escolha são escondidos e saem do `aria-describedby` (`retireServerErrors`); ao conectar, não são tocados. O que o navegador diz por conta própria, como um `required` sem arquivo, fica com o navegador (balão no envio; o input é marcado, sem texto na página).
- Com o input desabilitado, ou dentro de um `fieldset` desabilitado, a soltura é ignorada (sem deixar o navegador abrir o arquivo no lugar da página), os botões "Remover" ficam desabilitados e a dica "ou arraste os arquivos PDF para cá" some. Sem um input dentro, o elemento não desenha nada de seu (nem a área, nem a dica), e o que houver dentro aparece como está.
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
- O foco não se perde: ao remover um arquivo vai para o próximo botão "Remover" (ou para o input), ao fechar um alerta que o tinha vai para o alvo de foco (`data-jus-focus-target`) mais próximo antes dele (as abas do processo, no caso da confirmação de um peticionamento; `main#conteudo`, no das mensagens do alto), e uma região rolável só é parada de Tab enquanto transborda (seção 6.2).
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
| GET | `/documentos/{id}` | `document_download` | `VIEW` no processo do documento (sem `VIEW`: 404) |
| GET | `/design-system` | `design_system` | público |

- O logout exige o token CSRF: o link "Sair" é gerado com `logout_path('main')`, e um `/logout` sem token responde 403 sem encerrar a sessão.
- `{numero}` usa o formato mascarado como forma canônica; o `CnjNumberValueResolver` aceita com ou sem máscara e responde 404 se o número for inválido, antes de consultar o banco.
- `{id}` do download é o id do documento, um inteiro simples: sem zeros à esquerda (que dariam mais de um endereço ao mesmo documento) e que caiba no inteiro de 64 bits. Qualquer outra coisa é 404, como um id que não existe. A rota aceita só `GET` (e `HEAD`, que o roteador do Symfony aceita em toda rota `GET`: os mesmos cabeçalhos, sem o corpo); qualquer outro método dá 405.

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
- Abas por link, `?aba=movimentacoes|documentos#andamento`, com `aria-current="page"` na ativa: só o painel ativo é renderizado, então funcionam sem JavaScript. Movimentações (`<twig:Timeline>` dentro de `<jus-filtro-timeline>`, que acrescenta o filtro por tipo e, sem JavaScript, não faz nada) e Documentos (`<twig:DataTable>`, colunas título, tipo, data e tamanho, com os documentos de todas as movimentações, os da movimentação mais recente primeiro; a ordenação por `sort` e `direction` mantém a aba). `aba`, `sort` ou `direction` desconhecidos ou malformados caem nos valores padrão (Movimentações, ordem natural), sem erro.
- O título de cada documento é o link de download (`document_download`); o tipo, a data e o tamanho são texto. O tipo é o da petição ("Contestação") ou, nas demais movimentações, o da movimentação ("Despacho"); a data é a do envio. O endereço do link é montado com o `id` que o processo já carregou (`CaseDocumentsTable`), então os links não acrescentam consulta. Um documento que ainda não foi salvo não tem endereço, e a tabela mostra só o título.
- Número fixo de consultas: 3 (atualização do usuário, o processo com tudo o que possui, os prazos), em qualquer aba, com os links de download e também para o advogado que vê o botão "Peticionar". Um teste confere cada caso.
- Botão "Peticionar" (um link para `case_file`, `btn-primary`, no cabeçalho do processo) visível apenas com permissão `FILE`: não aparece para o servidor, para o advogado que não representa nenhuma parte do processo nem em processo arquivado. Perguntar ao Voter se ele deve aparecer não custa consulta.

**Peticionamento (`/processos/{numero}/peticionar`)**
- Ordem das decisões, antes de o formulário existir: visitante → redirect para `/login`; número sem máscara → redirect 301 para a URL mascarada (a query string vai junto); número inválido, processo inexistente ou sem `VIEW` → o mesmo 404; com `VIEW` e sem `FILE` → 403 (seção 5.5). Só depois o formulário é construído e a requisição é lida, tanto em `GET` quanto em `POST`.
- A página tem o título "Peticionar · Processo {número} · Jus", um `h1` "Peticionar" com o número e a classe do processo, o link "Voltar para o processo" e o formulário `FilingFormType` (seção 6.4): "Tipo de petição", "Descrição" e "Petição e anexos (PDF)" (o `<jus-upload>`), com o botão "Juntar petição". Sem JavaScript, o envio é um POST `multipart/form-data` comum, e o servidor valida tudo.
- **Sucesso:** `FilingService` (seção 5.6), mensagem flash "Petição juntada ao processo." e redirect **303** (padrão PRG) para `case_show` em `?aba=movimentacoes#andamento`, de modo que a nova movimentação aparece no alto da linha do tempo e um F5 não repete o envio. O redirect cai em `#andamento`, bem abaixo do alto da página, e por isso a confirmação é uma mensagem de um tipo próprio (`filing`) que a página do processo mostra dentro da seção Andamento, entre as abas e o painel (um `<twig:Alert type="success" dismissible>`), e não na área de mensagens do alto, que as outras páginas continuam usando. Ela aparece uma vez só.
- **Erro:** a página volta com **422**, o tipo e a descrição digitados mantidos, e nada é gravado (nem arquivo, nem registro).
  - Um resumo (`#resumo-erros`, um aviso `alert-danger` de texto, sem `role="alert"`, para não anunciar por cima do que a pessoa está lendo) lista cada campo inválido como um link para ele; cada campo também mostra o próprio erro (`aria-invalid`, `aria-describedby`, seção 6.4). O título da página começa com "Erro: ".
  - O navegador nunca devolve os arquivos a um `input type="file"`. Por isso, quando os arquivos chegaram e estão bons, mas o formulário falhou por outro motivo, a página diz "Selecione os arquivos novamente." (dentro do resumo ou, se nenhum campo falhou, num aviso). Quando o erro é dos próprios arquivos, o aviso não aparece.
  - Um token CSRF inválido é um erro do formulário, não de um campo: aparece no formulário com a mensagem "O token CSRF é inválido. Por favor, tente reenviar o formulário.". Os erros do próprio formulário (este e o do `post_max_size`) usam o componente `Alert` (`danger`, com `role="alert"`: ícone e o "Erro:" que o leitor de tela ouve, como no resumo), pelo bloco `form_errors` do tema; o erro de um campo continua sendo o `invalid-feedback` ao lado do campo.
  - Requisição acima do `post_max_size` do PHP: o PHP descarta o corpo inteiro, e todos os campos chegam vazios. O controlador reconhece o caso (pelo tamanho declarado da requisição) e mostra o formulário em branco com um erro só, sem um erro em cada campo: "O envio passou do limite de {limite} e não foi recebido. Escolha arquivos menores ou menos arquivos.", em que {limite} é o valor do `php.ini` (por exemplo, `8M`).
- Número fixo de consultas: 2 no `GET` (atualização do usuário e o processo com as partes e os advogados, que é tudo o que a autorização lê; as movimentações e os documentos, que o formulário não mostra, não são carregados). Um teste confere.

**Download (`/documentos/{id}`)**
- O documento chega junto com a movimentação, o processo, as partes e os advogados, em uma consulta (`DocumentRepository::findOneWithCase()`), que é tudo o que o Voter lê. A decisão (seção 5.5) vem antes de o disco ser tocado: sem `VIEW`, o mesmo 404 de um documento que não existe. O disco só é consultado depois, por `DocumentStorage::pathOf()`, e um arquivo que sumiu dá o mesmo 404.
- A resposta é o arquivo (`BinaryFileResponse`) com `Content-Type: application/pdf` sempre, e nunca o que os bytes pareçam ao navegador; `Content-Disposition: attachment`, porque o PDF é salvo e não aberto na página; `X-Content-Type-Options: nosniff` (definido pelo controlador; os demais cabeçalhos de segurança de toda resposta, da seção 4.4, vêm do listener); `Content-Length`; e um `Cache-Control` `private, no-store`: nenhum cache compartilhado guarda a resposta, e o próprio navegador também não, para que um PDF sigiloso não fique no cache de uma máquina compartilhada depois que a pessoa saiu da sessão.
- O nome do arquivo salvo é o que foi enviado (`originalFilename`), com barras e caracteres de controle trocados por `_` (uma quebra de linha dividiria o cabeçalho) e a extensão `.pdf` garantida: o nome guardado é cortado em 255 caracteres, o que pode tirar a extensão, e um nome vazio vira `documento.pdf`. O que não é ASCII vai em `filename*` (UTF-8), e o `filename` leva a versão ASCII para clientes antigos ("Procuração.PDF" fica `Procura__o.PDF`).
- Número fixo de consultas: 2 (atualização do usuário e o documento com o processo). Um teste confere.

**Dados fictícios (fixtures)**
- 4 usuários de teste, todos com a senha `jus-demo`: os advogados (`ROLE_LAWYER`) `advogado@jus.test` (Ana Ribeiro), `advogada2@jus.test` (Carla Mendes) e `advogado3@jus.test` (Bruno Teixeira), e o servidor (`ROLE_CLERK`) `servidor@jus.test` (João Almeida).
- 30 processos com todos os status, 3 deles sigilosos, com partes e movimentações.
- Cada processo começa com a petição inicial e o seu documento, então são 30 documentos, e cada um é um **PDF de verdade**: uma cópia de `tests/fixtures/sample.pdf` gravada pelo `DocumentStorage`, com nome UUID e o tamanho real do arquivo. Todos podem ser baixados na aba Documentos. Carregar as fixtures de novo apaga os PDFs anteriores (`DocumentStorage::clear()`, que só remove os `.pdf` do diretório), para que cada recarga não deixe arquivos órfãos; e, como o banco também é apagado, os peticionamentos feitos antes na demonstração se vão junto.
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
| Sigiloso de outro advogado na URL (página, peticionamento ou download) | 404 "Página não encontrada", a mesma página de um número inexistente: o sistema nunca revela que um processo sigiloso existe |
| Download de um documento que não existe, de um processo sem `VIEW`, cujo arquivo sumiu do disco ou cujo nome guardado não é um UUID | O mesmo 404 "Página não encontrada" nos quatro casos, sem `Content-Disposition` e sem nada do documento: quem pede não distingue um documento que não existe de um que não pode ver. Um id que não é um inteiro simples (texto, decimal, zeros à esquerda, maior que o inteiro de 64 bits) também dá 404, e outro método que não `GET` (ou `HEAD`, aceito em toda rota `GET`), 405 |
| Ação que o usuário não pode executar num processo que **pode ver** (peticionar com `VIEW` e sem `FILE`: o servidor, o advogado que não representa parte alguma de um processo público, o processo arquivado) ou ação recusada pelo sistema (o logout sem token CSRF) | 403 "Acesso negado", sem detalhes da exceção. Quem não tem `VIEW` nunca chega ao 403: recebe o 404 da linha acima, em qualquer rota do processo |
| Não autenticado | Redirect para `/login`, nas rotas que existem |
| `pagina`, `aba`, `sort` ou `direction` malformados | Valor padrão, sem erro |
| `pagina` além da última página | Redirect para a última página |
| Peticionamento inválido (tipo ausente ou fora da lista, a petição inicial inclusive; descrição vazia ou acima de 2000 caracteres; nenhum arquivo, mais de 5, arquivo que não é PDF ou acima de 10 MB; token CSRF inválido) | 422 com a página do formulário: cada erro junto do campo (form theme), o resumo de erros com links, o título com "Erro: " e nada gravado (seção 7). Com JavaScript, o `<jus-upload>` antecipa no navegador o limite de arquivos e de tamanho e o tipo PDF; o servidor continua decidindo |
| Arquivo acima do `upload_max_filesize` do PHP | 422, com o erro no campo de arquivos: "O arquivo é muito grande. O tamanho máximo permitido é de N MiB.", com o limite do servidor em unidades de 1024 |
| Requisição acima do `post_max_size` do PHP (o corpo chega inteiro vazio) | 422 com o formulário em branco e uma só mensagem: "O envio passou do limite de {limite} e não foi recebido. Escolha arquivos menores ou menos arquivos." |
| Falha ao gravar petição (disco, banco, prazo que não pode ser cumprido) | Rollback e remoção dos arquivos já gravados (seção 5.6), e a página "Algo deu errado" (500); o detalhe só vai para o log |
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
- Entidades e suas guardas (seção 5.1), sem kernel: só o advogado de uma parte peticiona; a petição inicial só abre o processo (nem depois de outra petição, nem de outra movimentação, nem duas vezes); uma juntada exige o tipo de petição e as demais movimentações o recusam; um prazo só nasce de uma intimação do próprio processo, com pelo menos um dia útil, e não é cumprido antes de começar (nem numa segunda chamada), mantendo a primeira data de cumprimento.

**PHPUnit — Component (`tests/Component/`)**
- Cada Twig Component com `InteractsWithTwigComponents`: variantes, HTML e atributos ARIA.
- `DeadlineIndicator` com `MockClock` para cada estado de urgência.

**PHPUnit — Integration (`tests/Integration/`)**
- Visibilidade: para servidor, advogado do polo ativo, advogado do polo passivo e advogado sem relação, em processo público e sigiloso, a busca e a consulta por número decidem exatamente como o `VIEW` do Voter (seção 5.5).
- `DocumentStorage`, no disco de verdade (um diretório por ambiente, apagado ao fim): o diretório de teste fica em `var/uploads/test`, fora de `public/`; o arquivo é gravado como cópia, com nome UUID v7, e o original fica no lugar; só se copia de caminho local (`http`, `https` e `ftp` são recusados); uma cópia que falha, mesmo no meio, não deixa PDF para trás, e o erro da cópia sobrevive a uma limpeza que também falha; o diretório é criado com o modo `0750`; `pathOf()` só devolve arquivos do próprio diretório e é `null` para um nome fora do formato UUID (`../` e `..\` com arquivos-isca plantados um nível acima, onde a travessia chegaria; subdiretório; outra extensão; maiúsculas; quebra de linha no fim ou um NUL antes do `.pdf`), ainda que o arquivo exista, e para um nome válido que não existe; `delete()` ignora os mesmos nomes; `clear()` remove só os `.pdf` do diretório, deixa outros arquivos e os de fora em paz, e funciona com o diretório ausente.
- `FilingService`: grava um evento e um documento por arquivo, com o título e o nome original tirados do nome enviado (uma tabela de nomes: caixa da extensão, caminhos do Windows e do Unix, espaços, `.pdf` duplo, nada sobrando, nomes de 300 caracteres); cumpre os prazos em aberto só das partes que o advogado representa (a parte contrária, outro processo e o prazo já cumprido ficam como estavam, e um prazo que só começa depois da juntada continua em aberto sem impedi-la); com um advogado sem parte, ou quando o banco falha (antes e depois de gravar), nada fica no banco nem no disco e o erro original é relançado; um arquivo que não pode ser gravado leva consigo os já gravados; e uma limpeza que falha não esconde o erro original. `DeadlineRepository::findOpenForLawyer()` tem testes próprios.
- `FilingData`: cada mensagem de erro do formulário e os limites nas bordas (exatamente 10 MB passa e 10 MB + 1 byte não; 5 arquivos passam e 6 não; 2000 caracteres passam e 2001 não); o tipo do arquivo vem do conteúdo, não do nome; um arquivo acima do limite do PHP é descrito em unidades de 1024.
- Tema dos formulários: o bloco `upload_widget` envolve o input nativo no `<jus-upload>`, com os atributos de limite, e deixa de escrevê-los sem a opção; o bloco `form_errors` desenha os erros do próprio formulário com o `Alert` e deixa os de campo como estavam.
- Fixtures (`AppFixtures`, em quatro datas escolhidas, inclusive sábado e o recesso): contas, processos, partes com advogado, datas em dias úteis forenses, todos os estados de urgência que o dia permite e **todo documento com o seu PDF no disco** (30, com o conteúdo de `sample.pdf` e o tamanho real, nenhum arquivo sem documento); recarregar as fixtures limpa os PDFs de antes.
- Linux apenas: o teste que confere o modo real do diretório (`0750`, nenhum acesso para os demais) só roda no Linux, porque o Windows ignora o modo; o pipeline roda no Linux (`ubuntu-latest`), mas ainda não está conectado ao Azure DevOps, então esse teste ainda não rodou em lugar nenhum (no Windows ele aparece como pulado); outro teste, em qualquer sistema, confere que o modo pedido na criação é `0750`.

**PHPUnit — Functional (`tests/Functional/`, `WebTestCase`)**
- Login e logout; busca (filtros, redirect por número exato, filtro de sigilosos, paginação com parâmetros malformados); página do processo (200, 404 para número inválido, inexistente ou sigiloso de outro advogado, partes por polo, abas e ordenação sem JavaScript); páginas de erro com `debug` desligado; peticionamento e download (abaixo); catálogo público.
- Peticionamento (`FilingPageTest`): o formulário e seus atributos (tipo sem a petição inicial, `maxlength`, os limites no `<jus-upload>` e na ajuda); o envio completo como um navegador sem JavaScript o faz, com o 303 para a aba de movimentações, a mensagem de sucesso, a movimentação na linha do tempo, os documentos na aba Documentos, os PDFs no disco e só os prazos do advogado cumpridos; a confirmação dentro da seção Andamento, uma vez só, com as outras mensagens no alto da página; cada tipo aceito; cada recusa (sem tipo, descrição vazia ou longa demais, sem arquivo, seis arquivos, arquivo que não é PDF, arquivo grande demais, token CSRF) com 422, a mensagem junto do campo e nada gravado; o resumo de erros (todos os campos inválidos como links, só os que falharam, o pedido de escolher os arquivos de novo só quando cabe); o título com "Erro: "; a mensagem do `post_max_size`; uma falha ao gravar, com a página 500 sem detalhes, o erro no log e nada guardado; o visitante, o sigiloso de outro advogado (o mesmo 404 de um número inexistente, em `GET` e `POST`), o servidor, o advogado sem parte e o processo arquivado (403, em `GET` e `POST`); o redirect da URL sem máscara e o 404 do número inválido; e o botão "Peticionar" na página do processo.
- Download (`DocumentDownloadTest`): o advogado, o advogado sem parte num processo público, o servidor num sigiloso e o advogado da parte num sigiloso baixam o PDF, com os cabeçalhos da seção 7; o sigiloso de outro advogado, o arquivo que sumiu, o nome guardado que não é um UUID e ids que não são documentos (texto, decimal, negativo, zeros à esquerda, zero, o maior inteiro e um maior que ele) dão o mesmo 404; só `GET` (e `HEAD`, sem o corpo); o `Cache-Control` com `private` e `no-store`; visitante para o login; os nomes do `Content-Disposition` (acentos, espaços, `%`, aspas, sem extensão, outra extensão, 255 caracteres, barras, quebra de linha, vazio, só `.pdf` em qualquer caixa e com espaços).
- O número de consultas de cada tela é fixo e verificado com `QueryRecorder`: 5 na busca (com 10 cartões, metade sem movimentações), 3 na página do processo, em qualquer aba (também para o advogado que vê o botão "Peticionar" e com os links de download), 2 no formulário de peticionamento e 2 no download.

**Vitest 5 em modo browser (Playwright)**
- Localmente os testes rodam no Google Chrome instalado (canal `chrome` do Playwright), sem baixar navegador; no CI (variável `CI` ou `TF_BUILD`) rodam no Chromium do Playwright, que o pipeline instala, pelo canal `chromium` (o navegador completo em modo headless novo, mais próximo do Chrome do que o headless shell). A configuração está em `vitest.config.ts`, e `npm test` é o comando nos dois casos.
- `shared/cnj.ts` com o mesmo JSON do PHPUnit, inclusive os 25 pontos de código que o `trim()` do JavaScript remove (seção 5.3); `shared/bytes.ts` com os mesmos casos do filtro Twig `bytes`; `shared/validity.ts`.
- Cada Web Component: comportamento, integração com o `<form>` (envio, validação nativa, `reset`), foco, ciclo de vida (mover, remover da página, reconectar) e acessibilidade. Os comportamentos de layout são testados com o Bootstrap e o `ResizeObserver` reais. O de envio uma vez só é testado com envios de verdade: um formulário válido, um que o navegador recusa, um cancelado por um tratador (antes ou depois do comportamento), a volta do cache de avançar e voltar (`pageshow` com `persisted`) e o envio real para um quadro à parte, que mostra que o botão apertado ainda vai nos dados.
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
- Para o ciclo rápido de escrever o teste e vê-lo falhar, `vendor/bin/phpunit` roda direto (um arquivo, `--filter`), sem reconstruir o cache de teste: ao contrário dos scripts do Composer, que o refazem antes, ele usa o container e os modelos já compilados. Depois de mudar um serviço, a configuração ou um template, rode `composer test:cache` uma vez, senão o teste enxerga o container velho (um listener novo, por exemplo, só passa a existir depois disso).
- `composer test` e `composer test:coverage` esvaziam o cache de teste e o reconstroem antes (`composer test:cache`, para os dois kernels que os testes sobem, com e sem debug), para que nenhum teste rode contra um container ou modelos Twig velhos, que o kernel sem debug não renova sozinho. A reconstrução fica fora da execução com cobertura, onde custaria o dobro, e soma cerca de 11 s à suíte.
- PHPStan no nível max **sem baseline** e sem `ignoreErrors`. A única exceção de configuração é tirar da análise os stubs dos polyfills `intl` do Symfony (`vendor/symfony/polyfill-intl-*/Resources/stubs/`): o projeto exige a extensão `intl`, e esses stubs em PHP puro, no classmap do Composer, esconderiam dela os tipos reais (por exemplo, `NumberFormatter::formatCurrency()` como `string|false`).
- O repositório fica no GitHub (público). O pipeline está definido em `azure-pipelines.yml`; a conexão dele com o Azure DevOps ainda está pendente, e o badge de status vai no README quando estiver.

### 10.1 Auditoria das páginas renderizadas (`npm run audit:pages`)

Os testes de componente conferem cada peça isolada; este script confere as **páginas que a aplicação realmente renderiza**, com o servidor, o CSS e o JavaScript do build. Não faz parte do `composer ci`, porque precisa da aplicação rodando.

```bash
composer setup && npm run build
php -d upload_max_filesize=10M -d post_max_size=60M -S 127.0.0.1:8123 -t public
npm run audit:pages -- --base-url=http://127.0.0.1:8123   # em outro terminal
```

- Usa o Google Chrome instalado (`channel: 'chrome'`, sem baixar navegador) e entra como `advogado@jus.test`, da demonstração. Sem `--base-url`, assume `http://127.0.0.1:8000`.
- **Páginas, em 1280 px e em 375 px, com JavaScript:** entrar (visitante), busca (com resultados e sem resultados), a página do processo (abas Movimentações e Documentos), o peticionamento (vazio, com os erros do 422 depois de um envio vazio, para o qual o script desliga a validação do próprio navegador no formulário, e com arquivos escolhidos), o processo depois de um peticionamento (com a confirmação), as páginas de erro 404, 403 e 500, o catálogo e, em 375 px, o menu aberto. O caso usado é o primeiro, entre os resultados da busca, em que a advogada pode peticionar.
- **Em cada página:** axe-core com as regras WCAG 2.0, 2.1 e 2.2, níveis A e AA, e a conferência de que `document.documentElement.scrollWidth <= innerWidth` (nada de rolagem horizontal). O que o axe não consegue decidir (`incomplete`: o fundo de um `select` tem uma imagem, um `textarea` vazio não tem valor, o painel do menu, `#menu-principal`, tem `aria-labelledby` sem `role`: é a marcação do Bootstrap, aceita em todas as larguras, porque a partir de 768 px o painel nunca é aberto e abaixo disso o `role="dialog"` só existe enquanto ele está aberto) é listado no relatório para quem ler conferir; não reprova a página.
- **Teclado, com eventos reais (`page.keyboard`), a 1280 px:** o primeiro Tab para no link "Pular para o conteúdo" e Enter leva o foco a `main#conteudo`; depois de um envio vazio (422), cada link do resumo de erros (`#resumo-erros`) leva o foco ao seu campo; o Tab alcança o tipo, a descrição, o input de arquivos (dentro do `<jus-upload>`) e o botão de envio; escolhidos dois arquivos, o Tab alcança os botões "Remover", Enter remove um arquivo e deixa o foco num "Remover"; e fechar com Enter a confirmação de um peticionamento mantém o foco na página (nas abas, `#andamento`), não no alto.
- **Sem JavaScript (`javaScriptEnabled: false`):** a entrada, a busca por um formulário comum, a troca de aba por links e um peticionamento inteiro (tipo, descrição, arquivo e envio) que termina na página do processo com a confirmação. Com os scripts desligados nada pode ser avaliado na página, nem o axe: as páginas que o navegador recebeu são então auditadas, a 1280 px e a 375 px, numa página que roda scripts mas tem o JavaScript da aplicação bloqueado (o mesmo HTML e o mesmo CSS, sem os aprimoramentos), e, no contexto realmente sem JavaScript, a 375 px e a 1280 px, confere-se que cada link do menu (Processos, Design System, Sair) está dentro da janela, pela caixa que ele ocupa, e não só que é visível.
- O relatório diz, por página e largura, as violações (regra, impacto, ajuda, seletor) e a rolagem; o código de saída é 1 se houver violação, rolagem horizontal ou verificação que falhou, e 2 se a própria auditoria não pôde rodar.
- A auditoria **grava peticionamentos** nos dados de demonstração (quatro por rodada, como uma pessoa faria); `composer setup` devolve os dados ao estado inicial. As páginas de erro vêm de `/_error/{código}`, rota do ambiente `dev` que desenha as páginas do projeto (num endereço inexistente, o `dev` mostra a página de depuração do Symfony, que não é nossa); em produção o mesmo endereço é um 404 e a página é a mesma.

## 11. Documentação e fluxo de Git

- **README (pt-BR):** o que é, prints de desktop e celular, como rodar (seção 3.3), usuários de teste, destaques técnicos e links para ADRs e diagramas.
- **Decisões de arquitetura (`docs/adr/`):** sete ADRs, listados na seção 12 e no [índice](adr/README.md).
- **Diagramas Mermaid (`docs/diagrams/`):** contexto e containers, entidades, sequência do peticionamento.
- **Código e commits em inglês**; interface e documentação em português.
- **Git:** Conventional Commits; uma branch e um PR por funcionalidade.

## 12. Decisões registradas (ADRs)

Cada decisão tem o seu registro em [`docs/adr/`](adr/README.md), com contexto, consequências e alternativas.

| ADR | Decisão |
|---|---|
| [0001](adr/0001-abordagem-hibrida-twig-e-web-components.md) | Abordagem híbrida: Twig Components + Web Components |
| [0002](adr/0002-design-tokens-como-css-custom-properties.md) | Design tokens como CSS custom properties para atravessar o Shadow DOM |
| [0003](adr/0003-webpack-encore-em-vez-de-assetmapper.md) | Webpack Encore em vez de AssetMapper |
| [0004](adr/0004-servidor-como-fonte-da-verdade.md) | Servidor como fonte da verdade; regra CNJ duplicada com contrato de testes compartilhado; prazo só no servidor |
| [0005](adr/0005-vitest-em-modo-browser.md) | Vitest em modo browser para Web Components: os componentes dependem de APIs reais do navegador (`DataTransfer`, `ResizeObserver`, constructable stylesheets, validação nativa, foco), que o jsdom não cobre |
| [0006](adr/0006-sqlite-como-banco-padrao.md) | SQLite como banco padrão |
| [0007](adr/0007-campo-cnj-aprimora-o-input-nativo.md) | Campo do número CNJ: aprimorar o input nativo em vez de assumir o campo por Shadow DOM (sem `ElementInternals`) |

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

As etapas 1 a 8 estão concluídas. A 8 entregou a pasta `src/Filing/` com o armazenamento dos PDFs fora de `public/`; as guardas do domínio e o `FilingService`; a página de peticionamento com o formulário, o `<jus-upload>` no tema e os limites de `FilingLimits`; o download dos documentos com a regra 404/403 da seção 5.5; e as fixtures com PDFs de verdade.

## 14. Critérios de aceite

1. Clone limpo roda com os comandos da seção 3.3 (PHP 8.4 + Node 24).
2. Login, 3 telas e catálogo funcionam em 375 px de largura sem rolagem horizontal e em desktop.
3. Com JavaScript desativado, consulta, visualização e peticionamento continuam funcionando.
4. Pipeline do Azure DevOps verde em todas as etapas.
5. PHPStan nível max sem erros e sem baseline.
6. 100% de cobertura de linhas em `src/Domain/`.
7. Nenhuma violação do axe-core nos testes dos Web Components.
8. README, 7 ADRs e 3 diagramas publicados.
