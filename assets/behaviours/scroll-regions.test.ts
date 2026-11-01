import { afterEach, describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../test-support/axe';
import { installScrollRegions } from './scroll-regions';

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error('Expected a value, got nothing.');
  }

  return value;
}

const NARROW = '200px';
const WIDE = '800px';
const TABLE_WIDTH = '500px';

interface MountOptions {
  /** Width of the region; the table inside is always 500px wide. */
  width?: string;
  /** Attributes of the region, after the server-rendered defaults. */
  attributes?: string;
}

const pages: HTMLElement[] = [];

/**
 * A region like the ones the catalog renders: scrolls sideways, is named and carries the server's no-JavaScript
 * default (tabindex="0"). The inline styles stand in for Bootstrap's .table-responsive, which the tests do not load.
 */
function mount({ width = NARROW, attributes = 'data-jus-scroll-region' }: MountOptions = {}): HTMLElement {
  const page = document.createElement('div');
  page.setHTMLUnsafe(`
    <div role="region" tabindex="0" aria-label="Propriedades do componente" ${attributes} style="overflow-x: auto; width: ${width}">
      <table style="width: ${TABLE_WIDTH}">
        <caption>Propriedades do componente</caption>
        <thead><tr><th scope="col">Nome</th><th scope="col">Tipo</th></tr></thead>
        <tbody><tr><th scope="row">numero</th><td>string</td></tr></tbody>
      </table>
    </div>`);
  document.body.append(page);
  pages.push(page);

  return required(page.querySelector<HTMLElement>('[role="region"]'));
}

describe('installScrollRegions', () => {
  afterEach(() => {
    for (const page of pages.splice(0)) {
      page.remove();
    }
  });

  it('makes a region a tab stop while its content overflows', () => {
    const region = mount({ width: NARROW });
    region.removeAttribute('tabindex');

    installScrollRegions(document);

    expect(region.scrollWidth).toBeGreaterThan(region.clientWidth);
    expect(region.getAttribute('tabindex')).toBe('0');
  });

  it('removes the server default tabindex when the content fits, and keeps the role and the name', () => {
    const region = mount({ width: WIDE });

    installScrollRegions(document);

    expect(region.hasAttribute('tabindex')).toBe(false);
    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('aria-label')).toBe('Propriedades do componente');
  });

  it('follows the region as it is resized', async () => {
    const region = mount({ width: NARROW });
    installScrollRegions(document);
    expect(region.getAttribute('tabindex')).toBe('0');

    region.style.width = WIDE;
    await expect.poll(() => region.hasAttribute('tabindex')).toBe(false);

    region.style.width = NARROW;
    await expect.poll(() => region.getAttribute('tabindex')).toBe('0');
  });

  it('follows the content as it grows or shrinks', async () => {
    const region = mount({ width: '600px' });
    installScrollRegions(document);
    expect(region.hasAttribute('tabindex')).toBe(false);

    required(region.querySelector('table')).style.width = '900px';
    await expect.poll(() => region.getAttribute('tabindex')).toBe('0');

    required(region.querySelector('table')).style.width = TABLE_WIDTH;
    await expect.poll(() => region.hasAttribute('tabindex')).toBe(false);
  });

  it('handles every marked region on the page, each on its own', () => {
    const narrow = mount({ width: NARROW });
    const wide = mount({ width: WIDE });

    installScrollRegions(document);

    expect(narrow.getAttribute('tabindex')).toBe('0');
    expect(wide.hasAttribute('tabindex')).toBe(false);
  });

  it('leaves regions that are not marked untouched', () => {
    const unmarked = mount({ width: WIDE, attributes: '' });

    installScrollRegions(document);

    expect(unmarked.getAttribute('tabindex')).toBe('0');
  });

  it('keeps every state free of accessibility violations', async () => {
    const narrow = mount({ width: NARROW });
    const wide = mount({ width: WIDE });
    installScrollRegions(document);

    await expectNoAxeViolations(narrow);
    await expectNoAxeViolations(wide);
  });
});
