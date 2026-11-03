/** The screens below Bootstrap's lg breakpoint (992 px), where the filters of the search are a panel above the results. */
const BELOW_LG = '(max-width: 991.98px)';

/** The panel of the filters, marked by what the server knows about them: "true" when one is applied or has an error. */
const PANEL = 'details[data-jus-filters-active]';

/**
 * Opens the filters panel of the search again when the window grows to lg.
 *
 * The server renders the panel (`<details class="jus-filters" open data-jus-filters-active="…">`) always open, and below lg
 * the inline script right after it (templates/case/_filters_script.html.twig) folds it before the first paint when no
 * filter is applied and no field has an error. From lg up the panel is a column of its own beside the results, its
 * summary hidden while it is open (components/_search.scss): a panel folded on a narrow window would sit there as a bare
 * summary, so it is opened again when the window crosses into lg. When the window narrows the panel is left as it is:
 * the person may be using it. Without JavaScript nothing is folded, so there is nothing to open.
 */
export function installFiltersPanel(document: Document): void {
  const view = document.defaultView;
  const panels = Array.from(document.querySelectorAll<HTMLDetailsElement>(PANEL));
  if (view === null || panels.length === 0) {
    return;
  }

  const belowLg = view.matchMedia(BELOW_LG);
  belowLg.addEventListener('change', () => {
    if (belowLg.matches) {
      return;
    }

    for (const panel of panels) {
      panel.open = true;
    }
  });
}
