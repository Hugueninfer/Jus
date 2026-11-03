import { afterEach, describe, expect, it } from 'vitest';
import { required } from '../test-support/required';
// The very file the search includes right after the panel: what is tested is what the page carries.
import template from '../../templates/case/_filters_script.html.twig?raw';

/** A phone, the last width below lg, the first width of lg, and a desktop. */
const PHONE = 375;
const LAST_BELOW_LG = 991;
const LG = 992;
const DESKTOP = 1280;

const frames: HTMLIFrameElement[] = [];

/** The text of the inline script, as the browser would run it (the template has the one <script>, and Twig comments around it). */
function inlineScript(): string {
  const withoutComments = template.replace(/\{#[\s\S]*?#\}/g, '');
  const scripts = Array.from(withoutComments.matchAll(/<script>([\s\S]*?)<\/script>/g));
  expect(scripts).toHaveLength(1);

  return required(required(scripts[0])[1]);
}

interface Loaded {
  panel: HTMLDetailsElement;
  /** Whether the panel was open when the parser reached the next element, before anything after it was parsed. */
  openRightAfter: string | undefined;
}

/**
 * A page of its own, as the search renders it: the panel, always sent open with what the server knows about the filters
 * (`active` is the value of data-jus-filters-active; null leaves it out), and the script right after it. In a frame of the
 * given width, which is the width its media queries see, so that each test has its own document.
 */
async function load(width: number, active: string | null = 'false', panelClass = 'jus-filters'): Promise<Loaded> {
  const attribute = active === null ? '' : ` data-jus-filters-active="${active}"`;
  const frame = document.createElement('iframe');
  frame.title = 'busca';
  frame.style.width = `${String(width)}px`;
  frame.style.height = '600px';
  frame.srcdoc = `<!doctype html><html lang="pt-BR"><head><title>Busca</title></head><body>
    <details class="${panelClass}" open${attribute}><summary>Filtrar</summary><p>Os campos.</p></details>
    <script>${inlineScript()}</script>
    <script>document.body.dataset.openRightAfter = String(document.querySelector('details').open);</script>
  </body></html>`;
  const loaded = new Promise<void>((resolve) => {
    frame.addEventListener('load', () => {
      resolve();
    }, { once: true });
  });
  document.body.append(frame);
  frames.push(frame);
  await loaded;

  const page = required(frame.contentDocument);

  return { panel: required(page.querySelector('details')), openRightAfter: page.body.dataset.openRightAfter };
}

afterEach(() => {
  for (const frame of frames.splice(0)) {
    frame.remove();
  }
});

describe('the inline script after the filters panel of the search', () => {
  it.each([PHONE, LAST_BELOW_LG])('folds the panel at %i px when no filter is in use, as soon as it is parsed', async (width) => {
    const { panel, openRightAfter } = await load(width, 'false');

    expect(openRightAfter).toBe('false');
    expect(panel.open).toBe(false);
  });

  it('leaves the panel open below lg when a filter is in use or a field has an error, where the person can see it', async () => {
    const { panel, openRightAfter } = await load(PHONE, 'true');

    expect(openRightAfter).toBe('true');
    expect(panel.open).toBe(true);
  });

  it.each([LG, DESKTOP])('leaves the panel open at %i px, where it is a column of its own, even with no filter in use', async (width) => {
    const { panel } = await load(width, 'false');

    expect(panel.open).toBe(true);
  });

  it.each([null, '', 'no'])('leaves alone a panel whose state the server did not give as "false" (%s)', async (active) => {
    const { panel } = await load(PHONE, active);

    expect(panel.open).toBe(true);
  });

  it('leaves alone a <details> that is not the filters panel', async () => {
    const { panel } = await load(PHONE, 'false', 'outro');

    expect(panel.open).toBe(true);
  });

  it('keeps the summary as the way to open the folded panel', async () => {
    const { panel } = await load(PHONE, 'false');

    required(panel.querySelector('summary')).click();

    expect(panel.open).toBe(true);
  });
});
