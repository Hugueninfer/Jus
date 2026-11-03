import { afterEach, describe, expect, it } from 'vitest';
import { parseColor } from './contrast';
import { installTokens } from './tokens';

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const THEME_ATTRIBUTE = 'data-bs-theme';

/** Compares colours, not their spelling: the stylesheet may write #fff where the spec says #ffffff. */
function expectColor(name: string, expected: string): void {
  expect(parseColor(token(name)), name).toEqual(parseColor(expected));
}

describe('installTokens', () => {
  const removers: (() => void)[] = [];

  afterEach(() => {
    for (const remove of removers.splice(0)) {
      remove();
    }
    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  });

  it('defines the design tokens on the document', () => {
    expect(token('--jus-color-primary')).toBe('');

    removers.push(installTokens());

    expect(token('--jus-color-primary')).toMatch(/^#[0-9a-f]{3,8}$/i);
    expect(token('--jus-space-2')).toMatch(/rem$/);
    expect(token('--jus-focus-width')).not.toBe('');
  });

  it('takes the tokens off again', () => {
    const remove = installTokens();
    expect(token('--jus-color-primary')).not.toBe('');

    remove();

    expect(token('--jus-color-primary')).toBe('');
  });

  it('installs the light values, and leaves the colour mode of the document alone, by default', () => {
    removers.push(installTokens());

    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
    expectColor('--jus-color-page', '#f4f6f9');
    expectColor('--jus-color-surface', '#ffffff');
    expectColor('--jus-color-text', '#111827');
  });

  it('installs the dark values and puts the dark colour mode on the document for the time of the test', () => {
    const remove = installTokens('dark');

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark');
    expectColor('--jus-color-page', '#0f1722');
    expectColor('--jus-color-surface', '#141e2b');
    expectColor('--jus-color-text', '#e8edf3');

    remove();

    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
    expect(token('--jus-color-page')).toBe('');
  });

  it('paints the page and its text with the theme, so contrast is measured against the real page colour', () => {
    const body = (property: string): string => getComputedStyle(document.body).getPropertyValue(property);

    const removeLight = installTokens();
    expect(parseColor(body('background-color'))).toEqual(parseColor('#f4f6f9'));
    expect(parseColor(body('color'))).toEqual(parseColor('#111827'));
    removeLight();

    const removeDark = installTokens('dark');
    expect(parseColor(body('background-color'))).toEqual(parseColor('#0f1722'));
    expect(parseColor(body('color'))).toEqual(parseColor('#e8edf3'));
    removeDark();

    expect(parseColor(body('background-color')).alpha).toBe(0);
  });

  it('gives the colour mode back as it found it', () => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, 'light');

    installTokens('dark')();

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light');
  });

  it('keeps the light values for an explicit light theme', () => {
    removers.push(installTokens('light'));

    expectColor('--jus-color-page', '#f4f6f9');
  });
});
