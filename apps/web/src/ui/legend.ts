// The legend: a button that opens a list of the site's kinds of place, each with
// the colour of its dots and a checkbox. Unticking a kind takes its places off the
// map, to thin out a busy one; search still finds every place. The control owns no
// map state: it reports the hidden kinds and the caller restyles.

import type { Category } from '../categories';

export interface LegendElements {
  readonly button: HTMLButtonElement;
  readonly panel: HTMLElement;
}

export interface LegendOptions {
  readonly categories: readonly Category[];
  /** Called with the ids of the kinds now hidden whenever a checkbox changes. */
  readonly onChange: (hidden: string[]) => void;
}

/** A link at the foot of the legend, for something that is not about the map itself. */
export interface LegendLink {
  readonly label: string;
  readonly path: string;
}

export interface Legend {
  /** Adds a link at the foot of the panel. */
  addLink(link: LegendLink): void;
}

/** One kind of place: its colour, its name, how many there are, and its switch. */
function row(category: Category, onToggle: (shown: boolean) => void): HTMLElement {
  const label = document.createElement('label');
  label.className = 'legend-row';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = true;
  input.addEventListener('change', () => onToggle(input.checked));
  // The swatch carries both shades; the stylesheet shows the one for the theme.
  const swatch = document.createElement('span');
  swatch.className = 'kind-swatch';
  swatch.setAttribute('aria-hidden', 'true');
  swatch.style.setProperty('--swatch-light', category.colour.light);
  swatch.style.setProperty('--swatch-dark', category.colour.dark);
  const name = document.createElement('span');
  name.className = 'legend-name';
  name.textContent = category.label;
  const count = document.createElement('span');
  count.className = 'legend-count';
  count.textContent = String(category.count);
  label.append(input, swatch, name, count);
  return label;
}

export function setupLegend(elements: LegendElements, options: LegendOptions): Legend {
  const { button, panel } = elements;
  const hidden = new Set<string>();

  const rows = document.createElement('div');
  rows.className = 'legend-rows';
  for (const category of options.categories) {
    rows.append(
      row(category, (shown) => {
        if (shown) hidden.delete(category.id);
        else hidden.add(category.id);
        options.onChange([...hidden]);
      }),
    );
  }
  const links = document.createElement('div');
  links.className = 'legend-links';
  links.hidden = true;
  panel.append(rows, links);

  let open = false;
  function setOpen(next: boolean): void {
    open = next;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  }

  button.addEventListener('click', () => setOpen(!open));
  // A tap or click outside the control, and Escape, close the panel.
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Node;
    if (open && !panel.contains(target) && !button.contains(target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      setOpen(false);
      button.focus();
    }
  });

  // With no kinds there is nothing to explain or filter, so the button stays away.
  button.hidden = options.categories.length === 0;
  button.disabled = false;

  return {
    addLink(link) {
      const anchor = document.createElement('a');
      anchor.href = link.path;
      anchor.textContent = link.label;
      links.append(anchor);
      links.hidden = false;
      button.hidden = false;
    },
  };
}
