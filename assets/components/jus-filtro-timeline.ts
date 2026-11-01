import { JusElement, sheet } from './jus-element';

const TOOLBAR_LABEL = 'Filtrar movimentações por tipo';
const ALL_LABEL = 'Todas';

const styles = sheet(`
  [role="group"] {
    display: flex;
    flex-wrap: wrap;
    gap: var(--jus-space-2);
    margin-block-end: var(--jus-space-3);
  }

  .jus-button[aria-pressed="true"] {
    border-color: var(--jus-color-primary);
  }
`);

/** One event of the timeline in the light DOM, with the type the filter matches on. */
interface TimelineEvent {
  readonly element: HTMLElement;
  readonly type: string;
}

/** One filter button; the type is undefined for the button that shows everything. */
interface FilterButton {
  readonly type: string | undefined;
  readonly button: HTMLButtonElement;
}

/** The types present, with their labels, in the order they first appear in the timeline. */
function distinctTypes(events: readonly TimelineEvent[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const { element, type } of events) {
    if (!labels.has(type)) {
      labels.set(type, element.dataset.eventLabel ?? type);
    }
  }

  return labels;
}

/**
 * Filters the server-rendered timeline (<twig:Timeline>, slotted as it is) by type of event: a button for each type
 * present, one choice at a time, hiding the other events and the days left without any. The result is announced
 * politely. The page's own `hidden` attribute does the hiding, so without JavaScript the whole list shows.
 *
 * The buttons only appear when there are two or more types to choose between. The events are read when the element
 * is connected and again when the timeline in the light DOM is replaced (slotchange).
 */
export class JusFiltroTimeline extends JusElement {
  readonly #slot = document.createElement('slot');
  readonly #status = document.createElement('p');
  #toolbar: HTMLElement | undefined;
  #buttons: readonly FilterButton[] = [];
  #events: readonly TimelineEvent[] = [];
  /** The types the buttons were built for, to keep them (and the focus on them) when the timeline is replaced by a similar one. */
  #typesBuilt = '';
  /** The type shown, or undefined for all of them. */
  #selected: string | undefined;
  #listeners: AbortController | undefined;

  constructor() {
    super();
    this.#status.setAttribute('aria-live', 'polite');
    this.#status.className = 'visually-hidden';
    // The slot stays in the shadow root for good: taking it out and putting it back would fire slotchange again.
    this.root.append(this.#slot);
  }

  protected override styles(): CSSStyleSheet[] {
    return [styles];
  }

  connectedCallback(): void {
    this.#listeners = new AbortController();
    this.#slot.addEventListener('slotchange', () => {
      this.#refresh();
    }, { signal: this.#listeners.signal });

    this.#refresh();
  }

  disconnectedCallback(): void {
    this.#listeners?.abort();
    this.#listeners = undefined;
  }

  /** Reads the timeline again, rebuilds the buttons if its types changed, and applies the filter to what is there. */
  #refresh(): void {
    this.#events = Array.from(this.querySelectorAll<HTMLElement>('.jus-timeline-event[data-event-type]'), (element) => ({
      element,
      type: element.dataset.eventType ?? '',
    }));
    const types = distinctTypes(this.#events);
    const filterable = types.size >= 2;

    // A choice only means something among two or more types, and only while its type is still there.
    if (!filterable || (this.#selected !== undefined && !types.has(this.#selected))) {
      this.#selected = undefined;
    }

    const typesBuilt = filterable ? JSON.stringify([...types]) : '';
    if (typesBuilt !== this.#typesBuilt) {
      this.#typesBuilt = typesBuilt;
      this.#buildToolbar(filterable ? types : new Map());
    }

    this.#status.textContent = '';
    this.#apply();
  }

  #buildToolbar(types: ReadonlyMap<string, string>): void {
    this.#toolbar?.remove();
    this.#toolbar = undefined;
    this.#buttons = [];
    this.#status.remove();
    if (types.size === 0) {
      return;
    }

    const toolbar = document.createElement('div');
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', TOOLBAR_LABEL);
    const choices: [string | undefined, string][] = [[undefined, ALL_LABEL], ...types];
    this.#buttons = choices.map(([type, label]) => this.#createButton(type, label));
    toolbar.append(...this.#buttons.map(({ button }) => button));

    this.#toolbar = toolbar;
    this.root.prepend(toolbar);
    this.root.append(this.#status);
  }

  #createButton(type: string | undefined, label: string): FilterButton {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jus-button';
    button.textContent = label;
    button.addEventListener('click', () => {
      this.#select(type);
    });

    return { type, button };
  }

  #select(type: string | undefined): void {
    if (type === this.#selected) {
      return;
    }

    this.#selected = type;
    this.#apply();
    this.#announce();
  }

  /** Hides the events of the other types, then the days left empty, and marks the pressed button. */
  #apply(): void {
    const selected = this.#selected;
    for (const { element, type } of this.#events) {
      element.hidden = selected !== undefined && type !== selected;
    }
    for (const day of this.querySelectorAll<HTMLElement>('.jus-timeline-day')) {
      day.hidden = selected !== undefined && day.querySelector('.jus-timeline-event:not([hidden])') === null;
    }
    for (const { type, button } of this.#buttons) {
      button.setAttribute('aria-pressed', String(type === selected));
    }
  }

  /** Replaces the text node, not just its data, so that a result with the same numbers is still noticed. */
  #announce(): void {
    const total = String(this.#events.length);
    const selected = this.#selected;
    if (selected === undefined) {
      this.#status.textContent = `Mostrando todas as ${total} movimentações.`;

      return;
    }

    const shown = String(this.#events.filter(({ type }) => type === selected).length);
    this.#status.textContent = `Mostrando ${shown} de ${total} movimentações.`;
  }
}
