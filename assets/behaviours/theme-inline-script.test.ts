import { afterEach, describe, expect, it } from 'vitest';
import { cdp } from 'vitest/browser';
import { required } from '../test-support/required';
// The very file the layout includes in the head: what is tested is what the pages carry.
import template from '../../templates/_theme_script.html.twig?raw';

const frames: HTMLIFrameElement[] = [];

/** The text of the inline script, as the browser would run it (the template has the one <script>, and Twig comments around it). */
function inlineScript(): string {
  const withoutComments = template.replace(/\{#[\s\S]*?#\}/g, '');
  const scripts = Array.from(withoutComments.matchAll(/<script>([\s\S]*?)<\/script>/g));
  expect(scripts).toHaveLength(1);

  return required(required(scripts[0])[1]);
}

interface Page {
  html: HTMLElement;
  /** Resolves once the browser has told the page that the colour scheme of the system changed, and the page's own listeners ran. */
  schemeChanged: () => Promise<void>;
}

/**
 * A page of its own, as the server renders it for the theme asked for: the attributes on <html> and the script in the head,
 * before anything is painted. In a frame, so that each test has its own document and its own listeners.
 */
async function load(tema: string, bootstrap: string): Promise<Page> {
  const frame = document.createElement('iframe');
  frame.title = 'página';
  frame.srcdoc = `<!doctype html><html lang="pt-BR" data-bs-theme="${bootstrap}" data-jus-tema="${tema}"><head><script>${inlineScript()}</script></head><body></body></html>`;
  const loaded = new Promise<void>((resolve) => {
    frame.addEventListener('load', () => {
      resolve();
    }, { once: true });
  });
  document.body.append(frame);
  frames.push(frame);
  await loaded;

  const view = required(frame.contentWindow);
  const html = required(frame.contentDocument).documentElement;
  const schemeChanged = (): Promise<void> =>
    new Promise((resolve) => {
      // Registered after the script's own listener, so by the time this one runs the script has run.
      view.matchMedia('(prefers-color-scheme: dark)').addEventListener(
        'change',
        () => {
          setTimeout(resolve, 0);
        },
        { once: true },
      );
    });

  return { html, schemeChanged };
}

/** The system asks for a colour scheme: the real media query of the browser. */
async function systemPrefers(scheme: 'dark' | 'light' | null): Promise<void> {
  await cdp().send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme ?? '' }] });
}

async function systemChangesTo(page: Page, scheme: 'dark' | 'light'): Promise<void> {
  const changed = page.schemeChanged();
  await systemPrefers(scheme);
  await changed;
}

afterEach(async () => {
  for (const frame of frames.splice(0)) {
    frame.remove();
  }
  await systemPrefers(null);
});

describe('the inline script in the head of the layout', () => {
  it('turns "sistema" dark before anything is painted, when the system asks for the dark scheme', async () => {
    await systemPrefers('dark');

    const { html } = await load('sistema', 'light');

    expect(html.dataset.bsTheme).toBe('dark');
    expect(html.dataset.jusTema).toBe('sistema');
  });

  it('leaves "sistema" light when the system asks for the light scheme', async () => {
    await systemPrefers('light');

    const { html } = await load('sistema', 'light');

    expect(html.dataset.bsTheme).toBe('light');
  });

  it('follows the system while the page says "sistema", both ways', async () => {
    await systemPrefers('light');
    const page = await load('sistema', 'light');

    await systemChangesTo(page, 'dark');
    expect(page.html.dataset.bsTheme).toBe('dark');

    await systemChangesTo(page, 'light');
    expect(page.html.dataset.bsTheme).toBe('light');
  });

  it.each([
    { tema: 'claro', bootstrap: 'light', against: 'dark' as const },
    { tema: 'escuro', bootstrap: 'dark', against: 'light' as const },
  ])('ignores the system when the page says "$tema", at the start and afterwards', async ({ tema, bootstrap, against }) => {
    await systemPrefers(against);
    const page = await load(tema, bootstrap);
    expect(page.html.dataset.bsTheme).toBe(bootstrap);

    await systemChangesTo(page, bootstrap === 'light' ? 'light' : 'dark');
    await systemChangesTo(page, against);

    expect(page.html.dataset.bsTheme).toBe(bootstrap);
    expect(page.html.dataset.jusTema).toBe(tema);
  });

  it('starts following the system as soon as the attribute says "sistema" again, which is all the switcher changes', async () => {
    await systemPrefers('dark');
    const page = await load('claro', 'light');
    expect(page.html.dataset.bsTheme).toBe('light');

    page.html.dataset.jusTema = 'sistema';
    await systemChangesTo(page, 'light');
    await systemChangesTo(page, 'dark');
    expect(page.html.dataset.bsTheme).toBe('dark');

    // And stops again, with the same attribute, when another theme is chosen.
    page.html.dataset.jusTema = 'claro';
    page.html.dataset.bsTheme = 'light';
    await systemChangesTo(page, 'light');
    await systemChangesTo(page, 'dark');
    expect(page.html.dataset.bsTheme).toBe('light');
  });
});
