/** A constructable stylesheet: parsed once, then adopted by any number of shadow roots. */
export function sheet(css: string): CSSStyleSheet {
  const created = new CSSStyleSheet();
  created.replaceSync(css);

  return created;
}

/**
 * Rules every component shares, written with the design tokens (custom properties) only,
 * the one styling hook that crosses the Shadow DOM boundary.
 */
const baseSheet = sheet(`
  :host {
    display: block;
    font-family: var(--jus-font-base);
    color: var(--jus-color-body);
  }

  [hidden] {
    display: none !important;
  }

  .visually-hidden {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0, 0, 0, 0) !important;
    white-space: nowrap !important;
    border: 0 !important;
  }

  .jus-button {
    padding: var(--jus-space-1) var(--jus-space-2);
    border: 1px solid var(--jus-color-border);
    border-radius: var(--jus-radius-base);
    background: var(--jus-color-surface);
    color: var(--jus-color-body);
    font: inherit;
    cursor: pointer;
  }

  .jus-button[aria-pressed="true"] {
    background: var(--jus-color-primary);
    color: var(--jus-color-surface);
  }

  :focus-visible {
    /* The page sets --jus-focus-ring to the inverse colour on dark surfaces (base/_focus.scss); inherited here. */
    outline: var(--jus-focus-width) solid var(--jus-focus-ring, var(--jus-focus-color));
    outline-offset: var(--jus-focus-offset);
  }
`);

/**
 * Base class of the Web Components: an open shadow root that adopts the shared base sheet,
 * followed by the sheets of the component itself.
 */
export abstract class JusElement extends HTMLElement {
  protected readonly root: ShadowRoot;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    this.root.adoptedStyleSheets = [baseSheet, ...this.styles()];
  }

  /**
   * The component's own stylesheets, adopted after the base sheet.
   * Called from the constructor, before the subclass fields are initialised: return module-level sheets
   * created once with sheet(), not values read from `this`.
   */
  protected styles(): CSSStyleSheet[] {
    return [];
  }
}
