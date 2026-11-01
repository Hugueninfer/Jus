import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { expectNoAxeViolations } from '../test-support/axe';
import { installTokens } from '../test-support/tokens';
import './index';
import { JusNumeroProcesso } from './jus-numero-processo';

const DIGITS = '00000013920248260100';
const MASKED = '0000001-39.2024.8.26.0100';
const WRONG_CHECK_DIGITS = '00000014020248260100';
const INCOMPLETE_MESSAGE = 'Informe os 20 dígitos do número do processo.';
const INVALID_MESSAGE = 'Dígito verificador inválido.';

interface Mounted {
  main: HTMLElement;
  form: HTMLFormElement;
  element: JusNumeroProcesso;
  input: HTMLInputElement;
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error('Expected a value, got nothing.');
  }

  return value;
}

/** Mounts the markup the form theme renders (label, the element around the native input, a button). */
function mount(inputAttributes = ''): Mounted {
  const main = document.createElement('main');
  main.setHTMLUnsafe(`
    <form>
      <label for="numero">Número do processo</label>
      <jus-numero-processo>
        <input type="text" id="numero" name="numero" inputmode="numeric" autocomplete="off" ${inputAttributes}>
      </jus-numero-processo>
      <button>Buscar</button>
    </form>
  `);
  document.body.append(main);

  const form = required(main.querySelector('form'));
  // A valid form would otherwise navigate the test page away.
  form.addEventListener('submit', (event) => {
    event.preventDefault();
  });

  return {
    main,
    form,
    element: required(main.querySelector<JusNumeroProcesso>('jus-numero-processo')),
    input: required(main.querySelector('input')),
  };
}

/** Puts the caret at the given position (default: the end) of the focused input, like a click would. */
function focusWithCaret(input: HTMLInputElement, position = input.value.length): void {
  input.focus();
  input.setSelectionRange(position, position);
}

async function typeInto(input: HTMLInputElement, text: string, position?: number): Promise<void> {
  focusWithCaret(input, position);
  await userEvent.keyboard(text);
}

/**
 * Pastes text through the real clipboard: copy it from a scratch textarea, then paste into the input,
 * over its whole value or, when a caret position is given, at that position.
 */
async function pasteInto(input: HTMLInputElement, text: string, position?: number): Promise<void> {
  const source = document.createElement('textarea');
  source.value = text;
  document.body.append(source);
  source.select();
  await userEvent.copy();
  source.remove();

  if (position === undefined) {
    input.focus();
    input.select();
  } else {
    focusWithCaret(input, position);
  }
  await userEvent.paste();
}

/** The event that restores the default values runs the reset algorithm after its listeners, so give it a turn. */
async function nextTask(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('<jus-numero-processo>', () => {
  let removeTokens: () => void;

  beforeEach(() => {
    removeTokens = installTokens();
  });

  afterEach(() => {
    removeTokens();
    document.body.replaceChildren();
  });

  it('is registered as jus-numero-processo and does not use a shadow root', () => {
    const { element } = mount();

    expect(customElements.get('jus-numero-processo')).toBe(JusNumeroProcesso);
    expect(element).toBeInstanceOf(JusNumeroProcesso);
    expect(element.shadowRoot).toBeNull();
  });

  describe('mask', () => {
    it('masks the digits as they are typed and submits the masked value', async () => {
      const { form, input } = mount();

      await typeInto(input, DIGITS);

      expect(input.value).toBe(MASKED);
      expect(input.validity.valid).toBe(true);
      expect(new FormData(form).get('numero')).toBe(MASKED);
    });

    it('adds each separator only once a digit follows it', async () => {
      const { input } = mount();

      await typeInto(input, '0000001');
      expect(input.value).toBe('0000001');

      await userEvent.keyboard('3');
      expect(input.value).toBe('0000001-3');
    });

    it.each([
      ['with the mask', MASKED],
      ['without the mask', DIGITS],
    ])('masks a pasted number %s', async (_name, pasted) => {
      const { input } = mount();

      await pasteInto(input, pasted);

      expect(input.value).toBe(MASKED);
      expect(input.validity.valid).toBe(true);
    });

    it('keeps only the first 20 digits when more are typed', async () => {
      const { input } = mount();

      await typeInto(input, `${DIGITS}12345`);

      expect(input.value).toBe(MASKED);
    });

    it('ignores letters', async () => {
      const { input } = mount();

      await typeInto(input, '12ab34');

      expect(input.value).toBe('1234');
    });

    it('does not set maxlength, the mask is the limit', () => {
      expect(mount().input.hasAttribute('maxlength')).toBe(false);
    });
  });

  describe('caret', () => {
    it('stays right after the digit typed in the middle, so typing goes on from there', async () => {
      const { input } = mount();
      await typeInto(input, '12345678');
      expect(input.value).toBe('1234567-8');

      await typeInto(input, '9', 3);

      expect(input.value).toBe('1239456-78');
      expect(input.selectionStart).toBe(4);
      expect(input.selectionEnd).toBe(4);

      await userEvent.keyboard('0');

      expect(input.value).toBe('1239045-67.8');
      expect(input.selectionStart).toBe(5);
    });

    it('moves past the separator that now follows the digit typed in front of it', async () => {
      const { input } = mount();
      await typeInto(input, '12345678');

      await typeInto(input, '9', 7);

      expect(input.value).toBe('1234567-98');
      expect(input.selectionStart).toBe(9);
    });

    it('stays where it was when a digit is deleted in the middle', async () => {
      const { input } = mount();
      await typeInto(input, '12345678');

      await typeInto(input, '{Backspace}', 3);

      expect(input.value).toBe('1245678');
      expect(input.selectionStart).toBe(2);
      expect(input.selectionEnd).toBe(2);
    });

    it('stays in the same place after a letter is rejected in the middle', async () => {
      const { input } = mount();
      await typeInto(input, '12345678');

      await typeInto(input, 'x', 3);

      expect(input.value).toBe('1234567-8');
      expect(input.selectionStart).toBe(3);
    });

    it('steps back over a separator that is deleted, so the next Backspace deletes the digit before it', async () => {
      const { input } = mount();
      await typeInto(input, '12345678');

      await typeInto(input, '{Backspace}', 8);

      expect(input.value).toBe('1234567-8');
      expect(input.selectionStart).toBe(7);

      await userEvent.keyboard('{Backspace}');

      expect(input.value).toBe('1234568');
      expect(input.selectionStart).toBe(6);
    });

    it('stays after the digits of a number pasted in the middle', async () => {
      const { input } = mount();
      await typeInto(input, '12345678');

      await pasteInto(input, '99', 3);

      expect(input.value).toBe('1239945-67.8');
      expect(input.selectionStart).toBe(5);
    });

    it('drops the trailing separator when the digit after it is deleted', async () => {
      const { input } = mount();
      await typeInto(input, '00000013');

      await userEvent.keyboard('{Backspace}');

      expect(input.value).toBe('0000001');
      expect(input.selectionStart).toBe(7);
    });

    it('ends at the end of the value when typing beyond the 20th digit', async () => {
      const { input } = mount();
      await typeInto(input, DIGITS);

      await userEvent.keyboard('9');

      expect(input.value).toBe(MASKED);
      expect(input.selectionStart).toBe(MASKED.length);
    });
  });

  describe('validity', () => {
    it('reports an incomplete number and keeps the form from being submitted', async () => {
      const { form, input } = mount();

      await typeInto(input, '0000001392');

      expect(input.validationMessage).toBe(INCOMPLETE_MESSAGE);
      expect(input.validity.valid).toBe(false);
      expect(form.checkValidity()).toBe(false);
    });

    it('reports wrong check digits', async () => {
      const { form, input } = mount();

      await typeInto(input, WRONG_CHECK_DIGITS);

      expect(input.value).toBe('0000001-40.2024.8.26.0100');
      expect(input.validationMessage).toBe(INVALID_MESSAGE);
      expect(form.checkValidity()).toBe(false);
    });

    it('accepts an empty optional field', async () => {
      const { form, input } = mount();

      expect(input.validity.valid).toBe(true);

      await typeInto(input, '12');
      await userEvent.keyboard('{Backspace}{Backspace}');

      expect(input.value).toBe('');
      expect(input.validity.valid).toBe(true);
      expect(form.checkValidity()).toBe(true);
    });

    it('leaves a required empty field to the native required check', async () => {
      const { input } = mount('required');

      await typeInto(input, '1');
      await userEvent.keyboard('{Backspace}');

      expect(input.validity.valueMissing).toBe(true);
      expect(input.validity.customError).toBe(false);
    });

    it('clears the message as soon as the number becomes valid', async () => {
      const { input } = mount();
      await typeInto(input, DIGITS.slice(0, 19));
      expect(input.validationMessage).toBe(INCOMPLETE_MESSAGE);

      await userEvent.keyboard('0');

      expect(input.validationMessage).toBe('');
      expect(input.validity.valid).toBe(true);
    });

    it('reports wrong check digits in a pasted number', async () => {
      const { input } = mount();

      await pasteInto(input, '0000001-40.2024.8.26.0100');

      expect(input.validationMessage).toBe(INVALID_MESSAGE);
    });
  });

  describe('aria-invalid', () => {
    it('marks nothing while the number is still being typed', async () => {
      const { input } = mount();

      await typeInto(input, '0000001392');

      expect(input.validity.valid).toBe(false);
      expect(input.hasAttribute('aria-invalid')).toBe(false);
    });

    it('marks an invalid number when the field loses focus and clears it once the number is corrected', async () => {
      const { input } = mount();
      await typeInto(input, '0000001392');

      await userEvent.tab();

      expect(input.getAttribute('aria-invalid')).toBe('true');

      await typeInto(input, DIGITS.slice(10));

      expect(input.validity.valid).toBe(true);
      expect(input.hasAttribute('aria-invalid')).toBe(false);
    });

    it('does not mark a valid number or an empty optional field on blur', async () => {
      const { input } = mount();
      input.focus();
      await userEvent.tab();
      expect(input.hasAttribute('aria-invalid')).toBe(false);

      await typeInto(input, DIGITS);
      await userEvent.tab();

      expect(input.hasAttribute('aria-invalid')).toBe(false);
    });

    it('marks the field when the form is checked and the number is invalid', () => {
      const { form, input } = mount();
      input.value = '123';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(form.checkValidity()).toBe(false);

      expect(input.getAttribute('aria-invalid')).toBe('true');
    });

    it('marks a required field that was left empty when the form is checked', () => {
      const { form, input } = mount('required');

      expect(form.checkValidity()).toBe(false);

      expect(input.getAttribute('aria-invalid')).toBe('true');
    });

    it('removes the aria-invalid the server rendered once the value is valid', async () => {
      const { input } = mount('value="0000001392" aria-invalid="true"');
      expect(input.getAttribute('aria-invalid')).toBe('true');

      await typeInto(input, DIGITS.slice(10));

      expect(input.hasAttribute('aria-invalid')).toBe(false);
    });

    it('keeps the aria-invalid the server rendered while the value is still invalid', async () => {
      const { input } = mount('value="0000001392" aria-invalid="true"');

      await typeInto(input, '0');

      expect(input.getAttribute('aria-invalid')).toBe('true');
    });
  });

  describe('initial value', () => {
    it('masks a value of digits rendered by the server and checks it', () => {
      const { input } = mount(`value="${DIGITS}"`);

      expect(input.value).toBe(MASKED);
      expect(input.validity.valid).toBe(true);
    });

    it('masks a partial value and reports it as incomplete', () => {
      const { form, input } = mount('value="0000001392"');

      expect(input.value).toBe('0000001-39.2');
      expect(input.validationMessage).toBe(INCOMPLETE_MESSAGE);
      expect(form.checkValidity()).toBe(false);
    });

    it('does not rewrite a value with letters that the server sent back', () => {
      const { input } = mount('value="processo 123"');

      expect(input.value).toBe('processo 123');
      expect(input.validationMessage).toBe(INCOMPLETE_MESSAGE);
    });

    it('does not mark the initial value as invalid before the person interacts', () => {
      const { input } = mount('value="0000001392"');

      expect(input.hasAttribute('aria-invalid')).toBe(false);
    });
  });

  describe('lifecycle', () => {
    it('does nothing and does not throw when there is no input', () => {
      const element = document.createElement('jus-numero-processo');

      expect(() => {
        document.body.append(element);
        element.remove();
      }).not.toThrow();
    });

    it('stops reacting once disconnected and works again when reconnected, without doubling up', () => {
      const { element, form, input } = mount();
      const validity = vi.spyOn(input, 'setCustomValidity');

      element.remove();
      input.value = '123456789';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(input.value).toBe('123456789');
      expect(validity).not.toHaveBeenCalled();

      form.append(element);
      validity.mockClear();
      input.value = '123456789';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(input.value).toBe('1234567-89');
      expect(validity).toHaveBeenCalledTimes(1);
    });

    it('checks the value again when the form is reset', async () => {
      const { form, input } = mount(`value="${DIGITS}"`);
      input.value = '12';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(input.validationMessage).toBe(INCOMPLETE_MESSAGE);

      form.reset();
      await nextTask();

      expect(input.value).toBe(MASKED);
      expect(input.validity.valid).toBe(true);
      expect(form.checkValidity()).toBe(true);
    });

    it('lets go of the aria-invalid when a reset brings back a valid value', async () => {
      const { form, input } = mount(`value="${DIGITS}"`);
      await userEvent.clear(input);
      await typeInto(input, '123');
      await userEvent.tab();
      expect(input.getAttribute('aria-invalid')).toBe('true');

      form.reset();
      await nextTask();

      expect(input.hasAttribute('aria-invalid')).toBe(false);
    });

    it('clears the incomplete message when a reset empties an optional field', async () => {
      const { form, input } = mount();
      await typeInto(input, '1234');
      expect(form.checkValidity()).toBe(false);

      form.reset();
      await nextTask();

      expect(input.value).toBe('');
      expect(form.checkValidity()).toBe(true);
    });
  });

  describe('accessibility', () => {
    it('has no accessibility violations, empty, typed, or marked invalid', async () => {
      const { main, input } = mount();
      await expectNoAxeViolations(main);

      await typeInto(input, DIGITS);
      await expectNoAxeViolations(main);

      await userEvent.clear(input);
      await typeInto(input, '123');
      await userEvent.tab();
      expect(input.getAttribute('aria-invalid')).toBe('true');
      await expectNoAxeViolations(main);
    });

    it('keeps the label as the accessible name of the native input', () => {
      const { input } = mount();

      expect(input.labels?.[0]?.textContent).toBe('Número do processo');
    });
  });
});
