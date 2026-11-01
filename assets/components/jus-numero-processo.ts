import { assessCnj, maskPartial, type CnjAssessment } from '../shared/cnj';

/** What the native validation shows for each assessment; empty is left to `required`. */
const MESSAGES: Record<CnjAssessment, string> = {
  empty: '',
  incomplete: 'Informe os 20 dígitos do número do processo.',
  invalid: 'Dígito verificador inválido.',
  valid: '',
};

/** A value the mask may rewrite: only digits and separators, so a rejected entry the server sent back stays as typed. */
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

/** Masks what was just typed or pasted, keeping the caret after the same digits so editing in the middle stays there. */
function maskAtCaret(input: HTMLInputElement): void {
  const { value } = input;
  const masked = maskPartial(value);
  if (masked === value) {
    return;
  }

  const caret = caretAfterDigits(masked, countDigits(value.slice(0, input.selectionStart ?? value.length)));
  input.value = masked;
  input.setSelectionRange(caret, caret);
}

/** Masks the value the page was rendered (or reset) with, unless it holds anything but digits and separators. */
function maskInitialValue(input: HTMLInputElement): void {
  if (MASKABLE.test(input.value)) {
    input.value = maskPartial(input.value);
  }
}

function validate(input: HTMLInputElement): void {
  input.setCustomValidity(MESSAGES[assessCnj(input.value)]);
}

/** After a change: re-checks the number, and drops the aria-invalid (the server's included) once it is valid. */
function update(input: HTMLInputElement): void {
  validate(input);
  if (input.validity.valid) {
    input.removeAttribute('aria-invalid');
  }
}

function flagIfInvalid(input: HTMLInputElement): void {
  if (!input.validity.valid) {
    input.setAttribute('aria-invalid', 'true');
  }
}

/**
 * Enhances the native input inside it, in place (no shadow root, the input stays the field the form submits):
 * a CNJ mask while typing, the check digits verified with the browser's own validation, and aria-invalid once the
 * person leaves the field or tries to submit. Without JavaScript the plain input and the server validation remain.
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

    input.addEventListener('input', () => {
      maskAtCaret(input);
      update(input);
    }, { signal });
    input.addEventListener('blur', () => {
      flagIfInvalid(input);
    }, { signal });
    input.addEventListener('invalid', () => {
      flagIfInvalid(input);
    }, { signal });
    // The reset puts the default value back after the event, so a custom error left from before would outlive it.
    input.form?.addEventListener('reset', () => {
      setTimeout(() => {
        if (!signal.aborted) {
          maskInitialValue(input);
          update(input);
        }
      }, 0);
    }, { signal });
  }

  disconnectedCallback(): void {
    this.#listeners?.abort();
    this.#listeners = undefined;
  }
}
