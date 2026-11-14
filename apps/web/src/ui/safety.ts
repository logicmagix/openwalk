// "Safety": the numbers the site lists for someone who needs help. Each row is a
// link that hands its number to the phone's dialer; the phone asks before it
// calls. The app makes no call and no request of its own.

import { telHref, type SafetyContact } from '../safety';

export interface SafetyElements {
  /** The panel itself, a dialog element. */
  readonly dialog: HTMLDialogElement;
  readonly close: HTMLButtonElement;
  /** Where the numbers are listed. */
  readonly list: HTMLElement;
}

export interface Safety {
  open(): void;
}

function row(contact: SafetyContact): HTMLLIElement {
  const entry = document.createElement('li');
  const link = document.createElement('a');
  link.className = 'safety-row';
  link.href = telHref(contact.number);
  const label = document.createElement('span');
  label.className = 'safety-label';
  label.textContent = contact.label;
  const number = document.createElement('span');
  number.className = 'safety-number';
  number.textContent = contact.number;
  link.append(label, number);
  if (contact.note !== undefined) {
    const note = document.createElement('small');
    note.textContent = contact.note;
    link.append(note);
  }
  entry.append(link);
  return entry;
}

export function setupSafety(elements: SafetyElements, contacts: readonly SafetyContact[]): Safety {
  const { dialog } = elements;
  const list = document.createElement('ul');
  list.className = 'safety-list';
  list.append(...contacts.map(row));
  elements.list.replaceChildren(list);

  elements.close.addEventListener('click', () => dialog.close());
  // A press on the dimmed page around the panel closes it, as Escape does.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  return {
    open() {
      if (!dialog.open) dialog.showModal();
    },
  };
}
