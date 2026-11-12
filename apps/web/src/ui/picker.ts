// The page at the root address of a host that serves several sites: a short
// list of its maps, each a link to that site's own page.

import { APP_NAME } from '../site/pages';

export interface PickerElements {
  readonly root: HTMLElement;
  readonly list: HTMLUListElement;
  /** The link to the privacy page at the foot of the list. */
  readonly privacy: HTMLAnchorElement;
}

export interface PickerEntry {
  readonly name: string;
  /** The address of the site's map. */
  readonly path: string;
}

export function showPicker(
  elements: PickerElements,
  entries: readonly PickerEntry[],
  privacyPath: string,
): void {
  elements.privacy.href = privacyPath;
  elements.list.replaceChildren(
    ...entries.map((entry) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = entry.path;
      link.textContent = entry.name;
      item.append(link);
      return item;
    }),
  );
  document.title = APP_NAME;
  // The map and its controls belong to a site; none is chosen yet.
  document.body.classList.add('picking');
  elements.root.hidden = false;
}
