import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { expectNoAxeViolations } from '../test-support/axe';
import { required } from '../test-support/required';
import { installTokens } from '../test-support/tokens';
import './index';
import { JusUpload } from './jus-upload';

const KB = 1024;
const MB = KB * KB;
const PDF = 'application/pdf';
const HINT = 'ou arraste os arquivos PDF para cá';

/** Small limits, so the files the tests build stay light: 1 MB each and three at most. */
const LIMITS = 'max-size="1048576" max-files="3"';

/** A file of the given size filled with zeroes; a PDF unless told otherwise. */
function fileOf(name: string, size = KB, type = PDF): File {
  return new File([new Uint8Array(size)], name, { type });
}

function transferOf(files: File[]): DataTransfer {
  const transfer = new DataTransfer();
  for (const file of files) {
    transfer.items.add(file);
  }

  return transfer;
}

interface Mounted {
  main: HTMLElement;
  form: HTMLFormElement;
  element: JusUpload;
  input: HTMLInputElement;
}

interface MountOptions {
  /** More attributes for the input, like the classes and state the server renders. */
  input?: string;
  /** Wraps the label and the element in a fieldset with these attributes. */
  fieldset?: string;
}

/**
 * Mounts the element around the native input, in a form and under a label, the way the filing form will use it.
 * `selected` is put in the input before it is connected, like a browser that restores the files of a form.
 */
function mount(attributes = LIMITS, selected: File[] = [], options: MountOptions = {}): Mounted {
  const main = document.createElement('main');
  const content = `
      <label for="docs">Documentos em PDF</label>
      <jus-upload ${attributes}><input type="file" id="docs" name="arquivos[]" multiple accept="application/pdf" ${options.input ?? ''}></jus-upload>`;
  main.setHTMLUnsafe(`<form>${options.fieldset === undefined ? content : `<fieldset ${options.fieldset}>${content}</fieldset>`}</form>`);
  const input = required(main.querySelector('input'));
  if (selected.length > 0) {
    input.files = transferOf(selected).files;
  }
  document.body.append(main);

  return {
    main,
    form: required(main.querySelector('form')),
    element: required(main.querySelector<JusUpload>('jus-upload')),
    input,
  };
}

function shadowOf(element: JusUpload): ShadowRoot {
  return required(element.shadowRoot);
}

function zoneOf(element: JusUpload): HTMLElement {
  return required(shadowOf(element).querySelector<HTMLElement>('.jus-upload-zone'));
}

function listOf(element: JusUpload): HTMLElement {
  return required(shadowOf(element).querySelector<HTMLElement>('ul'));
}

function statusOf(element: JusUpload): HTMLElement {
  return required(shadowOf(element).querySelector<HTMLElement>('[aria-live]'));
}

/** The visible text of the validation error, drawn in the shadow root. */
function errorOf(element: JusUpload): HTMLElement {
  return required(shadowOf(element).querySelector<HTMLElement>('.jus-upload-error'));
}

/** The field is marked invalid for assistive technology (aria-invalid) and for the eye (Bootstrap's is-invalid), together. */
function expectMarked(input: HTMLInputElement, marked: boolean): void {
  expect(input.getAttribute('aria-invalid')).toBe(marked ? 'true' : null);
  expect(input.classList.contains('is-invalid')).toBe(marked);
}

function removeButtons(element: JusUpload): HTMLButtonElement[] {
  return Array.from(shadowOf(element).querySelectorAll('button'));
}

function removeButtonOf(element: JusUpload, fileName: string): HTMLButtonElement {
  return required(removeButtons(element).find((button) => button.getAttribute('aria-label') === `Remover ${fileName}`));
}

/** What each item of the list shows, as [name, size, button text]. */
function itemsOf(element: JusUpload): string[][] {
  return Array.from(listOf(element).querySelectorAll('li'), (item) => Array.from(item.children, (child) => child.textContent));
}

function namesOf(input: HTMLInputElement): string[] {
  return Array.from(input.files ?? [], (file) => file.name);
}

/** The browser's own "choose files" result: the input gets the files and says it changed. */
function choose(input: HTMLInputElement, files: File[]): void {
  input.files = transferOf(files).files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** A drag event as the browser dispatches it while files are dragged over the page (composed, so it crosses shadow roots). */
function dragEvent(type: string, files: File[], init: DragEventInit = {}): DragEvent {
  return new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: transferOf(files), ...init });
}

/** Dispatches a drop of the files and returns the event, to look at whether the page's default was prevented. */
function drop(target: EventTarget, files: File[]): DragEvent {
  const event = dragEvent('drop', files);
  target.dispatchEvent(event);

  return event;
}

function listen(target: EventTarget, type: string): Event[] {
  const events: Event[] = [];
  target.addEventListener(type, (event) => {
    events.push(event);
  });

  return events;
}

/** The types of the events as they arrive, in order. */
function listenInOrder(target: EventTarget, types: string[]): string[] {
  const arrived: string[] = [];
  for (const type of types) {
    target.addEventListener(type, () => {
      arrived.push(type);
    });
  }

  return arrived;
}

function formFiles(form: HTMLFormElement): File[] {
  return new FormData(form).getAll('arquivos[]').filter((value): value is File => value instanceof File);
}

/** The colour a design token resolves to, as the browser reports computed colours. */
function colorOf(token: string): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const { color } = getComputedStyle(probe);
  probe.remove();

  return color;
}

/** Waits for what a form reset or a custom element does in a timer. */
async function nextTask(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function recordMutations(target: Node, options: MutationObserverInit): { records: MutationRecord[]; stop: () => void } {
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((batch) => {
    records.push(...batch);
  });
  observer.observe(target, options);

  return {
    records,
    stop: () => {
      observer.disconnect();
    },
  };
}

describe('<jus-upload>', () => {
  let removeTokens: () => void;

  beforeEach(() => {
    removeTokens = installTokens();
  });

  afterEach(() => {
    removeTokens();
    document.body.replaceChildren();
  });

  it('is registered as jus-upload and has an open shadow root', () => {
    const { element } = mount();

    expect(customElements.get('jus-upload')).toBe(JusUpload);
    expect(element).toBeInstanceOf(JusUpload);
    expect(element.shadowRoot?.mode).toBe('open');
  });

  describe('structure', () => {
    it('leaves the native file input where it is, visible and operable: it is still the field the form submits', () => {
      const { element, input, form } = mount();

      expect(input.parentElement).toBe(element);
      expect(input.type).toBe('file');
      expect(input.multiple).toBe(true);
      expect(input.accept).toBe(PDF);
      expect(input.disabled).toBe(false);
      expect(input.checkVisibility()).toBe(true);
      expect(form.elements.namedItem('arquivos[]')).toBe(input);
    });

    it('puts the input, through a slot, in a drop zone together with the hint', () => {
      const { element, input } = mount();

      const zone = zoneOf(element);
      expect(zone.localName).toBe('div');
      expect(required(zone.querySelector('slot')).assignedElements()).toEqual([input]);
      expect(zone.textContent.trim()).toBe(HINT);
    });

    it('has the zone, the error, the list of files and the announcement in the shadow root, in this order', () => {
      const { element } = mount();

      expect(Array.from(shadowOf(element).children, (child) => child.localName)).toEqual(['div', 'p', 'ul', 'p']);
      expect(shadowOf(element).children[1]).toBe(errorOf(element));
    });

    it('starts without files: no error, the list is hidden and the live region is polite, visually hidden and empty', () => {
      const { element } = mount();

      expect(errorOf(element).hidden).toBe(true);
      expect(errorOf(element).textContent).toBe('');
      expect(errorOf(element).hasAttribute('aria-live')).toBe(false);
      expect(listOf(element).hidden).toBe(true);
      expect(listOf(element).checkVisibility()).toBe(false);
      const status = statusOf(element);
      expect(status.localName).toBe('p');
      expect(status.getAttribute('aria-live')).toBe('polite');
      expect(status.classList.contains('visually-hidden')).toBe(true);
      expect(status.textContent).toBe('');
    });

    it('names the list of files and says it is a list, which list-style: none would otherwise take away from some screen readers', () => {
      const { element } = mount();

      expect(listOf(element).getAttribute('aria-label')).toBe('Arquivos selecionados');
      expect(listOf(element).getAttribute('role')).toBe('list');
    });
  });

  describe('choosing files', () => {
    it('lists the name and the size of each chosen file', () => {
      const { element, input } = mount();

      choose(input, [fileOf('peticao.pdf', 1536), fileOf('procuracao.pdf', 512)]);

      expect(itemsOf(element)).toEqual([
        ['peticao.pdf', '1,5 KB', 'Remover'],
        ['procuracao.pdf', '512 B', 'Remover'],
      ]);
      expect(listOf(element).hidden).toBe(false);
      expect(listOf(element).checkVisibility()).toBe(true);
    });

    it('gives each remove button a name that tells which file it removes, starting with its visible text', () => {
      const { element, input } = mount();

      choose(input, [fileOf('peticao.pdf'), fileOf('procuracao.pdf')]);

      expect(removeButtons(element).map((button) => button.getAttribute('aria-label'))).toEqual([
        'Remover peticao.pdf',
        'Remover procuracao.pdf',
      ]);
      for (const button of removeButtons(element)) {
        expect(button.type).toBe('button');
        expect(button.textContent).toBe('Remover');
      }
    });

    it('shows the names as text, never as markup', () => {
      const { element, input } = mount();

      choose(input, [fileOf('<b>peticao</b>.pdf')]);

      expect(itemsOf(element)[0]?.[0]).toBe('<b>peticao</b>.pdf');
      expect(listOf(element).querySelector('b')).toBeNull();
      expect(removeButtons(element)[0]?.getAttribute('aria-label')).toBe('Remover <b>peticao</b>.pdf');
    });

    it('shows only what the dialog returned when a new choice replaces the previous one, like the native input', () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf'), fileOf('b.pdf')]);

      choose(input, [fileOf('c.pdf')]);

      expect(itemsOf(element).map(([name]) => name)).toEqual(['c.pdf']);
    });

    it('empties and hides the list when the dialog returns nothing', () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf')]);

      choose(input, []);

      expect(itemsOf(element)).toEqual([]);
      expect(listOf(element).hidden).toBe(true);
    });

    it('shows the files the input already holds when it connects, without announcing them', () => {
      const { element } = mount(LIMITS, [fileOf('restaurado.pdf')]);

      expect(itemsOf(element).map(([name]) => name)).toEqual(['restaurado.pdf']);
      expect(statusOf(element).textContent).toBe('');
    });

    it('sends the chosen files with the form', () => {
      const { input, form } = mount();

      choose(input, [fileOf('a.pdf', 10), fileOf('b.pdf', 20)]);

      expect(formFiles(form).map((file) => [file.name, file.size])).toEqual([['a.pdf', 10], ['b.pdf', 20]]);
    });
  });

  describe('announcement', () => {
    it.each([
      { name: 'one file', files: [fileOf('a.pdf')], text: '1 arquivo selecionado.' },
      { name: 'two files', files: [fileOf('a.pdf'), fileOf('b.pdf')], text: '2 arquivos selecionados.' },
      { name: 'three files', files: [fileOf('a.pdf'), fileOf('b.pdf'), fileOf('c.pdf')], text: '3 arquivos selecionados.' },
      { name: 'no file', files: [], text: 'Nenhum arquivo selecionado.' },
    ])('says "$text" for $name', ({ files, text }) => {
      const { element, input } = mount();

      choose(input, files);

      expect(statusOf(element).textContent).toBe(text);
    });

    it('announces each change, whatever its source', () => {
      const { element, input } = mount();

      choose(input, [fileOf('a.pdf')]);
      expect(statusOf(element).textContent).toBe('1 arquivo selecionado.');
      drop(element, [fileOf('b.pdf')]);
      expect(statusOf(element).textContent).toBe('2 arquivos selecionados.');
      removeButtonOf(element, 'a.pdf').click();
      expect(statusOf(element).textContent).toBe('1 arquivo selecionado.');
    });

    it('changes the announced text node even when the text is the same, so assistive technology notices', async () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf')]);
      const mutations = recordMutations(statusOf(element), { childList: true });

      choose(input, [fileOf('b.pdf')]);
      await nextTask();

      expect(statusOf(element).textContent).toBe('1 arquivo selecionado.');
      expect(mutations.records.length).toBeGreaterThan(0);
      mutations.stop();
    });
  });

  describe('dropping files', () => {
    it('puts the dropped PDFs in the input and tells it changed', () => {
      const { element, input } = mount();
      const changes = listen(input, 'change');

      drop(element, [fileOf('peticao.pdf', 100), fileOf('procuracao.pdf', 200)]);

      expect(namesOf(input)).toEqual(['peticao.pdf', 'procuracao.pdf']);
      expect(input.files?.[0]?.size).toBe(100);
      expect(changes).toHaveLength(1);
      expect(changes[0]?.bubbles).toBe(true);
      expect(itemsOf(element).map(([name]) => name)).toEqual(['peticao.pdf', 'procuracao.pdf']);
    });

    it('adds the dropped files to the ones already selected, which stay first', () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf')]);

      drop(element, [fileOf('b.pdf'), fileOf('c.pdf')]);

      expect(namesOf(input)).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
      expect(itemsOf(element).map(([name]) => name)).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    });

    it('does not add a file with the same name and size again, but does add one that differs in either', () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf', 100)]);
      const changes = listen(input, 'change');

      drop(element, [fileOf('a.pdf', 100)]);
      expect(namesOf(input)).toEqual(['a.pdf']);
      expect(changes).toHaveLength(0);

      drop(element, [fileOf('a.pdf', 101), fileOf('b.pdf', 100)]);
      expect(Array.from(input.files ?? [], (file) => `${file.name}:${String(file.size)}`)).toEqual(['a.pdf:100', 'a.pdf:101', 'b.pdf:100']);
      expect(changes).toHaveLength(1);
    });

    it('adds a file once when the same one comes twice in one drop', () => {
      const { element, input } = mount();

      drop(element, [fileOf('a.pdf', 100), fileOf('a.pdf', 100)]);

      expect(namesOf(input)).toEqual(['a.pdf']);
    });

    it('ignores what is not a PDF and announces it, then says how many files are selected', () => {
      const { element, input } = mount();
      const changes = listen(input, 'change');

      drop(element, [fileOf('peticao.pdf'), fileOf('notas.txt', KB, 'text/plain'), fileOf('foto.png', KB, 'image/png')]);

      expect(namesOf(input)).toEqual(['peticao.pdf']);
      expect(changes).toHaveLength(1);
      expect(statusOf(element).textContent).toBe(
        'Somente arquivos PDF: notas.txt foi ignorado. Somente arquivos PDF: foto.png foi ignorado. 1 arquivo selecionado.',
      );
    });

    it('announces the ignored files even when nothing else changed, and does not fire change', () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf')]);
      const changes = listen(input, 'change');

      drop(element, [fileOf('notas.txt', KB, 'text/plain')]);

      expect(namesOf(input)).toEqual(['a.pdf']);
      expect(changes).toHaveLength(0);
      expect(statusOf(element).textContent).toBe('Somente arquivos PDF: notas.txt foi ignorado. 1 arquivo selecionado.');
    });

    it('does not carry the note of one drop over to the next announcement', () => {
      const { element, input } = mount();
      drop(element, [fileOf('notas.txt', KB, 'text/plain')]);

      choose(input, [fileOf('a.pdf')]);

      expect(statusOf(element).textContent).toBe('1 arquivo selecionado.');
    });

    it('prevents the default of a drop of files, so the browser does not open the file instead', () => {
      const { element } = mount();

      expect(drop(element, [fileOf('a.pdf')]).defaultPrevented).toBe(true);
      expect(drop(element, [fileOf('notas.txt', KB, 'text/plain')]).defaultPrevented).toBe(true);
    });

    it('takes a drop on the native input too, the event crossing the slot', () => {
      const { input } = mount();

      const event = drop(input, [fileOf('a.pdf'), fileOf('b.pdf')]);

      expect(event.defaultPrevented).toBe(true);
      expect(namesOf(input)).toEqual(['a.pdf', 'b.pdf']);
    });

    it('takes a drop on any part of the zone, the list included', () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf')]);

      drop(required(listOf(element).querySelector('li')), [fileOf('b.pdf')]);
      drop(zoneOf(element), [fileOf('c.pdf')]);

      expect(namesOf(input)).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    });

    it('leaves a drop that carries no files alone', () => {
      const { element, input } = mount();
      const changes = listen(input, 'change');
      const transfer = new DataTransfer();
      transfer.setData('text/plain', 'texto');
      const event = new DragEvent('drop', { bubbles: true, cancelable: true, composed: true, dataTransfer: transfer });

      element.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(changes).toHaveLength(0);
      expect(statusOf(element).textContent).toBe('');
    });

    it('sends the dropped files with the form', () => {
      const { element, form } = mount();

      drop(element, [fileOf('a.pdf', 10), fileOf('b.pdf', 20)]);

      expect(formFiles(form).map((file) => [file.name, file.size])).toEqual([['a.pdf', 10], ['b.pdf', 20]]);
    });

    it('validates what was dropped', () => {
      const { element, input } = mount();

      drop(element, [fileOf('a.pdf'), fileOf('b.pdf'), fileOf('c.pdf'), fileOf('d.pdf')]);

      expect(input.validationMessage).toBe('Envie no máximo 3 arquivos.');
    });
  });

  describe('drag state', () => {
    it.each(['dragenter', 'dragover'])('marks the zone while files are dragged over it (%s) and allows the drop', (type) => {
      const { element } = mount();
      expect(zoneOf(element).classList.contains('is-dragging')).toBe(false);

      const event = dragEvent(type, [fileOf('a.pdf')]);
      element.dispatchEvent(event);

      expect(zoneOf(element).classList.contains('is-dragging')).toBe(true);
      expect(event.defaultPrevented).toBe(true);
    });

    it('does not mark the zone for a drag that carries no files, and leaves it alone', () => {
      const { element } = mount();
      const transfer = new DataTransfer();
      transfer.setData('text/plain', 'texto');
      const event = new DragEvent('dragover', { bubbles: true, cancelable: true, composed: true, dataTransfer: transfer });

      element.dispatchEvent(event);

      expect(zoneOf(element).classList.contains('is-dragging')).toBe(false);
      expect(event.defaultPrevented).toBe(false);
    });

    it('clears the mark when the drag leaves the element', () => {
      const { element } = mount();
      element.dispatchEvent(dragEvent('dragenter', [fileOf('a.pdf')]));

      element.dispatchEvent(dragEvent('dragleave', [fileOf('a.pdf')], { relatedTarget: document.body }));

      expect(zoneOf(element).classList.contains('is-dragging')).toBe(false);
    });

    it('clears the mark when the drag leaves to nothing at all (outside the window)', () => {
      const { element } = mount();
      element.dispatchEvent(dragEvent('dragenter', [fileOf('a.pdf')]));

      element.dispatchEvent(dragEvent('dragleave', [fileOf('a.pdf')]));

      expect(zoneOf(element).classList.contains('is-dragging')).toBe(false);
    });

    it('keeps the mark while the drag only moves from one part of the element to another', () => {
      const { element, input } = mount();
      element.dispatchEvent(dragEvent('dragenter', [fileOf('a.pdf')]));

      input.dispatchEvent(dragEvent('dragleave', [fileOf('a.pdf')], { relatedTarget: zoneOf(element) }));
      element.dispatchEvent(dragEvent('dragleave', [fileOf('a.pdf')], { relatedTarget: input }));

      expect(zoneOf(element).classList.contains('is-dragging')).toBe(true);
    });

    it('clears the mark on drop', () => {
      const { element } = mount();
      element.dispatchEvent(dragEvent('dragenter', [fileOf('a.pdf')]));

      drop(element, [fileOf('a.pdf')]);

      expect(zoneOf(element).classList.contains('is-dragging')).toBe(false);
    });
  });

  describe('removing a file', () => {
    it('takes the file out of the input, the list and the form, tells the input it changed, and announces it', async () => {
      const { element, input, form } = mount();
      choose(input, [fileOf('a.pdf', 1), fileOf('b.pdf', 2), fileOf('c.pdf', 3)]);
      const changes = listen(input, 'change');

      await userEvent.click(removeButtonOf(element, 'b.pdf'));

      expect(namesOf(input)).toEqual(['a.pdf', 'c.pdf']);
      expect(input.files?.[1]?.size).toBe(3);
      expect(changes).toHaveLength(1);
      expect(itemsOf(element).map(([name]) => name)).toEqual(['a.pdf', 'c.pdf']);
      expect(formFiles(form).map((file) => file.name)).toEqual(['a.pdf', 'c.pdf']);
      expect(statusOf(element).textContent).toBe('2 arquivos selecionados.');
    });

    it('moves the focus to the next remove button', async () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf'), fileOf('b.pdf'), fileOf('c.pdf')]);

      await userEvent.click(removeButtonOf(element, 'a.pdf'));
      expect(shadowOf(element).activeElement).toBe(removeButtonOf(element, 'b.pdf'));

      await userEvent.click(removeButtonOf(element, 'b.pdf'));
      expect(shadowOf(element).activeElement).toBe(removeButtonOf(element, 'c.pdf'));
    });

    it('moves the focus to the next remove button when a file from the middle goes', async () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf'), fileOf('b.pdf'), fileOf('c.pdf')]);

      await userEvent.click(removeButtonOf(element, 'b.pdf'));

      expect(shadowOf(element).activeElement).toBe(removeButtonOf(element, 'c.pdf'));
    });

    it('moves the focus to the input when the last file goes, there being no next button', async () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf'), fileOf('b.pdf')]);

      await userEvent.click(removeButtonOf(element, 'b.pdf'));

      expect(document.activeElement).toBe(input);
      expect(shadowOf(element).activeElement).toBeNull();
    });

    it('moves the focus to the input when the only file goes, and says there is none left', async () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf')]);

      await userEvent.click(removeButtonOf(element, 'a.pdf'));

      expect(document.activeElement).toBe(input);
      expect(listOf(element).hidden).toBe(true);
      expect(input.files).toHaveLength(0);
      expect(statusOf(element).textContent).toBe('Nenhum arquivo selecionado.');
    });

    it('can be done with the keyboard alone: Tab from the input to the buttons, Enter to remove, the focus staying in the list', async () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf'), fileOf('b.pdf')]);

      await userEvent.tab();
      expect(document.activeElement).toBe(input);
      await userEvent.tab();
      expect(shadowOf(element).activeElement).toBe(removeButtonOf(element, 'a.pdf'));
      await userEvent.keyboard('{Enter}');

      expect(namesOf(input)).toEqual(['b.pdf']);
      expect(shadowOf(element).activeElement).toBe(removeButtonOf(element, 'b.pdf'));
      await userEvent.keyboard(' ');
      expect(namesOf(input)).toEqual([]);
      expect(document.activeElement).toBe(input);
    });

    it('does not fire the change event more than once per removal', async () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf'), fileOf('b.pdf')]);
      const changes = listen(input, 'change');

      await userEvent.click(removeButtonOf(element, 'a.pdf'));

      expect(changes).toHaveLength(1);
    });

    it('removes the right file when two have the same name and different sizes', () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf', 1), fileOf('a.pdf', 2)]);

      removeButtons(element)[1]?.click();

      expect(Array.from(input.files ?? [], (file) => file.size)).toEqual([1]);
    });
  });

  describe('validation', () => {
    it('is valid, with no message, before anything is chosen', () => {
      const { input, form } = mount();

      expect(input.validationMessage).toBe('');
      expect(input.validity.customError).toBe(false);
      expect(form.checkValidity()).toBe(true);
    });

    it('accepts PDFs within the limits, at the limits included', () => {
      const { input, form } = mount();

      choose(input, [fileOf('a.pdf', MB), fileOf('b.pdf'), fileOf('c.pdf')]);

      expect(input.validationMessage).toBe('');
      expect(form.checkValidity()).toBe(true);
    });

    it('refuses more files than max-files, with the number in the message', () => {
      const { input, form } = mount();

      choose(input, [fileOf('a.pdf'), fileOf('b.pdf'), fileOf('c.pdf'), fileOf('d.pdf')]);

      expect(input.validity.customError).toBe(true);
      expect(input.validationMessage).toBe('Envie no máximo 3 arquivos.');
      expect(form.checkValidity()).toBe(false);
    });

    it('says "arquivo" in the singular when only one file is allowed', () => {
      const { input } = mount('max-files="1"');

      choose(input, [fileOf('a.pdf'), fileOf('b.pdf')]);

      expect(input.validationMessage).toBe('Envie no máximo 1 arquivo.');
    });

    it('refuses a file bigger than max-size, naming it and the limit', () => {
      const { input, form } = mount();

      choose(input, [fileOf('pequeno.pdf'), fileOf('grande.pdf', MB + 1)]);

      expect(input.validationMessage).toBe('O arquivo grande.pdf passa do limite de 1 MB.');
      expect(form.checkValidity()).toBe(false);
    });

    it('formats the limit like the rest of the interface', () => {
      const { input } = mount('max-size="10485760"');

      choose(input, [fileOf('grande.pdf', 10 * MB + 1)]);

      expect(input.validationMessage).toBe('O arquivo grande.pdf passa do limite de 10 MB.');
    });

    it('names the first file over the limit', () => {
      const { input } = mount();

      choose(input, [fileOf('a.pdf'), fileOf('b.pdf', MB + 1), fileOf('c.pdf', MB + 2)]);

      expect(input.validationMessage).toBe('O arquivo b.pdf passa do limite de 1 MB.');
    });

    it('refuses a file that is not a PDF, which the dialog does not truly prevent', () => {
      const { input, form } = mount();

      choose(input, [fileOf('peticao.pdf'), fileOf('notas.txt', KB, 'text/plain')]);

      expect(input.validationMessage).toBe('Envie apenas arquivos PDF.');
      expect(form.checkValidity()).toBe(false);
    });

    it('checks the number of files first, then the size, then the type', () => {
      const { input } = mount();

      choose(input, [fileOf('a.txt', MB + 1, 'text/plain'), fileOf('b.pdf'), fileOf('c.pdf'), fileOf('d.pdf')]);
      expect(input.validationMessage).toBe('Envie no máximo 3 arquivos.');

      choose(input, [fileOf('a.txt', MB + 1, 'text/plain'), fileOf('b.pdf')]);
      expect(input.validationMessage).toBe('O arquivo a.txt passa do limite de 1 MB.');

      choose(input, [fileOf('a.txt', KB, 'text/plain'), fileOf('b.pdf')]);
      expect(input.validationMessage).toBe('Envie apenas arquivos PDF.');
    });

    it('is valid again once the choice is fixed', () => {
      const { input, form } = mount();
      choose(input, [fileOf('a.pdf'), fileOf('b.pdf'), fileOf('c.pdf'), fileOf('d.pdf')]);
      expect(form.checkValidity()).toBe(false);

      choose(input, [fileOf('a.pdf')]);

      expect(input.validationMessage).toBe('');
      expect(input.validity.customError).toBe(false);
      expect(form.checkValidity()).toBe(true);
    });

    it('checks again after a file is removed', async () => {
      const { element, input, form } = mount();
      choose(input, [fileOf('a.pdf'), fileOf('b.pdf'), fileOf('c.pdf'), fileOf('d.pdf')]);
      expect(form.checkValidity()).toBe(false);

      await userEvent.click(removeButtonOf(element, 'd.pdf'));

      expect(input.validationMessage).toBe('');
      expect(form.checkValidity()).toBe(true);
    });

    it('lets the user get rid of a file that is not a PDF', async () => {
      const { element, input, form } = mount();
      choose(input, [fileOf('a.pdf'), fileOf('notas.txt', KB, 'text/plain')]);
      expect(itemsOf(element).map(([name]) => name)).toEqual(['a.pdf', 'notas.txt']);

      await userEvent.click(removeButtonOf(element, 'notas.txt'));

      expect(form.checkValidity()).toBe(true);
    });

    it('only requires PDFs when there are no limit attributes', () => {
      const { input, form } = mount('');

      choose(input, [fileOf('a.pdf', 20 * MB), fileOf('b.pdf'), fileOf('c.pdf'), fileOf('d.pdf'), fileOf('e.pdf'), fileOf('f.pdf')]);
      expect(form.checkValidity()).toBe(true);

      choose(input, [fileOf('a.docx', KB, 'application/msword')]);
      expect(input.validationMessage).toBe('Envie apenas arquivos PDF.');
    });

    it.each(['abc', '0', '-5', '1.5', '10MB', ''])('ignores a limit that is not a positive whole number ("%s")', (value) => {
      const { input, form } = mount(`max-size="${value}" max-files="${value}"`);

      choose(input, [fileOf('a.pdf', 20 * MB), fileOf('b.pdf'), fileOf('c.pdf'), fileOf('d.pdf')]);

      expect(form.checkValidity()).toBe(true);
    });

    it('checks the limits again when an attribute changes', () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf'), fileOf('b.pdf')]);
      expect(input.validationMessage).toBe('');

      element.setAttribute('max-files', '1');
      expect(input.validationMessage).toBe('Envie no máximo 1 arquivo.');

      element.removeAttribute('max-files');
      expect(input.validationMessage).toBe('');

      element.setAttribute('max-size', '512');
      expect(input.validationMessage).toBe('O arquivo a.pdf passa do limite de 512 B.');
    });

    it('checks the files the input holds when it connects', () => {
      const { input } = mount(LIMITS, [fileOf('notas.txt', KB, 'text/plain')]);

      expect(input.validationMessage).toBe('Envie apenas arquivos PDF.');
    });
  });

  describe('showing the validation error', () => {
    const FOUR = [fileOf('a.pdf'), fileOf('b.pdf'), fileOf('c.pdf'), fileOf('d.pdf')];
    const OVER_LIMIT = 'Envie no máximo 3 arquivos.';

    it('marks the input invalid and writes the message as text when a choice breaks a rule', () => {
      const { element, input } = mount(LIMITS, [], { input: 'class="form-control"' });
      expectMarked(input, false);

      choose(input, FOUR);

      expectMarked(input, true);
      expect(input.classList.contains('form-control')).toBe(true);
      expect(errorOf(element).textContent).toBe(OVER_LIMIT);
      expect(errorOf(element).hidden).toBe(false);
      expect(errorOf(element).checkVisibility()).toBe(true);
    });

    it('does the same for what was dropped', () => {
      const { element, input } = mount();

      drop(element, FOUR);

      expectMarked(input, true);
      expect(errorOf(element).textContent).toBe(OVER_LIMIT);
    });

    it.each([
      { name: 'a file over the size', files: [fileOf('grande.pdf', MB + 1)], message: 'O arquivo grande.pdf passa do limite de 1 MB.' },
      { name: 'a file that is not a PDF', files: [fileOf('notas.txt', KB, 'text/plain')], message: 'Envie apenas arquivos PDF.' },
    ])('shows the message for $name', ({ files, message }) => {
      const { element, input } = mount();

      choose(input, files);

      expectMarked(input, true);
      expect(errorOf(element).textContent).toBe(message);
    });

    it('takes the marks and the text off once a new choice fixes it', () => {
      const { element, input } = mount();
      choose(input, FOUR);

      choose(input, [fileOf('a.pdf')]);

      expectMarked(input, false);
      expect(errorOf(element).textContent).toBe('');
      expect(errorOf(element).hidden).toBe(true);
    });

    it('takes the marks and the text off once a removal fixes it', async () => {
      const { element, input } = mount();
      choose(input, FOUR);

      await userEvent.click(removeButtonOf(element, 'd.pdf'));

      expectMarked(input, false);
      expect(errorOf(element).textContent).toBe('');
      expect(errorOf(element).hidden).toBe(true);
    });

    it('keeps the error after a drop, which only adds files', () => {
      const { element, input } = mount();
      choose(input, FOUR);

      drop(element, [fileOf('e.pdf')]);

      expectMarked(input, true);
      expect(errorOf(element).textContent).toBe(OVER_LIMIT);
    });

    it('keeps the error while a removal leaves the choice invalid', async () => {
      const { element, input } = mount();
      choose(input, [...FOUR, fileOf('e.pdf')]);

      await userEvent.click(removeButtonOf(element, 'e.pdf'));

      expectMarked(input, true);
      expect(errorOf(element).textContent).toBe(OVER_LIMIT);
    });

    it('announces the message after the count when it arises', () => {
      const { element, input } = mount();

      choose(input, FOUR);

      expect(statusOf(element).textContent).toBe(`4 arquivos selecionados. ${OVER_LIMIT}`);
    });

    it('announces it again while a removal still leaves the choice invalid, and not once it is fixed', async () => {
      const { element, input } = mount();
      choose(input, [...FOUR, fileOf('e.pdf')]);

      await userEvent.click(removeButtonOf(element, 'e.pdf'));
      expect(statusOf(element).textContent).toBe(`4 arquivos selecionados. ${OVER_LIMIT}`);

      await userEvent.click(removeButtonOf(element, 'd.pdf'));
      expect(statusOf(element).textContent).toBe('3 arquivos selecionados.');
    });

    it('announces what a drop ignored, then the count, then the message', () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf'), fileOf('b.pdf'), fileOf('c.pdf')]);

      drop(element, [fileOf('d.pdf'), fileOf('notas.txt', KB, 'text/plain')]);

      expect(input.validationMessage).toBe(OVER_LIMIT);
      expect(statusOf(element).textContent).toBe(`Somente arquivos PDF: notas.txt foi ignorado. 4 arquivos selecionados. ${OVER_LIMIT}`);
    });

    it('draws the message in the danger colour and as text, so it does not depend on the colour', () => {
      const { element, input } = mount();

      choose(input, FOUR);

      expect(getComputedStyle(errorOf(element)).color).toBe(colorOf('--jus-color-danger'));
      expect(errorOf(element).textContent.trim()).not.toBe('');
    });

    it('marks it when the browser reports the field as invalid, as it does when the form is submitted', () => {
      const { element, input, form } = mount();
      choose(input, [fileOf('a.pdf')]);
      element.setAttribute('max-size', '512');
      expect(input.validationMessage).toBe('O arquivo a.pdf passa do limite de 512 B.');
      expectMarked(input, false);

      expect(form.checkValidity()).toBe(false);

      expectMarked(input, true);
      expect(errorOf(element).textContent).toBe('O arquivo a.pdf passa do limite de 512 B.');
      expect(errorOf(element).hidden).toBe(false);
    });

    it('leaves the state the server rendered alone when it connects', () => {
      const { element, input } = mount(LIMITS, [], { input: 'class="form-control is-invalid" aria-invalid="true"' });

      expectMarked(input, true);
      expect(errorOf(element).textContent).toBe('');
    });

    it('does not mark the input when it connects over files that are not valid, either: the next change or the submit does', () => {
      const { element, input } = mount(LIMITS, [fileOf('notas.txt', KB, 'text/plain')], { input: 'class="form-control"' });

      expect(input.validationMessage).toBe('Envie apenas arquivos PDF.');
      expectMarked(input, false);
      expect(errorOf(element).textContent).toBe('');
    });

    it('leaves the state alone when an attribute changes, too', () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf'), fileOf('b.pdf')]);

      element.setAttribute('max-files', '1');

      expect(input.validationMessage).toBe('Envie no máximo 1 arquivo.');
      expectMarked(input, false);
      expect(errorOf(element).textContent).toBe('');

      input.classList.add('is-invalid');
      input.setAttribute('aria-invalid', 'true');
      element.setAttribute('max-files', '5');

      expect(input.validationMessage).toBe('');
      expectMarked(input, true);
    });

    it('takes an error that is shown off when an attribute change makes the choice valid, and updates it when it makes another rule fail, without announcing', () => {
      const { element, input } = mount();
      choose(input, FOUR);
      expect(errorOf(element).textContent).toBe(OVER_LIMIT);
      const announced = statusOf(element).textContent;

      element.setAttribute('max-files', '2');
      expect(errorOf(element).textContent).toBe('Envie no máximo 2 arquivos.');
      expectMarked(input, true);

      element.setAttribute('max-files', '9');
      expectMarked(input, false);
      expect(errorOf(element).textContent).toBe('');
      expect(errorOf(element).hidden).toBe(true);
      expect(statusOf(element).textContent).toBe(announced);
    });

    it('takes the server-rendered invalid state off, as the CNJ field does, once the person makes a valid choice', () => {
      const { input } = mount(LIMITS, [], { input: 'class="form-control is-invalid" aria-invalid="true"' });

      choose(input, [fileOf('a.pdf')]);

      expectMarked(input, false);
    });

    it('takes the marks and the text off after a reset', async () => {
      const { element, input, form } = mount();
      choose(input, FOUR);
      expectMarked(input, true);

      form.reset();
      await nextTask();

      expectMarked(input, false);
      expect(errorOf(element).textContent).toBe('');
      expect(errorOf(element).hidden).toBe(true);
    });
  });

  describe('with a required input, whose native errors are left to the browser', () => {
    const REQUIRED = { input: 'required class="form-control"' };

    it('leaves the input unmarked and the text empty after a reset, which says only that nothing is selected', async () => {
      const { element, input, form } = mount(LIMITS, [], REQUIRED);
      choose(input, [fileOf('a.pdf')]);

      form.reset();
      await nextTask();

      expect(input.validity.valueMissing).toBe(true);
      expect(input.validity.customError).toBe(false);
      expectMarked(input, false);
      expect(errorOf(element).textContent).toBe('');
      expect(errorOf(element).hidden).toBe(true);
      expect(statusOf(element).textContent).toBe('Nenhum arquivo selecionado.');
    });

    it('shows no text and no mark when the last file is removed, and announces only the count', async () => {
      const { element, input } = mount(LIMITS, [], REQUIRED);
      choose(input, [fileOf('a.pdf')]);

      await userEvent.click(removeButtonOf(element, 'a.pdf'));

      expect(input.validity.valueMissing).toBe(true);
      expectMarked(input, false);
      expect(errorOf(element).textContent).toBe('');
      expect(statusOf(element).textContent).toBe('Nenhum arquivo selecionado.');
    });

    it('marks an empty input when the browser reports it as invalid, without writing the browser text in the page', () => {
      const { element, input, form } = mount(LIMITS, [], REQUIRED);

      expect(form.checkValidity()).toBe(false);

      expectMarked(input, true);
      expect(errorOf(element).textContent).toBe('');
      expect(errorOf(element).hidden).toBe(true);
      expect(statusOf(element).textContent).toBe('');
    });

    it('takes that mark off once files are chosen', () => {
      const { input, form } = mount(LIMITS, [], REQUIRED);
      form.checkValidity();
      expectMarked(input, true);

      choose(input, [fileOf('a.pdf')]);

      expectMarked(input, false);
    });

    it('still shows and announces the messages of its own rules', () => {
      const { element, input } = mount(LIMITS, [], REQUIRED);

      choose(input, [fileOf('a.pdf'), fileOf('b.pdf'), fileOf('c.pdf'), fileOf('d.pdf')]);

      expectMarked(input, true);
      expect(errorOf(element).textContent).toBe('Envie no máximo 3 arquivos.');
      expect(statusOf(element).textContent).toBe('4 arquivos selecionados. Envie no máximo 3 arquivos.');
    });
  });

  describe('events', () => {
    it('fires input and then change on the input, both bubbling, when a drop writes the files, like the browser does for a chosen file', () => {
      const { element, input } = mount();
      const arrived = listenInOrder(input, ['input', 'change']);
      const inputEvents = listen(input, 'input');
      const changeEvents = listen(input, 'change');

      drop(element, [fileOf('a.pdf')]);

      expect(arrived).toEqual(['input', 'change']);
      expect(inputEvents[0]?.bubbles).toBe(true);
      expect(inputEvents[0]?.composed).toBe(true);
      expect(changeEvents[0]?.bubbles).toBe(true);
    });

    it('does the same when a removal writes the files, and tells the form around the input', async () => {
      const { element, input, form } = mount();
      choose(input, [fileOf('a.pdf'), fileOf('b.pdf')]);
      const arrived = listenInOrder(input, ['input', 'change']);
      const atTheForm = listenInOrder(form, ['input', 'change']);

      await userEvent.click(removeButtonOf(element, 'a.pdf'));

      expect(arrived).toEqual(['input', 'change']);
      expect(atTheForm).toEqual(['input', 'change']);
    });

    it('fires nothing when a drop adds nothing', () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf', 100)]);
      const arrived = listenInOrder(input, ['input', 'change']);

      drop(element, [fileOf('a.pdf', 100), fileOf('notas.txt', KB, 'text/plain')]);

      expect(arrived).toEqual([]);
    });
  });

  describe('when the input is disabled', () => {
    it.each([
      { name: 'the input is disabled', options: { input: 'disabled' } },
      { name: 'a fieldset around it is disabled', options: { fieldset: 'disabled' } },
    ])('ignores a drop, but still keeps the browser from opening the file, when $name', ({ options }) => {
      const { element, input } = mount(LIMITS, [], options);
      expect(input.matches(':disabled')).toBe(true);
      const arrived = listenInOrder(input, ['input', 'change']);

      const event = drop(element, [fileOf('a.pdf')]);

      expect(event.defaultPrevented).toBe(true);
      expect(input.files).toHaveLength(0);
      expect(arrived).toEqual([]);
      expect(itemsOf(element)).toEqual([]);
      expect(statusOf(element).textContent).toBe('');
    });

    it('does not mark the zone for a drag over it, and does not announce what a drop would have ignored', () => {
      const { element } = mount(LIMITS, [], { input: 'disabled' });

      const over = dragEvent('dragover', [fileOf('a.pdf')]);
      element.dispatchEvent(over);
      element.dispatchEvent(dragEvent('dragenter', [fileOf('a.pdf')]));

      expect(zoneOf(element).classList.contains('is-dragging')).toBe(false);
      expect(over.defaultPrevented).toBe(true);

      drop(element, [fileOf('notas.txt', KB, 'text/plain')]);
      expect(statusOf(element).textContent).toBe('');
    });

    it.each(['dragenter', 'dragover'])('tells the browser the drop is not allowed (%s), and leaves the effect alone when the input is enabled', (type) => {
      // A DataTransfer built by a script ignores dropEffect, so a stand-in with the same shape records what is set.
      const carrying = (): { types: string[]; files: File[]; dropEffect: string } => ({ types: ['Files'], files: [], dropEffect: 'copy' });
      const fakeDrag = (transfer: object): Event => Object.defineProperty(new Event(type, { bubbles: true, cancelable: true }), 'dataTransfer', { value: transfer });
      const disabled = mount(LIMITS, [], { input: 'disabled' });
      const enabled = mount();
      const refused = carrying();
      const allowed = carrying();

      disabled.element.dispatchEvent(fakeDrag(refused));
      enabled.element.dispatchEvent(fakeDrag(allowed));

      expect(refused.dropEffect).toBe('none');
      expect(allowed.dropEffect).toBe('copy');
    });

    it.each([
      { name: 'the input is disabled', options: { input: 'disabled' } },
      { name: 'a fieldset around it is disabled', options: { fieldset: 'disabled' } },
    ])('disables the remove buttons of the files it already holds when $name', ({ options }) => {
      const { element } = mount(LIMITS, [fileOf('a.pdf'), fileOf('b.pdf')], options);

      expect(removeButtons(element)).toHaveLength(2);
      for (const button of removeButtons(element)) {
        expect(button.disabled).toBe(true);
      }
    });

    it('leaves the remove buttons enabled when it is not', () => {
      const { element } = mount(LIMITS, [fileOf('a.pdf')]);

      expect(removeButtons(element)[0]?.disabled).toBe(false);
    });

    it('follows the input being disabled and enabled again, and a fieldset around it', async () => {
      const { element, input, main } = mount(LIMITS, [], { fieldset: '' });
      choose(input, [fileOf('a.pdf')]);
      const fieldset = required(main.querySelector('fieldset'));
      expect(removeButtons(element)[0]?.disabled).toBe(false);

      input.disabled = true;
      await nextTask();
      expect(removeButtons(element)[0]?.disabled).toBe(true);

      input.disabled = false;
      await nextTask();
      expect(removeButtons(element)[0]?.disabled).toBe(false);

      fieldset.disabled = true;
      await nextTask();
      expect(removeButtons(element)[0]?.disabled).toBe(true);
      expect(drop(element, [fileOf('b.pdf')]).defaultPrevented).toBe(true);
      expect(namesOf(input)).toEqual(['a.pdf']);

      fieldset.disabled = false;
      await nextTask();
      expect(removeButtons(element)[0]?.disabled).toBe(false);
      drop(element, [fileOf('b.pdf')]);
      expect(namesOf(input)).toEqual(['a.pdf', 'b.pdf']);
      expect(removeButtons(element).every((button) => !button.disabled)).toBe(true);
    });

    it('stops watching the fieldset once the element is removed from the page', async () => {
      const { main, element } = mount(LIMITS, [fileOf('a.pdf')], { fieldset: 'disabled' });
      const fieldset = required(main.querySelector('fieldset'));
      expect(removeButtons(element)[0]?.disabled).toBe(true);

      element.remove();
      fieldset.disabled = false;
      await nextTask();

      expect(removeButtons(element)[0]?.disabled).toBe(true);
    });
  });

  describe('the focus when the list is redrawn', () => {
    it('stays on the same remove button when a drop adds files while it has the focus', () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf'), fileOf('b.pdf')]);
      removeButtonOf(element, 'b.pdf').focus();
      expect(shadowOf(element).activeElement).toBe(removeButtonOf(element, 'b.pdf'));

      drop(element, [fileOf('c.pdf')]);

      expect(shadowOf(element).activeElement).toBe(removeButtonOf(element, 'b.pdf'));
      expect(shadowOf(element).activeElement?.isConnected).toBe(true);
    });

    it('stays on the remove button when a drop adds nothing, and only announces', () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf', 100)]);
      removeButtonOf(element, 'a.pdf').focus();

      drop(element, [fileOf('a.pdf', 100), fileOf('notas.txt', KB, 'text/plain')]);

      expect(shadowOf(element).activeElement).toBe(removeButtonOf(element, 'a.pdf'));
      expect(statusOf(element).textContent).toBe('Somente arquivos PDF: notas.txt foi ignorado. 1 arquivo selecionado.');
    });

    it('does not take the focus from the input when a drop adds files', () => {
      const { element, input } = mount();
      input.focus();

      drop(element, [fileOf('a.pdf')]);

      expect(document.activeElement).toBe(input);
    });

    it('does not take the focus from anywhere else when the list is redrawn', () => {
      const { element, input, main } = mount();
      const other = document.createElement('button');
      other.textContent = 'Outro';
      main.append(other);
      other.focus();

      drop(element, [fileOf('a.pdf')]);
      choose(input, [fileOf('b.pdf')]);

      expect(document.activeElement).toBe(other);
    });

    it('goes to the input, not to another button, when the new list has no button at that place', () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf'), fileOf('b.pdf'), fileOf('c.pdf')]);
      removeButtonOf(element, 'c.pdf').focus();

      choose(input, [fileOf('d.pdf')]);

      expect(document.activeElement).toBe(input);
      expect(shadowOf(element).activeElement).toBeNull();
    });

    it('goes to the input when a reset empties the list while a remove button has the focus', async () => {
      const { element, input, form } = mount();
      choose(input, [fileOf('a.pdf')]);
      removeButtonOf(element, 'a.pdf').focus();

      form.reset();
      await nextTask();

      expect(document.activeElement).toBe(input);
    });
  });

  describe('resetting the form', () => {
    it('empties the list and clears the message, once the form has put the default value back', async () => {
      const { element, input, form } = mount();
      choose(input, [fileOf('a.pdf'), fileOf('b.pdf'), fileOf('c.pdf'), fileOf('d.pdf')]);
      expect(input.validationMessage).not.toBe('');

      form.reset();
      await nextTask();

      expect(input.files).toHaveLength(0);
      expect(itemsOf(element)).toEqual([]);
      expect(listOf(element).hidden).toBe(true);
      expect(input.validationMessage).toBe('');
      expect(statusOf(element).textContent).toBe('Nenhum arquivo selecionado.');
    });

    it('says nothing when there was nothing in the list to empty', async () => {
      const { element, form } = mount();

      form.reset();
      await nextTask();

      expect(statusOf(element).textContent).toBe('');
    });
  });

  describe('lifecycle', () => {
    it('does not throw, and does nothing, without a file input inside', () => {
      const element = document.createElement('jus-upload');

      expect(() => {
        document.body.append(element);
      }).not.toThrow();
      expect(itemsOf(element as JusUpload)).toEqual([]);
      expect(() => {
        element.dispatchEvent(dragEvent('drop', [fileOf('a.pdf')]));
      }).not.toThrow();
    });

    it('handles each event once when it is moved', async () => {
      const { main, element, input } = mount();

      element.remove();
      main.append(element);
      await nextTask();
      const changes = listen(input, 'change');
      choose(input, [fileOf('a.pdf')]);
      drop(element, [fileOf('b.pdf')]);

      expect(itemsOf(element).map(([name]) => name)).toEqual(['a.pdf', 'b.pdf']);
      expect(namesOf(input)).toEqual(['a.pdf', 'b.pdf']);
      expect(changes).toHaveLength(2);
    });

    it('stops reacting once it is removed from the page', () => {
      const { element, input } = mount();

      element.remove();
      choose(input, [fileOf('a.pdf')]);
      const event = drop(element, [fileOf('b.pdf')]);

      expect(itemsOf(element)).toEqual([]);
      expect(statusOf(element).textContent).toBe('');
      expect(event.defaultPrevented).toBe(false);
      expect(namesOf(input)).toEqual(['a.pdf']);
    });

    it('settles after mounting: nothing in the shadow root keeps being rebuilt', async () => {
      const { element } = mount();
      await nextTask();
      const mutations = recordMutations(shadowOf(element), { childList: true, subtree: true, attributes: true, characterData: true });

      await nextTask();
      await nextTask();

      expect(mutations.records).toHaveLength(0);
      mutations.stop();
    });
  });

  describe('style', () => {
    it('draws the zone with a dashed border in the muted colour, dark enough to tell the area apart', () => {
      const { element } = mount();

      const style = getComputedStyle(zoneOf(element));
      expect(style.borderTopStyle).toBe('dashed');
      expect(style.borderTopColor).toBe(colorOf('--jus-color-muted'));
    });

    it('changes the zone while files are dragged over it: solid primary border, lighter fill, body-coloured hint', () => {
      const { element } = mount();
      const hint = required(zoneOf(element).querySelector('.jus-upload-hint'));
      const idle = getComputedStyle(zoneOf(element)).backgroundColor;

      element.dispatchEvent(dragEvent('dragenter', [fileOf('a.pdf')]));

      const style = getComputedStyle(zoneOf(element));
      expect(style.borderTopStyle).toBe('solid');
      expect(style.borderTopColor).toBe(colorOf('--jus-color-primary'));
      expect(style.backgroundColor).toBe(colorOf('--jus-color-light'));
      expect(style.backgroundColor).not.toBe(idle);
      expect(getComputedStyle(hint).color).toBe(colorOf('--jus-color-body'));
    });

    it('draws the remove buttons with the muted border colour', () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf')]);

      expect(getComputedStyle(removeButtonOf(element, 'a.pdf')).borderTopColor).toBe(colorOf('--jus-color-muted'));
    });

    it('lets the zone and each item wrap on a narrow screen', () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf')]);

      expect(getComputedStyle(zoneOf(element)).flexWrap).toBe('wrap');
      expect(getComputedStyle(required(listOf(element).querySelector('li'))).flexWrap).toBe('wrap');
    });
  });

  describe('accessibility', () => {
    it('has no accessibility violations, empty, with files, with an invalid choice and while dragging, with the real palette', async () => {
      const { main, element, input } = mount(LIMITS, [], { input: 'class="form-control"' });
      await expectNoAxeViolations(main);

      choose(input, [fileOf('peticao.pdf', 1536), fileOf('procuracao.pdf', 512)]);
      await expectNoAxeViolations(main);

      choose(input, [fileOf('a.pdf'), fileOf('b.pdf'), fileOf('c.pdf'), fileOf('d.pdf'), fileOf('notas.txt', KB, 'text/plain')]);
      expectMarked(input, true);
      expect(errorOf(element).checkVisibility()).toBe(true);
      await expectNoAxeViolations(main);

      element.dispatchEvent(dragEvent('dragenter', [fileOf('a.pdf')]));
      expect(zoneOf(element).classList.contains('is-dragging')).toBe(true);
      await expectNoAxeViolations(main);
    });

    it('has no accessibility violations while disabled, with files in the list', async () => {
      const { main } = mount(LIMITS, [fileOf('a.pdf')], { input: 'class="form-control" disabled' });

      await expectNoAxeViolations(main);
    });

    it('has no accessibility violations after a drop that ignored a file', async () => {
      const { main, element } = mount();

      drop(element, [fileOf('a.pdf'), fileOf('notas.txt', KB, 'text/plain')]);

      await expectNoAxeViolations(main);
    });

    it('gives every button an accessible name', () => {
      const { element, input } = mount();
      choose(input, [fileOf('a.pdf'), fileOf('b.pdf')]);

      for (const button of removeButtons(element)) {
        expect(button.getAttribute('aria-label')?.trim()).not.toBe('');
      }
      expect(removeButtons(element)).toHaveLength(2);
    });
  });
});
