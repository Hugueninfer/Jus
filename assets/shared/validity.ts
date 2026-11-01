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
