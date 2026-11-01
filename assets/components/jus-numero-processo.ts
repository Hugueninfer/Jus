import { assessCnj, maskPartial, type CnjAssessment } from '../shared/cnj';
import { retireServerErrors, setFieldError, setInvalid } from '../shared/validity';

/** What the native validation shows for each assessment; empty is left to `required`. */
const MESSAGES: Record<CnjAssessment, string> = {
  empty: '',
  incomplete: 'Informe os 20 dígitos do número do processo.',
  invalid: 'Dígito verificador inválido.',
  valid: '',
};

/** The most digits a number has; the mask keeps no more. */
const DIGIT_COUNT = 20;

/** A value the mask may rewrite: only digits and separators, so a rejected entry the server sent back stays as it came. */
const MASKABLE = /^[\d.-]*$/;

function countDigits(text: string): number {
  return text.replace(/\D/g, '').length;
}

/** The caret position right after the given number of digits of a masked value (0 for none, the end if there are fewer). */
function caretAfterDigits(masked: string, digitCount: number): number {
  if (digitCount === 0) {
    return 0;
  }

  let seen = 0;
  for (let position = 0; position < masked.length; position++) {
    if (/\d/.test(masked.charAt(position))) {
      seen++;
    }
    if (seen === digitCount) {
      return position + 1;
    }
  }

  return masked.length;
}

/**
 * Masks what was just typed, pasted or deleted, keeping the caret after the same digits so editing in the middle stays
 * there. After a forward Delete the caret also steps over the separator that now follows, otherwise the mask would put
 * that separator back and every further Delete would remove it again.
 */
function maskAtCaret(input: HTMLInputElement, event: Event): void {
  const { value } = input;
  const masked = maskPartial(value);
  if (masked === value) {
    return;
  }

  let caret = caretAfterDigits(masked, countDigits(value.slice(0, input.selectionStart ?? value.length)));
  if (event instanceof InputEvent && event.inputType === 'deleteContentForward' && /\D/.test(masked.charAt(caret))) {
    caret++;
  }
  input.value = masked;
  input.setSelectionRange(caret, caret);
}

/**
 * Masks the value the page was rendered (or reset) with, unless it holds anything but digits and separators or more than
 * 20 digits: the mask would drop the extra ones, and the person would not see the entry the server refused.
 */
function maskInitialValue(input: HTMLInputElement): void {
  if (MASKABLE.test(input.value) && countDigits(input.value) <= DIGIT_COUNT) {
    input.value = maskPartial(input.value);
  }
}

function validate(input: HTMLInputElement): void {
  input.setCustomValidity(MESSAGES[assessCnj(input.value)]);
}

/** The reason the number is refused when it is the component's own (a native state such as `required` is the browser's to say). */
function reasonOf(input: HTMLInputElement): string {
  return input.validity.customError ? input.validationMessage : '';
}

/**
 * After a change: re-checks the number. Once it is valid the invalid state goes (the server's included) and so does the
 * text. While the field is still marked, the text follows the number, so it names what is wrong now.
 */
function update(input: HTMLInputElement, host: Element): void {
  validate(input);
  if (input.validity.valid) {
    setInvalid(input, false);
    setFieldError(input, host, '');
  } else if (input.getAttribute('aria-invalid') === 'true') {
    setFieldError(input, host, reasonOf(input));
  }
}

/** When the person leaves the field: marks a number that is wrong and says why. An empty required field is the browser's to report. */
function flagOnBlur(input: HTMLInputElement, host: Element): void {
  if (input.validity.customError) {
    setInvalid(input, true);
    setFieldError(input, host, reasonOf(input));
  }
}

/** When the browser reports the field invalid (the form is submitted or checked): marks it, with the reason if it is ours. */
function flagOnInvalid(input: HTMLInputElement, host: Element): void {
  if (!input.validity.valid) {
    setInvalid(input, true);
    setFieldError(input, host, reasonOf(input));
  }
}

/**
 * Enhances the native input inside it, in place (no shadow root, the input stays the field the form submits):
 * a CNJ mask while typing, the check digits verified with the browser's own validation, and the invalid state
 * (aria-invalid and the Bootstrap is-invalid class, with the reason as text after the element that the input is
 * described by) once the person leaves the field or tries to submit a number that is wrong. A native state such as an
 * empty required field stays with the browser: on submit the field is marked, with no text of ours.
 * The errors the server rendered describe the value it refused, so they are hidden at the first change.
 * Without JavaScript the plain input and the server validation remain.
 */
export class JusNumeroProcesso extends HTMLElement {
  #listeners: AbortController | undefined;

  connectedCallback(): void {
    const input = this.querySelector('input');
    if (input === null) {
      return;
    }

    const controller = new AbortController();
    this.#listeners = controller;
    const { signal } = controller;

    maskInitialValue(input);
    validate(input);

    input.addEventListener('input', (event) => {
      retireServerErrors(input);
      maskAtCaret(input, event);
      update(input, this);
    }, { signal });
    input.addEventListener('blur', () => {
      flagOnBlur(input, this);
    }, { signal });
    input.addEventListener('invalid', () => {
      flagOnInvalid(input, this);
    }, { signal });
    // The reset puts the default value back after the event, so a custom error left from before would outlive it.
    input.form?.addEventListener('reset', () => {
      setTimeout(() => {
        if (!signal.aborted) {
          maskInitialValue(input);
          update(input, this);
        }
      }, 0);
    }, { signal });
  }

  disconnectedCallback(): void {
    this.#listeners?.abort();
    this.#listeners = undefined;
  }
}
