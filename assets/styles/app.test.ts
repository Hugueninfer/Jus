import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../test-support/axe';
import { contrastRatio, parseColor } from '../test-support/contrast';
import { required } from '../test-support/required';
import type { Theme } from '../test-support/tokens';
import appCss from './app.scss?inline';

/** WCAG 2.2 AA: 4.5:1 for text, 3:1 for the focus ring against the surface around it (1.4.3, 1.4.11). */
const TEXT = 4.5;
const FOCUS = 3;

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

/** A little of everything the pages are made of, as Bootstrap and the Twig components render it. */
const PAGE = `
  <header>
    <nav class="navbar navbar-expand-md navbar-dark bg-primary" aria-label="Navegação principal">
      <div class="container">
        <a class="navbar-brand fw-semibold" href="#inicio">Jus</a>
        <ul class="navbar-nav">
          <li class="nav-item"><a class="nav-link active" href="#processos" aria-current="page">Processos</a></li>
          <li class="nav-item"><a class="nav-link" href="#sair">Sair</a></li>
          <li class="nav-item"><span class="navbar-text text-white">Maria Souza</span></li>
        </ul>
      </div>
    </nav>
  </header>
  <main id="conteudo">
    <h1>Processos</h1>
    <article class="card"><div class="card-body">
      <h2 class="h6 font-monospace"><a href="#detalhe">0001234-56.2024.8.26.0100</a></h2>
      <p class="mb-1 text-body-secondary">Cobrança · 1ª Vara Cível</p>
      <span class="badge text-bg-success">Ativo</span>
      <span class="badge text-bg-warning">Suspenso</span>
      <span class="badge text-bg-secondary">Arquivado</span>
      <span class="badge text-bg-dark">Sigiloso</span>
    </div></article>
    <div class="alert alert-success" role="status">Petição protocolada.</div>
    <div class="alert alert-danger" role="alert">Não foi possível protocolar.</div>
    <div class="alert alert-warning" role="alert">Selecione os arquivos novamente.</div>
    <div class="alert alert-info" role="status">Prazo em contagem.</div>
    <form>
      <label class="form-label" for="busca">Número do processo</label>
      <input class="form-control" id="busca" type="text">
      <div class="form-text">Somente os dígitos.</div>
      <button class="btn btn-primary" type="submit">Buscar</button>
      <button class="btn btn-link" type="button">Limpar</button>
    </form>
    <p>Use <code>--jus-color-primary</code> no texto e <a href="#ajuda">veja a ajuda</a>.</p>
    <pre class="bg-body-tertiary p-3"><code>var(--jus-color-surface)</code></pre>
    <nav aria-label="Paginação"><ul class="pagination">
      <li class="page-item"><a class="page-link" href="#pagina-1">1</a></li>
      <li class="page-item active" aria-current="page"><span class="page-link">2</span></li>
    </ul></nav>
  </main>
  <footer class="border-top py-3 small text-body-secondary">Projeto de demonstração.</footer>`;

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

  it('paints cards with the surface role and the large radius', () => {
    const card = find(mount(PAGE), '.card');

    sameColor(css(card, 'background-color'), pick('#ffffff', '#141e2b'));
    sameColor(css(card, 'background-color'), rootToken('--jus-color-surface'));
    expect(css(card, 'border-top-left-radius')).toBe('12px');
  });

  it('paints form fields with the surface role and the base radius', () => {
    const field = find(mount(PAGE), '.form-control');

    sameColor(css(field, 'background-color'), rootToken('--jus-color-surface'));
    expect(css(field, 'border-top-left-radius')).toBe('8px');
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
  });

  it('keeps the labels of the navbar, which stays blue in both themes, at 4.5:1 or more', () => {
    const navbar = find(mount(PAGE), '.navbar');

    sameColor(css(navbar, 'background-color'), '#1f4e79');
    for (const label of navbar.querySelectorAll('.navbar-brand, .nav-link, .navbar-text')) {
      expect(contrastOfText(label), label.textContent).toBeGreaterThanOrEqual(TEXT);
    }
  });

  it('keeps the focus ring at 3:1 or more against the surfaces around it', () => {
    const ring = rootToken('--jus-focus-ring');

    expect(contrastRatio(ring, rootToken('--jus-color-page'))).toBeGreaterThanOrEqual(FOCUS);
    expect(contrastRatio(ring, rootToken('--jus-color-surface'))).toBeGreaterThanOrEqual(FOCUS);
    sameColor(ring, pick('#1f4e79', '#ffffff'));
  });

  it('inverts the focus ring over the blue areas, in both themes', () => {
    const page = mount(`
      <nav class="navbar navbar-dark bg-primary"></nav>
      <div class="text-bg-primary"></div>
      <a class="jus-skip-link" href="#conteudo">Pular</a>`);

    for (const selector of ['.navbar-dark', '.text-bg-primary', '.jus-skip-link']) {
      const area = find(page, selector);

      sameColor(css(area, '--jus-focus-ring'), '#ffffff');
    }
    sameColor(css(find(page, '.navbar-dark'), '--jus-focus-ring'), rootToken('--jus-focus-color-inverse'));
    expect(contrastRatio('#ffffff', css(find(page, '.navbar-dark'), 'background-color'))).toBeGreaterThanOrEqual(FOCUS);
  });

  it('has no accessibility violations for the markup the pages are made of, with the real palette', async () => {
    const page = mount(PAGE);

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
