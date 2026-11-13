// Turning text into comparable tokens. Both the index and the query go through the
// same function, so "Café", "cafe" and "CAFE " all become the token "cafe".

/**
 * Lowercase, strip accents, drop apostrophes, and replace every other run of
 * punctuation or whitespace with a single space.
 *
 * NFKD decomposition splits an accented letter into the base letter and a separate
 * combining mark (U+0300 to U+036F), which the regular expression then removes.
 */
export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The normalized words of a text, in order, without empties. */
export function tokenize(text: string): string[] {
  const normalized = normalize(text);
  return normalized === '' ? [] : normalized.split(' ');
}
