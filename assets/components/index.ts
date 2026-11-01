import { JusFiltroTimeline } from './jus-filtro-timeline';
import { JusNumeroProcesso } from './jus-numero-processo';

/**
 * Registers a custom element unless the name is taken, so loading the bundle twice (or two bundles on one page)
 * never throws.
 */
export function define(name: string, constructor: CustomElementConstructor): void {
  if (customElements.get(name) === undefined) {
    customElements.define(name, constructor);
  }
}

// Components are registered here, one `define()` call each, as they are added.
define('jus-numero-processo', JusNumeroProcesso);
define('jus-filtro-timeline', JusFiltroTimeline);
