import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cdp, userEvent } from 'vitest/browser';
import { expectNoAxeViolations } from '../test-support/axe';
import { required } from '../test-support/required';
import { installTokens } from '../test-support/tokens';
import { installThemeSwitcher } from './theme-switcher';

const pages: HTMLElement[] = [];
const unwatchers: (() => void)[] = [];

const root = document.documentElement;

/** The buttons of a switcher as the server renders them: the current one is the one marked pressed. */
function markup(current: string): string {
  const themes = [
    { value: 'sistema', icon: 'bi-circle-half', label: 'Sistema', announcement: 'Tema do sistema aplicado.' },
    { value: 'claro', icon: 'bi-sun', label: 'Claro', announcement: 'Tema claro aplicado.' },
    { value: 'escuro', icon: 'bi-moon-stars', label: 'Escuro', announcement: 'Tema escuro aplicado.' },
  ];
  const buttons = themes
    .map(
      (theme) => `
        <button type="submit" class="btn btn-outline-secondary" name="tema" value="${theme.value}" aria-pressed="${String(theme.value === current)}" title="Tema: ${theme.label}"
                data-jus-theme-announcement="${theme.announcement}">
          <i class="bi ${theme.icon}" aria-hidden="true"></i> <span class="visually-hidden">Tema: </span><span class="jus-theme-switcher-label">${theme.label}</span>
        </button>`,
    )
    .join('');

  // The form posts into a frame of its own, so that a send that goes through does not take the page of the tests away.
  return `
    <form method="post" action="/tema" target="sink" class="jus-theme-switcher" data-jus-theme-switcher>
      <input type="hidden" name="_token" value="csrf-token">
      <input type="hidden" name="voltar" value="/processos?q=maria">
      <div class="btn-group btn-group-sm" role="group" aria-label="Tema">${buttons}</div>
      <p class="visually-hidden" aria-live="polite" data-jus-theme-status></p>
    </form>`;
}

interface Mounted {
  page: HTMLElement;
  form: HTMLFormElement;
  status: HTMLElement;
}

/** Puts markup on the page, with the frame a form can post into. */
function place(html: string): HTMLElement {
  const page = document.createElement('div');
  page.setHTMLUnsafe(`<iframe name="sink" title="destino" hidden></iframe>${html}`);
  document.body.append(page);
  pages.push(page);

  return page;
}

function mount(current = 'sistema'): Mounted {
  const page = place(markup(current));

  return { page, form: required(page.querySelector('form')), status: required(page.querySelector<HTMLElement>('[data-jus-theme-status]')) };
}

function button(scope: ParentNode, theme: string): HTMLButtonElement {
  return required(scope.querySelector<HTMLButtonElement>(`button[value="${theme}"]`));
}

function pressed(scope: ParentNode): Record<string, string | null> {
  return Object.fromEntries(Array.from(scope.querySelectorAll('button')).map((each) => [each.value, each.getAttribute('aria-pressed')]));
}

/** What the page says about its theme: the attribute the stylesheet reads and the one the preference is kept in. */
function theme(): { tema: string | undefined; bootstrap: string | undefined } {
  return { tema: root.dataset.jusTema, bootstrap: root.dataset.bsTheme };
}

function startAs(tema: string, bootstrap: string): void {
  root.dataset.jusTema = tema;
  root.dataset.bsTheme = bootstrap;
}

/** The fetch of the page, answering with the given response (a 204, as the server does) unless the test says otherwise. */
function answerWith(respond: () => Promise<Response> = () => Promise.resolve(new Response(null, { status: 204 }))) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(respond);
}

/** The fields a request carries, read from the FormData body. */
function fieldsOf(init: RequestInit | undefined): Record<string, FormDataEntryValue> {
  const body = init?.body;
  if (!(body instanceof FormData)) {
    throw new Error('Expected a FormData body.');
  }

  return Object.fromEntries(body.entries());
}

interface Submits {
  /** For each submit of the document: whether a handler had prevented it by the time it reached the window (so the browser sends nothing). */
  prevented: boolean[];
  /** The value of the button each submit came from. */
  by: (string | null)[];
}

function watchSubmits(): Submits {
  const watched: Submits = { prevented: [], by: [] };
  const onSubmit = (submitted: SubmitEvent): void => {
    watched.prevented.push(submitted.defaultPrevented);
    watched.by.push(submitted.submitter instanceof HTMLButtonElement ? submitted.submitter.value : null);
  };
  window.addEventListener('submit', onSubmit);
  unwatchers.push(() => {
    window.removeEventListener('submit', onSubmit);
  });

  return watched;
}

/** The system asks for the dark or the light colour scheme: the real media query of the browser, not a stand-in. */
async function systemPrefers(scheme: 'dark' | 'light' | null): Promise<void> {
  await cdp().send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme ?? '' }] });
}

afterEach(async () => {
  for (const unwatch of unwatchers.splice(0)) {
    unwatch();
  }
  for (const page of pages.splice(0)) {
    page.remove();
  }
  vi.restoreAllMocks();
  root.removeAttribute('data-jus-tema');
  root.removeAttribute('data-bs-theme');
  await systemPrefers(null);
});

describe('a theme switcher before the behaviour is installed (scripts off, or not loaded yet)', () => {
  it('is a plain form: the browser sends it, with the button that was pressed, and the page does not change', async () => {
    const fetchSpy = answerWith();
    const watched = watchSubmits();
    startAs('sistema', 'light');
    const { page } = mount();

    await userEvent.click(button(page, 'escuro'));

    expect(watched.prevented).toEqual([false]);
    expect(watched.by).toEqual(['escuro']);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(theme()).toEqual({ tema: 'sistema', bootstrap: 'light' });
  });
});

describe('installThemeSwitcher', () => {
  beforeAll(() => {
    // The listener is on the document, so it also serves the switchers mounted after this.
    installThemeSwitcher(document);
  });

  it('applies the chosen theme to the page at once, with the pressed state of the buttons', async () => {
    answerWith();
    startAs('sistema', 'light');
    const { page } = mount();

    await userEvent.click(button(page, 'escuro'));

    expect(theme()).toEqual({ tema: 'escuro', bootstrap: 'dark' });
    expect(pressed(page)).toEqual({ sistema: 'false', claro: 'false', escuro: 'true' });

    await userEvent.click(button(page, 'claro'));

    expect(theme()).toEqual({ tema: 'claro', bootstrap: 'light' });
    expect(pressed(page)).toEqual({ sistema: 'false', claro: 'true', escuro: 'false' });
  });

  it('saves the choice with a POST of the fields of the form and the pressed button, asking for a bare answer', async () => {
    const fetchSpy = answerWith();
    const { page, form } = mount();

    await userEvent.click(button(page, 'escuro'));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = required(fetchSpy.mock.calls[0]);
    expect(url).toBe(form.action);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ Accept: 'application/json' });
    expect(fieldsOf(init)).toEqual({ _token: 'csrf-token', voltar: '/processos?q=maria', tema: 'escuro' });
  });

  it('keeps the page where it is: the browser does not send the form as well', async () => {
    answerWith();
    const watched = watchSubmits();
    const { page } = mount();

    await userEvent.click(button(page, 'claro'));

    expect(watched.prevented).toEqual([true]);
    expect(watched.by).toEqual(['claro']);
  });

  it('announces the theme in the live region of the form', async () => {
    answerWith();
    const { page, status } = mount();

    await userEvent.click(button(page, 'escuro'));
    await vi.waitFor(() => {
      expect(status.textContent).toBe('Tema escuro aplicado.');
    });

    await userEvent.click(button(page, 'sistema'));
    await vi.waitFor(() => {
      expect(status.textContent).toBe('Tema do sistema aplicado.');
    });
  });

  it('says it again when the person picks the theme they already have, by emptying the region first', async () => {
    answerWith();
    const { page, status } = mount();
    const heard: string[] = [];
    // One entry per change the assistive technology could notice: the region emptied, and the text put back in a later task.
    new MutationObserver(() => {
      heard.push(status.textContent);
    }).observe(status, { childList: true, characterData: true, subtree: true });

    await userEvent.click(button(page, 'escuro'));
    await vi.waitFor(() => {
      expect(heard).toEqual(['Tema escuro aplicado.']);
    });
    await userEvent.click(button(page, 'escuro'));

    await vi.waitFor(() => {
      expect(heard).toEqual(['Tema escuro aplicado.', '', 'Tema escuro aplicado.']);
    });
    expect(status.textContent).toBe('Tema escuro aplicado.');
  });

  it('follows the colour scheme of the system for "Sistema", and the choice of the person for the others', async () => {
    answerWith();
    startAs('claro', 'light');
    const { page } = mount('claro');

    await systemPrefers('dark');
    await userEvent.click(button(page, 'sistema'));
    expect(theme()).toEqual({ tema: 'sistema', bootstrap: 'dark' });

    await userEvent.click(button(page, 'claro'));
    expect(theme()).toEqual({ tema: 'claro', bootstrap: 'light' });

    await systemPrefers('light');
    await userEvent.click(button(page, 'sistema'));
    expect(theme()).toEqual({ tema: 'sistema', bootstrap: 'light' });

    await systemPrefers('dark');
    await userEvent.click(button(page, 'escuro'));
    expect(theme()).toEqual({ tema: 'escuro', bootstrap: 'dark' });
  });

  it('marks the theme as pressed in every switcher of the page, not only in the one that was used', async () => {
    answerWith();
    const first = mount('sistema');
    const second = mount('sistema');

    await userEvent.click(button(second.page, 'escuro'));

    expect(pressed(first.page)).toEqual({ sistema: 'false', claro: 'false', escuro: 'true' });
    expect(pressed(second.page)).toEqual({ sistema: 'false', claro: 'false', escuro: 'true' });
    expect(first.status.textContent).toBe('');
    expect(second.status.textContent).toBe('Tema escuro aplicado.');
  });

  it.each(['{Enter}', ' '])('works from the keyboard (%j on the focused button)', async (key) => {
    const fetchSpy = answerWith();
    const { page } = mount();
    button(page, 'claro').focus();

    await userEvent.keyboard(key);

    expect(theme().tema).toBe('claro');
    expect(fieldsOf(required(fetchSpy.mock.calls[0])[1]).tema).toBe('claro');
  });

  it('sends one request at a time, in the order of the choices, so that the last choice is the one that is kept', async () => {
    let release: (response: Response) => void = () => undefined;
    const fetchSpy = answerWith(
      vi
        .fn<() => Promise<Response>>()
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              release = resolve;
            }),
        )
        .mockImplementation(() => Promise.resolve(new Response(null, { status: 204 }))),
    );
    const { page } = mount();

    await userEvent.click(button(page, 'claro'));
    await userEvent.click(button(page, 'escuro'));

    // The page already shows the last choice; the second request waits for the first.
    expect(theme().tema).toBe('escuro');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    release(new Response(null, { status: 204 }));

    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
    expect(fetchSpy.mock.calls.map(([, init]) => fieldsOf(init).tema)).toEqual(['claro', 'escuro']);
  });

  describe('when the preference cannot be saved from the page', () => {
    it('lets the browser send the form instead, with the button that was pressed, when the request fails', async () => {
      const fetchSpy = answerWith(() => Promise.reject(new TypeError('Failed to fetch')));
      const watched = watchSubmits();
      startAs('sistema', 'light');
      const { page } = mount();

      await userEvent.click(button(page, 'escuro'));

      // The first submit was taken over by the page; the second one is the browser's own, from the same button, and
      // nothing stops it.
      await vi.waitFor(() => {
        expect(watched.prevented).toEqual([true, false]);
      });
      expect(watched.by).toEqual(['escuro', 'escuro']);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('does the same when the server refuses it', async () => {
      answerWith(() => Promise.resolve(new Response('Acesso negado', { status: 403 })));
      const watched = watchSubmits();
      const { page } = mount();

      await userEvent.click(button(page, 'claro'));

      await vi.waitFor(() => {
        expect(watched.prevented).toEqual([true, false]);
      });
      expect(watched.by).toEqual(['claro', 'claro']);
    });

    it('takes over the next choice again, once the browser has sent the form', async () => {
      const fetchSpy = answerWith(() => Promise.reject(new TypeError('Failed to fetch')));
      const watched = watchSubmits();
      const { page } = mount();
      await userEvent.click(button(page, 'escuro'));
      await vi.waitFor(() => {
        expect(watched.prevented).toEqual([true, false]);
      });
      fetchSpy.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));

      await userEvent.click(button(page, 'claro'));

      expect(watched.prevented).toEqual([true, false, true]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('sends the latest choice the browser way, when an earlier one failed, and does not save the ones queued behind it', async () => {
      let fail: (reason: Error) => void = () => undefined;
      const fetchSpy = answerWith(
        () =>
          new Promise<Response>((_resolve, reject) => {
            fail = reject;
          }),
      );
      const watched = watchSubmits();
      const { page } = mount();

      await userEvent.click(button(page, 'claro'));
      await userEvent.click(button(page, 'escuro'));
      fail(new TypeError('Failed to fetch'));

      // What the page shows is "escuro", so that is what the browser sends; "claro" is not sent late, over it.
      await vi.waitFor(() => {
        expect(watched.prevented).toEqual([true, true, false]);
      });
      expect(watched.by).toEqual(['claro', 'escuro', 'escuro']);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(theme().tema).toBe('escuro');
    });

    it('keeps saving the next choices after a resend that went wrong, and does not leave the form marked as being sent', async () => {
      const fetchSpy = answerWith(() => Promise.reject(new TypeError('Failed to fetch')));
      const resend = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {
        throw new Error('The browser refused the submit.');
      });
      const watched = watchSubmits();
      const { page } = mount();
      await userEvent.click(button(page, 'escuro'));
      await vi.waitFor(() => {
        expect(resend).toHaveBeenCalledTimes(1);
      });
      resend.mockRestore();
      fetchSpy.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));

      await userEvent.click(button(page, 'claro'));

      // The queue did not stall (the second request goes out), and this submit was taken over like any other.
      await vi.waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledTimes(2);
      });
      expect(watched.prevented).toEqual([true, true]);
      expect(theme().tema).toBe('claro');
    });
  });

  describe('what it leaves to the browser', () => {
    it('does not touch a form that is not a theme switcher', async () => {
      const fetchSpy = answerWith();
      const watched = watchSubmits();
      const page = place('<form method="post" action="/outro" target="sink"><button type="submit" name="tema" value="escuro">Enviar</button></form>');

      await userEvent.click(button(page, 'escuro'));

      expect(watched.prevented).toEqual([false]);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(root.dataset.jusTema).toBeUndefined();
    });

    it('does not take over a submit that did not come from a theme button', () => {
      const fetchSpy = answerWith();
      const watched = watchSubmits();
      const { form } = mount();

      form.requestSubmit();

      expect(watched.prevented).toEqual([false]);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(root.dataset.jusTema).toBeUndefined();
    });

    it('does not take over a button with a theme the page does not know', async () => {
      const fetchSpy = answerWith();
      const watched = watchSubmits();
      const { page } = mount();
      button(page, 'claro').value = 'roxo';

      await userEvent.click(button(page, 'roxo'));

      expect(watched.prevented).toEqual([false]);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(root.dataset.jusTema).toBeUndefined();
    });

    it('respects a submit that another handler has already prevented', async () => {
      const fetchSpy = answerWith();
      const { page, form } = mount();
      form.addEventListener('submit', (event) => {
        event.preventDefault();
      });

      await userEvent.click(button(page, 'escuro'));

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(root.dataset.jusTema).toBeUndefined();
    });
  });

  describe.each(['light', 'dark'] as const)('in the %s theme', (colourMode) => {
    it('has no accessibility violations, before and after a choice', async () => {
      answerWith();
      const uninstall = installTokens(colourMode);
      try {
        const { page } = mount();
        await expectNoAxeViolations(page);

        await userEvent.click(button(page, 'escuro'));

        await expectNoAxeViolations(page);
      } finally {
        uninstall();
      }
    });
  });
});
