/**
 * Marks a field invalid (or not) for everyone at once: aria-invalid for assistive technology and Bootstrap's
 * is-invalid for the red border and icon, the same state the server renders when it refuses the value.
 */
export function setInvalid(input: HTMLInputElement, invalid: boolean): void {
  if (invalid) {
    input.setAttribute('aria-invalid', 'true');
  } else {
    input.removeAttribute('aria-invalid');
  }
  input.classList.toggle('is-invalid', invalid);
}

/** The error element each input has once a message was first written for it. */
const fieldErrors = new WeakMap<HTMLInputElement, HTMLElement>();
let anonymousFields = 0;

function describedBy(input: HTMLInputElement): string[] {
  return (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id !== '');
}

function setDescribedBy(input: HTMLInputElement, ids: readonly string[]): void {
  if (ids.length === 0) {
    input.removeAttribute('aria-describedby');
  } else {
    input.setAttribute('aria-describedby', ids.join(' '));
  }
}

/**
 * Hides an invalid-feedback block. Bootstrap's `.d-block` is `!important`, as its `[hidden]` rule is, and comes later,
 * so the hidden attribute alone would not hide a block that has the class: it goes too.
 */
function hide(feedback: HTMLElement): void {
  feedback.hidden = true;
  feedback.classList.remove('d-block');
}

function errorFor(input: HTMLInputElement): HTMLElement {
  const existing = fieldErrors.get(input);
  if (existing !== undefined) {
    return existing;
  }

  const error = document.createElement('div');
  if (input.id === '') {
    anonymousFields++;
    error.id = `jus-field-${String(anonymousFields)}-client-error`;
  } else {
    error.id = `${input.id}-client-error`;
  }
  error.className = 'invalid-feedback';
  hide(error);
  fieldErrors.set(input, error);

  return error;
}

/**
 * Writes the reason a field is invalid as text, which the colour of a border cannot be, and describes the input with
 * it. The message goes in a Bootstrap `invalid-feedback` block (the look of the server's own errors) right after the
 * element that wraps the input, where Symfony renders those; its id is added to the input's `aria-describedby` while
 * it shows a message and taken off when it does not. An empty message hides it. Marking the field stays with
 * `setInvalid`.
 */
export function setFieldError(input: HTMLInputElement, host: Element, message: string): void {
  if (message === '' && !fieldErrors.has(input)) {
    return;
  }

  const error = errorFor(input);
  const others = describedBy(input).filter((id) => id !== error.id);
  if (message === '') {
    error.textContent = '';
    hide(error);
    setDescribedBy(input, others);

    return;
  }

  if (error.previousElementSibling !== host) {
    host.after(error);
  }
  error.textContent = message;
  error.hidden = false;
  error.classList.add('d-block');
  setDescribedBy(input, [...others, error.id]);
}

/** The message `setFieldError` is showing for the input, or an empty string. */
export function shownFieldError(input: HTMLInputElement): string {
  return fieldErrors.get(input)?.textContent ?? '';
}

/**
 * Hides the errors the server rendered for the input and takes them off its `aria-describedby`: they describe the value
 * that was submitted, not the one the person is editing now. They are the `invalid-feedback` blocks the input is
 * described by (Symfony's Bootstrap theme names them `<id>_error1`, ...); the help text stays, and so does the
 * message of `setFieldError`. Does nothing once they are gone, so it can run at every change.
 */
export function retireServerErrors(input: HTMLInputElement): void {
  const own = fieldErrors.get(input);
  const root = input.getRootNode();
  const scope = root instanceof Document || root instanceof DocumentFragment ? root : input.ownerDocument;
  const ids = describedBy(input);
  const remaining = ids.filter((id) => {
    const element = scope.getElementById(id);
    if (element === null || element === own || !element.classList.contains('invalid-feedback')) {
      return true;
    }
    hide(element);

    return false;
  });

  if (remaining.length !== ids.length) {
    setDescribedBy(input, remaining);
  }
}
