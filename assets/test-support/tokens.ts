// The real design tokens: the :root block that assets/styles/tokens/_custom-properties.scss emits, compiled by Vite
// from the same Sass files the page uses, so tests never keep a second copy of the palette.
import tokensCss from '../styles/tokens/_custom-properties.scss?inline';

export type Theme = 'light' | 'dark';

const COLOR_MODE_ATTRIBUTE = 'data-bs-theme';

const tokensSheet = new CSSStyleSheet();
tokensSheet.replaceSync(tokensCss);

// What the page stylesheet does with two of the tokens: paints the page and sets the text on it. Without it axe-core
// would measure the text of a dark-theme test against the white canvas of a bare document.
const pageSheet = new CSSStyleSheet();
pageSheet.replaceSync('body { background-color: var(--jus-color-page); color: var(--jus-color-text); }');

/**
 * Puts the --jus-* custom properties on the document, as the page stylesheet does, so computed styles
 * (and axe-core's colour-contrast rule) see the real palette. The dark theme also sets data-bs-theme="dark" on <html>,
 * the attribute the page carries in that theme, for as long as the tokens are installed.
 * Returns the function that takes it all off again.
 */
export function installTokens(theme: Theme = 'light'): () => void {
  const root = document.documentElement;
  const previousMode = root.getAttribute(COLOR_MODE_ATTRIBUTE);

  if (theme === 'dark') {
    root.setAttribute(COLOR_MODE_ATTRIBUTE, 'dark');
  }
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, tokensSheet, pageSheet];

  return () => {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((installed) => installed !== tokensSheet && installed !== pageSheet);
    if (theme === 'dark') {
      if (previousMode === null) {
        root.removeAttribute(COLOR_MODE_ATTRIBUTE);
      } else {
        root.setAttribute(COLOR_MODE_ATTRIBUTE, previousMode);
      }
    }
  };
}
