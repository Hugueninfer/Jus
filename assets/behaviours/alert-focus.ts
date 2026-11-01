/**
 * What a page marks as a place the focus may be sent to: `data-jus-focus-target`, on an element that also has a
 * `tabindex` (`-1`: focusable by script, not in the Tab order). It is opt-in, not every `tabindex="-1"` (an off-canvas
 * panel, an item of a list that moves its tabindex): only the pages know which places are meaningful to land on.
 */
const FOCUS_TARGET = '[data-jus-focus-target][tabindex]';

/**
 * Keeps the keyboard user's place when a dismissible alert goes away.
 *
 * Closing an alert that holds the focus (its close button, or a link in its message) removes the focused element, so
 * the browser drops the focus to the top of the document and the user has to tab through the header again. This hands
 * it to the nearest focus target before the alert instead: inside the main content (`main#conteudo`), the last element
 * marked `data-jus-focus-target` that comes before the alert (or holds it) and is shown; the main content itself when
 * there is none. The layout marks `main#conteudo`, and a page marks the places it wants (the tabs of the case,
 * `nav#andamento`). A message in the top area of the page therefore sends the focus to the top of the main content, and
 * the confirmation of a filing, which sits below those tabs, sends it to them, where the redirect had landed: the user
 * does not lose the place and is not thrown back above the case data.
 *
 * Bootstrap fires `close.bs.alert` on the alert before it closes it and `closed.bs.alert` on the alert after removing
 * it. The second one is dispatched on a detached element, so it never bubbles up to the document: it can only be
 * heard on the alert itself. The first one bubbles, so the document hears when a closing starts, and that is also the
 * last moment the focus can be read, and the alert is still where it was in the document, so the target is chosen then.
 */
export function installAlertFocus(document: Document): void {
  document.addEventListener('close.bs.alert', (closing) => {
    const alert = closing.target;
    const main = document.querySelector<HTMLElement>('main#conteudo');
    if (closing.defaultPrevented || !(alert instanceof Element) || main === null || !alert.contains(document.activeElement)) {
      return;
    }

    const target = nearestTargetBefore(alert, main);
    alert.addEventListener(
      'closed.bs.alert',
      () => {
        // The removal sent the focus to the body. If the user already moved it somewhere else while the alert
        // faded out, it stays there.
        const lost = document.activeElement === null || document.activeElement === document.body;
        if (lost) {
          // The target may have gone with a change of the page in the meantime: then the main content is the place.
          (target.isConnected ? target : main).focus();
        }
      },
      { once: true },
    );
  });
}

/**
 * The last marked focus target in the main content that comes before the alert in the document, or holds it: what an element
 * that follows it, or sits inside it (it goes away with it), is not. One that is not shown cannot take the focus and is
 * passed over. The main content is the answer when there is none.
 */
function nearestTargetBefore(alert: Element, main: HTMLElement): HTMLElement {
  let nearest = main;
  // In document order, so the last one that qualifies is the nearest.
  for (const candidate of main.querySelectorAll<HTMLElement>(FOCUS_TARGET)) {
    const comesBefore = (alert.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
    if (comesBefore && candidate.checkVisibility()) {
      nearest = candidate;
    }
  }

  return nearest;
}
