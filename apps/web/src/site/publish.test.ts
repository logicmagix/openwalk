import { describe, expect, it } from 'vitest';
import {
  isInsideSite,
  isTrace,
  publishedOverlays,
  publishedSettings,
  withheldOverlays,
} from './publish';

const settings = {
  id: 'park',
  overlays: [
    { id: 'official-map', publish: false },
    { id: 'trail-map' },
    { id: 'events-map', publish: true },
  ],
};

describe('withheldOverlays', () => {
  it('names only the overlays set not to be published', () => {
    expect([...withheldOverlays(settings)]).toEqual(['official-map']);
  });

  it('is empty for a site with no overlays', () => {
    expect(withheldOverlays({}).size).toBe(0);
  });
});

describe('publishedOverlays', () => {
  const document = {
    overlays: [
      { id: 'official-map', image: 'overlay/official-map.png' },
      { id: 'trail-map', image: 'overlay/trail-map.png' },
    ],
  };

  it('leaves out the overlays held back and keeps the rest', () => {
    const published = publishedOverlays(document, withheldOverlays(settings));
    expect(published.overlays.map((overlay) => overlay.id)).toEqual(['trail-map']);
  });

  it('keeps everything when nothing is held back', () => {
    expect(publishedOverlays(document, new Set())).toEqual(document);
  });
});

describe('publishedSettings', () => {
  it('drops the settings of overlays held back', () => {
    expect(publishedSettings(settings).overlays.map((overlay) => overlay.id)).toEqual([
      'trail-map',
      'events-map',
    ]);
    expect(publishedSettings(settings).id).toBe('park');
  });

  it('leaves a site with no overlays as it is', () => {
    const plain: { id: string; overlays?: [] } = { id: 'park' };
    expect(publishedSettings(plain)).toBe(plain);
  });
});

describe('isInsideSite', () => {
  it('accepts a path within the site directory', () => {
    expect(isInsideSite('overlay/official-map.png')).toBe(true);
  });

  it('refuses a path that climbs out or starts at the root', () => {
    expect(isInsideSite('../other-site/overlay/map.png')).toBe(false);
    expect(isInsideSite('overlay/../../secret.png')).toBe(false);
    expect(isInsideSite('/etc/passwd')).toBe(false);
    expect(isInsideSite('')).toBe(false);
  });
});

describe('isTrace', () => {
  it('accepts a recorded walk and nothing else', () => {
    expect(isTrace('demo-walk.gpx')).toBe(true);
    expect(isTrace('notes.txt')).toBe(false);
    expect(isTrace('../demo-walk.gpx')).toBe(false);
  });
});
