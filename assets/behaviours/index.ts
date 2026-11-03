import { installAlertFocus } from './alert-focus';
import { installScrollRegions } from './scroll-regions';
import { installSubmitOnce } from './submit-once';
import { installThemeSwitcher } from './theme-switcher';

function install(): void {
  installAlertFocus(document);
  installScrollRegions(document);
  installSubmitOnce(document);
  installThemeSwitcher(document);
}

// Scripts are deferred, so the document is usually parsed already by now; wait for it only when it is not.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true });
} else {
  install();
}
