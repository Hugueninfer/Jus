import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { contrastRatio, parseColor } from '../../test-support/contrast';
import { installTokens, type Theme } from '../../test-support/tokens';

/** WCAG 2.2 AA: 4.5:1 for text, 3:1 for what identifies a control (1.4.3, 1.4.11). */
const TEXT = 4.5;
const CONTROL = 3;
/** Not a WCAG figure: a hairline that has to be seen (the timeline rail) keeps at least this much against its ground. */
const SEPARATOR = 1.5;

const THEMES: Theme[] = ['light', 'dark'];

/** The roles every theme defines, as --jus-color-<role>. */
const ROLES = [
  'page', 'surface', 'border', 'border-strong', 'text', 'text-muted', 'primary', 'primary-hover', 'on-primary',
  'success-bg', 'success-text', 'warning-bg', 'warning-text', 'danger-bg', 'danger-text', 'info-bg', 'info-text',
  'neutral-bg', 'neutral-text',
];

/** The names the components used before the themes: each still resolves, now to a themed role. */
const LEGACY_ROLES: Record<string, string> = {
  body: 'text',
  muted: 'text-muted',
  light: 'neutral-bg',
  'surface-alt': 'neutral-bg',
  primary: 'primary',
  surface: 'surface',
  border: 'border',
};

/** Hues that do not change with the theme (Bootstrap's brand colours). */
const FIXED_COLORS = ['secondary', 'success', 'warning', 'danger', 'info', 'dark'];

/** The values the design spec (section 3) fixes, light then dark. */
const SPEC: Record<string, [string, string]> = {
  page: ['#f4f6f9', '#0f1722'],
  surface: ['#ffffff', '#141e2b'],
  border: ['#e5e7eb', '#243244'],
  text: ['#111827', '#e8edf3'],
  primary: ['#1f4e79', '#7fb2e5'],
};

interface Pair {
  foreground: string;
  background: string;
  minimum: number;
  /** What the pair is for. */
  use: string;
}

/** Every pair of colours that is shown together, as text (4.5:1) or as a control boundary (3:1). */
const PAIRS: Pair[] = [
  { foreground: 'text', background: 'page', minimum: TEXT, use: 'body text on the page' },
  { foreground: 'text', background: 'surface', minimum: TEXT, use: 'body text on cards and the navbar' },
  { foreground: 'text', background: 'neutral-bg', minimum: TEXT, use: 'text on a neutral fill (hovered upload area, code blocks)' },
  { foreground: 'text-muted', background: 'page', minimum: TEXT, use: 'secondary text on the page' },
  { foreground: 'text-muted', background: 'surface', minimum: TEXT, use: 'secondary text on cards' },
  { foreground: 'text-muted', background: 'neutral-bg', minimum: TEXT, use: 'a disabled button label' },
  { foreground: 'text-muted', background: 'page', minimum: CONTROL, use: 'the border of a button on the page' },
  { foreground: 'text-muted', background: 'surface', minimum: CONTROL, use: 'the border of a button on a card' },
  { foreground: 'primary', background: 'page', minimum: TEXT, use: 'links on the page' },
  { foreground: 'primary', background: 'surface', minimum: TEXT, use: 'links on cards' },
  { foreground: 'primary', background: 'neutral-bg', minimum: CONTROL, use: 'the border of a hovered upload area' },
  { foreground: 'on-primary', background: 'primary', minimum: TEXT, use: 'a pressed button' },
  { foreground: 'on-primary', background: 'primary-hover', minimum: TEXT, use: 'a primary button under the pointer' },
  { foreground: 'primary', background: 'page', minimum: CONTROL, use: 'the shape of a primary button on the page' },
  { foreground: 'primary-hover', background: 'page', minimum: CONTROL, use: 'the shape of a hovered primary button on the page' },
  { foreground: 'primary-hover', background: 'surface', minimum: CONTROL, use: 'the shape of a hovered primary button on a card' },
  { foreground: 'text', background: 'surface', minimum: CONTROL, use: 'the fill of the confidential badge on a card' },
  { foreground: 'surface', background: 'text', minimum: TEXT, use: 'the label of the confidential badge' },
  { foreground: 'border-strong', background: 'page', minimum: SEPARATOR, use: 'the timeline rail on the page' },
  { foreground: 'border-strong', background: 'surface', minimum: SEPARATOR, use: 'the timeline rail on a card' },
  { foreground: 'success-text', background: 'success-bg', minimum: TEXT, use: 'a success badge or alert' },
  { foreground: 'warning-text', background: 'warning-bg', minimum: TEXT, use: 'a warning badge or alert' },
  { foreground: 'danger-text', background: 'danger-bg', minimum: TEXT, use: 'a danger badge or alert' },
  { foreground: 'info-text', background: 'info-bg', minimum: TEXT, use: 'an info badge or alert' },
  { foreground: 'neutral-text', background: 'neutral-bg', minimum: TEXT, use: 'a neutral badge' },
];

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--jus-${name}`).trim();
}

function color(role: string): string {
  return token(`color-${role}`);
}

describe.each(THEMES)('the %s theme tokens', (theme) => {
  let removeTokens: () => void;

  beforeEach(() => {
    removeTokens = installTokens(theme);
  });

  afterEach(() => {
    removeTokens();
  });

  it.each(ROLES)('defines the colour role %s', (role) => {
    expect(color(role)).toMatch(/^#[0-9a-f]{3,8}$/i);
  });

  it.each(Object.entries(SPEC))('uses the colour the design spec gives to %s', (role, [light, dark]) => {
    expect(parseColor(color(role))).toEqual(parseColor(theme === 'light' ? light : dark));
  });

  it.each(Object.entries(LEGACY_ROLES))('still resolves the old name %s, to the role %s', (legacy, role) => {
    expect(color(legacy)).not.toBe('');
    expect(parseColor(color(legacy))).toEqual(parseColor(color(role)));
  });

  it.each(PAIRS)('keeps $foreground on $background at $minimum:1 or more ($use)', ({ foreground, background, minimum }) => {
    expect(contrastRatio(color(foreground), color(background))).toBeGreaterThanOrEqual(minimum);
  });

  it('gives a nested light scope the light values, whatever the theme of the page', () => {
    const scope = document.createElement('div');
    scope.setAttribute('data-bs-theme', 'light');
    document.body.append(scope);

    try {
      const read = (name: string): string => getComputedStyle(scope).getPropertyValue(`--jus-${name}`).trim();

      expect(parseColor(read('color-page'))).toEqual(parseColor('#f4f6f9'));
      expect(parseColor(read('color-text'))).toEqual(parseColor('#111827'));
      // The old names are written out for each scope too, rather than pointing at the page's (possibly dark) role.
      expect(parseColor(read('color-body'))).toEqual(parseColor('#111827'));
      expect(parseColor(read('color-muted'))).toEqual(parseColor(read('color-text-muted')));
    } finally {
      scope.remove();
    }
  });

  it('defines the radii of the design: 6, 8 and 12 pixels', () => {
    expect(token('radius-sm')).toBe('0.375rem');
    expect(token('radius-base')).toBe('0.5rem');
    expect(token('radius-lg')).toBe('0.75rem');
  });

  it('defines the shadows, soft on the light theme and a one pixel border on the dark one', () => {
    expect(token('shadow-sm')).not.toBe('');
    expect(token('shadow-base')).not.toBe('');
    expect(token('shadow-card')).not.toBe('');

    if (theme === 'light') {
      expect(token('shadow-card')).toMatch(/^0 1px 3px .+, 0 4px 12px /);
    } else {
      expect(token('shadow-card')).toMatch(/^0 0 0 1px /);
    }
  });

  it('starts the base font family with Inter and keeps the system fonts behind it', () => {
    expect(token('font-base')).toMatch(/^"Inter Variable", /);
    expect(token('font-base')).toContain('system-ui');
    expect(token('font-mono')).toContain('monospace');
  });

  it('defines the type scale: display, page title, section title and small text, and the weights', () => {
    expect(token('font-size-display')).toMatch(/rem$/);
    expect(Number.parseFloat(token('font-size-display'))).toBeGreaterThan(Number.parseFloat(token('font-size-page-title')));
    expect(token('font-size-page-title')).toMatch(/rem$/);
    expect(token('font-size-section-title')).toMatch(/rem$/);
    expect(token('font-size-small')).toMatch(/rem$/);
    expect(token('font-weight-regular')).toBe('400');
    expect(token('font-weight-medium')).toBe('500');
    expect(token('font-weight-semibold')).toBe('600');
  });

  it('keeps the spacing and focus tokens', () => {
    expect(token('space-3')).toBe('1rem');
    expect(token('focus-width')).not.toBe('');
    expect(token('focus-offset')).not.toBe('');
    expect(parseColor(token('focus-color'))).toEqual(parseColor('#1f4e79'));
    expect(parseColor(token('focus-color-inverse'))).toEqual(parseColor('#ffffff'));
  });
});

/** The value of a colour role on the page in the given theme, with the tokens installed for that one read. */
function colorOnThePage(theme: Theme, role: string): string {
  const removeTokens = installTokens(theme);
  try {
    return color(role);
  } finally {
    removeTokens();
  }
}

describe('the fixed hues', () => {
  it.each(FIXED_COLORS)('keeps the %s hue the same in both themes', (name) => {
    const light = colorOnThePage('light', name);
    const dark = colorOnThePage('dark', name);

    expect(light).toMatch(/^#[0-9a-f]{3,8}$/i);
    expect(parseColor(dark)).toEqual(parseColor(light));
  });
});
