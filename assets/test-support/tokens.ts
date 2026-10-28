// The real design tokens: the :root block that assets/styles/tokens/_custom-properties.scss emits, compiled by Vite
// from the same Sass files the page uses, so tests never keep a second copy of the palette.
import tokensCss from '../styles/tokens/_custom-properties.scss?inline';

const tokensSheet = new CSSStyleSheet();
tokensSheet.replaceSync(tokensCss);

/**
 * Puts the --jus-* custom properties on the document, as the page stylesheet does, so computed styles
 * (and axe-core's colour-contrast rule) see the real palette. Returns the function that takes them off again.
 */
export function installTokens(): () => void {
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, tokensSheet];

  return () => {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((installed) => installed !== tokensSheet);
  };
}
