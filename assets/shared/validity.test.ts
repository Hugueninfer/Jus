import { afterEach, describe, expect, it } from 'vitest';
import { required } from '../test-support/required';
import { retireServerErrors, setFieldError, setInvalid, shownFieldError } from './validity';

const containers: HTMLElement[] = [];

function field(markup = ''): HTMLInputElement {
  const container = document.createElement('div');
  container.setHTMLUnsafe(`<input ${markup}>`);

  const input = container.querySelector('input');
  if (input === null) {
    throw new Error('Expected an input.');
  }

  return input;
}

interface Wrapped {
  host: HTMLElement;
  input: HTMLInputElement;
}

/** An input inside a wrapper element, in the document (the way the components are), followed by whatever the server rendered. */
function wrapped(attributes = '', following = '', id = 'campo'): Wrapped {
  const container = document.createElement('div');
  container.setHTMLUnsafe(`<span><input ${id === '' ? '' : `id="${id}"`} ${attributes}></span>${following}`);
  document.body.append(container);
  containers.push(container);

  return { host: required(container.querySelector('span')), input: required(container.querySelector('input')) };
}

function errorElement(): HTMLElement {
  return required(document.getElementById('campo-client-error'));
}

afterEach(() => {
  for (const container of containers.splice(0)) {
    container.remove();
  }
  document.getElementById('test-bootstrap')?.remove();
});

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

describe('setFieldError', () => {
  it('writes the message as text in a Bootstrap invalid-feedback block right after the wrapper, and links it from the input', () => {
    const { host, input } = wrapped();

    setFieldError(input, host, 'Dígito verificador inválido.');

    const error = errorElement();
    expect(error.localName).toBe('div');
    expect(error.classList.contains('invalid-feedback')).toBe(true);
    expect(error.classList.contains('d-block')).toBe(true);
    expect(error.textContent).toBe('Dígito verificador inválido.');
    expect(error.hidden).toBe(false);
    expect(host.nextElementSibling).toBe(error);
    expect(input.getAttribute('aria-describedby')).toBe('campo-client-error');
    expect(shownFieldError(input)).toBe('Dígito verificador inválido.');
  });

  it('keeps the ids already described and adds its own once, however often it is written', () => {
    const { host, input } = wrapped('aria-describedby="campo_help"');

    setFieldError(input, host, 'Primeira.');
    setFieldError(input, host, 'Segunda.');

    expect(input.getAttribute('aria-describedby')).toBe('campo_help campo-client-error');
    expect(document.querySelectorAll('#campo-client-error')).toHaveLength(1);
    expect(errorElement().textContent).toBe('Segunda.');
  });

  it('does not mark the field: that stays with setInvalid', () => {
    const { host, input } = wrapped();

    setFieldError(input, host, 'Mensagem.');

    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.classList.contains('is-invalid')).toBe(false);
  });

  it('hides and empties the element and unlinks it when there is no message, leaving the other ids', () => {
    const { host, input } = wrapped('aria-describedby="campo_help"');
    setFieldError(input, host, 'Mensagem.');

    setFieldError(input, host, '');

    const error = errorElement();
    expect(error.hidden).toBe(true);
    expect(error.textContent).toBe('');
    expect(error.classList.contains('d-block')).toBe(false);
    expect(input.getAttribute('aria-describedby')).toBe('campo_help');
    expect(shownFieldError(input)).toBe('');
  });

  it('drops aria-describedby altogether when the message was the only thing it named', () => {
    const { host, input } = wrapped();
    setFieldError(input, host, 'Mensagem.');

    setFieldError(input, host, '');

    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });

  it('creates nothing when there is no message to show', () => {
    const { host, input } = wrapped();

    setFieldError(input, host, '');

    expect(document.getElementById('campo-client-error')).toBeNull();
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });

  it('is really hidden where Bootstrap would show an invalid-feedback with d-block despite the hidden attribute', () => {
    const style = document.createElement('style');
    style.id = 'test-bootstrap';
    style.textContent = '.invalid-feedback { display: none; } .d-block { display: block !important; }';
    document.head.append(style);
    const { host, input } = wrapped();

    setFieldError(input, host, 'Mensagem.');
    expect(errorElement().checkVisibility()).toBe(true);

    setFieldError(input, host, '');
    expect(errorElement().checkVisibility()).toBe(false);
  });

  it('follows the wrapper when it was moved since the last message', () => {
    const { host, input } = wrapped();
    setFieldError(input, host, 'Mensagem.');
    const elsewhere = document.createElement('div');
    document.body.append(elsewhere);
    containers.push(elsewhere);

    elsewhere.append(host);
    setFieldError(input, host, 'Outra.');

    expect(host.nextElementSibling).toBe(errorElement());
    expect(errorElement().parentElement).toBe(elsewhere);
  });

  it('gives an input without an id an error id of its own, different from the one of another such input', () => {
    const first = wrapped('', '', '');
    const second = wrapped('', '', '');

    setFieldError(first.input, first.host, 'Um.');
    setFieldError(second.input, second.host, 'Dois.');

    const firstId = required(first.input.getAttribute('aria-describedby'));
    const secondId = required(second.input.getAttribute('aria-describedby'));
    expect(firstId).not.toBe(secondId);
    expect(document.getElementById(firstId)?.textContent).toBe('Um.');
    expect(document.getElementById(secondId)?.textContent).toBe('Dois.');
  });
});

describe('retireServerErrors', () => {
  const SERVER = '<div class="form-text" id="campo_help">Ajuda</div><div class="invalid-feedback d-block" id="campo_error1">Recusado</div>';

  it('hides the server error elements the input is described by and unlinks them, leaving the help', () => {
    const { input } = wrapped('aria-describedby="campo_help campo_error1"', SERVER);

    retireServerErrors(input);

    const error = required(document.getElementById('campo_error1'));
    expect(error.hidden).toBe(true);
    expect(error.classList.contains('d-block')).toBe(false);
    expect(error.textContent).toBe('Recusado');
    expect(input.getAttribute('aria-describedby')).toBe('campo_help');
    expect(required(document.getElementById('campo_help')).hidden).toBe(false);
  });

  it('removes aria-describedby when only server errors were named', () => {
    const { input } = wrapped('aria-describedby="campo_error1"', SERVER);

    retireServerErrors(input);

    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });

  it('leaves the message of its own alone', () => {
    const { host, input } = wrapped('aria-describedby="campo_error1"', SERVER);
    setFieldError(input, host, 'Mensagem.');

    retireServerErrors(input);

    expect(input.getAttribute('aria-describedby')).toBe('campo-client-error');
    expect(shownFieldError(input)).toBe('Mensagem.');
    expect(errorElement().hidden).toBe(false);
    expect(required(document.getElementById('campo_error1')).hidden).toBe(true);
  });

  it('does nothing when there are none, or when an id names nothing', () => {
    const { input } = wrapped('aria-describedby="campo_help ausente"', SERVER);

    retireServerErrors(input);
    retireServerErrors(input);

    expect(input.getAttribute('aria-describedby')).toBe('campo_help ausente');
    expect(required(document.getElementById('campo_error1')).hidden).toBe(false);
  });

  it('does nothing for an input described by nothing', () => {
    const { input } = wrapped();

    retireServerErrors(input);

    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });
});
