// Typo tolerance. The edit distance counts the single-character insertions,
// deletions, substitutions and adjacent transpositions needed to turn one word
// into another ("optimal string alignment" distance). A typed "tenis" is one edit
// from "tennis"; "teh" is one edit from "the".

/**
 * The edit distance between `a` and `b`, or `limit + 1` as soon as it is known to
 * exceed `limit`. Stopping early keeps a search over hundreds of words cheap.
 */
export function editDistance(a: string, b: string, limit: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Three rows of the dynamic-programming table are enough: the transposition
  // rule looks two rows back.
  let twoBack: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i];
    let rowMinimum = i;
    for (let j = 1; j <= b.length; j += 1) {
      const same = a[i - 1] === b[j - 1];
      let cost = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + (same ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cost = Math.min(cost, (twoBack[j - 2] as number) + 1);
      }
      current.push(cost);
      if (cost < rowMinimum) rowMinimum = cost;
    }
    if (rowMinimum > limit) return limit + 1;
    twoBack = previous;
    previous = current;
  }
  const distance = previous[b.length] as number;
  return distance > limit ? limit + 1 : distance;
}

/**
 * How many typos a query word may contain and still match: none for short words,
 * where one edit changes the meaning, one for ordinary words, two for long ones.
 */
export function allowedEdits(word: string): number {
  if (word.length < 5) return 0;
  if (word.length < 8) return 1;
  return 2;
}
