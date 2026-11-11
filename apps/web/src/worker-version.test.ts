import { describe, expect, it } from 'vitest';
import { listing, stampWorker } from './worker-version';

describe('listing', () => {
  it('does not depend on the order the files were found in', () => {
    const a = listing([
      ['assets/app.js', 'aa'],
      ['sites/park/places.geojson', 'bb'],
    ]);
    const b = listing([
      ['sites/park/places.geojson', 'bb'],
      ['assets/app.js', 'aa'],
    ]);
    expect(a).toBe(b);
  });

  it('changes when a site data file changes, though no script did', () => {
    const before = listing([
      ['assets/app.js', 'aa'],
      ['sites/park/walkways.geojson', 'bb'],
    ]);
    const after = listing([
      ['assets/app.js', 'aa'],
      ['sites/park/walkways.geojson', 'cc'],
    ]);
    expect(after).not.toBe(before);
  });

  it('changes when a file is added or renamed', () => {
    const one = listing([['assets/app.js', 'aa']]);
    expect(listing([['assets/main.js', 'aa']])).not.toBe(one);
    expect(
      listing([
        ['assets/app.js', 'aa'],
        ['sites/park/overlays.json', 'dd'],
      ]),
    ).not.toBe(one);
  });
});

describe('stampWorker', () => {
  const source =
    "// worker\nconst VERSION = '__BUILD_ID__';\nconst CACHE = `openwalk-${VERSION}`;\n";

  it('sets the version', () => {
    expect(stampWorker(source, 'abc123')).toContain("const VERSION = 'abc123';");
  });

  it('replaces an earlier stamp', () => {
    const again = stampWorker(stampWorker(source, 'first'), 'second');
    expect(again).toContain("const VERSION = 'second';");
    expect(again).not.toContain('first');
  });

  it('leaves the rest of the worker alone', () => {
    expect(stampWorker(source, 'x')).toBe(source.replace('__BUILD_ID__', 'x'));
  });

  it('refuses a file with no version line', () => {
    expect(() => stampWorker('// nothing here\n', 'x')).toThrow(/VERSION/);
  });
});
