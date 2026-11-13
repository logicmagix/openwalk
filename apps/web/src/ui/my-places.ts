// "My places": what someone has saved on this site, in one panel. Each saved
// place and walk can be removed here; the lot can be sent to another device as
// a code to scan, a link to paste or a file; and places sent from elsewhere can
// be added. The panel owns no data: it shows what it is given and reports what
// the person asks for.

import { qrPicture } from './qr';

export interface MyPlacesElements {
  /** The panel itself, a dialog element. */
  readonly dialog: HTMLDialogElement;
  readonly close: HTMLButtonElement;
  /** Where the saved places and walks are listed. */
  readonly list: HTMLElement;
  readonly clearRecent: HTMLButtonElement;
  /** Everything about sending, hidden when there is nothing to send. */
  readonly share: HTMLElement;
  readonly code: HTMLElement;
  readonly link: HTMLInputElement;
  readonly copy: HTMLButtonElement;
  readonly saveFile: HTMLButtonElement;
  readonly pasted: HTMLInputElement;
  readonly add: HTMLButtonElement;
  readonly file: HTMLInputElement;
  readonly status: HTMLElement;
}

/** One row of the list: what it is called and what removing it does. */
export interface KeptItem {
  readonly label: string;
  /** "Saved place" or "Saved route". */
  readonly kind: string;
  readonly remove: () => void;
}

export interface MyPlacesOptions {
  /** The saved places and walks, in the order to list them. */
  readonly items: () => KeptItem[];
  readonly recentCount: () => number;
  readonly clearRecent: () => void;
  /** A link carrying everything saved, or null when nothing is. */
  readonly link: () => string | null;
  /** A file carrying everything saved. */
  readonly file: () => { readonly name: string; readonly text: string };
  /** Adds what the text holds; returns what to tell the person. */
  readonly add: (text: string) => string;
}

export interface MyPlaces {
  open(): void;
  /** Opens with a link ready in the box, for the person to accept or leave. */
  offer(link: string, message: string): void;
}

const EMPTY = 'Nothing saved yet. Open a place and press its star to save it.';

export function setupMyPlaces(elements: MyPlacesElements, options: MyPlacesOptions): MyPlaces {
  const { dialog } = elements;

  function say(message: string): void {
    elements.status.textContent = message;
  }

  function row(item: KeptItem): HTMLLIElement {
    const entry = document.createElement('li');
    const text = document.createElement('span');
    text.className = 'kept-text';
    const label = document.createElement('span');
    label.textContent = item.label;
    const kind = document.createElement('small');
    kind.textContent = item.kind;
    text.append(label, kind);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'kept-remove';
    remove.textContent = 'Remove';
    // Named in full for a screen reader, which hears the buttons out of their rows.
    remove.setAttribute('aria-label', `Remove ${item.label}`);
    remove.addEventListener('click', () => {
      item.remove();
      say(`Removed ${item.label}.`);
      render();
      // The button pressed is gone; the focus goes somewhere that still exists.
      elements.close.focus();
    });
    entry.append(text, remove);
    return entry;
  }

  function render(): void {
    const items = options.items();
    if (items.length === 0) {
      const none = document.createElement('p');
      none.className = 'kept-none';
      none.textContent = EMPTY;
      elements.list.replaceChildren(none);
    } else {
      const list = document.createElement('ul');
      list.className = 'kept-list';
      list.append(...items.map(row));
      elements.list.replaceChildren(list);
    }
    elements.clearRecent.hidden = options.recentCount() === 0;

    const link = options.link();
    elements.share.hidden = link === null;
    if (link !== null) {
      elements.link.value = link;
      const picture = qrPicture(link, 'A code that carries your saved places');
      if (picture === null) {
        const note = document.createElement('p');
        note.textContent = 'There is too much here for one code. Use the link or the file.';
        elements.code.replaceChildren(note);
      } else {
        elements.code.replaceChildren(picture);
      }
    }
  }

  function add(text: string): void {
    say(options.add(text));
    render();
  }

  elements.close.addEventListener('click', () => dialog.close());
  // A press on the dimmed page around the panel closes it, as Escape does.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  elements.clearRecent.addEventListener('click', () => {
    options.clearRecent();
    say('Recent places cleared.');
    render();
    elements.close.focus();
  });

  elements.copy.addEventListener('click', () => {
    const link = elements.link.value;
    // The clipboard may be refused; the link is on show to be copied by hand.
    navigator.clipboard.writeText(link).then(
      () => say('Link copied.'),
      () => {
        elements.link.select();
        say('Select the link and copy it.');
      },
    );
  });

  elements.saveFile.addEventListener('click', () => {
    const { name, text } = options.file();
    const address = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = address;
    anchor.download = name;
    anchor.click();
    // Let the save begin before the address is given up.
    window.setTimeout(() => URL.revokeObjectURL(address), 10_000);
    say(`Saved as ${name}.`);
  });

  elements.add.addEventListener('click', () => {
    add(elements.pasted.value);
    elements.pasted.value = '';
  });
  elements.pasted.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      elements.add.click();
    }
  });

  elements.file.addEventListener('change', () => {
    const chosen = elements.file.files?.[0];
    if (chosen === undefined) return;
    chosen.text().then(
      (text) => add(text),
      () => say('That file could not be read.'),
    );
    // Choosing the same file again should count as a new choice.
    elements.file.value = '';
  });

  function open(): void {
    say('');
    render();
    if (!dialog.open) dialog.showModal();
  }

  return {
    open,
    offer(link, message) {
      open();
      elements.pasted.value = link;
      say(message);
      elements.add.focus();
    },
  };
}
