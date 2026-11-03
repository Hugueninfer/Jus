import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles/app.scss';

// Bootstrap behaviour used by the layout and the components (data attributes, no Popper needed).
import 'bootstrap/js/dist/alert';
import 'bootstrap/js/dist/offcanvas';

// The Web Components (registered as custom elements on load).
import './components';

// Layout behaviours: focus after a dismissed alert, scroll regions as tab stops only while they overflow, forms sent once,
// the theme switcher, the filters of the search opened again when the window grows to lg (an inline script folds them
// below lg), and the values of the tokens in the catalogue.
import './behaviours';
