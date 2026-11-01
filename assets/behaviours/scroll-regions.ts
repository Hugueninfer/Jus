/**
 * Makes a scrollable region a keyboard tab stop only while it really overflows.
 *
 * A region that scrolls sideways has to be reachable with the keyboard, or its hidden columns are out of reach; but
 * a tab stop on a region that fits is noise. The server renders `tabindex="0"` (the safe default without JavaScript)
 * and this removes it for the regions that do not overflow, putting it back if they start to (a narrower window, a
 * larger font, wider content). The `role="region"` and the `aria-label` stay either way.
 *
 * Regions are the elements marked with `data-jus-scroll-region`.
 */
export function installScrollRegions(document: Document): void {
  // What is observed (the region and the elements inside it) mapped to the region to update when it changes size.
  const regionOf = new Map<Element, Element>();
  const observer = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const region = regionOf.get(target);
      if (region !== undefined) {
        update(region);
      }
    }
  });

  for (const region of document.querySelectorAll('[data-jus-scroll-region]')) {
    update(region);
    // The region changes size with the window; its content, with fonts loading or text changing.
    for (const observed of [region, ...region.children]) {
      regionOf.set(observed, region);
      observer.observe(observed);
    }
  }
}

function update(region: Element): void {
  if (region.scrollWidth > region.clientWidth) {
    region.setAttribute('tabindex', '0');
  } else {
    region.removeAttribute('tabindex');
  }
}
