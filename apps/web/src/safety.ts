// The numbers a site lists for someone who needs help: emergency services, the
// site's own security office, a helpline. They are the site's to choose, since
// they differ from one place and one country to the next.

/** One number, as a site's configuration gives it. */
export interface SafetyContact {
  /** Who answers, for example "Emergency" or "Campus security". */
  readonly label: string;
  /** The number as people write it, for example "(352) 555-0100" or "911". */
  readonly number: string;
  /** A few words on when to use it or when it is answered. */
  readonly note?: string;
}

/**
 * The address that hands a number to the phone's dialer. A `tel:` address takes
 * digits only, with a leading plus for a number given with its country code, so
 * the spaces, brackets and hyphens people write are dropped.
 */
export function telHref(number: string): string {
  const digits = number.replace(/\D/g, '');
  return `tel:${number.trim().startsWith('+') ? '+' : ''}${digits}`;
}
