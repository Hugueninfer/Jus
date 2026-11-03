import { afterEach, describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../test-support/axe';
import { required } from '../test-support/required';
import { installTokens, type Theme } from '../test-support/tokens';
import { installTokenValues } from './token-values';

/** What the server puts in a value cell for screen readers, until the value is read. */
const PLACEHOLDER = '<span class="visually-hidden">Amostra da cor; o valor é lido com JavaScript.</span>';

const pages: HTMLElement[] = [];
const cleanups: (() => void)[] = [];

/** A row of the catalogue's table of colours, as templates/design_system/sections/tokens.html.twig renders it. */
function row(role: string): string {
  const cell = (theme: Theme): string => `
    <td>
      <span class="jus-token-sample">
        <span class="jus-token-swatch jus-token-swatch-${role}" data-bs-theme="${theme}" aria-hidden="true"></span>
        <code data-jus-token-value="--jus-color-${role}" data-jus-token-theme="${theme}">${PLACEHOLDER}</code>
      </span>
    </td>`;

  return `<tr><th scope="row"><code>--jus-color-${role}</code></th>${cell('light')}${cell('dark')}<td>Uso.</td></tr>`;
}

function mount(html: string): HTMLElement {
  const page = document.createElement('div');
  page.innerHTML = html;
  document.body.append(page);
  pages.push(page);

  return page;
}

function table(...roles: string[]): HTMLElement {
  return mount(`<table class="table"><caption>Cores nos dois temas</caption><thead><tr><th scope="col">Papel</th><th scope="col">Claro</th><th scope="col">Escuro</th><th scope="col">Uso</th></tr></thead><tbody>${roles.map(row).join('')}</tbody></table>`);
}

function useTokens(theme: Theme): void {
  cleanups.push(installTokens(theme));
}

/** The value the custom property takes inside a scope of the theme, as the test reads it for itself. */
function resolved(name: string, theme: Theme): string {
  const scope = mount(`<div data-bs-theme="${theme}"></div>`);
  const value = getComputedStyle(required(scope.firstElementChild)).getPropertyValue(name).trim();
  scope.remove();

  return value;
}

function valueOf(page: ParentNode, role: string, theme: Theme): string {
  return required(page.querySelector(`[data-jus-token-value="--jus-color-${role}"][data-jus-token-theme="${theme}"]`)).textContent;
}

describe('installTokenValues', () => {
  afterEach(() => {
    for (const page of pages.splice(0)) {
      page.remove();
    }
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it('writes the value of each role in each theme next to its swatch, as the stylesheet gives it', () => {
    useTokens('light');
    const page = table('page', 'primary-hover', 'border-strong');

    installTokenValues(document);

    for (const role of ['page', 'primary-hover', 'border-strong']) {
      for (const theme of ['light', 'dark'] as const) {
        expect(valueOf(page, role, theme), `${role} ${theme}`).toBe(resolved(`--jus-color-${role}`, theme));
        expect(valueOf(page, role, theme), `${role} ${theme}`).toMatch(/^#[0-9a-f]{3,8}$/i);
        // The value takes the place of the words for screen readers.
        expect(required(page.querySelector(`[data-jus-token-value="--jus-color-${role}"][data-jus-token-theme="${theme}"]`)).children).toHaveLength(0);
      }
      expect(valueOf(page, role, 'light')).not.toBe(valueOf(page, role, 'dark'));
    }
  });

  it('gives each column the values of its own theme whatever the theme of the page', () => {
    useTokens('light');
    const onLight = table('surface');
    installTokenValues(document);
    const light = [valueOf(onLight, 'surface', 'light'), valueOf(onLight, 'surface', 'dark')];
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }

    useTokens('dark');
    const onDark = table('surface');
    installTokenValues(document);

    expect([valueOf(onDark, 'surface', 'light'), valueOf(onDark, 'surface', 'dark')]).toEqual(light);
  });

  it('leaves a value it cannot read empty: an unknown property, a theme that is not one of the two', () => {
    useTokens('light');
    const page = mount(`
      <code data-jus-token-value="--jus-color-nada" data-jus-token-theme="light"></code>
      <code data-jus-token-value="--jus-color-page" data-jus-token-theme="sepia"></code>
      <code data-jus-token-value="" data-jus-token-theme="dark"></code>`);

    installTokenValues(document);

    for (const code of page.querySelectorAll('code')) {
      expect(code.textContent).toBe('');
    }
  });

  it('keeps the words for screen readers in a cell whose value it cannot read', () => {
    useTokens('light');
    const page = mount(`<code data-jus-token-value="--jus-color-nada" data-jus-token-theme="light">${PLACEHOLDER}</code>`);

    installTokenValues(document);

    expect(page.innerHTML).toBe(`<code data-jus-token-value="--jus-color-nada" data-jus-token-theme="light">${PLACEHOLDER}</code>`);
  });

  it('leaves nothing of its own in the page', () => {
    useTokens('light');
    table('page');
    const before = document.body.innerHTML;

    installTokenValues(document);

    expect(document.body.children).toHaveLength(pages.length);
    expect(document.body.innerHTML).not.toBe(before);
    expect(document.querySelectorAll('[data-jus-token-probe]')).toHaveLength(0);
  });

  it('does nothing on a page without values to show', () => {
    useTokens('light');
    const page = mount('<p>Sem tokens.</p>');

    installTokenValues(document);

    expect(page.innerHTML).toBe('<p>Sem tokens.</p>');
    expect(document.body.children).toHaveLength(1);
  });

  it('has no accessibility violations once the values are written', async () => {
    useTokens('light');
    const page = table('page', 'text');

    installTokenValues(document);

    await expectNoAxeViolations(page);
  });
});
