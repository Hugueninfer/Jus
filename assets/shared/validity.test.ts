import { describe, expect, it } from 'vitest';
import { setInvalid } from './validity';

function field(markup = ''): HTMLInputElement {
  const container = document.createElement('div');
  container.setHTMLUnsafe(`<input ${markup}>`);

  const input = container.querySelector('input');
  if (input === null) {
    throw new Error('Expected an input.');
  }

  return input;
}

describe('setInvalid', () => {
  it('marks the field for assistive technology (aria-invalid) and for the eye (Bootstrap is-invalid), together', () => {
    const input = field('class="form-control"');

    setInvalid(input, true);

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.classList.contains('is-invalid')).toBe(true);
    expect(input.classList.contains('form-control')).toBe(true);
  });

  it('takes both marks off again, whoever put them there (the server included)', () => {
    const input = field('class="form-control is-invalid" aria-invalid="true"');

    setInvalid(input, false);

    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.classList.contains('is-invalid')).toBe(false);
    expect(input.classList.contains('form-control')).toBe(true);
  });

  it('is idempotent in both directions', () => {
    const input = field();

    setInvalid(input, true);
    setInvalid(input, true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.classList.length).toBe(1);

    setInvalid(input, false);
    setInvalid(input, false);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.classList.contains('is-invalid')).toBe(false);
  });
});
