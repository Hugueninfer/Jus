import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles/app.scss';

// Bootstrap behaviour used by the layout and the components (data attributes, no Popper needed).
import 'bootstrap/js/dist/alert';
import 'bootstrap/js/dist/offcanvas';

// The Web Components (registered as custom elements on load).
import './components';

// Layout behaviours: focus after a dismissed alert, scroll regions as tab stops only while they overflow, forms sent once,
// the theme switcher, and the filters of the search folded below lg when none is in use.
import './behaviours';
