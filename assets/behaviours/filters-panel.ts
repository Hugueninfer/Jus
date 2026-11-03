/** The screens below Bootstrap's lg breakpoint (992 px), where the filters of the search are a panel above the results. */
const BELOW_LG = '(max-width: 991.98px)';

/** The panel of the filters, marked by what the server knows about them: "true" when one is in use or has an error. */
const PANEL = 'details[data-jus-filters-active]';

/**
 * Folds the filters of the search on a phone or a tablet when none is in use, so the results come first.
 *
 * The server renders the panel (`<details class="jus-filters" open data-jus-filters-active="…">`) always open: without
 * JavaScript the filters are simply there, on every screen. From lg up the panel is a column of its own beside the
 * results, its summary hidden (components/_search.scss), and it is never folded. Below lg, on load, this folds a panel
 * the server marked `data-jus-filters-active="false"` (no filter in use and no field with an error); one with a filter
 * or an error stays open, where the person sees what the results were filtered by, or what to fix. The summary
 * ("Filtrar", with the number of filters in use) opens it again.
 *
 * A panel folded on a narrow window is opened again when the window grows to lg, since its summary is hidden there and
 * nothing could open it any more. When the window narrows the panel is left as it is: the person may be using it.
 */
export function installFiltersPanel(document: Document): void {
  const view = document.defaultView;
  const panels = Array.from(document.querySelectorAll<HTMLDetailsElement>(PANEL));
  if (view === null || panels.length === 0) {
    return;
  }

  const belowLg = view.matchMedia(BELOW_LG);
  if (belowLg.matches) {
    for (const panel of panels) {
      if (panel.dataset.jusFiltersActive === 'false') {
        panel.open = false;
      }
    }
  }

  belowLg.addEventListener('change', () => {
    if (belowLg.matches) {
      return;
    }

    for (const panel of panels) {
      panel.open = true;
    }
  });
}
