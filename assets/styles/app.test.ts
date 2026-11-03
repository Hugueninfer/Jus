import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cdp, page as browserPage, userEvent } from 'vitest/browser';
import { expectNoAxeViolations } from '../test-support/axe';
import { contrastRatio, parseColor } from '../test-support/contrast';
import { required } from '../test-support/required';
import type { Theme } from '../test-support/tokens';
import appCss from './app.scss?inline';

/** WCAG 2.2 AA: 4.5:1 for text, 3:1 for what identifies a control and for the focus ring (1.4.3, 1.4.11). */
const TEXT = 4.5;
const CONTROL = 3;
const FOCUS = 3;
/** Not a WCAG figure: a hairline that has to be seen (the timeline rail) keeps at least this much against its ground. */
const SEPARATOR = 1.5;

const THEMES: Theme[] = ['light', 'dark'];

/** The page stylesheet as the browser gets it (Bootstrap, the tokens, the Inter faces), on a <style> so @import works. */
let style: HTMLStyleElement;

function mount(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.append(container);

  return container;
}

function find(root: ParentNode, selector: string): HTMLElement {
  return required(root.querySelector<HTMLElement>(selector));
}

function css(element: Element, property: string): string {
  return getComputedStyle(element).getPropertyValue(property).trim();
}

function rootToken(name: string): string {
  return css(document.documentElement, name);
}

function sameColor(actual: string, expected: string): void {
  expect(parseColor(actual)).toEqual(parseColor(expected));
}

/** What a custom property gives once used for a property, as the browser computes it (a colour, a shadow). */
function computed(property: 'color' | 'box-shadow', token: string): string {
  const probe = document.createElement('span');
  probe.style.setProperty(property, `var(${token})`);
  document.body.append(probe);
  const value = css(probe, property);
  probe.remove();

  return value;
}

/** Where the text of an element is read: its own background, or the first opaque one behind it. */
function backgroundBehind(element: Element): string {
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    const background = parseColor(css(node, 'background-color'));
    if (background.alpha === 1) {
      return css(node, 'background-color');
    }
  }

  return css(document.body, 'background-color');
}

function contrastOfText(element: Element): number {
  return contrastRatio(css(element, 'color'), backgroundBehind(element));
}

/** Ends the transitions of an element (Bootstrap animates the colours of buttons), so computed styles are the final ones. */
function settle(element: Element): void {
  for (const animation of element.getAnimations()) {
    animation.finish();
  }
}

/**
 * Runs the checks with the test window at the given width (the stylesheet changes at md and lg), and gives the window its
 * own size back afterwards.
 */
async function atWidth(width: number, run: () => void | Promise<void>): Promise<void> {
  const [previousWidth, previousHeight] = [window.innerWidth, window.innerHeight];
  await browserPage.viewport(width, 800);
  try {
    await run();
  } finally {
    await browserPage.viewport(previousWidth, previousHeight);
  }
}

/** Runs the checks as Windows contrast themes show the page: the system's colours, no shadows, no background images. */
async function inForcedColours(run: () => void | Promise<void>): Promise<void> {
  await cdp().send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
  try {
    await run();
  } finally {
    await cdp().send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: '' }] });
  }
}

/** The colours of a computed box-shadow, in the order of its shadows. */
function shadowColours(shadow: string): string[] {
  return Array.from(shadow.matchAll(/rgba?\([^)]*\)/g), (match) => match[0]);
}

/** The theme switcher as templates/_theme_switcher.html.twig renders it, with "Claro" as the current theme. */
const SWITCHER = `
  <form class="jus-theme-switcher" method="post" action="/tema" data-jus-theme-switcher>
    <div class="btn-group btn-group-sm" role="group" aria-label="Tema">
      <button type="submit" class="btn btn-outline-secondary" name="tema" value="sistema" aria-pressed="false"><i class="bi bi-circle-half" aria-hidden="true"></i> <span class="visually-hidden">Tema: </span><span class="jus-theme-switcher-label">Sistema</span></button>
      <button type="submit" class="btn btn-outline-secondary" name="tema" value="claro" aria-pressed="true"><i class="bi bi-sun" aria-hidden="true"></i> <span class="visually-hidden">Tema: </span><span class="jus-theme-switcher-label">Claro</span></button>
      <button type="submit" class="btn btn-outline-secondary" name="tema" value="escuro" aria-pressed="false"><i class="bi bi-moon-stars" aria-hidden="true"></i> <span class="visually-hidden">Tema: </span><span class="jus-theme-switcher-label">Escuro</span></button>
    </div>
  </form>`;

/** The navbar as templates/base.html.twig renders it for a person signed in: from md up the off-canvas panel is in line. */
function navbarFor(name: string): string {
  return `
    <nav class="navbar navbar-expand-md jus-navbar" aria-label="Navegação principal">
      <div class="container">
        <a class="navbar-brand jus-brand" href="#inicio"><span class="jus-brand-mark" aria-hidden="true">J</span> <span class="jus-brand-name">Jus</span></a>
        <button class="navbar-toggler" type="button" aria-label="Abrir menu"><span class="navbar-toggler-icon"></span></button>
        <div class="offcanvas offcanvas-end" tabindex="-1" aria-label="Menu">
          <div class="offcanvas-body">
            <ul class="navbar-nav flex-grow-1 align-items-md-center gap-md-3">
              <li class="nav-item"><a class="nav-link active" href="#processos" aria-current="page">Processos</a></li>
              <li class="nav-item"><a class="nav-link" href="#catalogo">Design System</a></li>
              <li class="nav-item jus-navbar-user ms-md-auto"><span class="navbar-text jus-user"><span class="jus-avatar" aria-hidden="true">MC</span> <span class="jus-user-name">${name}</span></span></li>
              <li class="nav-item"><a class="nav-link" href="#sair">Sair</a></li>
              <li class="nav-item py-2 py-md-0">${SWITCHER}</li>
            </ul>
          </div>
        </div>
      </div>
    </nav>`;
}

/** A name longer than the navbar has room for between md and xl (twice over, so it runs short at every width). */
const LONG_NAME = 'Maria Aparecida de Albuquerque Cavalcanti';
const VERY_LONG_NAME = `${LONG_NAME} ${LONG_NAME}`;

/** A little of everything the pages are made of, as Bootstrap, the layout and the Twig components render it. */
const PAGE = `
  <a class="jus-skip-link visually-hidden-focusable position-absolute z-3 top-0 start-0 m-2 p-2 bg-body rounded shadow" href="#conteudo">Pular para o conteúdo</a>
  <header>
    <nav class="navbar navbar-expand-md jus-navbar" aria-label="Navegação principal">
      <div class="container">
        <a class="navbar-brand jus-brand" href="#inicio"><span class="jus-brand-mark" aria-hidden="true">J</span> <span class="jus-brand-name">Jus</span></a>
        <button class="navbar-toggler" type="button" aria-label="Abrir menu"><span class="navbar-toggler-icon"></span></button>
        <ul class="navbar-nav">
          <li class="nav-item"><a class="nav-link active" href="#processos" aria-current="page">Processos</a></li>
          <li class="nav-item"><a class="nav-link" href="#catalogo">Design System</a></li>
          <li class="nav-item jus-navbar-user"><span class="navbar-text jus-user"><span class="jus-avatar" aria-hidden="true">MS</span> <span class="jus-user-name">Maria Souza</span></span></li>
          <li class="nav-item"><a class="nav-link" href="#sair">Sair</a></li>
          <li class="nav-item">${SWITCHER}</li>
        </ul>
      </div>
    </nav>
  </header>
  <main id="conteudo" class="container">
    <header class="jus-page-header"><h1 class="h2">Processos</h1></header>
    <article class="card jus-surface"><div class="card-body">
      <h2 class="h6 font-monospace"><a href="#detalhe">0001234-56.2024.8.26.0100</a></h2>
      <p class="mb-1 text-body-secondary">Cobrança · 1ª Vara Cível</p>
      <span class="badge rounded-pill jus-badge jus-badge-success"><i class="bi bi-play-circle" aria-hidden="true"></i> Em andamento</span>
      <span class="badge rounded-pill jus-badge jus-badge-warning"><i class="bi bi-pause-circle" aria-hidden="true"></i> Suspenso</span>
      <span class="badge rounded-pill jus-badge jus-badge-danger"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i> Venceu em 03/03/2026</span>
      <span class="badge rounded-pill jus-badge jus-badge-info"><i class="bi bi-info-circle" aria-hidden="true"></i> Em contagem</span>
      <span class="badge rounded-pill jus-badge jus-badge-neutral"><i class="bi bi-archive" aria-hidden="true"></i> Arquivado</span>
      <span class="badge rounded-pill jus-badge jus-badge-inverse"><i class="bi bi-lock" aria-hidden="true"></i> Sigiloso</span>
    </div></article>
    <section class="jus-surface p-3" aria-label="Painel"><p class="mb-0">Um painel.</p></section>
    <div class="alert alert-success" role="status">Petição protocolada.</div>
    <div class="alert alert-danger" role="alert">Não foi possível protocolar.</div>
    <div class="alert alert-warning" role="alert">Selecione os arquivos novamente.</div>
    <div class="alert alert-info" role="status">Prazo em contagem.</div>
    <form>
      <label class="form-label" for="busca">Número do processo</label>
      <input class="form-control" id="busca" type="text">
      <div class="form-text">Somente os dígitos.</div>
      <label class="form-label" for="situacao">Situação</label>
      <select class="form-select" id="situacao"><option>Todas</option></select>
      <div class="form-check">
        <input class="form-check-input" type="checkbox" id="sigilo">
        <label class="form-check-label" for="sigilo">Somente sigilosos</label>
      </div>
      <div class="form-check">
        <input class="form-check-input" type="checkbox" id="marcado" checked>
        <label class="form-check-label" for="marcado">Com prazo</label>
      </div>
      <button class="btn btn-primary" type="submit">Buscar</button>
      <button class="btn btn-outline-secondary" type="button">Exportar</button>
      <button class="btn btn-link" type="button">Limpar</button>
    </form>
    <nav aria-label="Andamento do processo"><ul class="nav nav-tabs">
      <li class="nav-item"><a class="nav-link active" href="#movimentacoes" aria-current="page">Movimentações</a></li>
      <li class="nav-item"><a class="nav-link" href="#documentos">Documentos</a></li>
    </ul></nav>
    <p>Use <code>--jus-color-primary</code> no texto e <a href="#ajuda">veja a ajuda</a>.</p>
    <pre class="bg-body-tertiary p-3"><code>var(--jus-color-surface)</code></pre>
    <table class="table">
      <caption>Documentos</caption>
      <thead><tr><th scope="col">Nome</th><th scope="col">Tamanho</th></tr></thead>
      <tbody><tr><td>Petição inicial</td><td>180 KB</td></tr></tbody>
    </table>
    <nav aria-label="Paginação"><ul class="pagination">
      <li class="page-item"><a class="page-link" href="#pagina-1">1</a></li>
      <li class="page-item active"><span class="page-link" aria-current="page">2</span></li>
      <li class="page-item"><a class="page-link" href="#pagina-3">3</a></li>
    </ul></nav>
  </main>
  <footer class="border-top py-3 small text-body-secondary">Projeto de demonstração.</footer>`;

/** The timeline as <twig:Timeline> renders it, inside the custom element that filters it. */
const TIMELINE = `
  <ol class="list-unstyled jus-timeline" role="list">
    <li class="jus-timeline-day">
      <h3 class="h6 text-body-secondary mb-2"><time datetime="2024-04-02">02/04/2024</time></h3>
      <ol class="list-unstyled" role="list">
        <li class="jus-timeline-event" data-event-type="decision" data-event-label="Decisão">
          <i class="bi bi-hammer" aria-hidden="true"></i>
          <div class="jus-timeline-event-body"><p class="mb-0"><strong>Decisão</strong></p><p class="mb-0 jus-timeline-description">Defiro.</p></div>
        </li>
      </ol>
    </li>
    <li class="jus-timeline-day">
      <h3 class="h6 text-body-secondary mb-2"><time datetime="2024-03-04">04/03/2024</time></h3>
      <ol class="list-unstyled" role="list">
        <li class="jus-timeline-event" data-event-type="filing" data-event-label="Juntada de petição">
          <i class="bi bi-file-earmark-arrow-up" aria-hidden="true"></i>
          <div class="jus-timeline-event-body"><p class="mb-0"><strong>Juntada de petição — Petição inicial</strong></p><p class="mb-0 jus-timeline-description">Petição inicial distribuída.</p></div>
        </li>
      </ol>
    </li>
  </ol>`;

/** The table of <twig:DataTable>: cards below md, a table from md up. */
const DATA_TABLE = `
  <div class="jus-data-table-wrapper">
    <div class="table-responsive">
      <table class="table align-middle jus-data-table">
        <caption>Documentos do processo</caption>
        <thead><tr><th scope="col">Nome</th><th scope="col">Tamanho</th></tr></thead>
        <tbody><tr><td data-label="Nome">Petição inicial</td><td data-label="Tamanho">180 KB</td></tr></tbody>
      </table>
    </div>
  </div>`;

/** The sign-in page as templates/security/login.html.twig renders it, in the main content of the layout. */
const LOGIN = `
  <main id="conteudo" class="container py-4">
    <div class="jus-login">
      <div class="jus-login-hero text-bg-primary">
        <p class="jus-brand"><span class="jus-brand-mark" aria-hidden="true">J</span> <span class="jus-brand-name">Jus</span></p>
        <p class="jus-login-hero-title">Processo eletrônico, do jeito que deveria ser.</p>
        <p class="jus-login-hero-text">Consulta, prazos e peticionamento num painel acessível, que funciona até sem JavaScript.</p>
        <p class="jus-login-hero-note"><i class="bi bi-info-circle" aria-hidden="true"></i> Projeto de demonstração · dados fictícios</p>
      </div>
      <div class="jus-login-card jus-surface">
        <h1 class="h3 mb-3">Entrar</h1>
        <form method="post" action="#entrar">
          <div class="mb-3"><label class="form-label" for="username">E-mail</label><input class="form-control" type="email" id="username"></div>
          <div class="mb-3"><label class="form-label" for="password">Senha</label><input class="form-control" type="password" id="password"></div>
          <button class="btn btn-primary w-100" type="submit">Entrar</button>
        </form>
        <div class="jus-demo-accounts">
          <p class="jus-demo-accounts-title"><i class="bi bi-person-badge" aria-hidden="true"></i> Contas de demonstração</p>
          <ul class="list-unstyled"><li><code>advogado@jus.test</code> (advogada)</li><li><code>servidor@jus.test</code> (servidor)</li></ul>
          <p>Senha das duas: <code>jus-demo</code></p>
        </div>
      </div>
    </div>
  </main>`;

/** An error page as templates/_error_card.html.twig renders it, in the given tone, in the main content of the layout. */
function errorPage(tone: string): string {
  return `
    <main id="conteudo" class="container py-4">
      <div class="jus-error-page">
        <div class="jus-error jus-surface">
          <span class="jus-error-icon jus-error-icon-${tone}" aria-hidden="true"><i class="bi bi-signpost-2"></i></span>
          <h1 class="h3">Página não encontrada</h1>
          <p class="lead">O endereço pode estar incorreto, ou o conteúdo não existe mais.</p>
          <a class="btn btn-primary" href="#entrar">Entrar</a>
        </div>
      </div>
    </main>`;
}

const ERROR_TONES = ['info', 'warning', 'danger'];

/** A card of the results, as <twig:CaseCard> renders it (in short). */
function caseCard(number: string): string {
  return `
    <li class="col-12 col-xl-6">
      <article class="card jus-surface jus-case-card h-100"><div class="card-body">
        <h3 class="h6 mb-0 font-monospace"><a href="#${number}" class="stretched-link">${number}</a></h3>
        <p class="mb-1 fw-semibold">Procedimento Comum Cível</p>
      </div></article>
    </li>`;
}

/** The search as templates/case/search.html.twig renders it, with two filters in use and three cards. */
const SEARCH = `
  <main id="conteudo" class="container py-4">
    <h1 class="h2 mb-3">Processos</h1>
    <div class="row g-4 jus-search">
      <div class="col-12 col-lg-4 col-xxl-3 jus-search-filters">
        <details class="jus-filters" open data-jus-filters-active="true">
          <summary><i class="bi bi-funnel" aria-hidden="true"></i> Filtrar · 2 filtros<i class="bi bi-chevron-down jus-filters-chevron" aria-hidden="true"></i></summary>
          <form method="get" class="jus-surface jus-filters-form" role="search" aria-label="Buscar processos">
            <div class="mb-3"><label class="form-label" for="parte">Nome da parte</label><input class="form-control" id="parte" name="parte" value="maria"></div>
            <div class="mb-3"><label class="form-label" for="status">Status</label><select class="form-select" id="status" name="status"><option value="active" selected>Em andamento</option></select></div>
            <div class="d-flex flex-wrap align-items-center gap-2">
              <button type="submit" class="btn btn-primary">Buscar</button>
              <a class="btn btn-link" href="#limpar">Limpar</a>
            </div>
          </form>
        </details>
      </div>
      <div class="col-12 col-lg-8 col-xxl-9 jus-search-results">
        <h2 class="h4" id="resultados" tabindex="-1">3 processos encontrados</h2>
        <ul class="list-unstyled row g-3 jus-case-list" role="list">
          ${caseCard('0000001-39.2024.8.26.0100')}${caseCard('0000002-14.2024.8.26.0100')}${caseCard('0000003-86.2024.8.26.0100')}
        </ul>
      </div>
    </div>
  </main>`;

/** A party of the case page, as templates/case/show.html.twig renders it. */
function party(name: string, lawyers: string): string {
  return `
    <li class="jus-party">
      <h4 class="h6 mb-1">${name}</h4>
      <p class="small text-body-secondary mb-1">381.818.397-60</p>
      ${lawyers === '' ? '<p class="small mb-0 text-body-secondary">Sem advogado constituído.</p>' : `<p class="small mb-0">Advogados: ${lawyers}</p>`}
    </li>`;
}

/** The case page as templates/case/show.html.twig renders it (in short), for a lawyer who may file, in the layout's main. */
const CASE_PAGE = `
  <main id="conteudo" class="container py-4">
    <header class="jus-page-header">
      <p class="jus-back-link"><a href="#processos"><i class="bi bi-arrow-left" aria-hidden="true"></i> <span class="visually-hidden">Voltar para</span> Processos</a></p>
      <div class="jus-case-header">
        <div class="jus-case-header-title">
          <div class="d-flex flex-wrap align-items-center gap-2">
            <h1 class="h3 mb-0 font-monospace jus-case-number">0001001-03.2026.8.26.0101</h1>
            <span class="badge rounded-pill jus-badge jus-badge-success"><i class="bi bi-play-circle" aria-hidden="true"></i> Em andamento</span>
            <span class="badge rounded-pill jus-badge jus-badge-inverse"><i class="bi bi-lock" aria-hidden="true"></i> Sigiloso</span>
          </div>
          <p class="jus-case-class">Execução de Título Extrajudicial</p>
        </div>
        <a class="btn btn-primary" href="#peticionar"><i class="bi bi-file-earmark-arrow-up" aria-hidden="true"></i> Peticionar</a>
      </div>
    </header>
    <div class="row g-4 jus-case">
      <aside class="col-12 col-lg-4 jus-case-aside" aria-labelledby="dados-da-causa partes">
        <section aria-labelledby="dados-da-causa">
          <h2 class="h4" id="dados-da-causa">Dados da causa</h2>
          <dl class="jus-surface jus-case-data">
            <div><dt>Assunto</dt><dd>Cobrança de aluguéis</dd></div>
            <div><dt>Órgão julgador</dt><dd>2ª Vara Cível</dd></div>
            <div><dt>Valor da causa</dt><dd>R$ 439.822,87</dd></div>
            <div><dt>Distribuição</dt><dd><time datetime="2026-08-21">21/08/2026</time></dd></div>
            <div><dt>Sigilo</dt><dd>Sigiloso</dd></div>
          </dl>
        </section>
        <section aria-labelledby="partes">
          <h2 class="h4" id="partes">Partes</h2>
          <div class="jus-surface jus-party-side">
            <h3 class="jus-party-side-title">Polo ativo</h3>
            <ul class="list-unstyled mb-0" role="list">${party('Cauan Aguiar Neto', 'Ana Ribeiro (SP 123.456)')}${party('Maria Oliveira', '')}</ul>
          </div>
          <div class="jus-surface jus-party-side">
            <h3 class="jus-party-side-title">Polo passivo</h3>
            <p class="text-body-secondary mb-0"><span aria-hidden="true">—</span><span class="visually-hidden">Nenhuma parte.</span></p>
          </div>
        </section>
      </aside>
      <div class="col-12 col-lg-8 jus-case-main">
        <section aria-labelledby="prazos">
          <h2 class="h4" id="prazos">Prazos</h2>
          <div class="jus-surface jus-case-panel">
            <ul class="list-unstyled mb-0 jus-deadlines" role="list">
              <li><span class="badge rounded-pill jus-badge jus-badge-warning" data-urgency="warning"><i class="bi bi-hourglass-split" aria-hidden="true"></i> Vence em 2 dias úteis (05/11)</span> <span>Cauan Aguiar Neto — intimação em <time datetime="2026-10-30">30/10/2026</time></span></li>
              <li><span class="badge rounded-pill jus-badge jus-badge-neutral" data-urgency="fulfilled"><i class="bi bi-check2-circle" aria-hidden="true"></i> Cumprido em 02/11/2026</span> <span>Maria Oliveira — intimação em <time datetime="2026-10-20">20/10/2026</time></span></li>
            </ul>
          </div>
        </section>
        <section aria-labelledby="andamento-titulo">
          <h2 class="h4" id="andamento-titulo">Andamento</h2>
          <nav id="andamento" aria-label="Andamento do processo" tabindex="-1"><ul class="nav nav-tabs mb-3">
            <li class="nav-item"><a class="nav-link active" href="#movimentacoes" aria-current="page">Movimentações</a></li>
            <li class="nav-item"><a class="nav-link" href="#documentos">Documentos</a></li>
          </ul></nav>
          <div class="jus-surface jus-case-panel">${TIMELINE}</div>
        </section>
      </div>
    </div>
  </main>`;

/** The filing page as templates/case/file.html.twig renders it after a refused submit (in short), in the layout's main. */
const FILING_PAGE = `
  <main id="conteudo" class="container py-4">
    <header class="jus-page-header">
      <p class="jus-back-link"><a href="#processo"><i class="bi bi-arrow-left" aria-hidden="true"></i> Voltar para o processo</a></p>
      <h1 class="h3 mb-1">Peticionar</h1>
      <p class="jus-case-class"><span class="font-monospace">0001001-03.2026.8.26.0101</span> · Execução de Título Extrajudicial</p>
    </header>
    <div class="jus-surface jus-filing-card">
      <div class="alert alert-danger" id="resumo-erros">
        <p class="fw-semibold mb-1"><i class="bi bi-x-octagon-fill" aria-hidden="true"></i> <span class="visually-hidden">Erro:</span> Corrija os campos indicados e envie a petição de novo:</p>
        <ul class="mb-0"><li><a class="alert-link" href="#filing_description">Descrição</a></li></ul>
      </div>
      <form method="post" action="#peticionar">
        <div class="mb-3"><label class="form-label" for="filing_type">Tipo de petição</label><select class="form-select" id="filing_type"><option>Manifestação</option></select></div>
        <div class="mb-3"><label class="form-label" for="filing_description">Descrição</label><textarea class="form-control is-invalid" id="filing_description" aria-invalid="true" aria-describedby="filing_description_error1"></textarea><div class="invalid-feedback d-block" id="filing_description_error1">Descreva a petição.</div></div>
        <button type="submit" class="btn btn-primary">Juntar petição</button>
      </form>
    </div>
  </main>`;

/** A row of the catalogue's table of colours, as templates/design_system/sections/tokens.html.twig renders it. */
function swatchRow(role: string): string {
  const cell = (theme: Theme): string => `
    <td><span class="jus-token-sample">
      <span class="jus-token-swatch jus-token-swatch-${role}" data-bs-theme="${theme}" aria-hidden="true"></span>
      <code data-jus-token-value="--jus-color-${role}" data-jus-token-theme="${theme}">valor</code>
    </span></td>`;

  return `<tr><th scope="row" class="text-nowrap"><code>--jus-color-${role}</code></th>${cell('light')}${cell('dark')}<td>Uso.</td></tr>`;
}

const SWATCH_ROLES = ['page', 'surface', 'border-strong', 'primary'];

/** The catalogue as templates/design_system/index.html.twig renders it (in short), with a tall section to scroll past. */
const CATALOG = `
  <main id="conteudo" class="container py-4">
    <header class="jus-page-header">
      <h1 class="h2">Design System</h1>
      <p class="lead mb-2">Componentes da interface, renderizados a partir do próprio código.</p>
      <p class="jus-catalog-themes"><i class="bi bi-circle-half" aria-hidden="true"></i> Troque de tema para ver cada componente no claro e no escuro.</p>
    </header>
    <div class="row g-4 jus-catalog">
      <div class="col-12 col-lg-3">
        <nav class="jus-surface jus-catalog-nav" aria-label="Componentes"><ul class="nav flex-lg-column">
          <li class="nav-item"><a class="nav-link" href="#tokens">Tokens de design</a></li>
          <li class="nav-item"><a class="nav-link" href="#alert">Alert</a></li>
          <li class="nav-item"><a class="nav-link" href="#status-badge">StatusBadge</a></li>
          <li class="nav-item"><a class="nav-link" href="#cnj-field">Campo de número CNJ</a></li>
        </ul></nav>
      </div>
      <div class="col-12 col-lg-9 jus-catalog-sections">
        <section id="tokens" class="jus-surface jus-catalog-section" aria-labelledby="tokens-titulo">
          <h2 class="h4" id="tokens-titulo">Tokens de design</h2>
          <p>Os tokens são a fonte única dos valores visuais.</p>
          <div class="table-responsive overflow-y-hidden mb-3 jus-catalog-reference" role="region" tabindex="0" aria-label="Cores nos dois temas">
            <table class="table table-sm align-middle mb-0">
              <caption class="visually-hidden">Cores nos dois temas</caption>
              <thead><tr><th scope="col">Papel</th><th scope="col">Claro</th><th scope="col">Escuro</th><th scope="col">Uso</th></tr></thead>
              <tbody>${SWATCH_ROLES.map(swatchRow).join('')}</tbody>
            </table>
          </div>
          <figure class="jus-catalog-example">
            <figcaption class="visually-hidden">Exemplo: sucesso</figcaption>
            <div class="alert alert-success" role="status">Petição protocolada.</div>
          </figure>
          <details class="jus-catalog-details" open>
            <summary>Código do exemplo: sucesso</summary>
            <pre class="jus-catalog-code"><code>&lt;twig:Alert type="success"&gt;Petição protocolada.&lt;/twig:Alert&gt;</code></pre>
          </details>
        </section>
        <section id="alert" class="jus-surface jus-catalog-section" aria-labelledby="alert-titulo">
          <h2 class="h4" id="alert-titulo">Alert</h2>
          <p class="jus-catalog-filler">Mensagem de feedback ao usuário.</p>
        </section>
      </div>
    </div>
  </main>`;

/** The value a custom property gives the colour of an element inside a scope of the theme. */
function colourIn(theme: Theme, token: string): string {
  const scope = mount(`<span data-bs-theme="${theme}" style="color: var(${token})"></span>`);
  const value = css(required(scope.firstElementChild), 'color');
  scope.remove();

  return value;
}

/** How many cards of the results share the first row. */
function cardsInTheFirstRow(page: ParentNode): number {
  const cards = Array.from(page.querySelectorAll('.jus-case-list > li'), (card) => card.getBoundingClientRect().top);

  return cards.filter((top) => top === cards[0]).length;
}

beforeEach(() => {
  style = document.createElement('style');
  style.textContent = appCss;
  document.head.append(style);
});

afterEach(() => {
  style.remove();
  document.body.replaceChildren();
  document.documentElement.removeAttribute('data-bs-theme');
});

function useTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-bs-theme', theme);
}

describe('the page stylesheet', () => {
  it('sets the text of the page in Inter, with the system fonts behind it', () => {
    const family = css(document.body, 'font-family');

    expect(family.startsWith('"Inter Variable"')).toBe(true);
    expect(family).toContain('system-ui');
  });

  it('serves the Inter variable faces from the package, not from a CDN', async () => {
    const faces = await document.fonts.load('1rem "Inter Variable"');

    expect(faces.length).toBeGreaterThan(0);
    expect(document.fonts.check('1rem "Inter Variable"')).toBe(true);
    expect(appCss).not.toMatch(/@import\s+(?:url\()?['"]?https?:|url\(\s*['"]?https?:/);
  });

  it('keeps the monospace stack of the system for numbers and code', () => {
    expect(css(document.body, '--bs-font-monospace')).toContain('monospace');
    expect(css(document.body, '--bs-font-monospace')).not.toContain('Inter');
  });

  it('asks the browser for native controls in the colour mode of the page', () => {
    expect(rootToken('color-scheme')).not.toBe('dark');

    useTheme('dark');

    expect(rootToken('color-scheme')).toBe('dark');
  });

  it('sizes the titles with the type scale of the tokens on a wide screen: page titles, then section titles, in the semibold weight', async () => {
    await atWidth(1280, () => {
      const page = mount('<h1 class="h2">Processos</h1><h1 class="h3">Peticionar</h1><h2 class="h4">Prazos</h2>');
      const pageTitle = Number.parseFloat(rootToken('--jus-font-size-page-title')) * 16;
      const sectionTitle = Number.parseFloat(rootToken('--jus-font-size-section-title')) * 16;

      expect(css(find(page, '.h2'), 'font-size')).toBe(`${String(pageTitle)}px`);
      expect(css(find(page, '.h3'), 'font-size')).toBe(`${String(pageTitle)}px`);
      expect(css(find(page, '.h4'), 'font-size')).toBe(`${String(sectionTitle)}px`);
      expect(css(find(page, '.h2'), 'font-weight')).toBe(rootToken('--jus-font-weight-semibold'));
    });
  });
});

describe.each(THEMES)('the %s theme, with the whole stylesheet', (theme) => {
  beforeEach(() => {
    useTheme(theme);
  });

  const pick = (light: string, dark: string): string => (theme === 'light' ? light : dark);

  it('paints the page and its text with the page and text roles', () => {
    sameColor(css(document.body, 'background-color'), pick('#f4f6f9', '#0f1722'));
    sameColor(css(document.body, 'color'), pick('#111827', '#e8edf3'));
    sameColor(css(document.body, '--bs-body-bg'), rootToken('--jus-color-page'));
    sameColor(css(document.body, '--bs-body-color'), rootToken('--jus-color-text'));
    sameColor(css(document.body, '--bs-border-color'), rootToken('--jus-color-border'));
    sameColor(css(document.body, '--bs-secondary-color'), rootToken('--jus-color-text-muted'));
  });

  describe('the navbar', () => {
    it('is the surface colour with a border below it, in both themes', () => {
      const navbar = find(mount(PAGE), '.navbar');

      sameColor(css(navbar, 'background-color'), pick('#ffffff', '#141e2b'));
      sameColor(css(navbar, 'background-color'), rootToken('--jus-color-surface'));
      sameColor(css(navbar, 'border-bottom-color'), rootToken('--jus-color-border'));
      expect(css(navbar, 'border-bottom-width')).toBe('1px');
      expect(css(navbar, 'border-bottom-style')).toBe('solid');
    });

    it('writes its links and the name of the person in the text colour, at 4.5:1 or more', () => {
      const navbar = find(mount(PAGE), '.navbar');

      sameColor(css(find(navbar, '.nav-link[href="#catalogo"]'), 'color'), rootToken('--jus-color-text'));
      for (const label of navbar.querySelectorAll('.jus-brand-name, .nav-link, .jus-user-name')) {
        expect(contrastOfText(label), label.textContent).toBeGreaterThanOrEqual(TEXT);
      }
    });

    it('marks the current section in the primary colour, underlined, and leaves the others plain', () => {
      const navbar = find(mount(PAGE), '.navbar');
      const current = find(navbar, '.nav-link.active');
      const other = find(navbar, '.nav-link[href="#catalogo"]');

      sameColor(css(current, 'color'), pick('#1f4e79', '#7fb2e5'));
      expect(css(current, 'text-decoration-line')).toBe('underline');
      expect(contrastOfText(current)).toBeGreaterThanOrEqual(TEXT);
      expect(css(other, 'text-decoration-line')).toBe('none');
    });

    it('draws the brand mark as a primary square with the initial in the on-primary colour', () => {
      const mark = find(mount(PAGE), '.jus-brand-mark');

      sameColor(css(mark, 'background-color'), rootToken('--jus-color-primary'));
      sameColor(css(mark, 'color'), rootToken('--jus-color-on-primary'));
      expect(css(mark, 'border-top-left-radius')).toBe('6px');
      expect(contrastOfText(mark)).toBeGreaterThanOrEqual(TEXT);
      expect(mark.getBoundingClientRect().width).toBe(mark.getBoundingClientRect().height);
    });

    it('draws the avatar as a round badge with legible initials', () => {
      const avatar = find(mount(PAGE), '.jus-avatar');

      expect(css(avatar, 'border-top-left-radius')).toBe('50%');
      expect(parseColor(css(avatar, 'background-color')).alpha).toBe(1);
      expect(contrastOfText(avatar)).toBeGreaterThanOrEqual(TEXT);
      expect(avatar.getBoundingClientRect().width).toBe(avatar.getBoundingClientRect().height);
      // The same size as the brand mark, from the spacing scale (twice space 3).
      expect(avatar.getBoundingClientRect().width).toBe(find(document.body, '.jus-brand-mark').getBoundingClientRect().width);
      expect(avatar.getBoundingClientRect().width).toBe(Number.parseFloat(rootToken('--jus-space-3')) * 16 * 2);
    });

    it('gives the menu button a boundary and an icon that stand out from the navbar', () => {
      const navbar = find(mount(PAGE), '.navbar');
      const toggler = find(navbar, '.navbar-toggler');

      sameColor(css(toggler, 'border-top-color'), rootToken('--jus-color-text-muted'));
      expect(contrastRatio(css(toggler, 'border-top-color'), css(navbar, 'background-color'))).toBeGreaterThanOrEqual(CONTROL);
    });

    it('draws the theme switcher with a visible current theme, and legible buttons', () => {
      const navbar = find(mount(PAGE), '.navbar');
      const navbarBackground = css(navbar, 'background-color');
      const buttons = Array.from(navbar.querySelectorAll<HTMLElement>('.jus-theme-switcher .btn'));
      const current = buttons.filter((button) => button.getAttribute('aria-pressed') === 'true');

      expect(buttons).toHaveLength(3);
      expect(current).toHaveLength(1);
      for (const button of buttons) {
        // Text and icon over the fill of the button (the current one) or the navbar; the border against the navbar (1.4.11).
        expect(contrastOfText(button), button.textContent).toBeGreaterThanOrEqual(TEXT);
        expect(contrastRatio(css(button, 'border-top-color'), navbarBackground), button.textContent).toBeGreaterThanOrEqual(CONTROL);
      }
      // In the page's own colours the current theme is a filled button among outlined ones, the fill in the primary colour
      // and the label in the colour that goes on it; the fill stands out from the navbar (forced colours, which drop it,
      // are the next test).
      for (const button of buttons.filter((other) => !current.includes(other))) {
        expect(parseColor(css(button, 'background-color')).alpha).toBe(0);
      }
      const pressed = required(current[0]);
      sameColor(css(pressed, 'background-color'), rootToken('--jus-color-primary'));
      sameColor(css(pressed, 'color'), rootToken('--jus-color-on-primary'));
      expect(contrastRatio(css(pressed, 'background-color'), navbarBackground)).toBeGreaterThanOrEqual(CONTROL);
    });

    it('draws the focus ring of a switcher button over the current theme beside it', async () => {
      const switcher = find(mount(PAGE), '.jus-theme-switcher');
      const first = find(switcher, '.btn[value="sistema"]');
      const pressed = find(switcher, '.btn[aria-pressed="true"]');
      // Tabbing in from just before the group gives the keyboard focus (and :focus-visible) to its first button.
      const before = document.createElement('button');
      before.textContent = 'Antes';
      switcher.before(before);
      before.focus();

      await userEvent.tab();

      expect(document.activeElement).toBe(first);
      expect(first.matches(':focus-visible')).toBe(true);
      expect(Number(css(first, 'z-index'))).toBeGreaterThan(Number(css(pressed, 'z-index')));

      // The ring itself: the token ring of the theme, kept off the button by a gap, at 3:1 or more against the navbar
      // around it and against that gap.
      settle(first);
      const [gap, ring] = shadowColours(css(first, 'box-shadow'));
      const navbarBackground = css(find(document.body, '.jus-navbar'), 'background-color');
      sameColor(required(ring), rootToken('--jus-focus-ring'));
      expect(contrastRatio(required(ring), navbarBackground)).toBeGreaterThanOrEqual(FOCUS);
      expect(contrastRatio(required(ring), required(gap))).toBeGreaterThanOrEqual(FOCUS);
    });

    it.each([800, 1024])('keeps the navbar on one line at %i px, the items inside it, even with a long name', async (width) => {
      await atWidth(width, () => {
        const short = find(mount(navbarFor('Ana Ribeiro')), '.navbar');
        const long = find(mount(navbarFor(VERY_LONG_NAME)), '.navbar');
        const container = find(long, '.container').getBoundingClientRect();

        expect(long.getBoundingClientRect().height).toBe(short.getBoundingClientRect().height);
        for (const item of long.querySelectorAll('.navbar-brand, .navbar-nav > li')) {
          const box = item.getBoundingClientRect();
          expect(box.right, item.textContent).toBeLessThanOrEqual(container.right + 0.5);
          expect(box.top, item.textContent).toBeGreaterThanOrEqual(container.top - 0.5);
          expect(box.bottom, item.textContent).toBeLessThanOrEqual(container.bottom + 0.5);
        }
        // The links and the theme buttons never wrap (an icon above its word, in a squeezed switcher): only the name gives way.
        // The icon font is not loaded here, so the wrap would not show in the heights; the rule is what is checked.
        for (const link of long.querySelectorAll('.nav-link')) {
          expect(link.getClientRects(), link.textContent).toHaveLength(1);
          expect(css(link, 'white-space')).toBe('nowrap');
        }
        for (const button of long.querySelectorAll('.jus-theme-switcher .btn')) {
          expect(css(button, 'white-space'), button.textContent).toBe('nowrap');
        }
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
      });
    });

    it('shows only the avatar between md and lg, the name staying there as text for screen readers', async () => {
      await atWidth(800, () => {
        const navbar = find(mount(navbarFor(LONG_NAME)), '.navbar');
        const name = find(navbar, '.jus-user-name');

        expect(find(navbar, '.jus-avatar').getBoundingClientRect().width).toBeGreaterThan(1);
        expect(name.getBoundingClientRect().width).toBeLessThanOrEqual(1);
        expect(css(name, 'position')).toBe('absolute');
        expect(name.textContent).toBe(LONG_NAME);
      });
    });

    it('shortens a name too long for the navbar with an ellipsis from lg up, and shows a short one whole', async () => {
      await atWidth(1024, () => {
        const long = find(mount(navbarFor(VERY_LONG_NAME)), '.jus-user-name');
        const short = find(mount(navbarFor('Ana Ribeiro')), '.jus-user-name');

        expect(css(long, 'text-overflow')).toBe('ellipsis');
        expect(long.scrollWidth).toBeGreaterThan(long.clientWidth);
        expect(long.getClientRects()).toHaveLength(1);
        expect(short.scrollWidth).toBeLessThanOrEqual(short.clientWidth);
      });
    });

    it('lets the name wrap in the menu of a phone', async () => {
      await atWidth(375, () => {
        const name = find(mount(PAGE.replace('Maria Souza', LONG_NAME)), '.jus-user-name');

        expect(css(name, 'white-space')).toBe('normal');
        expect(css(name, 'position')).not.toBe('absolute');
      });
    });

    it('marks the current theme of the switcher by its border too, when the system forces its colours (the fill is lost)', async () => {
      const buttons = Array.from(find(mount(PAGE), '.jus-theme-switcher').querySelectorAll<HTMLElement>('.btn'));
      const current = required(buttons.find((button) => button.getAttribute('aria-pressed') === 'true'));
      const others = buttons.filter((button) => button !== current);
      const border = (button: HTMLElement): number => Number.parseFloat(css(button, 'border-top-width'));
      const before = current.getBoundingClientRect();

      await cdp().send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
      try {
        // Thicker than the others, so the current one reads in the system's own colours without the fill...
        for (const other of others) {
          expect(border(current)).toBeGreaterThan(border(other));
        }
        // ...and without the group changing size or the buttons moving.
        const after = current.getBoundingClientRect();
        expect([after.width, after.height]).toEqual([before.width, before.height]);
      } finally {
        await cdp().send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: '' }] });
      }

      // Outside forced colours the border is the same on every button.
      for (const other of others) {
        expect(border(current)).toBe(border(other));
      }
    });
  });

  describe('surfaces', () => {
    it('draws a panel and a card (.jus-surface) with the surface role, the large radius and the card shadow', () => {
      const page = mount(PAGE);

      for (const surface of [find(page, 'section.jus-surface'), find(page, 'article.card.jus-surface')]) {
        sameColor(css(surface, 'background-color'), pick('#ffffff', '#141e2b'));
        expect(css(surface, 'border-top-left-radius')).toBe('12px');
        expect(css(surface, 'box-shadow')).toBe(computed('box-shadow', '--jus-shadow-card'));
      }
      // The card shadow is the edge of a card: Bootstrap's own border would draw a second one.
      expect(css(find(page, 'article.card'), 'border-top-width')).toBe('0px');
    });

    it('gives the surfaces, the rows and the panel of the documents table and the page header a real border in forced colours, which drop shadows and border images', async () => {
      const border = (element: Element, side: 'top' | 'bottom' = 'top'): string => `${css(element, `border-${side}-style`)} ${css(element, `border-${side}-width`)}`;

      await atWidth(375, async () => {
        const page = mount(`${PAGE}${DATA_TABLE}`);
        const header = find(page, '.jus-page-header');
        const surfaces = [find(page, 'section.jus-surface'), find(page, 'article.card.jus-surface'), find(page, '.jus-data-table tbody tr')];

        // Outside forced colours the shadow (and, for the band, the border image) is the edge, and there is no border.
        for (const surface of surfaces) {
          expect(css(surface, 'border-top-width')).toBe('0px');
        }
        await inForcedColours(() => {
          for (const surface of surfaces) {
            expect(css(surface, 'box-shadow')).toBe('none');
            expect(border(surface)).toBe('solid 1px');
          }
          expect(css(header, 'border-image-source')).toBe('none');
          expect(border(header, 'bottom')).toBe('solid 1px');
        });
      });
      await atWidth(1280, async () => {
        const panel = find(mount(DATA_TABLE), '.jus-data-table-wrapper > .table-responsive');

        await inForcedColours(() => {
          expect(border(panel)).toBe('solid 1px');
          // In table layout the row is no card: only the panel has the border.
          expect(css(find(panel, 'tbody tr'), 'border-top-width')).toBe('0px');
        });
      });
    });

    it('gives a surface its edge as a one pixel border in the colour of the border role on the dark theme', () => {
      const shadow = computed('box-shadow', '--jus-shadow-card');

      if (theme === 'dark') {
        expect(shadow).toBe(`${computed('color', '--jus-color-border')} 0px 0px 0px 1px`);
      } else {
        expect(shadow).toMatch(/0px 1px 3px 0px, .+ 0px 4px 12px 0px$/);
      }
    });

    it('draws the page header as a surface band from edge to edge, with a line below, without a sideways scroll', () => {
      const header = find(mount(PAGE), '.jus-page-header');
      const band = css(header, 'border-image-source');

      // The band is drawn by the border image, which reaches out to the sides of the window (it never makes the page
      // scroll): the surface, and the border colour in its last pixel.
      expect(band).toContain(computed('color', '--jus-color-surface'));
      expect(band).toContain(computed('color', '--jus-color-border'));
      expect(Number.parseFloat(css(header, 'border-image-outset').split(' ')[1] ?? '0')).toBeGreaterThan(0);
      expect(css(header, 'padding-top')).toBe(css(header, 'padding-bottom'));
      expect(Number.parseFloat(css(header, 'padding-top'))).toBeGreaterThan(0);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
      expect(contrastRatio(css(find(header, 'h1'), 'color'), rootToken('--jus-color-surface'))).toBeGreaterThanOrEqual(TEXT);
    });

    it('puts tables on the surface, not on the page', () => {
      const page = mount(PAGE);

      for (const cell of page.querySelectorAll('table.table th, table.table td')) {
        sameColor(css(cell, 'background-color'), rootToken('--jus-color-surface'));
        sameColor(css(cell, 'color'), rootToken('--jus-color-text'));
        expect(contrastRatio(css(cell, 'color'), rootToken('--jus-color-surface'))).toBeGreaterThanOrEqual(TEXT);
      }
    });

    it('makes each row of the documents table a surface card on a narrow screen, with nothing around it that clips its edge', async () => {
      await atWidth(375, () => {
        const wrapper = find(mount(DATA_TABLE), '.jus-data-table-wrapper > .table-responsive');
        const row = find(wrapper, 'tbody tr');

        expect(css(row, 'display')).toBe('block');
        sameColor(css(row, 'background-color'), rootToken('--jus-color-surface'));
        expect(css(row, 'border-top-left-radius')).toBe('12px');
        expect(css(row, 'box-shadow')).toBe(computed('box-shadow', '--jus-shadow-card'));
        // The cards wrap their text, so the box around them need not scroll; a scrolling box would cut the side shadow.
        expect(css(wrapper, 'overflow-x')).toBe('visible');
        expect(css(wrapper, 'overflow-y')).toBe('visible');
      });
    });

    it('lays the documents table out as one panel on the surface from md up, with rounded corners, scrolling sideways inside', async () => {
      await atWidth(1280, () => {
        const wrapper = find(mount(DATA_TABLE), '.jus-data-table-wrapper > .table-responsive');

        expect(css(wrapper, 'border-top-left-radius')).toBe('12px');
        expect(css(wrapper, 'box-shadow')).toBe(computed('box-shadow', '--jus-shadow-card'));
        sameColor(css(wrapper, 'background-color'), rootToken('--jus-color-surface'));
        sameColor(css(find(wrapper, 'td'), 'background-color'), rootToken('--jus-color-surface'));
        expect(css(wrapper, 'overflow-x')).toBe('auto');
      });
    });

    it('draws the timeline rail in the strong border colour, which stays visible on the page and on a surface', () => {
      const event = find(mount(TIMELINE), '.jus-timeline-event');
      const rail = css(event, 'border-left-color');

      sameColor(rail, rootToken('--jus-color-border-strong'));
      expect(css(event, 'border-left-width')).toBe('2px');
      expect(contrastRatio(rail, rootToken('--jus-color-page'))).toBeGreaterThanOrEqual(SEPARATOR);
      expect(contrastRatio(rail, rootToken('--jus-color-surface'))).toBeGreaterThanOrEqual(SEPARATOR);
    });
  });

  describe('badges', () => {
    it.each(['success', 'warning', 'danger', 'info', 'neutral'])('draws the %s badge as a pill in the tinted tone of its status, at 4.5:1 or more', (tone) => {
      const badge = find(mount(PAGE), `.jus-badge-${tone}`);

      sameColor(css(badge, 'color'), rootToken(`--jus-color-${tone}-text`));
      sameColor(css(badge, 'background-color'), rootToken(`--jus-color-${tone}-bg`));
      expect(contrastOfText(badge)).toBeGreaterThanOrEqual(TEXT);
      expect(Number.parseFloat(css(badge, 'border-top-left-radius'))).toBeGreaterThanOrEqual(badge.getBoundingClientRect().height / 2);
    });

    it('draws the confidential badge in the strong tone, the text colour as the fill, which stands out on every surface', () => {
      const badge = find(mount(PAGE), '.jus-badge-inverse');

      sameColor(css(badge, 'background-color'), rootToken('--jus-color-text'));
      sameColor(css(badge, 'color'), rootToken('--jus-color-surface'));
      expect(contrastOfText(badge)).toBeGreaterThanOrEqual(TEXT);
      expect(contrastRatio(css(badge, 'background-color'), rootToken('--jus-color-surface'))).toBeGreaterThanOrEqual(CONTROL);
    });
  });

  describe('buttons and fields', () => {
    it('fills the primary button with the primary role of the theme and labels it in the on-primary colour', () => {
      const button = find(mount(PAGE), '.btn-primary');

      sameColor(css(button, 'background-color'), pick('#1f4e79', '#7fb2e5'));
      sameColor(css(button, 'color'), rootToken('--jus-color-on-primary'));
      expect(css(button, 'border-top-left-radius')).toBe('8px');
      expect(contrastOfText(button)).toBeGreaterThanOrEqual(TEXT);
      // The shape of the button against the page and the cards (1.4.11).
      expect(contrastRatio(css(button, 'background-color'), rootToken('--jus-color-page'))).toBeGreaterThanOrEqual(CONTROL);
      expect(contrastRatio(css(button, 'background-color'), rootToken('--jus-color-surface'))).toBeGreaterThanOrEqual(CONTROL);
    });

    it('shows the hover of the primary button in its own shade, still legible', async () => {
      const button = find(mount(PAGE), '.btn-primary');
      const resting = css(button, 'background-color');

      await userEvent.hover(button);
      settle(button);

      expect(css(button, 'background-color')).not.toBe(resting);
      sameColor(css(button, 'background-color'), rootToken('--jus-color-primary-hover'));
      expect(contrastOfText(button)).toBeGreaterThanOrEqual(TEXT);
      await userEvent.unhover(button);
    });

    it('outlines the secondary button with the muted colour, at 3:1 or more, and labels it in the text colour', () => {
      const button = find(mount(PAGE), 'form .btn-outline-secondary');

      sameColor(css(button, 'color'), rootToken('--jus-color-text'));
      sameColor(css(button, 'border-top-color'), rootToken('--jus-color-text-muted'));
      expect(contrastOfText(button)).toBeGreaterThanOrEqual(TEXT);
      expect(contrastRatio(css(button, 'border-top-color'), rootToken('--jus-color-page'))).toBeGreaterThanOrEqual(CONTROL);
      expect(contrastRatio(css(button, 'border-top-color'), rootToken('--jus-color-surface'))).toBeGreaterThanOrEqual(CONTROL);
    });

    it('paints form fields with the surface role and the base radius', () => {
      const field = find(mount(PAGE), '.form-control');

      sameColor(css(field, 'background-color'), rootToken('--jus-color-surface'));
      expect(css(field, 'border-top-left-radius')).toBe('8px');
    });

    it.each(['.form-control', '.form-select', '.form-check-input:not(:checked)'])('draws the boundary of %s in the muted colour, at 3:1 or more on the page and on a card', (selector) => {
      const field = find(mount(PAGE), selector);
      const border = css(field, 'border-top-color');

      sameColor(border, rootToken('--jus-color-text-muted'));
      expect(contrastRatio(border, rootToken('--jus-color-page'))).toBeGreaterThanOrEqual(CONTROL);
      expect(contrastRatio(border, rootToken('--jus-color-surface'))).toBeGreaterThanOrEqual(CONTROL);
    });

    it('fills a ticked box with the primary role of the theme', () => {
      const box = find(mount(PAGE), '.form-check-input:checked');

      sameColor(css(box, 'background-color'), rootToken('--jus-color-primary'));
      expect(contrastRatio(css(box, 'background-color'), rootToken('--jus-color-surface'))).toBeGreaterThanOrEqual(CONTROL);
      // The tick is an image in the on-primary colour of the theme, so it stands out from the fill.
      expect(decodeURIComponent(css(box, 'background-image'))).toContain(`stroke='${rootToken('--jus-color-on-primary')}'`);
      expect(contrastRatio(rootToken('--jus-color-on-primary'), css(box, 'background-color'))).toBeGreaterThanOrEqual(CONTROL);
    });

    it('marks the current page of the pagination with the primary role and the on-primary label', () => {
      const current = find(mount(PAGE), '.page-item.active .page-link');

      sameColor(css(current, 'background-color'), rootToken('--jus-color-primary'));
      sameColor(css(current, 'color'), rootToken('--jus-color-on-primary'));
      expect(contrastOfText(current)).toBeGreaterThanOrEqual(TEXT);
    });

    it('separates the page links, each with the base radius', () => {
      const links = Array.from(mount(PAGE).querySelectorAll<HTMLElement>('.page-link'));
      const [first, second] = links.map((link) => link.getBoundingClientRect());

      expect(required(second).left).toBeGreaterThan(required(first).right);
      for (const link of links) {
        expect(css(link, 'border-top-left-radius')).toBe('8px');
        expect(css(link, 'border-top-right-radius')).toBe('8px');
      }
    });
  });

  it('marks the current tab with a bar in the primary colour, at 3:1 or more, and keeps every tab legible', () => {
    const page = mount(PAGE);
    const current = find(page, '.nav-tabs .nav-link.active');
    const other = find(page, '.nav-tabs .nav-link:not(.active)');

    sameColor(css(current, 'border-bottom-color'), rootToken('--jus-color-primary'));
    expect(css(current, 'border-bottom-width')).toBe('2px');
    expect(contrastRatio(css(current, 'border-bottom-color'), rootToken('--jus-color-page'))).toBeGreaterThanOrEqual(CONTROL);
    expect(contrastRatio(css(current, 'border-bottom-color'), rootToken('--jus-color-surface'))).toBeGreaterThanOrEqual(CONTROL);
    sameColor(css(current, 'color'), rootToken('--jus-color-text'));
    expect(parseColor(css(other, 'border-bottom-color')).alpha).toBe(0);
    for (const tab of [current, other]) {
      expect(contrastOfText(tab), tab.textContent).toBeGreaterThanOrEqual(TEXT);
    }
  });

  it('draws links in the primary role of the theme', () => {
    const link = find(mount(PAGE), 'a[href="#ajuda"]');

    sameColor(css(link, 'color'), pick('#1f4e79', '#7fb2e5'));
  });

  it('draws code in the text colour, readable on the page and on the neutral fill', () => {
    const page = mount(PAGE);
    const inline = find(page, 'p > code');
    const block = find(page, 'pre > code');

    expect(contrastOfText(inline)).toBeGreaterThanOrEqual(TEXT);
    expect(contrastOfText(block)).toBeGreaterThanOrEqual(TEXT);
  });

  it.each(['success', 'danger', 'warning', 'info'])('draws the %s alert with the tones of its status', (status) => {
    const alert = find(mount(PAGE), `.alert-${status}`);

    sameColor(css(alert, 'color'), rootToken(`--jus-color-${status}-text`));
    sameColor(css(alert, 'background-color'), rootToken(`--jus-color-${status}-bg`));
    expect(contrastOfText(alert)).toBeGreaterThanOrEqual(TEXT);
    // The tinted fill is the shape; the border is there, transparent, for forced colours, which paint it in the system's.
    expect(parseColor(css(alert, 'border-top-color')).alpha).toBe(0);
    expect(css(alert, 'border-top-style')).toBe('solid');
  });

  describe('the sign-in page', () => {
    it('paints the presentation the brand blue in both themes, its text at 4.5:1 or more, with the inverse focus ring', () => {
      const hero = find(mount(LOGIN), '.jus-login-hero');
      const background = css(hero, 'background-color');

      sameColor(background, '#1f4e79');
      for (const text of hero.querySelectorAll('.jus-brand-name, .jus-login-hero-title, .jus-login-hero-text, .jus-login-hero-note')) {
        expect(contrastOfText(text), text.textContent).toBeGreaterThanOrEqual(TEXT);
      }
      sameColor(css(hero, '--jus-focus-ring'), rootToken('--jus-focus-color-inverse'));
      expect(contrastRatio(css(hero, '--jus-focus-ring'), background)).toBeGreaterThanOrEqual(FOCUS);
    });

    it('draws the brand mark on the blue as an outline in the text colour, around a legible initial', () => {
      const hero = find(mount(LOGIN), '.jus-login-hero');
      const mark = find(hero, '.jus-brand-mark');

      expect(parseColor(css(mark, 'background-color')).alpha).toBe(0);
      sameColor(css(mark, 'color'), css(hero, 'color'));
      sameColor(required(shadowColours(css(mark, 'box-shadow'))[0]), css(hero, 'color'));
      expect(contrastOfText(mark)).toBeGreaterThanOrEqual(TEXT);
    });

    it('puts the form on a surface card and the demonstration accounts on the tinted information fill, legible', () => {
      const page = mount(LOGIN);
      const card = find(page, '.jus-login-card');
      const accounts = find(page, '.jus-demo-accounts');

      sameColor(css(card, 'background-color'), rootToken('--jus-color-surface'));
      expect(css(card, 'box-shadow')).toBe(computed('box-shadow', '--jus-shadow-card'));
      sameColor(css(accounts, 'background-color'), rootToken('--jus-color-info-bg'));
      sameColor(css(accounts, 'color'), rootToken('--jus-color-info-text'));
      for (const text of accounts.querySelectorAll('p, li, code')) {
        expect(contrastOfText(text), text.textContent).toBeGreaterThanOrEqual(TEXT);
      }
    });

    it('has no accessibility violations, with the real palette', async () => {
      await expectNoAxeViolations(mount(LOGIN));
    });
  });

  describe('the error pages', () => {
    it.each(ERROR_TONES)('draws the large icon of the %s tone on its tinted round fill, legible', (tone) => {
      const icon = find(mount(errorPage(tone)), '.jus-error-icon');

      sameColor(css(icon, 'background-color'), rootToken(`--jus-color-${tone}-bg`));
      sameColor(css(icon, 'color'), rootToken(`--jus-color-${tone}-text`));
      expect(css(icon, 'border-top-left-radius')).toBe('50%');
      expect(contrastOfText(icon)).toBeGreaterThanOrEqual(TEXT);
    });

    it('has no accessibility violations, with the real palette', async () => {
      await expectNoAxeViolations(mount(errorPage('info')));
    });
  });

  describe('the search', () => {
    it('draws the summary of the filters as a button below lg: a boundary at 3:1 or more on the page, a legible label', async () => {
      await atWidth(375, () => {
        const summary = find(mount(SEARCH), '.jus-filters > summary');

        expect(css(summary, 'display')).toBe('flex');
        expect(css(summary, 'cursor')).toBe('pointer');
        sameColor(css(summary, 'background-color'), rootToken('--jus-color-surface'));
        sameColor(css(summary, 'border-top-color'), rootToken('--jus-color-text-muted'));
        expect(contrastRatio(css(summary, 'border-top-color'), rootToken('--jus-color-page'))).toBeGreaterThanOrEqual(CONTROL);
        expect(contrastOfText(summary)).toBeGreaterThanOrEqual(TEXT);
      });
    });

    it('puts the form of the filters on a surface card', () => {
      const form = find(mount(SEARCH), '.jus-filters form');

      sameColor(css(form, 'background-color'), rootToken('--jus-color-surface'));
      expect(css(form, 'border-top-left-radius')).toBe('12px');
      expect(css(form, 'box-shadow')).toBe(computed('box-shadow', '--jus-shadow-card'));
    });

    it('has no accessibility violations, with the real palette', async () => {
      await expectNoAxeViolations(mount(SEARCH));
    });
  });

  describe('the case page', () => {
    it('puts the content of each section on a surface card: the data, each side of the parties, the deadlines, the timeline', () => {
      const page = mount(CASE_PAGE);
      const panels = Array.from(page.querySelectorAll('.jus-case-data, .jus-party-side, .jus-case-panel'));

      expect(panels).toHaveLength(5);
      for (const panel of panels) {
        sameColor(css(panel, 'background-color'), rootToken('--jus-color-surface'));
        expect(css(panel, 'border-top-left-radius'), panel.className).toBe('12px');
        expect(css(panel, 'box-shadow'), panel.className).toBe(computed('box-shadow', '--jus-shadow-card'));
        expect(css(panel, 'padding-top'), panel.className).toBe(`${String(Number.parseFloat(rootToken('--jus-space-3')) * 16)}px`);
      }
    });

    it('writes the way back in the primary colour and the class in the muted one, legible on the band', () => {
      const header = find(mount(CASE_PAGE), '.jus-page-header');
      const back = find(header, '.jus-back-link a');
      const band = rootToken('--jus-color-surface');

      sameColor(css(back, 'color'), rootToken('--jus-color-primary'));
      expect(css(back, 'text-decoration-line')).toBe('none');
      expect(contrastRatio(css(back, 'color'), band)).toBeGreaterThanOrEqual(TEXT);
      sameColor(css(find(header, '.jus-case-class'), 'color'), rootToken('--jus-color-text-muted'));
      expect(contrastRatio(css(find(header, '.jus-case-class'), 'color'), band)).toBeGreaterThanOrEqual(TEXT);
    });

    it('underlines the way back under the pointer', async () => {
      const back = find(mount(CASE_PAGE), '.jus-back-link a');

      await userEvent.hover(back);
      expect(css(back, 'text-decoration-line')).toBe('underline');
      await userEvent.unhover(back);
    });

    it('writes the names of the data and the titles of the sides in the muted colour, at 4.5:1 or more on their cards', () => {
      const page = mount(CASE_PAGE);

      for (const label of page.querySelectorAll('.jus-case-data dt, .jus-party-side-title, .jus-party .text-body-secondary')) {
        sameColor(css(label, 'color'), rootToken('--jus-color-text-muted'));
        expect(contrastOfText(label), label.textContent).toBeGreaterThanOrEqual(TEXT);
      }
      for (const value of page.querySelectorAll('.jus-case-data dd, .jus-party h4, .jus-deadlines span:not(.badge)')) {
        expect(contrastOfText(value), value.textContent).toBeGreaterThanOrEqual(TEXT);
      }
    });

    it('draws a line in the border colour between one party, or one deadline, and the next, and none above the first', () => {
      const page = mount(CASE_PAGE);

      for (const list of [find(page, '.jus-party-side ul'), find(page, '.jus-deadlines')]) {
        const [first, second] = Array.from(list.children);
        expect(css(required(first), 'border-top-width')).toBe('0px');
        expect(css(required(second), 'border-top-style')).toBe('solid');
        expect(css(required(second), 'border-top-width')).toBe('1px');
        sameColor(css(required(second), 'border-top-color'), rootToken('--jus-color-border'));
      }
    });

    it('starts the timeline at the top of its card and ends it at the bottom, the days apart from each other', () => {
      const page = mount(CASE_PAGE);
      const [first, second] = Array.from(page.querySelectorAll('.jus-timeline-day > h3'));

      expect(css(required(first), 'margin-top')).toBe('0px');
      expect(css(required(second), 'margin-top')).toBe(`${String(Number.parseFloat(rootToken('--jus-space-3')) * 16)}px`);
      expect(css(find(page, '.jus-timeline'), 'margin-bottom')).toBe('0px');
    });

    it('has no accessibility violations, with the real palette', async () => {
      await expectNoAxeViolations(mount(CASE_PAGE));
    });
  });

  describe('the filing page', () => {
    it('puts the form on a surface card, with the summary of the errors at its top, legible', () => {
      const card = find(mount(FILING_PAGE), '.jus-filing-card');
      const summary = find(card, '#resumo-erros');

      sameColor(css(card, 'background-color'), rootToken('--jus-color-surface'));
      expect(css(card, 'border-top-left-radius')).toBe('12px');
      expect(css(card, 'box-shadow')).toBe(computed('box-shadow', '--jus-shadow-card'));
      expect(card.firstElementChild).toBe(summary);
      expect(summary.getBoundingClientRect().top - card.getBoundingClientRect().top).toBe(Number.parseFloat(css(card, 'padding-top')));
      expect(contrastOfText(find(summary, 'p'))).toBeGreaterThanOrEqual(TEXT);
      expect(contrastOfText(find(summary, 'a'))).toBeGreaterThanOrEqual(TEXT);
    });

    it('has no accessibility violations, with the real palette', async () => {
      await expectNoAxeViolations(mount(FILING_PAGE));
    });
  });

  describe('the catalogue', () => {
    it('puts the navigation and each section on a surface card', () => {
      const page = mount(CATALOG);

      for (const card of page.querySelectorAll('.jus-catalog-nav, .jus-catalog-section')) {
        sameColor(css(card, 'background-color'), rootToken('--jus-color-surface'));
        expect(css(card, 'border-top-left-radius')).toBe('12px');
        expect(css(card, 'box-shadow')).toBe(computed('box-shadow', '--jus-shadow-card'));
      }
    });

    it('writes the links of the navigation in the text colour, legible on their card and under the pointer', async () => {
      const link = find(mount(CATALOG), '.jus-catalog-nav .nav-link');

      sameColor(css(link, 'color'), rootToken('--jus-color-text'));
      expect(contrastOfText(link)).toBeGreaterThanOrEqual(TEXT);
      await userEvent.hover(link);
      settle(link);
      sameColor(css(link, 'background-color'), rootToken('--jus-color-neutral-bg'));
      expect(contrastOfText(link)).toBeGreaterThanOrEqual(TEXT);
      await userEvent.unhover(link);
    });

    it('shows each example on the page colour and its code in a block of the same palette, framed in the border colour', () => {
      const page = mount(CATALOG);

      for (const block of [find(page, '.jus-catalog-example'), find(page, '.jus-catalog-code')]) {
        sameColor(css(block, 'background-color'), rootToken('--jus-color-page'));
        sameColor(css(block, 'border-top-color'), rootToken('--jus-color-border'));
        expect(`${css(block, 'border-top-style')} ${css(block, 'border-top-width')}`).toBe('solid 1px');
        expect(css(block, 'border-top-left-radius')).toBe('8px');
      }
      // The frame closes the example: the alert inside keeps no space of its own below it.
      expect(css(find(page, '.jus-catalog-example > .alert'), 'margin-bottom')).toBe('0px');
      const code = find(page, '.jus-catalog-code code');
      sameColor(css(code, 'color'), rootToken('--jus-color-text'));
      expect(contrastOfText(code)).toBeGreaterThanOrEqual(TEXT);
    });

    it('writes the summary of each code block in the primary colour and the word on the themes in the muted one, legible', () => {
      const page = mount(CATALOG);
      const summary = find(page, '.jus-catalog-details > summary');
      const themes = find(page, '.jus-catalog-themes');

      sameColor(css(summary, 'color'), rootToken('--jus-color-primary'));
      expect(contrastOfText(summary)).toBeGreaterThanOrEqual(TEXT);
      sameColor(css(themes, 'color'), rootToken('--jus-color-text-muted'));
      expect(contrastRatio(css(themes, 'color'), rootToken('--jus-color-surface'))).toBeGreaterThanOrEqual(TEXT);
    });

    it('frames each reference table in the border colour, without a second line below its last row', () => {
      const region = find(mount(CATALOG), '.jus-catalog-reference');
      const lastCell = find(region, 'tbody tr:last-child td');

      sameColor(css(region, 'border-top-color'), rootToken('--jus-color-border'));
      expect(css(region, 'border-top-width')).toBe('1px');
      expect(css(region, 'border-top-left-radius')).toBe('8px');
      expect(css(lastCell, 'border-bottom-width')).toBe('0px');
      // Its text as far from the frame as an example's.
      const space = `${String(Number.parseFloat(rootToken('--jus-space-3')) * 16)}px`;
      expect(css(find(region, 'thead th:first-child'), 'padding-left')).toBe(space);
      expect(css(find(region, 'tbody tr:last-child > td:last-child'), 'padding-right')).toBe(space);
    });

    it.each(SWATCH_ROLES)('paints the swatches of %s with the value of each theme, whatever the theme of the page', (role) => {
      const page = mount(CATALOG);

      for (const theme of THEMES) {
        const swatch = find(page, `.jus-token-swatch-${role}[data-bs-theme="${theme}"]`);
        sameColor(css(swatch, 'background-color'), colourIn(theme, `--jus-color-${role}`));
        // The edge of the swatch, in the strong border colour of its theme, shows on the cell around it.
        sameColor(css(swatch, 'border-top-color'), colourIn(theme, '--jus-color-border-strong'));
        expect(contrastRatio(css(swatch, 'border-top-color'), backgroundBehind(required(swatch.parentElement)))).toBeGreaterThanOrEqual(SEPARATOR);
      }
      expect(parseColor(colourIn('light', `--jus-color-${role}`))).not.toEqual(parseColor(colourIn('dark', `--jus-color-${role}`)));
    });

    it('keeps the colours of the swatches when the system forces its own', async () => {
      const swatch = find(mount(CATALOG), '.jus-token-swatch-primary[data-bs-theme="dark"]');
      // Read first: in forced colours the probe's own colour is the system's.
      const primary = colourIn('dark', '--jus-color-primary');

      await inForcedColours(() => {
        expect(css(swatch, 'forced-color-adjust')).toBe('none');
        sameColor(css(swatch, 'background-color'), primary);
      });
    });

    it('has no accessibility violations, with the real palette', async () => {
      await expectNoAxeViolations(mount(CATALOG));
    });
  });

  it('keeps the focus ring at 3:1 or more against the surfaces around it', () => {
    const ring = rootToken('--jus-focus-ring');

    expect(contrastRatio(ring, rootToken('--jus-color-page'))).toBeGreaterThanOrEqual(FOCUS);
    expect(contrastRatio(ring, rootToken('--jus-color-surface'))).toBeGreaterThanOrEqual(FOCUS);
    sameColor(ring, pick('#1f4e79', '#ffffff'));
  });

  it('draws the ring of the theme on the navbar and the skip link, which sit on light surfaces in the light theme', () => {
    const page = mount(PAGE);

    for (const selector of ['.jus-navbar', '.jus-skip-link']) {
      const area = find(page, selector);
      const ring = css(area, '--jus-focus-ring');

      sameColor(ring, pick('#1f4e79', '#ffffff'));
      expect(contrastRatio(ring, backgroundBehind(area)), selector).toBeGreaterThanOrEqual(FOCUS);
    }
  });

  it('inverts the focus ring over the blue areas, in both themes', () => {
    const area = find(mount('<div class="text-bg-primary"><a href="#ajuda">Ajuda</a></div>'), '.text-bg-primary');

    sameColor(css(area, '--jus-focus-ring'), rootToken('--jus-focus-color-inverse'));
    sameColor(css(area, '--jus-focus-ring'), '#ffffff');
    expect(contrastRatio('#ffffff', css(area, 'background-color'))).toBeGreaterThanOrEqual(FOCUS);
  });

  it('has no accessibility violations for the markup the pages are made of, with the real palette', async () => {
    const page = mount(`${PAGE}${TIMELINE}${DATA_TABLE}`);

    await expectNoAxeViolations(page);
  });
});

describe('the layout of the sign-in page', () => {
  it('sets the presentation beside the card from lg up, both as tall as the taller one, the title in the display size', async () => {
    await atWidth(1280, () => {
      const page = mount(LOGIN);
      const hero = find(page, '.jus-login-hero').getBoundingClientRect();
      const card = find(page, '.jus-login-card').getBoundingClientRect();

      expect(hero.right).toBeLessThan(card.left);
      expect(hero.top).toBe(card.top);
      expect(hero.height).toBe(card.height);
      expect(hero.width).toBeGreaterThan(card.width);
      expect(css(find(page, '.jus-login-hero-title'), 'font-size')).toBe(`${String(Number.parseFloat(rootToken('--jus-font-size-display')) * 16)}px`);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    });
  });

  it('makes the presentation a short header above the card below lg, the two as wide as each other, without a sideways scroll', async () => {
    await atWidth(375, () => {
      const page = mount(LOGIN);
      const hero = find(page, '.jus-login-hero').getBoundingClientRect();
      const card = find(page, '.jus-login-card').getBoundingClientRect();

      expect(hero.bottom).toBeLessThan(card.top);
      expect([hero.left, hero.width]).toEqual([card.left, card.width]);
      expect(hero.height).toBeLessThan(card.height);
      expect(css(find(page, '.jus-login-hero-title'), 'font-size')).toBe(`${String(Number.parseFloat(rootToken('--jus-font-size-section-title')) * 16)}px`);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    });
  });

  it('keeps the presentation and the accounts apart from what is around them in forced colours, which drop their fills', async () => {
    const page = mount(LOGIN);

    await inForcedColours(() => {
      for (const area of [find(page, '.jus-login-hero'), find(page, '.jus-demo-accounts')]) {
        expect(`${css(area, 'border-top-style')} ${css(area, 'border-top-width')}`, area.className).toBe('solid 1px');
      }
    });
  });
});

describe('the layout of the error pages', () => {
  it.each([375, 1280])('centres the card in the main content at %i px, without a sideways scroll', async (width) => {
    await atWidth(width, () => {
      const page = mount(errorPage('info'));
      const main = find(page, 'main');
      const content = main.getBoundingClientRect();
      const card = find(page, '.jus-error').getBoundingClientRect();
      const padding = Number.parseFloat(css(main, 'padding-left'));

      expect(Math.abs(card.left + card.width / 2 - (content.left + content.width / 2))).toBeLessThan(1);
      expect(card.width).toBeLessThanOrEqual(content.width - 2 * padding);
      for (const part of find(page, '.jus-error').children) {
        const box = part.getBoundingClientRect();
        expect(Math.abs(box.left + box.width / 2 - (card.left + card.width / 2)), part.tagName).toBeLessThan(1);
      }
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    });
  });
});

describe('the layout of the search', () => {
  it('sets the filters beside the results from lg up, the summary of the open panel hidden, one card a row in lg', async () => {
    await atWidth(1024, () => {
      const page = mount(SEARCH);
      const filters = find(page, '.jus-search-filters form').getBoundingClientRect();
      const results = find(page, '.jus-search-results').getBoundingClientRect();

      expect(css(find(page, '.jus-filters > summary'), 'display')).toBe('none');
      expect(filters.right).toBeLessThanOrEqual(results.left);
      expect(filters.top).toBeLessThanOrEqual(results.top);
      expect(filters.width).toBeLessThan(results.width);
      expect(cardsInTheFirstRow(page)).toBe(1);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    });
  });

  it('lays the cards out two a row from xl up', async () => {
    await atWidth(1280, () => {
      expect(cardsInTheFirstRow(mount(SEARCH))).toBe(2);
    });
  });

  it('keeps the summary of a folded panel from lg up, so that it can be opened (the behaviour opens it there anyway)', async () => {
    await atWidth(1280, () => {
      const panel = required(mount(SEARCH).querySelector<HTMLDetailsElement>('.jus-filters'));
      panel.open = false;

      expect(css(find(panel, 'summary'), 'display')).toBe('flex');
    });
  });

  it('puts the summary and the filters above the results below lg, as wide as they are, without a sideways scroll', async () => {
    await atWidth(375, () => {
      const page = mount(SEARCH);
      const summary = find(page, '.jus-filters > summary').getBoundingClientRect();
      const form = find(page, '.jus-filters form').getBoundingClientRect();
      const results = find(page, '.jus-search-results h2').getBoundingClientRect();

      expect(summary.bottom).toBeLessThan(form.top);
      expect(form.bottom).toBeLessThan(results.top);
      expect([summary.left, summary.width]).toEqual([form.left, form.width]);
      expect(cardsInTheFirstRow(page)).toBe(1);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    });
  });

  it('turns the chevron of the summary with the panel, without the animation when motion is reduced', async () => {
    const panel = required(mount(SEARCH).querySelector<HTMLDetailsElement>('.jus-filters'));
    const chevron = find(panel, '.jus-filters-chevron');

    expect(css(chevron, 'transform')).not.toBe('none');
    expect(Number.parseFloat(css(chevron, 'transition-duration'))).toBeGreaterThan(0);
    panel.open = false;
    settle(chevron);
    expect(css(chevron, 'transform')).toBe('none');

    await cdp().send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    try {
      expect(css(chevron, 'transition-duration')).toBe('0s');
    } finally {
      await cdp().send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: '' }] });
    }
  });
});

/** The columns the data of the cause is laid out in: the distinct left edges of its pairs of name and value. */
function dataColumns(page: ParentNode): number {
  return new Set(Array.from(page.querySelectorAll('.jus-case-data > div'), (pair) => pair.getBoundingClientRect().left)).size;
}

describe('the layout of the case page', () => {
  it('sets the aside to the left of the main column from lg up, both from the same line, the button at the end of the band', async () => {
    await atWidth(1280, () => {
      const page = mount(CASE_PAGE);
      const aside = find(page, '.jus-case-aside').getBoundingClientRect();
      const main = find(page, '.jus-case-main').getBoundingClientRect();
      const header = find(page, '.jus-page-header');
      const button = find(header, '.btn-primary').getBoundingClientRect();
      const title = find(header, 'h1').getBoundingClientRect();

      expect(aside.right).toBeLessThanOrEqual(main.left);
      expect(aside.top).toBe(main.top);
      expect(aside.width).toBeLessThan(main.width);
      expect(Math.abs(button.right - header.getBoundingClientRect().right)).toBeLessThan(1);
      expect(button.top).toBeLessThan(title.bottom);
      expect(dataColumns(page)).toBe(1);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    });
  });

  it('puts the aside right below the band below lg, then the main column, as wide as each other, without a sideways scroll', async () => {
    await atWidth(375, () => {
      const page = mount(CASE_PAGE);
      const header = find(page, '.jus-page-header').getBoundingClientRect();
      const aside = find(page, '.jus-case-aside').getBoundingClientRect();
      const main = find(page, '.jus-case-main').getBoundingClientRect();
      const number = find(page, '.jus-case-number');

      expect(header.bottom).toBeLessThanOrEqual(aside.top);
      expect(aside.bottom).toBeLessThanOrEqual(main.top);
      expect([aside.left, aside.width]).toEqual([main.left, main.width]);
      expect(number.scrollWidth).toBeLessThanOrEqual(number.clientWidth);
      expect(dataColumns(page)).toBe(1);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    });
  });

  it('lays the data of the cause out in two columns between sm and lg, where the aside is as wide as the page', async () => {
    await atWidth(800, () => {
      expect(dataColumns(mount(CASE_PAGE))).toBe(2);
    });
  });

  it('lets a very long case number break on a very narrow screen rather than widen the page', async () => {
    await atWidth(320, () => {
      mount(CASE_PAGE);

      expect(css(find(document.body, '.jus-case-number'), 'overflow-wrap')).toBe('anywhere');
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    });
  });
});

describe('the layout of the filing page', () => {
  it('gives the card a medium width from lg up, lined up with the title of the band', async () => {
    await atWidth(1280, () => {
      const page = mount(FILING_PAGE);
      const card = find(page, '.jus-filing-card').getBoundingClientRect();
      const title = find(page, '.jus-page-header h1').getBoundingClientRect();

      expect(card.width).toBe(720);
      expect(card.left).toBe(title.left);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    });
  });

  it('makes the card as wide as the content below md, without a sideways scroll', async () => {
    await atWidth(375, () => {
      const page = mount(FILING_PAGE);
      const card = find(page, '.jus-filing-card').getBoundingClientRect();
      const title = find(page, '.jus-page-header h1').getBoundingClientRect();

      expect([card.left, card.width]).toEqual([title.left, title.width]);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    });
  });
});

describe('the layout of the catalogue', () => {
  /**
   * The catalogue with a section tall enough to scroll past the top of the navigation, in a box that scrolls (the test
   * page itself does not): a sticky element sticks to the nearest one, as it does to the window on the real page.
   */
  function tallCatalog(): HTMLElement {
    const scroller = mount(`<div style="overflow-y: auto; block-size: 600px">${CATALOG}</div>`);
    find(scroller, '.jus-catalog-filler').style.blockSize = '3000px';

    return find(scroller, ':scope > div');
  }

  it('keeps the navigation in view beside the sections from lg up, a little below the top of the window', async () => {
    await atWidth(1280, () => {
      const scroller = tallCatalog();
      const nav = find(scroller, '.jus-catalog-nav');
      const sections = find(scroller, '.jus-catalog-sections');
      const space = Number.parseFloat(rootToken('--jus-space-4')) * 16;
      const top = (element: Element): number => element.getBoundingClientRect().top - scroller.getBoundingClientRect().top;

      expect(nav.getBoundingClientRect().right).toBeLessThanOrEqual(sections.getBoundingClientRect().left);
      expect(css(nav, 'position')).toBe('sticky');
      scroller.scrollTop = 1000;

      expect(top(nav)).toBe(space);
      expect(top(sections)).toBeLessThan(0);
      // A jump to a section leaves the same room above its card.
      expect(css(find(scroller, '#alert'), 'scroll-margin-top')).toBe(`${String(space)}px`);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    });
  });

  it('puts the navigation above the sections below lg, as wide as they are, its links in rows, without a sideways scroll', async () => {
    await atWidth(375, () => {
      const page = tallCatalog();
      const nav = find(page, '.jus-catalog-nav');
      const sections = find(page, '.jus-catalog-sections').getBoundingClientRect();
      const links = Array.from(nav.querySelectorAll('.nav-link'), (link) => link.getBoundingClientRect());

      expect(css(nav, 'position')).toBe('static');
      expect(nav.getBoundingClientRect().bottom).toBeLessThan(sections.top);
      expect(nav.getBoundingClientRect().width).toBe(find(page, '.jus-catalog-section').getBoundingClientRect().width);
      expect(required(links[1]).top).toBe(required(links[0]).top);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    });
  });

  it('wraps the long lines of a code block on a phone instead of scrolling it sideways, which the keyboard could not do', async () => {
    await atWidth(375, () => {
      const page = mount(CATALOG);
      const block = find(page, '.jus-catalog-code');
      find(block, 'code').textContent = '<twig:DataTable :columns="samples.columns" :rows="samples.rows" :sort="sort" :direction="direction" caption="Documentos do processo" />';

      expect(css(block, 'white-space')).toBe('pre-wrap');
      expect(block.scrollWidth).toBeLessThanOrEqual(block.clientWidth);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    });
  });
});

describe('a light scope inside a dark page', () => {
  it('gets the dark ring on a light surface again, and the light text colour', () => {
    useTheme('dark');
    const scope = find(mount('<div data-bs-theme="light" id="claro"><p>Claro</p></div>'), '#claro');

    sameColor(css(scope, '--jus-focus-ring'), '#1f4e79');
    sameColor(css(scope, '--jus-color-text'), '#111827');
    sameColor(css(scope, '--bs-body-color'), '#111827');
  });
});

describe('Bootstrap dark mode', () => {
  it('takes its dark values from the tokens', () => {
    useTheme('dark');

    sameColor(rootToken('--bs-body-bg'), '#0f1722');
    sameColor(rootToken('--bs-body-color'), '#e8edf3');
    sameColor(rootToken('--bs-border-color'), '#243244');
    sameColor(rootToken('--bs-link-color'), '#7fb2e5');
    sameColor(rootToken('--bs-primary-text-emphasis'), '#7fb2e5');
  });

  it('leaves the light values to the document when it carries no colour mode', () => {
    sameColor(rootToken('--bs-body-bg'), '#f4f6f9');
    sameColor(rootToken('--bs-link-color'), '#1f4e79');
  });
});
