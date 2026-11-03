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
      <h3 class="h6 text-body-secondary mt-3 mb-2"><time datetime="2024-04-02">02/04/2024</time></h3>
      <ol class="list-unstyled" role="list">
        <li class="jus-timeline-event" data-event-type="decision" data-event-label="Decisão">
          <i class="bi bi-hammer" aria-hidden="true"></i>
          <div class="jus-timeline-event-body"><p class="mb-0"><strong>Decisão</strong></p><p class="mb-0 jus-timeline-description">Defiro.</p></div>
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
