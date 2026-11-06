// The search box: a text field with a list of destinations under it. With nothing
// typed it lists every destination, so it doubles as the destination dropdown;
// typing narrows and ranks the list. Built on the combobox pattern so a keyboard
// or a screen reader can drive it.

import type { PlaceFeature } from '@openwalk/search';
import type { Listing } from './listing';

export interface SearchElements {
  readonly input: HTMLInputElement;
  readonly list: HTMLUListElement;
}

export interface SearchHandlers {
  readonly listFor: (query: string) => Listing[];
  readonly onChoose: (place: PlaceFeature) => void;
}

export function setupSearch(elements: SearchElements, handlers: SearchHandlers): void {
  const { input, list } = elements;
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
        // pointerdown fires before the input loses focus, so the choice wins
        // over the blur that would close the list.
        option.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          choose(index);
        });
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
  input.addEventListener('blur', close);
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
