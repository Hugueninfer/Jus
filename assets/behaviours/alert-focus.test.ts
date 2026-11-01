// Bootstrap's own dismissal, the one the page loads: the behaviour must work with the events it really fires.
import 'bootstrap/js/dist/alert';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { installAlertFocus } from './alert-focus';

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error('Expected a value, got nothing.');
  }

  return value;
}

const ALERT = (message: string): string => `
  <div class="alert alert-success alert-dismissible fade show" role="status">
    <span>${message}</span>
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Fechar"></button>
  </div>`;

interface Mounted {
  page: HTMLElement;
  main: HTMLElement | null;
  alerts: HTMLElement[];
  field: HTMLInputElement;
}

const pages: HTMLElement[] = [];

/** Bootstrap's fade, slowed down enough for the tests to see the alert while it fades out. */
const FADE = '.fade { transition: opacity 300ms linear; } .fade:not(.show) { opacity: 0; }';

/**
 * Builds the layout the page has: the flash alerts first, then the rest of the content, all inside main#conteudo
 * (unless `withMain` is false). The page is put in the document so Bootstrap's click handler and focus behave as live.
 */
function mount(alertCount = 1, withMain = true): Mounted {
  const page = document.createElement('div');
  const alerts = Array.from({ length: alertCount }, (_, index) => ALERT(`Mensagem ${String(index + 1)}`)).join('');
  const content = `${alerts}<label for="campo">Campo</label><input id="campo" type="text">`;
  page.setHTMLUnsafe(withMain ? `<main id="conteudo" tabindex="-1">${content}</main>` : `<section>${content}</section>`);
  document.body.append(page);
  pages.push(page);

  return {
    page,
    main: page.querySelector('main'),
    alerts: Array.from(page.querySelectorAll<HTMLElement>('.alert')),
    field: required(page.querySelector('input')),
  };
}

function closeButtonOf(alert: HTMLElement): HTMLButtonElement {
  return required(alert.querySelector('button'));
}

/** Dismisses the alert from a script: a click on its close button that moves no focus. */
function dismiss(alert: HTMLElement): void {
  closeButtonOf(alert).click();
}

/** Closes the alert the way a keyboard user does: the close button focused, then Enter. */
async function closeWithKeyboard(alert: HTMLElement): Promise<void> {
  closeButtonOf(alert).focus();
  await userEvent.keyboard('{Enter}');
}


describe('installAlertFocus', () => {
  beforeAll(() => {
    installAlertFocus(document);
  });

  afterEach(() => {
    for (const page of pages.splice(0)) {
      page.remove();
    }
    document.getElementById('test-fade')?.remove();
  });

  it('moves the focus to the main content when the focused alert is closed from the keyboard', async () => {
    const { main, alerts } = mount();
    const alert = required(alerts[0]);

    await closeWithKeyboard(alert);

    await expect.poll(() => alert.isConnected).toBe(false);
    expect(document.activeElement).toBe(main);
  });

  it('waits for the fade-out: the focus moves once the alert is really gone', async () => {
    const style = document.createElement('style');
    style.id = 'test-fade';
    style.textContent = FADE;
    document.head.append(style);
    const { main, alerts } = mount();
    const alert = required(alerts[0]);

    await closeWithKeyboard(alert);

    // Fading out, the alert is still there and so is the focus.
    expect(alert.isConnected).toBe(true);
    expect(document.activeElement).toBe(closeButtonOf(alert));
    await expect.poll(() => document.activeElement).toBe(main);
    expect(alert.isConnected).toBe(false);
  });

  it('keeps the focus where the user moved it while the alert was fading out', async () => {
    const style = document.createElement('style');
    style.id = 'test-fade';
    style.textContent = FADE;
    document.head.append(style);
    const { field, alerts } = mount();
    const alert = required(alerts[0]);

    await closeWithKeyboard(alert);
    field.focus();

    await expect.poll(() => alert.isConnected).toBe(false);
    expect(document.activeElement).toBe(field);
  });

  it('moves the focus when it was on a link inside the alert and the alert is dismissed from a script', async () => {
    const { main, alerts } = mount();
    const alert = required(alerts[0]);
    const link = document.createElement('a');
    link.href = '#campo';
    link.textContent = 'Ver detalhes';
    alert.append(link);
    link.focus();

    dismiss(alert);

    await expect.poll(() => alert.isConnected).toBe(false);
    expect(document.activeElement).toBe(main);
  });

  it('leaves the focus alone when it was somewhere else', async () => {
    const { field, alerts } = mount();
    const alert = required(alerts[0]);
    field.focus();

    dismiss(alert);

    await expect.poll(() => alert.isConnected).toBe(false);
    expect(document.activeElement).toBe(field);
  });

  it('leaves the focus alone when it is on another alert that stays', async () => {
    const { alerts } = mount(2);
    const closing = required(alerts[0]);
    const stayingButton = closeButtonOf(required(alerts[1]));
    stayingButton.focus();

    dismiss(closing);

    await expect.poll(() => closing.isConnected).toBe(false);
    expect(document.activeElement).toBe(stayingButton);
  });

  it('does nothing when the closing is cancelled, now or in a later closing', async () => {
    const { field, alerts } = mount();
    const alert = required(alerts[0]);
    const cancel = (event: Event): void => {
      event.preventDefault();
    };
    alert.addEventListener('close.bs.alert', cancel);

    await closeWithKeyboard(alert);

    expect(alert.isConnected).toBe(true);
    expect(document.activeElement).toBe(closeButtonOf(alert));

    // Closed later with the focus elsewhere, the earlier attempt must not pull the focus to main.
    alert.removeEventListener('close.bs.alert', cancel);
    field.focus();
    dismiss(alert);

    await expect.poll(() => alert.isConnected).toBe(false);
    expect(document.activeElement).toBe(field);
  });

  it('does nothing without a main content element', async () => {
    const { alerts } = mount(1, false);
    const alert = required(alerts[0]);

    await closeWithKeyboard(alert);

    await expect.poll(() => alert.isConnected).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });
});
