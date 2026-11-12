// The search box: a text field with a list under it. Typing ranks the places
// against the text. With nothing typed the list is for browsing: every place on a
// small site, or the kinds of place on a larger one, each opening onto its own
// places. Built on the combobox pattern so a keyboard or a screen reader can
// drive it.

import type { PlaceFeature } from '@openwalk/search';
import { ALL_PLACES, type Listing } from './listing';

export interface SearchElements {
  readonly input: HTMLInputElement;
  readonly list: HTMLUListElement;
  readonly clear: HTMLButtonElement;
}

export interface SearchHandlers {
  /** The rows for the text typed and the kind of place being browsed, if any. */
  readonly listFor: (query: string, browsing: string | null) => Listing[];
  readonly onChoose: (place: PlaceFeature) => void;
}

export function setupSearch(elements: SearchElements, handlers: SearchHandlers): void {
  const { input, list, clear } = elements;
  let items: Listing[] = [];
  let active = -1;
  // The kind of place whose places are listed, while browsing with nothing typed.
  let browsing: string | null = null;

  function rowFor(item: Listing, index: number): HTMLLIElement {
    const option = document.createElement('li');
    option.id = `${list.id}-${index}`;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(index === active));
    option.className = [item.kind, index === active ? 'active' : ''].join(' ').trim();
    if (item.kind === 'category') {
      // The same dot as on the map and in the legend; the stylesheet picks the
      // shade for the theme.
      const swatch = document.createElement('span');
      swatch.className = 'kind-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style.setProperty('--swatch-light', item.category.colour.light);
      swatch.style.setProperty('--swatch-dark', item.category.colour.dark);
      option.append(swatch);
    }
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = item.label;
    option.append(label);
    if (item.detail !== '') {
      const detail = document.createElement('span');
      detail.className = 'detail';
      detail.textContent = item.detail;
      option.append(detail);
    }
    // click (not pointerdown) so dragging a finger scrolls the list instead
    // of selecting. The item is captured here, not looked up by index later,
    // so the choice holds even if the list has since changed.
    option.addEventListener('click', () => choose(item));
    return option;
  }

  function render(): void {
    list.replaceChildren(...items.map(rowFor));
    const open = items.length > 0;
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    const current = active >= 0 ? `${list.id}-${active}` : '';
    if (current) input.setAttribute('aria-activedescendant', current);
    else input.removeAttribute('aria-activedescendant');
    list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
    clear.hidden = input.value === '';
  }

  /** Lists the rows for the text as it stands. */
  function show(): void {
    items = handlers.listFor(input.value, browsing);
    active = -1;
    render();
  }

  /** Opens the list afresh, at the top level of browsing. */
  function open(): void {
    browsing = null;
    show();
  }

  function close(): void {
    items = [];
    active = -1;
    browsing = null;
    render();
  }

  function choose(item: Listing | undefined): void {
    if (item === undefined) return;
    if (item.kind === 'place') {
      input.value = item.label;
      close();
      input.blur();
      handlers.onChoose(item.place);
      return;
    }
    // A kind of place, every place, or the way back: the list stays open on
    // other rows.
    if (item.kind === 'category') browsing = item.category.id;
    else browsing = item.kind === 'all' ? ALL_PLACES : null;
    show();
    list.scrollTop = 0;
  }

  input.addEventListener('focus', open);
  input.addEventListener('input', open);

  // The list closes on an outside tap, on Escape, or when a place is chosen —
  // never on the input losing focus. Tapping a row blurs the input, and so does a
  // finger scrolling the list; closing on blur would remove the row before the tap
  // landed (which silently broke selecting a new place) and cut a scroll short.
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Node;
    if (
      items.length > 0 &&
      !input.contains(target) &&
      !list.contains(target) &&
      !clear.contains(target)
    ) {
      close();
    }
  });

  // The clear button empties the field and reopens the full list. pointerdown +
  // preventDefault keeps the input focused, so there is no blur-close race.
  const clearSearch = (): void => {
    input.value = '';
    input.focus();
    open();
  };
  clear.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    clearSearch();
  });
  // Enter or Space on the button arrives as a click with no pointer behind it
  // (detail 0); a click that follows a tap has already been handled above.
  clear.addEventListener('click', (event) => {
    if (event.detail === 0) clearSearch();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (items.length === 0) open();
      if (items.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + items.length) % items.length;
      render();
      event.preventDefault();
    } else if (event.key === 'Enter') {
      // With a row highlighted, Enter takes it. With none, it takes the best
      // match for what was typed; while browsing there is no best row to assume.
      if (active >= 0) choose(items[active]);
      else if (input.value.trim() !== '') choose(items[0]);
      event.preventDefault();
    } else if (event.key === 'Backspace' && input.value === '' && browsing !== null) {
      // Nothing left to delete: step back out of the kind being browsed.
      browsing = null;
      show();
    } else if (event.key === 'Escape') {
      // Close the list and stay in the box: letting go of the focus would send
      // a keyboard back to the top of the page.
      close();
      event.preventDefault();
    }
  });
}
