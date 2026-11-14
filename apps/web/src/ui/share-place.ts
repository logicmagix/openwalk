// "Share this place": one place's link, handed out as a code to scan, as text to
// copy, and through the device's own sharing where the browser offers it. The
// link names the site and the place and carries nothing else.

import { qrPicture } from './qr';

export interface SharePlaceElements {
  /** The panel itself, a dialog element. */
  readonly dialog: HTMLDialogElement;
  readonly close: HTMLButtonElement;
  /** Where the place is named. */
  readonly name: HTMLElement;
  readonly code: HTMLElement;
  readonly link: HTMLInputElement;
  readonly copy: HTMLButtonElement;
  /** Opens the device's own sharing; shown only where the browser has it. */
  readonly send: HTMLButtonElement;
  readonly status: HTMLElement;
}

export interface SharePlace {
  /** Opens on a place, given what it is called and the link that leads to it. */
  open(label: string, link: string): void;
}

export function setupSharePlace(elements: SharePlaceElements): SharePlace {
  const { dialog } = elements;
  let shown = { label: '', link: '' };

  function say(message: string): void {
    elements.status.textContent = message;
  }

  // The Web Share API hands a link to the phone's own sharing sheet (messages,
  // mail, a nearby device). Not every browser has it, so the button is shown
  // only where it would do something.
  const canSend = typeof navigator.share === 'function';
  elements.send.hidden = !canSend;

  elements.close.addEventListener('click', () => dialog.close());
  // A press on the dimmed page around the panel closes it, as Escape does.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  elements.copy.addEventListener('click', () => {
    // The clipboard may be refused; the link is on show to be copied by hand.
    navigator.clipboard.writeText(shown.link).then(
      () => say('Link copied.'),
      () => {
        elements.link.select();
        say('Select the link and copy it.');
      },
    );
  });

  elements.send.addEventListener('click', () => {
    // Closing the sheet without sending rejects the promise; nothing to report.
    navigator.share({ title: shown.label, url: shown.link }).catch(() => undefined);
  });

  return {
    open(label, link) {
      shown = { label, link };
      say('');
      elements.name.textContent = label;
      elements.link.value = link;
      const picture = qrPicture(link, `A code that opens ${label} on the map`);
      if (picture === null) elements.code.replaceChildren();
      else elements.code.replaceChildren(picture);
      if (!dialog.open) dialog.showModal();
    },
  };
}
