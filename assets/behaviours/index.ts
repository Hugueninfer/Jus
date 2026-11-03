import { installAlertFocus } from './alert-focus';
import { installFiltersPanel } from './filters-panel';
import { installScrollRegions } from './scroll-regions';
import { installSubmitOnce } from './submit-once';
import { installThemeSwitcher } from './theme-switcher';
import { installTokenValues } from './token-values';

function install(): void {
  installAlertFocus(document);
  installFiltersPanel(document);
  installScrollRegions(document);
  installSubmitOnce(document);
  installThemeSwitcher(document);
  installTokenValues(document);
}

// Scripts are deferred, so the document is usually parsed already by now; wait for it only when it is not.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true });
} else {
  install();
}
