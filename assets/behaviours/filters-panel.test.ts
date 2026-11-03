import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page as browserPage } from 'vitest/browser';
import { expectNoAxeViolations } from '../test-support/axe';
import { required } from '../test-support/required';
import { installFiltersPanel } from './filters-panel';

/** A phone, the last width below lg, the first width of lg, and a desktop. */
const PHONE = 375;
const LAST_BELOW_LG = 991;
const LG = 992;
const DESKTOP = 1280;

const pages: HTMLElement[] = [];
let size: [number, number];

/**
 * The panel as templates/case/search.html.twig renders it: always open, with what the server knows about the filters
 * (`active` is the value of data-jus-filters-active; null leaves the attribute out).
 */
function mount(active: string | null = 'false'): HTMLDetailsElement {
  const attribute = active === null ? '' : ` data-jus-filters-active="${active}"`;
  const page = document.createElement('div');
  page.setHTMLUnsafe(`
    <details class="jus-filters" open${attribute}>
      <summary><i class="bi bi-funnel" aria-hidden="true"></i> Filtrar</summary>
      <form role="search" aria-label="Buscar processos" action="#busca" class="jus-surface">
        <label class="form-label" for="parte">Nome da parte</label>
        <input class="form-control" id="parte" name="parte">
        <button class="btn btn-primary" type="submit">Buscar</button>
      </form>
    </details>`);
  document.body.append(page);
  pages.push(page);

  return required(page.querySelector('details'));
}

async function atWidth(width: number): Promise<void> {
  await browserPage.viewport(width, 800);
}

describe('installFiltersPanel', () => {
  beforeEach(() => {
    size = [window.innerWidth, window.innerHeight];
  });

  afterEach(async () => {
    for (const page of pages.splice(0)) {
      page.remove();
    }
    await browserPage.viewport(...size);
  });

  it.each([PHONE, LAST_BELOW_LG])('folds the panel at %i px when no filter is in use and no field has an error', async (width) => {
    await atWidth(width);
    const panel = mount('false');

    installFiltersPanel(document);

    expect(panel.open).toBe(false);
  });

  it('leaves the panel open below lg when a filter is in use or a field has an error, where the person can see it', async () => {
    await atWidth(PHONE);
    const panel = mount('true');

    installFiltersPanel(document);

    expect(panel.open).toBe(true);
  });

  it.each([LG, DESKTOP])('leaves the panel open at %i px, where it is a column of its own, even with no filter in use', async (width) => {
    await atWidth(width);
    const panel = mount('false');

    installFiltersPanel(document);

    expect(panel.open).toBe(true);
  });

  it.each([null, '', 'no'])('leaves alone a panel whose state the server did not give as "false" (%s)', async (active) => {
    await atWidth(PHONE);
    const panel = mount(active);

    installFiltersPanel(document);

    expect(panel.open).toBe(true);
  });

  it('opens a folded panel again when the window grows to lg, where its summary is hidden', async () => {
    await atWidth(PHONE);
    const panel = mount('false');
    installFiltersPanel(document);
    expect(panel.open).toBe(false);

    await atWidth(DESKTOP);

    await expect.poll(() => panel.open).toBe(true);
  });

  it('does not fold the panel when the window narrows: the person may be using it', async () => {
    await atWidth(DESKTOP);
    const panel = mount('false');
    installFiltersPanel(document);
    const narrowed = new Promise<void>((resolve) => {
      window.matchMedia('(max-width: 991.98px)').addEventListener('change', () => {
        resolve();
      }, { once: true });
    });

    await atWidth(PHONE);
    await narrowed;

    expect(panel.open).toBe(true);
  });

  it('keeps the summary as the way to open the folded panel', async () => {
    await atWidth(PHONE);
    const panel = mount('false');
    installFiltersPanel(document);

    required(panel.querySelector('summary')).click();

    expect(panel.open).toBe(true);
  });

  it('has no accessibility violations, folded or open', async () => {
    await atWidth(PHONE);
    const panel = mount('false');
    installFiltersPanel(document);

    await expectNoAxeViolations(required(panel.parentElement));
    panel.open = true;
    await expectNoAxeViolations(required(panel.parentElement));
  });
});
