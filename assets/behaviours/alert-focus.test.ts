// Bootstrap's own dismissal, the one the page loads: the behaviour must work with the events it really fires.
import 'bootstrap/js/dist/alert';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { required } from '../test-support/required';
import { installAlertFocus } from './alert-focus';

/** The attributes of an element the page offers as a place to send the focus to. */
const TARGET = 'data-jus-focus-target tabindex="-1"';

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

/**
 * How long the test fade lasts. The tests look at the alert while it is still fading out, so it has to outlast a slow
 * machine running the checks in between.
 */
const FADE_MS = 1000;

/** Bootstrap's fade, slowed down enough for the tests to see the alert while it fades out. */
const FADE = `.fade { transition: opacity ${String(FADE_MS)}ms linear; } .fade:not(.show) { opacity: 0; }`;

/** The most a test waits for something that ends with the fade, well past it. */
const AFTER_FADE = { timeout: 5 * FADE_MS };

/**
 * Builds the layout the page has: the flash alerts first, then the rest of the content, all inside main#conteudo
 * (unless `withMain` is false). The page is put in the document so Bootstrap's click handler and focus behave as live.
 */
function mount(alertCount = 1, withMain = true): Mounted {
  const page = document.createElement('div');
  const alerts = Array.from({ length: alertCount }, (_, index) => ALERT(`Mensagem ${String(index + 1)}`)).join('');
  const content = `${alerts}<label for="campo">Campo</label><input id="campo" type="text">`;
  page.setHTMLUnsafe(withMain ? `<main id="conteudo" data-jus-focus-target tabindex="-1">${content}</main>` : `<section>${content}</section>`);
  document.body.append(page);
  pages.push(page);

  return {
    page,
    main: page.querySelector('main'),
    alerts: Array.from(page.querySelectorAll<HTMLElement>('.alert')),
    field: required(page.querySelector('input')),
  };
}

/**
 * Mounts the markup given, inside the document: the alert(s) of the markup are returned in order. The markup decides where
 * the focus targets (`data-jus-focus-target`, with `tabindex="-1"`) are, before or after the alert.
 */
function mountMarkup(markup: string): { page: HTMLElement; alerts: HTMLElement[] } {
  const page = document.createElement('div');
  page.setHTMLUnsafe(markup);
  document.body.append(page);
  pages.push(page);

  return { page, alerts: Array.from(page.querySelectorAll<HTMLElement>('.alert')) };
}

function byId(page: HTMLElement, id: string): HTMLElement {
  return required(page.querySelector<HTMLElement>(`#${id}`));
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
    await expect.poll(() => document.activeElement, AFTER_FADE).toBe(main);
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

    await expect.poll(() => alert.isConnected, AFTER_FADE).toBe(false);
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
    const { main, alerts } = mount();
    const alert = required(alerts[0]);
    const cancel = (event: Event): void => {
      event.preventDefault();
    };
    alert.addEventListener('close.bs.alert', cancel);

    await closeWithKeyboard(alert);

    expect(alert.isConnected).toBe(true);
    expect(document.activeElement).toBe(closeButtonOf(alert));

    // Closed later with the focus on nothing (so it counts as lost), the earlier attempt must not pull it to main.
    alert.removeEventListener('close.bs.alert', cancel);
    closeButtonOf(alert).blur();
    expect(document.activeElement).toBe(document.body);
    dismiss(alert);

    await expect.poll(() => alert.isConnected).toBe(false);
    expect(document.activeElement).toBe(document.body);
    expect(document.activeElement).not.toBe(main);
  });

  describe('with a focus target of its own before the alert', () => {
    it('moves the focus to the nearest one that precedes the alert, not to the top of the main content', async () => {
      const { page, alerts } = mountMarkup(`
        <main id="conteudo" data-jus-focus-target tabindex="-1">
          <h2 id="resumo" data-jus-focus-target tabindex="-1">Resumo</h2>
          <nav id="andamento" data-jus-focus-target tabindex="-1"><a href="#a">Movimentações</a></nav>
          ${ALERT('Petição juntada.')}
          <p>Linha do tempo</p>
        </main>`);
      const alert = required(alerts[0]);

      await closeWithKeyboard(alert);

      await expect.poll(() => alert.isConnected).toBe(false);
      expect(document.activeElement).toBe(byId(page, 'andamento'));
    });

    it('takes one that holds the alert, if no other is nearer', async () => {
      const { page, alerts } = mountMarkup(`
        <main id="conteudo" data-jus-focus-target tabindex="-1">
          <section id="secao" data-jus-focus-target tabindex="-1">${ALERT('Petição juntada.')}<p>Linha do tempo</p></section>
        </main>`);
      const alert = required(alerts[0]);

      await closeWithKeyboard(alert);

      await expect.poll(() => alert.isConnected).toBe(false);
      expect(document.activeElement).toBe(byId(page, 'secao'));
    });

    it('ignores one that comes after the alert', async () => {
      const { page, alerts } = mountMarkup(`
        <main id="conteudo" data-jus-focus-target tabindex="-1">
          ${ALERT('Petição juntada.')}
          <h2 id="depois" data-jus-focus-target tabindex="-1">Mais abaixo</h2>
        </main>`);
      const alert = required(alerts[0]);

      await closeWithKeyboard(alert);

      await expect.poll(() => alert.isConnected).toBe(false);
      expect(document.activeElement).toBe(byId(page, 'conteudo'));
    });

    it('ignores one inside the alert that is closing, and uses the nearest one before it', async () => {
      const { page, alerts } = mountMarkup(`
        <main id="conteudo" data-jus-focus-target tabindex="-1">
          <h2 id="antes" data-jus-focus-target tabindex="-1">Antes</h2>
          ${ALERT('Petição juntada.')}
        </main>`);
      const alert = required(alerts[0]);
      // A real focus target (marked and focusable) inside the alert: it is the last one in the document order, so only
      // its position rules it out. Were it chosen, it would be gone with the alert and the focus would fall back to the main content.
      const inside = document.createElement('span');
      inside.tabIndex = -1;
      inside.dataset['jusFocusTarget'] = '';
      inside.textContent = 'Detalhe da petição';
      alert.append(inside);

      await closeWithKeyboard(alert);

      await expect.poll(() => alert.isConnected).toBe(false);
      expect(document.activeElement).toBe(byId(page, 'antes'));
    });

    it('skips one that is not shown, and uses the nearest one that is', async () => {
      const { page, alerts } = mountMarkup(`
        <main id="conteudo" data-jus-focus-target tabindex="-1">
          <h2 id="visivel" data-jus-focus-target tabindex="-1">Visível</h2>
          <h2 id="oculto" data-jus-focus-target tabindex="-1" hidden>Oculto</h2>
          ${ALERT('Petição juntada.')}
        </main>`);
      const alert = required(alerts[0]);

      await closeWithKeyboard(alert);

      await expect.poll(() => alert.isConnected).toBe(false);
      expect(document.activeElement).toBe(byId(page, 'visivel'));
    });

    it('uses only what is in the main content: an element outside it (the header menu) is not a place to land', async () => {
      const { page, alerts } = mountMarkup(`
        <header><div id="menu" data-jus-focus-target tabindex="-1">Menu</div></header>
        <main id="conteudo" data-jus-focus-target tabindex="-1">${ALERT('Petição juntada.')}</main>`);
      const alert = required(alerts[0]);

      await closeWithKeyboard(alert);

      await expect.poll(() => alert.isConnected).toBe(false);
      expect(document.activeElement).toBe(byId(page, 'conteudo'));
    });

    it('ignores an element that is only focusable by script (tabindex="-1") without being marked as a target', async () => {
      const { page, alerts } = mountMarkup(`
        <main id="conteudo" ${TARGET}>
          <div id="roving" tabindex="-1">Um item de uma lista com tabindex móvel</div>
          ${ALERT('Petição juntada.')}
        </main>`);
      const alert = required(alerts[0]);

      await closeWithKeyboard(alert);

      await expect.poll(() => alert.isConnected).toBe(false);
      expect(document.activeElement).toBe(byId(page, 'conteudo'));
    });

    it('ignores a marked element that cannot take the focus (it has no tabindex)', async () => {
      const { page, alerts } = mountMarkup(`
        <main id="conteudo" ${TARGET}>
          <nav id="sem-tabindex" data-jus-focus-target><a href="#a">Movimentações</a></nav>
          ${ALERT('Petição juntada.')}
        </main>`);
      const alert = required(alerts[0]);

      await closeWithKeyboard(alert);

      await expect.poll(() => alert.isConnected).toBe(false);
      expect(document.activeElement).toBe(byId(page, 'conteudo'));
    });

    it('still falls back to main#conteudo when the main content is not marked as a target itself', async () => {
      const { page, alerts } = mountMarkup(`
        <main id="conteudo" tabindex="-1">${ALERT('Petição juntada.')}</main>`);
      const alert = required(alerts[0]);

      await closeWithKeyboard(alert);

      await expect.poll(() => alert.isConnected).toBe(false);
      expect(document.activeElement).toBe(byId(page, 'conteudo'));
    });

    it('falls back to the main content when the target is gone by the time the alert is', async () => {
      const style = document.createElement('style');
      style.id = 'test-fade';
      style.textContent = FADE;
      document.head.append(style);
      const { page, alerts } = mountMarkup(`
        <main id="conteudo" data-jus-focus-target tabindex="-1">
          <nav id="andamento" data-jus-focus-target tabindex="-1"><a href="#a">Movimentações</a></nav>
          ${ALERT('Petição juntada.')}
        </main>`);
      const alert = required(alerts[0]);

      await closeWithKeyboard(alert);
      byId(page, 'andamento').remove();

      await expect.poll(() => alert.isConnected, AFTER_FADE).toBe(false);
      expect(document.activeElement).toBe(byId(page, 'conteudo'));
    });

    it('keeps the focus where the user moved it while the alert was fading out', async () => {
      const style = document.createElement('style');
      style.id = 'test-fade';
      style.textContent = FADE;
      document.head.append(style);
      const { page, alerts } = mountMarkup(`
        <main id="conteudo" data-jus-focus-target tabindex="-1">
          <nav id="andamento" data-jus-focus-target tabindex="-1"><a href="#a">Movimentações</a></nav>
          ${ALERT('Petição juntada.')}
          <input id="campo" type="text">
        </main>`);
      const alert = required(alerts[0]);

      await closeWithKeyboard(alert);
      byId(page, 'campo').focus();

      await expect.poll(() => alert.isConnected, AFTER_FADE).toBe(false);
      expect(document.activeElement).toBe(byId(page, 'campo'));
    });
  });

  it('does nothing without a main content element', async () => {
    const { alerts } = mount(1, false);
    const alert = required(alerts[0]);

    await closeWithKeyboard(alert);

    await expect.poll(() => alert.isConnected).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });
});
