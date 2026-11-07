// The search box: a text field with a list of destinations under it. With nothing
// typed it lists every destination, so it doubles as the destination dropdown;
// typing narrows and ranks the list. Built on the combobox pattern so a keyboard
// or a screen reader can drive it.

import type { PlaceFeature } from '@openwalk/search';
import type { Listing } from './listing';

export interface SearchElements {
  readonly input: HTMLInputElement;
  readonly list: HTMLUListElement;
  readonly clear: HTMLButtonElement;
}

export interface SearchHandlers {
  readonly listFor: (query: string) => Listing[];
  readonly onChoose: (place: PlaceFeature) => void;
}

export function setupSearch(elements: SearchElements, handlers: SearchHandlers): void {
  const { input, list, clear } = elements;
  let items: Listing[] = [];
  let active = -1;

  function render(): void {
    list.replaceChildren(
      ...items.map((item, index) => {
        const option = document.createElement('li');
        option.id = `${list.id}-${index}`;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(index === active));
        option.className = index === active ? 'active' : '';
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
        // of selecting; the list is kept open through the drag by the handlers
        // further down.
        option.addEventListener('click', () => choose(index));
        return option;
      }),
    );
    const open = items.length > 0;
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    const current = active >= 0 ? `${list.id}-${active}` : '';
    if (current) input.setAttribute('aria-activedescendant', current);
    else input.removeAttribute('aria-activedescendant');
    list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
    clear.hidden = input.value === '';
  }

  function open(): void {
    items = handlers.listFor(input.value);
    active = -1;
    render();
  }

  function close(): void {
    items = [];
    active = -1;
    render();
  }

  function choose(index: number): void {
    const item = items[index];
    if (item === undefined) return;
    input.value = item.label;
    close();
    input.blur();
    handlers.onChoose(item.place);
  }

  input.addEventListener('focus', open);
  input.addEventListener('input', open);

  // The list closes on an outside tap, Escape, or a choice — not on the input's
  // blur by itself, so a finger can scroll the list (which blurs the input)
  // without it vanishing. A keyboard tab-away still closes it, through the
  // guarded blur, since no pointer is on the list then.
  let pointerInList = false;
  list.addEventListener('pointerdown', () => {
    pointerInList = true;
  });
  window.addEventListener(
    'pointerup',
    () => {
      pointerInList = false;
    },
    true,
  );
  input.addEventListener('blur', () => {
    if (!pointerInList) close();
  });
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
  clear.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    input.value = '';
    input.focus();
    open();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (items.length === 0) open();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + items.length) % items.length;
      render();
      event.preventDefault();
    } else if (event.key === 'Enter') {
      if (active >= 0) choose(active);
      else if (items.length > 0) choose(0);
      event.preventDefault();
    } else if (event.key === 'Escape') {
      close();
      input.blur();
    }
  });
}
