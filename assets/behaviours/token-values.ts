const THEMES = new Set(['light', 'dark']);

/**
 * Writes the value of a design token next to its swatch, in the catalogue's table of colours (templates/design_system/
 * sections/tokens.html.twig): the value the stylesheet gives the custom property in the theme the element names.
 *
 * The values are never written in the page, so the tokens stay their one source: each element marked
 * `data-jus-token-value="--jus-color-page" data-jus-token-theme="dark"` gets, as its text, what the property resolves
 * to inside a scope of that theme (`data-bs-theme`, which assets/styles/tokens/_custom-properties.scss gives each
 * theme's values). Without JavaScript the swatches, which are the properties themselves, still show.
 */
export function installTokenValues(document: Document): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-jus-token-value]');
  if (elements.length === 0) {
    return;
  }

  // One hidden scope per theme, read for every value and taken out again.
  const probes = new Map<string, HTMLElement>();
  const probeFor = (theme: string): HTMLElement => {
    let probe = probes.get(theme);
    if (probe === undefined) {
      probe = document.createElement('span');
      probe.hidden = true;
      probe.dataset.bsTheme = theme;
      probe.dataset.jusTokenProbe = '';
      document.body.append(probe);
      probes.set(theme, probe);
    }

    return probe;
  };

  for (const element of elements) {
    const name = element.dataset.jusTokenValue ?? '';
    const theme = element.dataset.jusTokenTheme ?? '';
    if (name.startsWith('--') && THEMES.has(theme)) {
      element.textContent = getComputedStyle(probeFor(theme)).getPropertyValue(name).trim();
    }
  }

  for (const probe of probes.values()) {
    probe.remove();
  }
}
