import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { expectNoAxeViolations } from '../test-support/axe';
import { installTokens } from '../test-support/tokens';
import { define } from './index';
import { JusElement, sheet } from './jus-element';

const ownSheet = sheet(':host { outline: 1px solid red; }');
const otherSheet = sheet(':host { outline: 2px solid blue; }');

class TestElement extends JusElement {
  protected override styles(): CSSStyleSheet[] {
    return [ownSheet];
  }

  connectedCallback(): void {
    this.root.setHTMLUnsafe(`
      <button type="button" class="jus-button" aria-pressed="false">Filtrar</button>
      <p id="hidden-by-attribute" hidden>Oculto</p>
      <span class="visually-hidden">Somente para leitores de tela</span>
    `);
  }
}

class PlainElement extends JusElement {}

class TwoSheetsElement extends JusElement {
  protected override styles(): CSSStyleSheet[] {
    return [ownSheet, otherSheet];
  }
}

define('jus-test-element', TestElement);
define('jus-plain-element', PlainElement);
define('jus-two-sheets-element', TwoSheetsElement);

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error('Expected a value, got nothing.');
  }

  return value;
}

function mount(tag: string): HTMLElement {
  const element = document.createElement(tag);
  document.body.append(element);

  return element;
}

function sheetsOf(element: HTMLElement): CSSStyleSheet[] {
  return required(element.shadowRoot).adoptedStyleSheets;
}

function cssOf(styleSheet: CSSStyleSheet | undefined): string {
  return Array.from(required(styleSheet).cssRules, (rule) => rule.cssText).join('\n');
}

function rootToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Mounts the test element and moves keyboard focus onto the button in its shadow root. */
async function focusButtonIn(parent: HTMLElement): Promise<HTMLButtonElement> {
  const element = document.createElement('jus-test-element');
  parent.append(element);
  await userEvent.tab();
  const button = required(element.shadowRoot?.activeElement);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Expected the keyboard focus to land on the button.');
  }

  return button;
}

describe('JusElement', () => {
  let removeTokens: () => void;

  beforeEach(() => {
    removeTokens = installTokens();
  });

  afterEach(() => {
    removeTokens();
    document.body.replaceChildren();
    document.documentElement.removeAttribute('style');
  });

  it('attaches an open shadow root', () => {
    const element = mount('jus-test-element');

    expect(element.shadowRoot).toBeInstanceOf(ShadowRoot);
    expect(element.shadowRoot?.mode).toBe('open');
  });

  it('adopts the shared base sheet first and the component sheet after it', () => {
    const sheets = sheetsOf(mount('jus-test-element'));

    expect(sheets).toHaveLength(2);
    expect(sheets[1]).toBe(ownSheet);

    const base = cssOf(sheets[0]);
    for (const selector of [':host', '[hidden]', '.visually-hidden', '.jus-button', ':focus-visible']) {
      expect(base).toContain(selector);
    }
  });

  it('shares one base sheet instance between elements, including different classes', () => {
    const base = sheetsOf(mount('jus-test-element'))[0];

    expect(base).toBeInstanceOf(CSSStyleSheet);
    expect(sheetsOf(mount('jus-test-element'))[0]).toBe(base);
    expect(sheetsOf(mount('jus-plain-element'))[0]).toBe(base);
  });

  it('adopts only the base sheet when the component declares no styles', () => {
    expect(sheetsOf(mount('jus-plain-element'))).toHaveLength(1);
  });

  it('keeps the order of several component sheets after the base sheet', () => {
    const sheets = sheetsOf(mount('jus-two-sheets-element'));

    expect(sheets).toHaveLength(3);
    expect(sheets[1]).toBe(ownSheet);
    expect(sheets[2]).toBe(otherSheet);
  });

  it('writes no literal hex, rgb or hsl colour in the base sheet', () => {
    const css = cssOf(sheetsOf(mount('jus-plain-element'))[0]);

    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it('refers only to tokens the page defines, apart from the focus ring colour it falls back from', () => {
    const css = cssOf(sheetsOf(mount('jus-plain-element'))[0]);
    const names = new Set(Array.from(css.matchAll(/--jus-[a-z0-9-]+/g), (match) => match[0]));
    // The page sets --jus-focus-ring in base/_focus.scss; the base sheet always gives it a token fallback.
    names.delete('--jus-focus-ring');

    expect(names.size).toBeGreaterThan(5);
    for (const name of names) {
      expect(rootToken(name), name).not.toBe('');
    }
  });

  it('draws the focus ring with the page ring colour', async () => {
    const surface = document.createElement('div');
    surface.style.setProperty('--jus-focus-ring', 'rgb(9, 8, 7)');
    document.body.append(surface);

    const outline = getComputedStyle(await focusButtonIn(surface));

    expect(outline.outlineStyle).toBe('solid');
    expect(outline.outlineColor).toBe('rgb(9, 8, 7)');
  });

  it('falls back to the focus token colour when the page sets no ring colour', async () => {
    document.documentElement.style.setProperty('--jus-focus-color', 'rgb(4, 5, 6)');

    const outline = getComputedStyle(await focusButtonIn(document.body));

    expect(outline.outlineStyle).toBe('solid');
    expect(outline.outlineColor).toBe('rgb(4, 5, 6)');
  });

  it('hides [hidden] content even when a component sets display on it', () => {
    const element = mount('jus-test-element');
    const shadow = required(element.shadowRoot);
    shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet('#hidden-by-attribute { display: block; }')];

    expect(getComputedStyle(required(shadow.getElementById('hidden-by-attribute'))).display).toBe('none');
  });

  it('styles a pressed button with the primary and surface tokens', () => {
    document.documentElement.style.setProperty('--jus-color-primary', 'rgb(1, 2, 3)');
    document.documentElement.style.setProperty('--jus-color-surface', 'rgb(250, 251, 252)');
    const button = required(required(mount('jus-test-element').shadowRoot).querySelector('button'));

    expect(getComputedStyle(button).backgroundColor).toBe('rgb(250, 251, 252)');

    button.setAttribute('aria-pressed', 'true');

    expect(getComputedStyle(button).backgroundColor).toBe('rgb(1, 2, 3)');
    expect(getComputedStyle(button).color).toBe('rgb(250, 251, 252)');
  });

  it('has no accessibility violations for its base markup, with the real palette, pressed or not', async () => {
    const main = document.createElement('main');
    main.append(document.createElement('jus-test-element'));
    document.body.append(main);

    await expectNoAxeViolations(main);

    required(main.querySelector('jus-test-element')?.shadowRoot?.querySelector('button')).setAttribute('aria-pressed', 'true');

    await expectNoAxeViolations(main);
  });
});

describe('sheet', () => {
  it('creates a constructable stylesheet with the given rules', () => {
    const created = sheet('.a { color: red; } .b { color: blue; }');

    expect(created).toBeInstanceOf(CSSStyleSheet);
    expect(created.cssRules).toHaveLength(2);
  });
});

describe('define', () => {
  it('registers a component under its name', () => {
    expect(customElements.get('jus-test-element')).toBe(TestElement);
  });

  it('does not throw when called twice with the same name, and keeps the first constructor', () => {
    class Replacement extends JusElement {}

    expect(() => {
      define('jus-test-element', TestElement);
      define('jus-test-element', Replacement);
    }).not.toThrow();
    expect(customElements.get('jus-test-element')).toBe(TestElement);
  });
});
