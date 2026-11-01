/**
 * Keeps the keyboard user's place when a dismissible alert goes away.
 *
 * Closing an alert that holds the focus (its close button, or a link in its message) removes the focused element, so
 * the browser drops the focus to the top of the document and the user has to tab through the header again. This hands
 * it to the main content instead, which the layout makes focusable (`main#conteudo`, `tabindex="-1"`).
 *
 * Bootstrap fires `close.bs.alert` on the alert before it closes it and `closed.bs.alert` on the alert after removing
 * it. The second one is dispatched on a detached element, so it never bubbles up to the document: it can only be
 * heard on the alert itself. The first one bubbles, so the document hears when a closing starts, and that is also the
 * last moment the focus can be read.
 */
export function installAlertFocus(document: Document): void {
  document.addEventListener('close.bs.alert', (closing) => {
    const alert = closing.target;
    if (closing.defaultPrevented || !(alert instanceof Element) || !alert.contains(document.activeElement)) {
      return;
    }

    alert.addEventListener(
      'closed.bs.alert',
      () => {
        // The removal sent the focus to the body. If the user already moved it somewhere else while the alert
        // faded out, it stays there.
        const lost = document.activeElement === null || document.activeElement === document.body;
        const main = document.querySelector<HTMLElement>('main#conteudo');
        if (lost && main !== null) {
          main.focus();
        }
      },
      { once: true },
    );
  });
}
