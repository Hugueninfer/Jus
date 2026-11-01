import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { expectNoAxeViolations } from '../test-support/axe';
import { required } from '../test-support/required';
import { installSubmitOnce } from './submit-once';

interface Mounted {
  page: HTMLElement;
  form: HTMLFormElement;
  field: HTMLInputElement;
  submit: HTMLButtonElement;
}

const pages: HTMLElement[] = [];

/**
 * A form like the filing form, marked for the behaviour. Its method is "dialog", so that a submit that goes through
 * does not leave the page the tests run in: the event is fired and not prevented, which is all the behaviour looks at.
 */
function mount({ marked = true, value = 'texto' }: { marked?: boolean; value?: string } = {}): Mounted {
  const page = document.createElement('div');
  page.setHTMLUnsafe(`
    <form method="dialog"${marked ? ' data-jus-submit-once' : ''}>
      <label for="descricao">Descrição</label>
      <input id="descricao" name="descricao" type="text" required value="${value}">
      <button type="submit" class="primary">Juntar petição</button>
      <input type="submit" value="Juntar e continuar">
      <button type="button">Cancelar</button>
    </form>`);
  document.body.append(page);
  pages.push(page);

  const form = required(page.querySelector('form'));

  return { page, form, field: required(form.querySelector<HTMLInputElement>('input[type="text"]')), submit: required(form.querySelector<HTMLButtonElement>('button.primary')) };
}

function submitButtons(form: HTMLFormElement): (HTMLButtonElement | HTMLInputElement)[] {
  return Array.from(form.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button[type="submit"], input[type="submit"]'));
}

/** Lets the task the behaviour queues run, and whatever the browser does after the submit event. */
async function afterTheSubmit(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** The browser brings the page back from its back-forward cache: the page is shown again, with the state it was left in. */
function restoreFromTheCache(persisted: boolean): void {
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted }));
}

describe('installSubmitOnce', () => {
  beforeAll(() => {
    // The listeners are on the document and window, so they also serve the forms mounted after this.
    installSubmitOnce(document);
  });

  afterEach(() => {
    for (const page of pages.splice(0)) {
      page.remove();
    }
  });

  it('disables the submit buttons and marks the form busy once a valid form is submitted', async () => {
    const { form, submit } = mount();

    await userEvent.click(submit);
    await afterTheSubmit();

    for (const button of submitButtons(form)) {
      expect(button.disabled).toBe(true);
    }
    expect(form.getAttribute('aria-busy')).toBe('true');
  });

  it('still sends the button that was pressed, even though it is disabled right after', async () => {
    // A real send, into a frame of its own so that the page the tests run in stays where it is.
    const page = document.createElement('div');
    page.setHTMLUnsafe(`
      <iframe name="sink" title="destino" hidden></iframe>
      <form method="post" action="about:blank" target="sink" data-jus-submit-once>
        <input name="descricao" value="texto"><button type="submit" name="acao" value="juntar">Juntar</button>
      </form>`);
    document.body.append(page);
    pages.push(page);
    const form = required(page.querySelector('form'));
    const button = required(page.querySelector<HTMLButtonElement>('button'));
    let sent: [string, FormDataEntryValue][] = [];
    form.addEventListener('formdata', (event) => {
      sent = Array.from(event.formData.entries());
    });

    await userEvent.click(button);
    await afterTheSubmit();

    expect(sent).toEqual([['descricao', 'texto'], ['acao', 'juntar']]);
    expect(button.disabled).toBe(true);
  });

  it('remembers what a second submit before the first one settled found already disabled', async () => {
    const { form } = mount();

    form.requestSubmit();
    form.requestSubmit();
    await afterTheSubmit();
    expect(submitButtons(form).every((button) => button.disabled)).toBe(true);

    restoreFromTheCache(true);

    expect(submitButtons(form).some((button) => button.disabled)).toBe(false);
  });

  it('leaves alone the buttons that do not submit', async () => {
    const { form, submit } = mount();

    await userEvent.click(submit);
    await afterTheSubmit();

    expect(required(form.querySelector<HTMLButtonElement>('button[type="button"]')).disabled).toBe(false);
  });

  it('acts on a submit that comes from a script as well as on a click', async () => {
    const { form } = mount();

    form.requestSubmit();
    await afterTheSubmit();

    expect(submitButtons(form).every((button) => button.disabled)).toBe(true);
    expect(form.getAttribute('aria-busy')).toBe('true');
  });

  it('changes nothing while the browser finds the form invalid, since no submit happens', async () => {
    const { form, submit } = mount({ value: '' });

    await userEvent.click(submit);
    await afterTheSubmit();

    expect(submitButtons(form).some((button) => button.disabled)).toBe(false);
    expect(form.hasAttribute('aria-busy')).toBe(false);
  });

  it('can be submitted again after the browser found the form invalid and the value was fixed', async () => {
    const { form, field, submit } = mount({ value: '' });
    await userEvent.click(submit);

    await userEvent.type(field, 'texto');
    await userEvent.click(submit);
    await afterTheSubmit();

    expect(form.getAttribute('aria-busy')).toBe('true');
    expect(submit.disabled).toBe(true);
  });

  it('changes nothing when a handler prevented the submit (the page sends it some other way, or not at all)', async () => {
    const { form, submit } = mount();
    form.addEventListener('submit', (event) => {
      event.preventDefault();
    });

    await userEvent.click(submit);
    await afterTheSubmit();

    expect(submitButtons(form).some((button) => button.disabled)).toBe(false);
    expect(form.hasAttribute('aria-busy')).toBe(false);
  });

  it('also respects a handler that prevents the submit further up, after the behaviour has seen the event', async () => {
    const { form, submit } = mount();
    const prevent = (event: Event): void => {
      event.preventDefault();
    };
    window.addEventListener('submit', prevent);

    try {
      await userEvent.click(submit);
      await afterTheSubmit();
    } finally {
      window.removeEventListener('submit', prevent);
    }

    expect(submit.disabled).toBe(false);
    expect(form.hasAttribute('aria-busy')).toBe(false);
  });

  it('leaves alone a form that is not marked', async () => {
    const { form, submit } = mount({ marked: false });

    await userEvent.click(submit);
    await afterTheSubmit();

    expect(submitButtons(form).some((button) => button.disabled)).toBe(false);
    expect(form.hasAttribute('aria-busy')).toBe(false);
  });

  it('serves a form added to the page after it was installed', async () => {
    const first = mount();
    const second = mount();

    await userEvent.click(second.submit);
    await afterTheSubmit();

    expect(second.form.getAttribute('aria-busy')).toBe('true');
    expect(first.form.hasAttribute('aria-busy')).toBe(false);
  });

  it('enables the buttons again when the page is restored from the back-forward cache', async () => {
    const { form, submit } = mount();
    await userEvent.click(submit);
    await afterTheSubmit();

    restoreFromTheCache(true);

    expect(submitButtons(form).some((button) => button.disabled)).toBe(false);
    expect(form.hasAttribute('aria-busy')).toBe(false);
  });

  it('can be submitted again after the restore', async () => {
    const { form, submit } = mount();
    await userEvent.click(submit);
    await afterTheSubmit();
    restoreFromTheCache(true);

    await userEvent.click(submit);
    await afterTheSubmit();

    expect(form.getAttribute('aria-busy')).toBe('true');
    expect(submit.disabled).toBe(true);
  });

  it('does not enable the buttons for a page that was not restored from the cache', async () => {
    const { form, submit } = mount();
    await userEvent.click(submit);
    await afterTheSubmit();

    restoreFromTheCache(false);

    expect(submit.disabled).toBe(true);
    expect(form.getAttribute('aria-busy')).toBe('true');
  });

  it('keeps disabled a button that was disabled before the submit', async () => {
    const { form, submit } = mount();
    const other = required(form.querySelector<HTMLInputElement>('input[type="submit"]'));
    other.disabled = true;
    await userEvent.click(submit);
    await afterTheSubmit();

    restoreFromTheCache(true);

    expect(submit.disabled).toBe(false);
    expect(other.disabled).toBe(true);
  });

  it('has no accessibility violations before and while the form is busy', async () => {
    const { page, submit } = mount();
    await expectNoAxeViolations(page);

    await userEvent.click(submit);
    await afterTheSubmit();

    await expectNoAxeViolations(page);
  });
});
