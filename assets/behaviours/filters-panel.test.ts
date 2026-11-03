import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page as browserPage } from 'vitest/browser';
import { expectNoAxeViolations } from '../test-support/axe';
import { required } from '../test-support/required';
import { installFiltersPanel } from './filters-panel';

/** A phone and a desktop, below and above Bootstrap's lg breakpoint. */
const PHONE = 375;
const DESKTOP = 1280;

const pages: HTMLElement[] = [];
let size: [number, number];

/**
 * The panel as templates/case/search.html.twig renders it, with what the server knows about the filters (`active` is the
 * value of data-jus-filters-active), and folded or not as the inline script after it left it.
 */
function mount(active = 'false', open = true): HTMLDetailsElement {
  const page = document.createElement('div');
  page.setHTMLUnsafe(`
    <details class="jus-filters"${open ? ' open' : ''} data-jus-filters-active="${active}">
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

/** Resolves once the window has crossed the lg breakpoint, and the listeners of the behaviour have run. */
function crossingLg(): Promise<void> {
  return new Promise((resolve) => {
    window.matchMedia('(max-width: 991.98px)').addEventListener(
      'change',
      () => {
        setTimeout(resolve, 0);
      },
      { once: true },
    );
  });
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

  it.each([
    { width: PHONE, open: false },
    { width: PHONE, open: true },
    { width: DESKTOP, open: true },
  ])('leaves the panel as the page has it on load at $width px (open: $open): the inline script folds it', async ({ width, open }) => {
    await atWidth(width);
    const panel = mount('false', open);

    installFiltersPanel(document);

    expect(panel.open).toBe(open);
  });

  it.each(['false', 'true'])('opens a folded panel (active: %s) again when the window grows to lg, where its summary is hidden', async (active) => {
    await atWidth(PHONE);
    const panel = mount(active, false);
    installFiltersPanel(document);

    const crossed = crossingLg();
    await atWidth(DESKTOP);
    await crossed;

    expect(panel.open).toBe(true);
  });

  it('does not fold the panel when the window narrows: the person may be using it', async () => {
    await atWidth(DESKTOP);
    const panel = mount('false');
    installFiltersPanel(document);

    const crossed = crossingLg();
    await atWidth(PHONE);
    await crossed;

    expect(panel.open).toBe(true);
  });

  it('leaves alone a <details> that is not the filters panel', async () => {
    await atWidth(PHONE);
    const other = mount('false', false);
    other.removeAttribute('data-jus-filters-active');
    installFiltersPanel(document);

    const crossed = crossingLg();
    await atWidth(DESKTOP);
    await crossed;

    expect(other.open).toBe(false);
  });

  it('has no accessibility violations, folded or open', async () => {
    const panel = mount('false', false);
    installFiltersPanel(document);

    await expectNoAxeViolations(required(panel.parentElement));
    panel.open = true;
    await expectNoAxeViolations(required(panel.parentElement));
  });
});
