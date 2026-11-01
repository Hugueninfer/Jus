const MARKER = 'form[data-jus-submit-once]';

/** The submit buttons each busy form had enabled before they were disabled (the ones to enable again). */
const disabledBy = new WeakMap<HTMLFormElement, (HTMLButtonElement | HTMLInputElement)[]>();

/**
 * Keeps a form from being sent twice by an impatient second click while the first request is still on its way (a filing
 * with large PDFs takes a while, and every send would file the petition again).
 *
 * Once a submit of a marked form (`data-jus-submit-once`) goes through, its submit buttons are disabled and the form is
 * marked `aria-busy="true"`. It is not done for a form the browser refused to send because of its own validation (no
 * submit event is fired for those), nor for a submit some handler prevented: the form stays usable. A page restored from
 * the back-forward cache (the person went back to it) has them enabled again, since the page is shown with the state it
 * was left in, and nothing is on its way any more. Without JavaScript nothing changes: the form is sent as usual.
 *
 * The buttons are disabled after the event, in a task of their own, for two reasons. Whether the submit was prevented
 * is only settled once every handler has run, including the ones further up the page than this one. And a disabled
 * button takes its name and value out of the data sent, but the browser builds that data right after the event,
 * before the task runs: the button that was pressed is still part of what is sent.
 */
export function installSubmitOnce(document: Document): void {
  document.addEventListener('submit', (submitted) => {
    const form = submitted.target;
    if (!(form instanceof HTMLFormElement) || !form.matches(MARKER) || submitted.defaultPrevented) {
      return;
    }

    setTimeout(() => {
      if (!submitted.defaultPrevented) {
        makeBusy(form);
      }
    }, 0);
  });

  document.defaultView?.addEventListener('pageshow', (shown) => {
    if (!shown.persisted) {
      return;
    }

    for (const form of document.querySelectorAll<HTMLFormElement>(`${MARKER}[aria-busy="true"]`)) {
      makeReady(form);
    }
  });
}

function submitButtonsOf(form: HTMLFormElement): (HTMLButtonElement | HTMLInputElement)[] {
  return Array.from(form.elements).filter(
    (control): control is HTMLButtonElement | HTMLInputElement =>
      (control instanceof HTMLButtonElement || control instanceof HTMLInputElement) && (control.type === 'submit' || control.type === 'image'),
  );
}

function makeBusy(form: HTMLFormElement): void {
  // A second submit before the first one's task ran: what the first one disabled is already on record.
  if (disabledBy.has(form)) {
    return;
  }

  const enabled = submitButtonsOf(form).filter((button) => !button.disabled);
  for (const button of enabled) {
    button.disabled = true;
  }

  disabledBy.set(form, enabled);
  form.setAttribute('aria-busy', 'true');
}

function makeReady(form: HTMLFormElement): void {
  for (const button of disabledBy.get(form) ?? []) {
    button.disabled = false;
  }

  disabledBy.delete(form);
  form.removeAttribute('aria-busy');
}
