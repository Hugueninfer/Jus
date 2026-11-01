import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { expectNoAxeViolations } from '../test-support/axe';
import { required } from '../test-support/required';
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

/** What Symfony's Bootstrap theme renders after the widget for a value the server refused, with the help text. */
const SERVER_FEEDBACK = '<div class="form-text" id="numero_help">Informe o número.</div><div class="invalid-feedback d-block" id="numero_error1">Número recusado pelo servidor.</div>';
const SERVER_ATTRIBUTES = 'value="0000001392" class="form-control is-invalid" aria-invalid="true" aria-describedby="numero_help numero_error1"';
/** The same, for a number that is well formed (the server refused it for a reason of its own): the browser has nothing to say about it. */
const SERVER_ATTRIBUTES_WELL_FORMED = `value="${DIGITS}" class="form-control is-invalid" aria-invalid="true" aria-describedby="numero_help numero_error1"`;

/** Mounts the markup the form theme renders (label, the element around the native input, what follows it, a button). */
function mount(inputAttributes = '', following = ''): Mounted {
  const main = document.createElement('main');
  main.setHTMLUnsafe(`
    <form>
      <label for="numero">Número do processo</label>
      <jus-numero-processo>
        <input type="text" id="numero" name="numero" inputmode="numeric" autocomplete="off" ${inputAttributes}>
      </jus-numero-processo>
      ${following}
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

function errorOf(): HTMLElement | null {
  return document.getElementById('numero-client-error');
}

/** The reason the person can read under the field: its text while it shows, otherwise nothing. */
function errorText(): string {
  const error = errorOf();

  return error === null || error.hidden ? '' : error.textContent;
}

/** The ids the input is described by. */
function describedBy(input: HTMLInputElement): string[] {
  return (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id !== '');
}

/** The field is marked invalid for assistive technology (aria-invalid) and for the eye (Bootstrap's is-invalid border and icon), together. */
function expectMarkedInvalid(input: HTMLInputElement, marked: boolean): void {
  expect(input.getAttribute('aria-invalid')).toBe(marked ? 'true' : null);
  expect(input.classList.contains('is-invalid')).toBe(marked);
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

    it('steps over a separator that is deleted forward, so the next Delete deletes the digit after it', async () => {
      const { input } = mount();
      await typeInto(input, '12345678');

      await typeInto(input, '{Delete}', 7);

      expect(input.value).toBe('1234567-8');
      expect(input.selectionStart).toBe(8);

      await userEvent.keyboard('{Delete}');

      expect(input.value).toBe('1234567');
      expect(input.selectionStart).toBe(7);
    });

    it('stays where it was when a digit is deleted forward in the middle', async () => {
      const { input } = mount();
      await typeInto(input, '123456789');

      await typeInto(input, '{Delete}', 3);

      expect(input.value).toBe('1235678-9');
      expect(input.selectionStart).toBe(3);
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

  describe('error state', () => {
    it('marks nothing while the number is still being typed', async () => {
      const { input } = mount();

      await typeInto(input, '0000001392');

      expect(input.validity.valid).toBe(false);
      expectMarkedInvalid(input, false);
    });

    it('marks an invalid number when the field loses focus (attribute and border) and clears it once the number is corrected', async () => {
      const { input } = mount();
      await typeInto(input, '0000001392');

      await userEvent.tab();

      expectMarkedInvalid(input, true);

      await typeInto(input, DIGITS.slice(10));

      expect(input.validity.valid).toBe(true);
      expectMarkedInvalid(input, false);
    });

    it('does not mark a valid number or an empty optional field on blur', async () => {
      const { input } = mount();
      input.focus();
      await userEvent.tab();
      expectMarkedInvalid(input, false);

      await typeInto(input, DIGITS);
      await userEvent.tab();

      expectMarkedInvalid(input, false);
    });

    it('marks the field when the form is checked and the number is invalid', () => {
      const { form, input } = mount();
      input.value = '123';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(form.checkValidity()).toBe(false);

      expectMarkedInvalid(input, true);
    });

    it('marks a required field that was left empty when the form is checked, without text of its own', () => {
      const { form, input } = mount('required');

      expect(form.checkValidity()).toBe(false);

      expectMarkedInvalid(input, true);
      expect(errorText()).toBe('');
      expect(input.hasAttribute('aria-describedby')).toBe(false);
    });

    it('does not mark a required field that was left empty when it loses focus: the browser says so when the form is submitted', async () => {
      const { input } = mount('required');
      input.focus();

      await userEvent.tab();

      expect(input.validity.valueMissing).toBe(true);
      expectMarkedInvalid(input, false);
      expect(errorText()).toBe('');
    });

    it('does not mark a required field emptied again either', async () => {
      const { input } = mount('required');
      await typeInto(input, '1');
      await userEvent.keyboard('{Backspace}');

      await userEvent.tab();

      expectMarkedInvalid(input, false);
      expect(errorText()).toBe('');
    });

    it('lets go of the marks of a required field that is emptied after the browser reported it, as it has no text of ours to give', async () => {
      const { form, input } = mount('required');
      form.checkValidity();
      await typeInto(input, '12');
      expectMarkedInvalid(input, true);
      expect(errorText()).toBe(INCOMPLETE_MESSAGE);

      await userEvent.keyboard('{Backspace}{Backspace}');

      expect(input.validity.valueMissing).toBe(true);
      expectMarkedInvalid(input, false);
      expect(errorText()).toBe('');
      expect(input.hasAttribute('aria-describedby')).toBe(false);
    });

    it('lets go of the mark the server rendered when the field is emptied and is required: a red border with no reason is not left behind', async () => {
      const { input } = mount(`required ${SERVER_ATTRIBUTES}`, SERVER_FEEDBACK);
      expectMarkedInvalid(input, true);

      await userEvent.clear(input);

      expect(input.validity.valueMissing).toBe(true);
      expectMarkedInvalid(input, false);
      expect(errorText()).toBe('');
      expect(describedBy(input)).toEqual(['numero_help']);
    });

    it('marks it again, with the reason, when the number is typed once more', async () => {
      const { form, input } = mount('required');
      form.checkValidity();
      await typeInto(input, '1');
      await userEvent.keyboard('{Backspace}');
      expectMarkedInvalid(input, false);

      await typeInto(input, '12');
      await userEvent.tab();

      expectMarkedInvalid(input, true);
      expect(errorText()).toBe(INCOMPLETE_MESSAGE);
    });

    it('removes the error state the server rendered once the value is valid', async () => {
      const { input } = mount('value="0000001392" class="form-control is-invalid" aria-invalid="true"');
      expectMarkedInvalid(input, true);

      await typeInto(input, DIGITS.slice(10));

      expectMarkedInvalid(input, false);
    });

    it('keeps the error state the server rendered while the value is still invalid', async () => {
      const { input } = mount('value="0000001392" class="form-control is-invalid" aria-invalid="true"');

      await typeInto(input, '0');

      expectMarkedInvalid(input, true);
    });
  });

  describe('error text', () => {
    it('writes the reason as text after the element when the field loses focus, linked to the input by aria-describedby', async () => {
      const { element, input } = mount('aria-describedby="numero_help"', '<div class="form-text" id="numero_help">Ajuda</div>');
      await typeInto(input, '0000001392');
      expect(errorOf()).toBeNull();

      await userEvent.tab();

      const error = required(errorOf());
      expect(error.textContent).toBe(INCOMPLETE_MESSAGE);
      expect(error.localName).toBe('div');
      expect(error.classList.contains('invalid-feedback')).toBe(true);
      expect(error.classList.contains('d-block')).toBe(true);
      expect(error.checkVisibility()).toBe(true);
      expect(element.nextElementSibling).toBe(error);
      expect(error.contains(input)).toBe(false);
      expect(describedBy(input)).toEqual(['numero_help', 'numero-client-error']);
    });

    it('names wrong check digits as well', async () => {
      const { input } = mount();
      await typeInto(input, WRONG_CHECK_DIGITS);

      await userEvent.tab();

      expect(errorText()).toBe(INVALID_MESSAGE);
    });

    it('writes nothing while the number is still being typed', async () => {
      const { input } = mount();

      await typeInto(input, '0000001392');

      expect(errorOf()).toBeNull();
      expect(input.hasAttribute('aria-describedby')).toBe(false);
    });

    it('goes away, and is unlinked, once the number is corrected', async () => {
      const { input } = mount('aria-describedby="numero_help"', '<div class="form-text" id="numero_help">Ajuda</div>');
      await typeInto(input, '0000001392');
      await userEvent.tab();
      expect(errorText()).toBe(INCOMPLETE_MESSAGE);

      await typeInto(input, DIGITS.slice(10));

      expect(input.validity.valid).toBe(true);
      expect(errorText()).toBe('');
      expect(required(errorOf()).hidden).toBe(true);
      expect(describedBy(input)).toEqual(['numero_help']);
    });

    it('follows the number while it is shown, naming what is wrong now', async () => {
      const { input } = mount();
      await typeInto(input, '0000001402');
      await userEvent.tab();
      expect(errorText()).toBe(INCOMPLETE_MESSAGE);

      await typeInto(input, WRONG_CHECK_DIGITS.slice(10));

      expect(input.validationMessage).toBe(INVALID_MESSAGE);
      expect(errorText()).toBe(INVALID_MESSAGE);
      expectMarkedInvalid(input, true);
    });

    it('goes away when the field is emptied and is optional', async () => {
      const { input } = mount();
      await typeInto(input, '123');
      await userEvent.tab();
      expect(errorText()).toBe(INCOMPLETE_MESSAGE);

      await userEvent.clear(input);

      expect(input.validity.valid).toBe(true);
      expect(errorText()).toBe('');
      expectMarkedInvalid(input, false);
    });

    it('goes away when the field is emptied and required, which is left to the browser', async () => {
      const { input } = mount('required');
      await typeInto(input, '123');
      await userEvent.tab();
      expect(errorText()).toBe(INCOMPLETE_MESSAGE);

      await userEvent.clear(input);

      expect(input.validity.valueMissing).toBe(true);
      expect(errorText()).toBe('');
      expect(input.hasAttribute('aria-describedby')).toBe(false);
    });

    it('writes the reason when the browser reports the number as invalid, as it does when the form is submitted', () => {
      const { form, input } = mount();
      input.value = '123';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(errorOf()).toBeNull();

      expect(form.checkValidity()).toBe(false);

      expectMarkedInvalid(input, true);
      expect(errorText()).toBe(INCOMPLETE_MESSAGE);
      expect(describedBy(input)).toEqual(['numero-client-error']);
    });

    it('writes a reason as soon as a required field the browser reported empty gets a number that is not valid', async () => {
      const { form, input } = mount('required');
      form.checkValidity();
      expectMarkedInvalid(input, true);
      expect(errorText()).toBe('');

      await typeInto(input, '12');

      expect(errorText()).toBe(INCOMPLETE_MESSAGE);
      expectMarkedInvalid(input, true);
    });

    it('writes no reason of its own for a native state, even when the field is reported invalid', () => {
      const { form, input } = mount('required');
      form.checkValidity();

      expectMarkedInvalid(input, true);
      expect(errorOf()).toBeNull();
    });

    it('takes the text away with the marks when a reset brings back a valid value', async () => {
      const { form, input } = mount(`value="${DIGITS}"`);
      await userEvent.clear(input);
      await typeInto(input, '123');
      await userEvent.tab();
      expect(errorText()).toBe(INCOMPLETE_MESSAGE);

      form.reset();
      await nextTask();

      expect(errorText()).toBe('');
      expect(input.hasAttribute('aria-describedby')).toBe(false);
    });
  });

  describe('feedback rendered by the server', () => {
    it('stays as it is when the element connects', () => {
      const { input } = mount(SERVER_ATTRIBUTES, SERVER_FEEDBACK);

      const feedback = required(document.getElementById('numero_error1'));
      expect(feedback.hidden).toBe(false);
      expect(feedback.checkVisibility()).toBe(true);
      expect(feedback.classList.contains('d-block')).toBe(true);
      expect(describedBy(input)).toEqual(['numero_help', 'numero_error1']);
      expectMarkedInvalid(input, true);
    });

    it('stays while the value is not changed and the browser has nothing to say about it, even when the field loses focus or the form is checked', async () => {
      const { form, input } = mount(SERVER_ATTRIBUTES_WELL_FORMED, SERVER_FEEDBACK);
      input.focus();

      await userEvent.tab();
      form.checkValidity();

      expect(required(document.getElementById('numero_error1')).hidden).toBe(false);
      expect(describedBy(input)).toEqual(['numero_help', 'numero_error1']);
      expect(errorOf()).toBeNull();
      expectMarkedInvalid(input, true);
    });

    it.each([
      ['the field loses focus', async (_form: HTMLFormElement, input: HTMLInputElement): Promise<void> => {
        input.focus();
        await userEvent.tab();
      }],
      ['the form is checked', (form: HTMLFormElement): void => {
        form.checkValidity();
      }],
    ])('is replaced by the reason of the browser, with no change to the value, when %s: one text, not two', async (_name, act) => {
      const { form, input } = mount(SERVER_ATTRIBUTES, SERVER_FEEDBACK);

      await act(form, input);

      const feedback = required(document.getElementById('numero_error1'));
      expect(feedback.hidden).toBe(true);
      expect(feedback.checkVisibility()).toBe(false);
      expect(errorText()).toBe(INCOMPLETE_MESSAGE);
      expect(describedBy(input)).toEqual(['numero_help', 'numero-client-error']);
      expect(required(document.getElementById('numero_help')).hidden).toBe(false);
      expectMarkedInvalid(input, true);
    });

    it('shows one error text at a time for the whole life of a refused value', async () => {
      const { main, input } = mount(SERVER_ATTRIBUTES, SERVER_FEEDBACK);
      const texts = (): string[] => Array.from(main.querySelectorAll<HTMLElement>('.invalid-feedback')).filter((feedback) => feedback.checkVisibility()).map((feedback) => feedback.textContent);
      expect(texts()).toEqual(['Número recusado pelo servidor.']);

      input.focus();
      await userEvent.tab();
      expect(texts()).toEqual([INCOMPLETE_MESSAGE]);

      await typeInto(input, '0');
      expect(texts()).toEqual([INCOMPLETE_MESSAGE]);

      await userEvent.clear(input);
      await typeInto(input, DIGITS.slice(0, 3));
      await userEvent.tab();
      expect(texts()).toEqual([INCOMPLETE_MESSAGE]);
    });

    it('is hidden and unlinked at the first change, because it describes the value that was submitted; the help stays', async () => {
      const { input } = mount(SERVER_ATTRIBUTES, SERVER_FEEDBACK);

      await typeInto(input, '0');

      const feedback = required(document.getElementById('numero_error1'));
      expect(feedback.hidden).toBe(true);
      expect(feedback.checkVisibility()).toBe(false);
      expect(describedBy(input)).toContain('numero_help');
      expect(describedBy(input)).not.toContain('numero_error1');
      expect(required(document.getElementById('numero_help')).hidden).toBe(false);
    });

    it('goes together with the invalid state once the number is valid', async () => {
      const { input } = mount(SERVER_ATTRIBUTES, SERVER_FEEDBACK);

      await typeInto(input, DIGITS.slice(10));

      expect(required(document.getElementById('numero_error1')).hidden).toBe(true);
      expectMarkedInvalid(input, false);
      expect(errorText()).toBe('');
      expect(describedBy(input)).toEqual(['numero_help']);
    });

    it('is replaced by the reason of the browser while the value stays invalid', async () => {
      const { input } = mount(SERVER_ATTRIBUTES, SERVER_FEEDBACK);

      await typeInto(input, '0');

      expectMarkedInvalid(input, true);
      expect(errorText()).toBe(INCOMPLETE_MESSAGE);
      expect(describedBy(input)).toEqual(['numero_help', 'numero-client-error']);
    });

    it('leaves the help text alone when there is no feedback to retire', async () => {
      const { input } = mount('aria-describedby="numero_help"', '<div class="form-text" id="numero_help">Ajuda</div>');

      await typeInto(input, '12');

      expect(describedBy(input)).toEqual(['numero_help']);
      expect(required(document.getElementById('numero_help')).hidden).toBe(false);
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

    it('does not rewrite a value with more than 20 digits that the server sent back', () => {
      const { input } = mount('value="0000001-39.2024.8.26.0100-123"');

      expect(input.value).toBe('0000001-39.2024.8.26.0100-123');
      expect(input.validity.customError).toBe(true);
    });

    it('still masks a value of exactly 20 digits, with or without separators', () => {
      expect(mount(`value="${DIGITS}"`).input.value).toBe(MASKED);
      expect(mount(`value="${MASKED}"`).input.value).toBe(MASKED);
    });

    it('does not mark the initial value as invalid before the person interacts', () => {
      const { input } = mount('value="0000001392"');

      expectMarkedInvalid(input, false);
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

    it('lets go of the error state when a reset brings back a valid value', async () => {
      const { form, input } = mount(`value="${DIGITS}"`);
      await userEvent.clear(input);
      await typeInto(input, '123');
      await userEvent.tab();
      expectMarkedInvalid(input, true);

      form.reset();
      await nextTask();

      expectMarkedInvalid(input, false);
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
      expectMarkedInvalid(input, true);
      expect(errorText()).toBe(INCOMPLETE_MESSAGE);
      await expectNoAxeViolations(main);

      await userEvent.clear(input);
      await typeInto(input, WRONG_CHECK_DIGITS);
      await userEvent.tab();
      expect(errorText()).toBe(INVALID_MESSAGE);
      await expectNoAxeViolations(main);

      await userEvent.clear(input);
      expect(errorText()).toBe('');
      await expectNoAxeViolations(main);
    });

    it('has no accessibility violations with the server feedback, and after it is retired', async () => {
      const { main, input } = mount(SERVER_ATTRIBUTES, SERVER_FEEDBACK);
      await expectNoAxeViolations(main);

      await typeInto(input, '0');
      expect(required(document.getElementById('numero_error1')).hidden).toBe(true);
      expect(errorText()).toBe(INCOMPLETE_MESSAGE);
      await expectNoAxeViolations(main);

      await userEvent.clear(input);
      await typeInto(input, DIGITS);
      expectMarkedInvalid(input, false);
      await expectNoAxeViolations(main);
    });

    it('has no accessibility violations with a required empty field the browser reported invalid', async () => {
      const { main, form, input } = mount('required');

      form.checkValidity();

      expectMarkedInvalid(input, true);
      await expectNoAxeViolations(main);
    });

    it('keeps the label as the accessible name of the native input', () => {
      const { input } = mount();

      expect(input.labels?.[0]?.textContent).toBe('Número do processo');
    });
  });
});
