import { formatBytes } from '../shared/bytes';
import { retireServerErrors, setFieldError, setInvalid, shownFieldError } from '../shared/validity';
import { JusElement, sheet } from './jus-element';

const PDF = 'application/pdf';
const HINT = 'ou arraste os arquivos PDF para cá';
const LIST_LABEL = 'Arquivos selecionados';
const REMOVE_LABEL = 'Remover';
const DRAGGING = 'is-dragging';

const styles = sheet(`
  .jus-upload-zone {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--jus-space-2) var(--jus-space-3);
    padding: var(--jus-space-3);
    border: 2px dashed var(--jus-color-muted);
    border-radius: var(--jus-radius-lg);
  }

  /* While files are dragged over the element: a solid primary border and a light fill (the text stays body-coloured, so
     it keeps its contrast on the fill). */
  .jus-upload-zone.is-dragging {
    border-style: solid;
    border-color: var(--jus-color-primary);
    background: var(--jus-color-light);
  }

  ::slotted(input) {
    max-width: 100%;
  }

  .jus-upload-hint {
    color: var(--jus-color-muted);
  }

  .is-dragging .jus-upload-hint {
    color: var(--jus-color-body);
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: var(--jus-space-2);
    margin: var(--jus-space-3) 0 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--jus-space-1) var(--jus-space-3);
  }

  .jus-upload-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .jus-upload-size {
    color: var(--jus-color-muted);
  }

  /* The base sheet's border is a decoration (about 1.5:1); the button needs a boundary that identifies it as a control. */
  .jus-button {
    border-color: var(--jus-color-muted);
  }
`);

function isPdf(file: File): boolean {
  return file.type === PDF;
}

/** Two files with the same name and size are taken to be the same file. */
function identityOf(file: File): string {
  return `${file.name}:${String(file.size)}`;
}

/** A limit attribute: a positive whole number, otherwise there is no limit. */
function limitOf(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) {
    return undefined;
  }
  const limit = Number(value);

  return limit > 0 ? limit : undefined;
}

function countMessage(count: number): string {
  if (count === 0) {
    return 'Nenhum arquivo selecionado.';
  }

  return count === 1 ? '1 arquivo selecionado.' : `${String(count)} arquivos selecionados.`;
}

/** The first rule the choice breaks, as the browser shows it when the form is submitted; empty when it breaks none. */
function validationMessage(files: readonly File[], maxFiles: number | undefined, maxSize: number | undefined): string {
  if (maxFiles !== undefined && files.length > maxFiles) {
    return `Envie no máximo ${String(maxFiles)} ${maxFiles === 1 ? 'arquivo' : 'arquivos'}.`;
  }

  if (maxSize !== undefined) {
    const tooBig = files.find((file) => file.size > maxSize);
    if (tooBig !== undefined) {
      return `O arquivo ${tooBig.name} passa do limite de ${formatBytes(maxSize)}.`;
    }
  }

  return files.every(isPdf) ? '' : 'Envie apenas arquivos PDF.';
}

/** Whether files are being dragged (as opposed to text or a link), which is all this element takes. */
function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') === true;
}

/**
 * Wraps the native `<input type="file" multiple accept="application/pdf">`, which stays where it is as the visible,
 * operable control the form submits, and adds to it: a drop zone (files dropped over the element are added to the
 * selection, only PDFs), the list of the selected files with a button to remove each one, early validation with
 * `setCustomValidity` (`max-files`, `max-size` and PDF only), and a polite announcement of every change. Without
 * JavaScript this is an unknown element and the plain input works on its own.
 *
 * The input is the only state: the list is drawn from `input.files`, and a drop or a removal writes the new
 * list back to it with a `DataTransfer` and fires `input` and `change`, as choosing files in the dialog does. The
 * dialog replaces the selection, as it does natively; a drop adds to it.
 *
 * When a change leaves the choice invalid the problem is shown (the input gets aria-invalid and Bootstrap's
 * is-invalid, and the message is written as text after the element, outside the shadow root so that the input can be
 * described by it) and announced after the count; when it leaves it valid both marks and the text go. The first change
 * also hides the errors the server rendered, which describe what was submitted. Connecting only checks the choice and
 * leaves alone the marks and the errors the server may have rendered.
 * Changing a limit attribute checks it again and, only while the component is showing an error, updates or clears
 * that error to follow the new limit; with none shown the marks stay as they are until the next change or submit.
 * A disabled input (or one in a disabled fieldset) takes no drops and its remove buttons are disabled.
 *
 * Consumers should read the validity on `change`, not on `input`: the component checks the choice when `change` arrives.
 */
export class JusUpload extends JusElement {
  static readonly observedAttributes = ['max-size', 'max-files'];

  readonly #zone = document.createElement('div');
  readonly #list = document.createElement('ul');
  readonly #status = document.createElement('p');
  #input: HTMLInputElement | undefined;
  /** What the next announcement says before the count (the files a drop ignored); cleared as it is spoken. */
  #notice = '';
  #listeners: AbortController | undefined;

  constructor() {
    super();
    this.#zone.className = 'jus-upload-zone';
    const hint = document.createElement('span');
    hint.className = 'jus-upload-hint';
    hint.textContent = HINT;
    this.#zone.append(document.createElement('slot'), hint);

    // The role keeps the list a list for screen readers that drop it with list-style: none.
    this.#list.setAttribute('role', 'list');
    this.#list.setAttribute('aria-label', LIST_LABEL);
    this.#list.hidden = true;

    this.#status.setAttribute('aria-live', 'polite');
    this.#status.className = 'visually-hidden';

    this.root.append(this.#zone, this.#list, this.#status);
  }

  protected override styles(): CSSStyleSheet[] {
    return [styles];
  }

  connectedCallback(): void {
    const input = this.querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null) {
      return;
    }

    const controller = new AbortController();
    this.#listeners = controller;
    this.#input = input;
    const { signal } = controller;

    input.addEventListener('change', () => {
      retireServerErrors(input);
      this.#settle(true);
    }, { signal });
    // The browser reports the field as invalid when the form is submitted (or checked). That is when a choice that
    // became invalid without a change, through the limit attributes, is marked, and so is a required field left empty.
    input.addEventListener('invalid', () => {
      this.#report(true);
    }, { signal });
    // The reset puts the default value back after the event, so what the list shows would outlive it. It is only
    // worth announcing when there was something in the list to empty.
    input.form?.addEventListener('reset', () => {
      setTimeout(() => {
        if (!signal.aborted) {
          this.#settle(this.#list.childElementCount > 0);
        }
      }, 0);
    }, { signal });
    this.#watchDisabled(input, signal);

    // Dragover is prevented for files, which is what makes the element a place where they can be dropped.
    for (const type of ['dragenter', 'dragover'] as const) {
      this.addEventListener(type, (event) => {
        if (carriesFiles(event)) {
          event.preventDefault();
          if (!this.#disabled()) {
            this.#zone.classList.add(DRAGGING);
          } else if (event.dataTransfer !== null) {
            // Still a target, but one that says it takes nothing: browsers do not normally fire `drop` after a
            // `none` effect, and the drop handler below is the safety net that cancels it if one does.
            event.dataTransfer.dropEffect = 'none';
          }
        }
      }, { signal });
    }
    this.addEventListener('dragleave', (event) => {
      // Moving between the parts of the element also leaves one of them; only a move out of the element ends the drag.
      // Where the related target is unknown, the next dragover marks the zone again.
      if (!(event.relatedTarget instanceof Node && this.contains(event.relatedTarget))) {
        this.#zone.classList.remove(DRAGGING);
      }
    }, { signal });
    this.addEventListener('drop', (event) => {
      this.#zone.classList.remove(DRAGGING);
      if (carriesFiles(event)) {
        // The browser would otherwise open the file in place of the page, disabled field or not.
        event.preventDefault();
        if (!this.#disabled()) {
          this.#add(Array.from(event.dataTransfer?.files ?? []));
        }
      }
    }, { signal });

    this.#render();
  }

  disconnectedCallback(): void {
    this.#listeners?.abort();
    this.#listeners = undefined;
    this.#input = undefined;
    this.#zone.classList.remove(DRAGGING);
  }

  attributeChangedCallback(): void {
    this.#validate();
    // An error on show follows the new limits: it goes away, or names the rule that fails now. When none is shown the
    // marks stay as they are (the server's included) until the next change or the submit.
    if (this.#input !== undefined && shownFieldError(this.#input) !== '') {
      this.#report();
    }
  }

  #selected(): File[] {
    return Array.from(this.#input?.files ?? []);
  }

  /** Whether the input is disabled, by itself or by a fieldset around it. */
  #disabled(): boolean {
    return this.#input?.matches(':disabled') === true;
  }

  /** Keeps the remove buttons in step with the input being disabled or enabled, it or a fieldset around it. */
  #watchDisabled(input: HTMLInputElement, signal: AbortSignal): void {
    const observer = new MutationObserver(() => {
      const disabled = this.#disabled();
      for (const button of this.#list.querySelectorAll('button')) {
        button.disabled = disabled;
      }
    });
    for (let node: Element | null = input; node !== null; node = node.parentElement) {
      if (node === input || node instanceof HTMLFieldSetElement) {
        observer.observe(node, { attributes: true, attributeFilter: ['disabled'] });
      }
    }
    signal.addEventListener('abort', () => {
      observer.disconnect();
    });
  }

  /**
   * After a change: redraws the list, checks the choice, shows the problem (or takes it off) and, when asked, says what
   * changed: the notice, the count and the message. Connecting only reads the choice (#render), and silently.
   */
  #settle(announce: boolean): void {
    this.#render();
    const message = this.#report();

    if (announce) {
      // A new text node each time, so that the same words twice in a row are still noticed.
      const count = countMessage(this.#selected().length);
      this.#status.textContent = [this.#notice, count, message].filter((text) => text !== '').join(' ');
    }
    this.#notice = '';
  }

  /** Checks the choice and redraws the list, keeping the focus on the remove button it was on. */
  #render(): void {
    const input = this.#input;
    if (input === undefined) {
      return;
    }

    const files = this.#selected();
    this.#validate();
    const focused = this.root.activeElement;
    const focusedIndex = focused instanceof HTMLButtonElement ? Array.from(this.#list.querySelectorAll('button')).indexOf(focused) : -1;

    const disabled = this.#disabled();
    this.#list.replaceChildren(...files.map((file) => this.#item(file, disabled)));
    this.#list.hidden = files.length === 0;

    // The redraw replaces the button that had the focus: the one now at its place takes it, or the input if there is none.
    if (focusedIndex >= 0) {
      (this.#list.querySelectorAll('button')[focusedIndex] ?? input).focus();
    }
  }

  /**
   * Marks the input invalid and writes the message after the element (see `setFieldError`), or takes both off; returns
   * the message. Only the component's own messages (the custom error) are marked and written after a change: what the
   * browser says by itself, such as a required field left empty, is in its language and stays with its bubble on submit.
   * When the browser itself reports the field as invalid (`submitted`), any invalid state marks it, still with no text
   * of its own.
   */
  #report(submitted = false): string {
    const input = this.#input;
    if (input === undefined) {
      return '';
    }

    const { validity } = input;
    const message = validity.customError ? input.validationMessage : '';
    setInvalid(input, submitted ? !validity.valid : validity.customError);
    setFieldError(input, this, message);

    return message;
  }

  #validate(): void {
    this.#input?.setCustomValidity(
      validationMessage(this.#selected(), limitOf(this.getAttribute('max-files')), limitOf(this.getAttribute('max-size'))),
    );
  }

  #item(file: File, disabled: boolean): HTMLLIElement {
    const name = document.createElement('span');
    name.className = 'jus-upload-name';
    name.textContent = file.name;

    const size = document.createElement('span');
    size.className = 'jus-upload-size';
    size.textContent = formatBytes(file.size);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jus-button';
    button.disabled = disabled;
    button.textContent = REMOVE_LABEL;
    button.setAttribute('aria-label', `${REMOVE_LABEL} ${file.name}`);
    button.addEventListener('click', () => {
      this.#remove(file);
    });

    const item = document.createElement('li');
    item.append(name, size, button);

    return item;
  }

  /** Adds the dropped PDFs to the selection, skipping the ones it already has, and notes the other files as ignored. */
  #add(dropped: readonly File[]): void {
    const selected = this.#selected();
    const known = new Set(selected.map(identityOf));
    const added: File[] = [];
    const ignored: File[] = [];
    for (const file of dropped) {
      if (!isPdf(file)) {
        ignored.push(file);
      } else if (!known.has(identityOf(file))) {
        known.add(identityOf(file));
        added.push(file);
      }
    }

    this.#notice = ignored.map((file) => `Somente arquivos PDF: ${file.name} foi ignorado.`).join(' ');
    if (added.length === 0) {
      this.#settle(true);

      return;
    }
    this.#write([...selected, ...added]);
  }

  /**
   * Takes the file out and puts the focus on the next remove button, or on the input when there is none. The redraw
   * keeps the focus by position, but not every browser focuses a button when it is clicked, so it is set here too.
   */
  #remove(file: File): void {
    const selected = this.#selected();
    this.#write(selected.filter((candidate) => candidate !== file));

    const buttons = this.#list.querySelectorAll('button');
    (buttons[selected.indexOf(file)] ?? this.#input)?.focus();
  }

  /**
   * Puts the files in the input the way the browser does when they are chosen, and says so: the input fires `input`
   * and then `change`, which the page and the form around the input may be listening to.
   */
  #write(files: readonly File[]): void {
    const input = this.#input;
    if (input === undefined) {
      return;
    }

    const transfer = new DataTransfer();
    for (const file of files) {
      transfer.items.add(file);
    }
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
