const SWITCHER = 'form[data-jus-theme-switcher]';
const THEME_BUTTONS = `${SWITCHER} button[name="tema"]`;
const DARK_SCHEME = '(prefers-color-scheme: dark)';

/** The values of the `tema` field, as the server names them. */
type Theme = 'sistema' | 'claro' | 'escuro';

function isTheme(value: string): value is Theme {
  return value === 'sistema' || value === 'claro' || value === 'escuro';
}

/**
 * Makes the theme switcher of the layout take effect without leaving the page.
 *
 * The switcher is a plain form (`data-jus-theme-switcher`): without this script a click posts it to `/tema`, which saves
 * the choice in a cookie and sends the person back to the same page, now rendered in the theme. With the script, a
 * submit that comes from one of its theme buttons is taken over: the page changes at once (`data-jus-tema`, which says
 * what was chosen, and `data-bs-theme`, which is what the stylesheet reads), every switcher of the page marks the new
 * button as pressed, a polite live region says "Tema escuro aplicado." (the sentence comes from the page, on the button),
 * and the same form is sent in the background, with `fetch`, to save the choice.
 *
 * "Sistema" is resolved here with the media query of the browser. Keeping up with the system afterwards is the job of the
 * small script in the head of the layout, which reads `data-jus-tema` and so notices that the person chose another theme.
 *
 * A request that does not go through (the connection dropped, or the server refused it) is not left unsaid: the page
 * would show a theme that the next page will not have. The form is then sent the way the browser sends it, by a second
 * submit of the same button that this script lets pass. That is the path without JavaScript, which ends on the page
 * with the saved theme (or on the error the browser or the server has to show, which is the truth about the state of
 * things); it costs a page load only when something is wrong already, and needs no message of its own.
 *
 * The requests go one at a time, in the order of the choices: two choices made in quick succession may be answered out of
 * order by the network, and the saved theme must be the last one, the one the page shows. What the browser sends when a
 * request failed is also that one, whatever was queued behind the request that failed: the page shows the latest choice, so
 * that is the one to keep, and the choices that were still waiting are covered by it (they are not sent afterwards, over it).
 * A failure of any kind in that last resort does not stop the next choices from being saved.
 */
export function installThemeSwitcher(document: Document): void {
  /** The forms the browser is sending after the background request failed: their next submit is not ours to take over. */
  const resending = new WeakSet<HTMLFormElement>();
  let sending: Promise<void> = Promise.resolve();
  /** The number of choices made so far, to tell the ones a resend has already covered from the ones that came after it. */
  let made = 0;
  let covered = 0;
  let latest: Choice | null = null;

  document.addEventListener('submit', (submitted) => {
    const form = submitted.target;
    if (!(form instanceof HTMLFormElement) || !form.matches(SWITCHER) || submitted.defaultPrevented) {
      return;
    }
    if (resending.has(form)) {
      return;
    }

    const button = submitted.submitter;
    if (!(button instanceof HTMLButtonElement) || !isTheme(button.value)) {
      return;
    }

    submitted.preventDefault();
    show(document, button.value);
    announce(form, button);

    const choice = { form, button };
    const number = ++made;
    latest = choice;
    sending = sending
      .then(async () => {
        if (number <= covered || (await save(choice))) {
          return;
        }

        await nextTask();
        // The latest choice, read now: the person may have chosen again while the request was failing or the task waited.
        covered = made;
        const last = latest ?? choice;
        resending.add(last.form);
        try {
          // The submit event is dispatched before requestSubmit returns, so the mark only has to last that long.
          last.form.requestSubmit(last.button);
        } finally {
          resending.delete(last.form);
        }
      })
      .catch(() => undefined);
  });
}

/** What was chosen: the button that was pressed, and the form it belongs to. */
interface Choice {
  form: HTMLFormElement;
  button: HTMLButtonElement;
}

/** What the stylesheet reads for a choice: "sistema" is whatever the browser says the system prefers now. */
function colourModeOf(document: Document, theme: Theme): 'light' | 'dark' {
  if (theme === 'sistema') {
    return document.defaultView?.matchMedia(DARK_SCHEME).matches === true ? 'dark' : 'light';
  }

  return theme === 'escuro' ? 'dark' : 'light';
}

function show(document: Document, theme: Theme): void {
  document.documentElement.dataset.jusTema = theme;
  document.documentElement.dataset.bsTheme = colourModeOf(document, theme);

  for (const button of document.querySelectorAll<HTMLButtonElement>(THEME_BUTTONS)) {
    button.setAttribute('aria-pressed', String(button.value === theme));
  }
}

function announce(form: HTMLFormElement, button: HTMLButtonElement): void {
  const status = form.querySelector('[data-jus-theme-status]');
  if (status === null) {
    return;
  }

  // Emptied first, and filled in a task of its own: a live region whose text does not change says nothing, and a person
  // who picks the theme they already have is waiting to hear that it was applied.
  const message = button.dataset.jusThemeAnnouncement ?? '';
  status.textContent = '';
  setTimeout(() => {
    status.textContent = message;
  }, 0);
}

/**
 * The browser ignores a submit that is asked for while the event of another submit is still being dispatched, and the
 * callback of a promise that has already settled runs right there, as soon as the listener returns. A task of its own
 * is outside the event. (A request that really fails takes longer than that, but a refusal that is already known need not.)
 */
function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Sends the form, with the button that was pressed, the way the browser would, but without leaving the page. */
async function save({ form, button }: Choice): Promise<boolean> {
  try {
    const response = await fetch(form.action, { method: 'POST', body: new FormData(form, button), headers: { Accept: 'application/json' } });

    return response.ok;
  } catch {
    return false;
  }
}
