import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { expectNoAxeViolations } from '../test-support/axe';
import { installTokens } from '../test-support/tokens';
import './index';
import { JusFiltroTimeline } from './jus-filtro-timeline';

const GROUP_LABEL = 'Filtrar movimentações por tipo';

interface EventSample {
  type: string;
  label: string;
  time: string;
}

const DECISION: EventSample = { type: 'decision', label: 'Decisão', time: '15:00' };
const ORDER: EventSample = { type: 'order', label: 'Despacho', time: '11:00' };
const FILING: EventSample = { type: 'filing', label: 'Juntada de petição', time: '09:30' };
const HEARING: EventSample = { type: 'hearing', label: 'Audiência', time: '10:00' };

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error('Expected a value, got nothing.');
  }

  return value;
}

/** An event the way templates/components/Timeline.html.twig renders it. */
function eventMarkup({ type, label, time }: EventSample): string {
  return `
    <li class="jus-timeline-event" data-event-type="${type}" data-event-label="${label}">
      <i class="bi" aria-hidden="true"></i>
      <div class="jus-timeline-event-body">
        <p class="mb-0"><strong>${label}</strong> <time class="small" datetime="2024-03-06T${time}:00-03:00">${time}</time></p>
        <p class="mb-0 jus-timeline-description">Texto do evento.</p>
      </div>
    </li>`;
}

function dayMarkup(date: string, events: EventSample[]): string {
  return `
    <li class="jus-timeline-day">
      <h3 class="h6"><time datetime="${date}">${date}</time></h3>
      <ol class="list-unstyled" role="list">${events.map(eventMarkup).join('')}</ol>
    </li>`;
}

function timelineMarkup(days: [string, EventSample[]][]): string {
  return `<ol class="list-unstyled jus-timeline" role="list">${days.map(([date, events]) => dayMarkup(date, events)).join('')}</ol>`;
}

/** Two days and three types: the first day has all of them but the filing, the second day only filings. */
const FULL_TIMELINE = timelineMarkup([
  ['2024-03-06', [DECISION, { ...ORDER, time: '11:00' }, { ...ORDER, time: '10:00' }]],
  ['2024-03-04', [FILING, { ...FILING, time: '09:00' }]],
]);
const ONE_TYPE_TIMELINE = timelineMarkup([['2024-03-06', [ORDER, { ...ORDER, time: '10:00' }]]]);
const EMPTY_TIMELINE = '<ol class="list-unstyled jus-timeline" role="list"><li class="text-body-secondary">Nenhuma movimentação.</li></ol>';
const HEARINGS_TIMELINE = timelineMarkup([['2024-04-02', [HEARING, DECISION]]]);

interface Mounted {
  main: HTMLElement;
  element: JusFiltroTimeline;
}

/** Mounts the element around the markup of the Twig timeline, under the heading the case page puts above it. */
function mount(timeline = FULL_TIMELINE): Mounted {
  const main = document.createElement('main');
  main.setHTMLUnsafe(`<h2>Andamento</h2><jus-filtro-timeline>${timeline}</jus-filtro-timeline>`);
  document.body.append(main);

  return { main, element: required(main.querySelector<JusFiltroTimeline>('jus-filtro-timeline')) };
}

function shadowOf(element: JusFiltroTimeline): ShadowRoot {
  return required(element.shadowRoot);
}

function groupOf(element: JusFiltroTimeline): HTMLElement | null {
  return shadowOf(element).querySelector<HTMLElement>('[role="group"]');
}

function buttonsOf(element: JusFiltroTimeline): HTMLButtonElement[] {
  return Array.from(shadowOf(element).querySelectorAll('button'));
}

function buttonNamed(element: JusFiltroTimeline, name: string): HTMLButtonElement {
  return required(buttonsOf(element).find((button) => button.textContent === name));
}

function statusOf(element: JusFiltroTimeline): HTMLElement {
  return required(shadowOf(element).querySelector<HTMLElement>('[aria-live]'));
}

function pressedStates(element: JusFiltroTimeline): Record<string, string | null> {
  return Object.fromEntries(buttonsOf(element).map((button) => [button.textContent, button.getAttribute('aria-pressed')]));
}

/** The types of the events that are not hidden, in document order. */
function shownEvents(element: JusFiltroTimeline): string[] {
  return Array.from(element.querySelectorAll<HTMLElement>('.jus-timeline-event'))
    .filter((item) => !item.hidden)
    .map((item) => item.dataset.eventType ?? '');
}

/** The dates of the days that are not hidden. */
function shownDays(element: JusFiltroTimeline): string[] {
  return Array.from(element.querySelectorAll<HTMLElement>('.jus-timeline-day'))
    .filter((day) => !day.hidden)
    .map((day) => day.querySelector('time')?.textContent ?? '');
}

async function filterBy(element: JusFiltroTimeline, name: string): Promise<void> {
  await userEvent.click(buttonNamed(element, name));
}

/** slotchange is delivered asynchronously, after the mutation that caused it. */
async function nextTask(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Collects the mutations of a node as they are delivered, so read `records` after an await (the observer callback
 * runs in a microtask, and takeRecords() would then find the queue already empty).
 */
function recordMutations(target: Node, options: MutationObserverInit): { records: MutationRecord[]; stop: () => void } {
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((batch) => {
    records.push(...batch);
  });
  observer.observe(target, options);

  return {
    records,
    stop: () => {
      observer.disconnect();
    },
  };
}

/** The colour a design token resolves to, as the browser reports computed colours. */
function colorOf(token: string): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const { color } = getComputedStyle(probe);
  probe.remove();

  return color;
}

describe('<jus-filtro-timeline>', () => {
  let removeTokens: () => void;

  beforeEach(() => {
    removeTokens = installTokens();
  });

  afterEach(() => {
    removeTokens();
    document.body.replaceChildren();
  });

  it('is registered as jus-filtro-timeline and has an open shadow root', () => {
    const { element } = mount();

    expect(customElements.get('jus-filtro-timeline')).toBe(JusFiltroTimeline);
    expect(element).toBeInstanceOf(JusFiltroTimeline);
    expect(element.shadowRoot?.mode).toBe('open');
  });

  describe('buttons', () => {
    it('offers "Todas" and one button per type present, in the order of their first appearance', () => {
      const { element } = mount();

      expect(buttonsOf(element).map((button) => button.textContent)).toEqual(['Todas', 'Decisão', 'Despacho', 'Juntada de petição']);
    });

    it('puts the buttons in a named group, before the slotted timeline, followed by the announcement', () => {
      const { element } = mount();

      const group = required(groupOf(element));
      expect(group.getAttribute('aria-label')).toBe(GROUP_LABEL);
      expect(Array.from(shadowOf(element).children, (child) => child.localName)).toEqual(['div', 'slot', 'p']);
      expect(shadowOf(element).children[0]).toBe(group);
      expect(group.querySelectorAll('button')).toHaveLength(4);

      const slot = required(shadowOf(element).querySelector('slot'));
      expect(slot.assignedElements()).toEqual([element.querySelector('ol.jus-timeline')]);
    });

    it('makes every button a plain button, so it never submits a form around it', () => {
      const { element } = mount();

      expect(buttonsOf(element)).toHaveLength(4);
      for (const button of buttonsOf(element)) {
        expect(button.type).toBe('button');
      }
    });

    it('starts with "Todas" pressed and the others not', () => {
      const { element } = mount();

      expect(pressedStates(element)).toEqual({
        Todas: 'true',
        Decisão: 'false',
        Despacho: 'false',
        'Juntada de petição': 'false',
      });
    });

    it('does not hide anything on load', () => {
      const { element } = mount();

      expect(shownEvents(element)).toEqual(['decision', 'order', 'order', 'filing', 'filing']);
      expect(shownDays(element)).toEqual(['2024-03-06', '2024-03-04']);
    });

    it('uses the label from the markup, as text', () => {
      const { element } = mount(timelineMarkup([['2024-03-06', [{ type: 'decision', label: '&lt;b&gt;Decisão&lt;/b&gt;', time: '10:00' }, ORDER]]]));

      expect(buttonsOf(element)[1]?.textContent).toBe('<b>Decisão</b>');
      expect(shadowOf(element).querySelector('b')).toBeNull();
    });
  });

  describe('filtering', () => {
    it('shows only the events of the chosen type and hides the others', async () => {
      const { element } = mount();

      await filterBy(element, 'Despacho');

      expect(shownEvents(element)).toEqual(['order', 'order']);
      expect(element.querySelectorAll('.jus-timeline-event[hidden]')).toHaveLength(3);
    });

    it('hides a day that has no event of the chosen type, together with its heading', async () => {
      const { element } = mount();
      const earlierDay = required(element.querySelectorAll<HTMLElement>('.jus-timeline-day')[1]);
      expect(required(earlierDay.querySelector('h3')).checkVisibility()).toBe(true);

      await filterBy(element, 'Decisão');

      expect(shownDays(element)).toEqual(['2024-03-06']);
      expect(earlierDay.hidden).toBe(true);
      expect(required(earlierDay.querySelector('h3')).checkVisibility()).toBe(false);
    });

    it('keeps a day that still has an event of the chosen type, hiding only the other events', async () => {
      const { element } = mount();

      await filterBy(element, 'Juntada de petição');

      expect(shownDays(element)).toEqual(['2024-03-04']);
      expect(shownEvents(element)).toEqual(['filing', 'filing']);
      expect(required(element.querySelector<HTMLElement>('.jus-timeline-day')).hidden).toBe(true);
    });

    it('marks the chosen button as pressed and every other one as not pressed', async () => {
      const { element } = mount();

      await filterBy(element, 'Despacho');

      expect(pressedStates(element)).toEqual({
        Todas: 'false',
        Decisão: 'false',
        Despacho: 'true',
        'Juntada de petição': 'false',
      });
    });

    it('goes straight from one type to another', async () => {
      const { element } = mount();
      await filterBy(element, 'Despacho');

      await filterBy(element, 'Juntada de petição');

      expect(shownEvents(element)).toEqual(['filing', 'filing']);
      expect(shownDays(element)).toEqual(['2024-03-04']);
      expect(pressedStates(element)['Despacho']).toBe('false');
      expect(pressedStates(element)['Juntada de petição']).toBe('true');
    });

    it('shows everything again, days included, when "Todas" is chosen', async () => {
      const { element } = mount();
      await filterBy(element, 'Juntada de petição');

      await filterBy(element, 'Todas');

      expect(shownEvents(element)).toEqual(['decision', 'order', 'order', 'filing', 'filing']);
      expect(shownDays(element)).toEqual(['2024-03-06', '2024-03-04']);
      expect(element.querySelector('[hidden]')).toBeNull();
      expect(pressedStates(element)['Todas']).toBe('true');
    });

    it('does not remove any event from the page, it only hides them', async () => {
      const { element } = mount();

      await filterBy(element, 'Decisão');

      expect(element.querySelectorAll('.jus-timeline-event')).toHaveLength(5);
      expect(element.querySelectorAll('.jus-timeline-day')).toHaveLength(2);
      expect(getComputedStyle(required(element.querySelector('.jus-timeline-event[data-event-type="order"]'))).display).toBe('none');
    });
  });

  describe('announcement', () => {
    it('is a polite live region, visually hidden, and says nothing on load', () => {
      const { element } = mount();

      const status = statusOf(element);
      expect(status.localName).toBe('p');
      expect(status.getAttribute('aria-live')).toBe('polite');
      expect(status.classList.contains('visually-hidden')).toBe(true);
      expect(status.textContent).toBe('');
    });

    it('says how many of the events are shown when a type is chosen', async () => {
      const { element } = mount();

      await filterBy(element, 'Despacho');
      expect(statusOf(element).textContent).toBe('Mostrando 2 de 5 movimentações.');

      await filterBy(element, 'Decisão');
      expect(statusOf(element).textContent).toBe('Mostrando 1 de 5 movimentações.');
    });

    it('says that all the events are shown when "Todas" is chosen again', async () => {
      const { element } = mount();
      await filterBy(element, 'Despacho');

      await filterBy(element, 'Todas');

      expect(statusOf(element).textContent).toBe('Mostrando todas as 5 movimentações.');
    });

    it('changes the announced text node even when the numbers are the same, so assistive technology notices', async () => {
      const { element } = mount();
      await filterBy(element, 'Despacho');
      expect(statusOf(element).textContent).toBe('Mostrando 2 de 5 movimentações.');
      const mutations = recordMutations(statusOf(element), { childList: true });

      await filterBy(element, 'Juntada de petição');

      expect(statusOf(element).textContent).toBe('Mostrando 2 de 5 movimentações.');
      expect(mutations.records.length).toBeGreaterThan(0);
      mutations.stop();
    });

    it('does not announce again when the pressed button is chosen once more', async () => {
      const { element } = mount();
      await filterBy(element, 'Despacho');
      const mutations = recordMutations(statusOf(element), { childList: true, characterData: true, subtree: true });

      await filterBy(element, 'Despacho');
      await nextTask();

      expect(mutations.records).toHaveLength(0);
      expect(pressedStates(element)['Despacho']).toBe('true');
      mutations.stop();
    });
  });

  describe('without anything to choose between', () => {
    it.each([
      { name: 'a single type', timeline: ONE_TYPE_TIMELINE, eventCount: 2 },
      { name: 'no events', timeline: EMPTY_TIMELINE, eventCount: 0 },
    ])('renders only the slot with $name', ({ timeline, eventCount }) => {
      const { element } = mount(timeline);

      expect(groupOf(element)).toBeNull();
      expect(buttonsOf(element)).toHaveLength(0);
      expect(shadowOf(element).querySelector('[aria-live]')).toBeNull();
      expect(Array.from(shadowOf(element).children, (child) => child.localName)).toEqual(['slot']);
      expect(element.querySelectorAll('.jus-timeline-event')).toHaveLength(eventCount);
      expect(element.querySelector('[hidden]')).toBeNull();
    });

    it('leaves the empty message of an empty timeline visible', () => {
      const { element } = mount(EMPTY_TIMELINE);

      expect(required(element.querySelector('li')).checkVisibility()).toBe(true);
    });

    it('does not throw without any timeline at all', () => {
      expect(() => mount('')).not.toThrow();
    });
  });

  describe('keyboard', () => {
    it('reaches the buttons with Tab and filters with Enter', async () => {
      const { element } = mount();

      await userEvent.tab();
      expect(shadowOf(element).activeElement).toBe(buttonNamed(element, 'Todas'));
      await userEvent.tab();
      expect(shadowOf(element).activeElement).toBe(buttonNamed(element, 'Decisão'));
      await userEvent.keyboard('{Enter}');

      expect(shownEvents(element)).toEqual(['decision']);
      expect(pressedStates(element)['Decisão']).toBe('true');
      expect(statusOf(element).textContent).toBe('Mostrando 1 de 5 movimentações.');
    });

    it('filters with Space and keeps the focus on the button', async () => {
      const { element } = mount();

      await userEvent.tab();
      await userEvent.tab();
      await userEvent.tab();
      expect(shadowOf(element).activeElement).toBe(buttonNamed(element, 'Despacho'));
      await userEvent.keyboard(' ');

      expect(shownEvents(element)).toEqual(['order', 'order']);
      expect(shadowOf(element).activeElement).toBe(buttonNamed(element, 'Despacho'));
    });

    it('goes back to every event from the keyboard', async () => {
      const { element } = mount();
      await userEvent.tab();
      await userEvent.tab();
      await userEvent.keyboard('{Enter}');
      expect(shownEvents(element)).toEqual(['decision']);

      await userEvent.tab({ shift: true });
      await userEvent.keyboard('{Enter}');

      expect(shownEvents(element)).toHaveLength(5);
      expect(statusOf(element).textContent).toBe('Mostrando todas as 5 movimentações.');
    });
  });

  describe('when the timeline is replaced', () => {
    it('rebuilds the buttons for the types of the new timeline', async () => {
      const { element } = mount();

      element.setHTMLUnsafe(HEARINGS_TIMELINE);
      await nextTask();

      expect(buttonsOf(element).map((button) => button.textContent)).toEqual(['Todas', 'Audiência', 'Decisão']);
      expect(groupOf(element)?.getAttribute('aria-label')).toBe(GROUP_LABEL);
      expect(shadowOf(element).querySelectorAll('[role="group"]')).toHaveLength(1);
      expect(statusOf(element).textContent).toBe('');
    });

    it('filters the new timeline', async () => {
      const { element } = mount();
      element.setHTMLUnsafe(HEARINGS_TIMELINE);
      await nextTask();

      await filterBy(element, 'Audiência');

      expect(shownEvents(element)).toEqual(['hearing']);
      expect(statusOf(element).textContent).toBe('Mostrando 1 de 2 movimentações.');
    });

    it('keeps the chosen type when the new timeline still has it', async () => {
      const { element } = mount();
      await filterBy(element, 'Decisão');

      element.setHTMLUnsafe(HEARINGS_TIMELINE);
      await nextTask();

      expect(pressedStates(element)).toEqual({ Todas: 'false', Audiência: 'false', Decisão: 'true' });
      expect(shownEvents(element)).toEqual(['decision']);
      expect(statusOf(element).textContent).toBe('');
    });

    it('goes back to every event when the new timeline no longer has the chosen type', async () => {
      const { element } = mount();
      await filterBy(element, 'Juntada de petição');

      element.setHTMLUnsafe(HEARINGS_TIMELINE);
      await nextTask();

      expect(pressedStates(element)).toEqual({ Todas: 'true', Audiência: 'false', Decisão: 'false' });
      expect(shownEvents(element)).toEqual(['hearing', 'decision']);
    });

    it('drops the buttons, and the filter with them, when the new timeline has a single type', async () => {
      const { element } = mount();
      await filterBy(element, 'Decisão');

      element.setHTMLUnsafe(ONE_TYPE_TIMELINE);
      await nextTask();

      expect(groupOf(element)).toBeNull();
      expect(shadowOf(element).querySelector('[aria-live]')).toBeNull();
      expect(element.querySelector('[hidden]')).toBeNull();
    });

    it('forgets the chosen type while there is nothing to choose between, even if the lone type is the same', async () => {
      const { element } = mount();
      await filterBy(element, 'Despacho');

      element.setHTMLUnsafe(ONE_TYPE_TIMELINE);
      await nextTask();
      element.setHTMLUnsafe(FULL_TIMELINE);
      await nextTask();

      expect(pressedStates(element)['Todas']).toBe('true');
      expect(shownEvents(element)).toEqual(['decision', 'order', 'order', 'filing', 'filing']);
    });

    it('shows the buttons when a timeline with several types replaces an empty one', async () => {
      const { element } = mount(EMPTY_TIMELINE);

      element.setHTMLUnsafe(FULL_TIMELINE);
      await nextTask();

      expect(buttonsOf(element)).toHaveLength(4);
    });
  });

  describe('lifecycle', () => {
    it('builds one set of buttons again when it is moved, and still filters', async () => {
      const { main, element } = mount();

      element.remove();
      main.append(element);
      await nextTask();

      expect(shadowOf(element).querySelectorAll('[role="group"]')).toHaveLength(1);
      expect(buttonsOf(element)).toHaveLength(4);
      await filterBy(element, 'Despacho');
      expect(shownEvents(element)).toEqual(['order', 'order']);
      expect(statusOf(element).textContent).toBe('Mostrando 2 de 5 movimentações.');
    });

    it('settles after mounting: nothing in the shadow root keeps being rebuilt', async () => {
      const { element } = mount();
      await nextTask();
      const mutations = recordMutations(shadowOf(element), { childList: true, subtree: true, attributes: true, characterData: true });

      await nextTask();
      await nextTask();

      expect(mutations.records).toHaveLength(0);
      mutations.stop();
    });

    it('keeps the same buttons, and the focus on them, when the timeline is replaced by one with the same types', async () => {
      const { element } = mount();
      await nextTask();
      const before = buttonsOf(element);
      await userEvent.tab();
      await userEvent.tab();
      await userEvent.keyboard('{Enter}');
      expect(shadowOf(element).activeElement).toBe(before[1]);

      element.setHTMLUnsafe(FULL_TIMELINE);
      await nextTask();

      const after = buttonsOf(element);
      expect(after).toHaveLength(before.length);
      for (const [index, button] of before.entries()) {
        expect(after[index]).toBe(button);
      }
      expect(shadowOf(element).activeElement).toBe(before[1]);
      expect(shownEvents(element)).toEqual(['decision']);
      expect(pressedStates(element)['Decisão']).toBe('true');
    });
  });

  describe('style', () => {
    it('draws the unpressed buttons with the muted colour, which is dark enough to tell them apart, and the pressed one with the primary colour', async () => {
      const { element } = mount();
      await filterBy(element, 'Despacho');

      expect(getComputedStyle(buttonNamed(element, 'Decisão')).borderTopColor).toBe(colorOf('--jus-color-muted'));
      expect(getComputedStyle(buttonNamed(element, 'Despacho')).borderTopColor).toBe(colorOf('--jus-color-primary'));
      expect(getComputedStyle(buttonNamed(element, 'Despacho')).backgroundColor).toBe(colorOf('--jus-color-primary'));
    });

    it('lets the buttons wrap onto another line on a narrow screen', () => {
      const { element } = mount();

      expect(getComputedStyle(required(groupOf(element))).flexWrap).toBe('wrap');
    });
  });

  describe('accessibility', () => {
    it('has no accessibility violations, unfiltered, filtered or back to all, with the real palette', async () => {
      const { main, element } = mount();
      await expectNoAxeViolations(main);

      await filterBy(element, 'Decisão');
      await expectNoAxeViolations(main);

      await filterBy(element, 'Todas');
      await expectNoAxeViolations(main);
    });

    it.each([
      { name: 'a single type', timeline: ONE_TYPE_TIMELINE },
      { name: 'no events', timeline: EMPTY_TIMELINE },
    ])('has no accessibility violations with $name', async ({ timeline }) => {
      await expectNoAxeViolations(mount(timeline).main);
    });

    it('gives every button an accessible name and the group a name of its own', () => {
      const { element } = mount();

      expect(groupOf(element)?.getAttribute('aria-label')).toBe(GROUP_LABEL);
      for (const button of buttonsOf(element)) {
        expect(button.textContent.trim()).not.toBe('');
      }
    });
  });
});
