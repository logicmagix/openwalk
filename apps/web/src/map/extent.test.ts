import { describe, expect, it } from 'vitest';
import type { PlacesDocument, WalkwaysDocument } from '../site/types';
import {
  clampToExtent,
  distanceOutsideM,
  isOnSite,
  minZoomFor,
  siteExtent,
  zoomRoom,
  type Extent,
} from './extent';

const places = (coords: [number, number][]): PlacesDocument => ({
  type: 'FeatureCollection',
  features: coords.map((c, i) => ({
    type: 'Feature',
    id: `p${i}`,
    geometry: { type: 'Point', coordinates: c },
    properties: { name: `P${i}`, category: 'x', keywords: [], verified: false },
  })),
});

const walkways = (lines: [number, number][][]): WalkwaysDocument => ({
  type: 'FeatureCollection',
  features: lines.map((coordinates) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates },
    properties: { source: 'osm', highway: 'footway' },
  })),
});

describe('siteExtent', () => {
  it('is null for a site with nothing in it', () => {
    expect(siteExtent(places([]), walkways([]))).toBeNull();
  });

  it('covers walkways that run past the outermost places', () => {
    const extent = siteExtent(
      places([
        [0, 0],
        [0.01, 0.01],
      ]),
      walkways([
        [
          [0.005, 0.005],
          [0.03, -0.02],
        ],
      ]),
    );
    expect(extent).not.toBeNull();
    if (extent === null) return;
    const [[west, south], [east, north]] = extent;
    expect(west).toBeLessThan(0);
    expect(south).toBeLessThan(-0.02);
    expect(east).toBeGreaterThan(0.03);
    expect(north).toBeGreaterThan(0.01);
  });

  it('adds only a small margin', () => {
    const extent = siteExtent(places([[10, 50]]), walkways([]));
    expect(extent).not.toBeNull();
    if (extent === null) return;
    const [[west, south], [east, north]] = extent;
    // Tens of meters, not hundreds: well under a thousandth of a degree north-south.
    expect(north - south).toBeGreaterThan(0);
    expect(north - south).toBeLessThan(0.002);
    // The same distance is more degrees east-west away from the equator.
    expect(east - west).toBeGreaterThan(north - south);
  });

  it('includes area walkways drawn as polygons', () => {
    const area: WalkwaysDocument = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [1, 1],
                [1.5, 1],
                [1.5, 1.5],
                [1, 1],
              ],
            ],
          },
          properties: { source: 'osm', highway: 'pedestrian' },
        },
      ],
    };
    const extent = siteExtent(places([]), area);
    expect(extent?.[1][0]).toBeGreaterThan(1.5);
  });
});

describe('clampToExtent', () => {
  const extent: Extent = [
    [0, 10],
    [2, 12],
  ];

  it('leaves a point inside alone', () => {
    expect(clampToExtent([1, 11], extent)).toEqual([1, 11]);
  });

  it('pulls a point outside back to the nearest edge', () => {
    expect(clampToExtent([-1, 11], extent)).toEqual([0, 11]);
    expect(clampToExtent([5, 20], extent)).toEqual([2, 12]);
  });
});

describe('minZoomFor', () => {
  // One degree of longitude at the equator is 1/360 of the world: at zoom z it
  // spans 512 * 2^z / 360 pixels.
  const square: Extent = [
    [0, -0.5],
    [1, 0.5],
  ];

  it('lets the whole extent fit the shorter side of the screen', () => {
    const zoom = minZoomFor(square, 400, 800);
    const pixelsAcross = (512 * 2 ** zoom) / 360;
    expect(pixelsAcross).toBeLessThan(400);
    expect(pixelsAcross).toBeGreaterThan(200);
  });

  it('does not depend on which way the screen is held', () => {
    expect(minZoomFor(square, 400, 800)).toBeCloseTo(minZoomFor(square, 800, 400));
  });

  it('is sized by the longer side of a long, thin site', () => {
    const trail: Extent = [
      [0, -0.01],
      [1, 0.01],
    ];
    expect(minZoomFor(trail, 400, 800)).toBeCloseTo(minZoomFor(square, 400, 800), 1);
  });

  it('allows a closer limit on a bigger screen', () => {
    expect(minZoomFor(square, 800, 1600)).toBeGreaterThan(minZoomFor(square, 400, 800));
  });
});

describe('being on site', () => {
  // About 1.1 km on a side at the equator.
  const extent: Extent = [
    [0, 0],
    [0.01, 0.01],
  ];

  it('measures nothing for a position inside', () => {
    expect(distanceOutsideM([0.005, 0.005], extent)).toBe(0);
  });

  it('measures the gap to the nearest edge or corner', () => {
    // 0.001 degrees is about 111 m.
    expect(distanceOutsideM([0.005, 0.011], extent)).toBeCloseTo(111.32, 0);
    expect(distanceOutsideM([0.011, 0.011], extent)).toBeCloseTo(111.32 * Math.SQRT2, 0);
  });

  it('counts a position inside, or just outside, as on site', () => {
    expect(isOnSite([0.005, 0.005], 10, extent)).toBe(true);
    expect(isOnSite([0.005, 0.0105], 10, extent)).toBe(true); // about 56 m out
  });

  it('turns away an accurate position well outside', () => {
    expect(isOnSite([0.005, 0.02], 10, extent)).toBe(false); // about 1.1 km out
  });

  it('gives a rough reading near the site the benefit of the doubt', () => {
    // About 330 m out: off site if the reading is sharp, possible if it is rough.
    expect(isOnSite([0.005, 0.013], 10, extent)).toBe(false);
    expect(isOnSite([0.005, 0.013], 400, extent)).toBe(true);
  });

  it('does not let a very rough reading from far away count', () => {
    expect(isOnSite([0.005, 0.1], 5000, extent)).toBe(false); // about 10 km out
  });
});

describe('zoomRoom', () => {
  it('has room both ways in the middle of the range', () => {
    expect(zoomRoom(16, 14, 22)).toEqual({ canZoomIn: true, canZoomOut: true });
  });

  it('has no room out at the furthest zoom, or just short of it', () => {
    expect(zoomRoom(14, 14, 22).canZoomOut).toBe(false);
    expect(zoomRoom(14.004, 14, 22).canZoomOut).toBe(false);
  });

  it('has no room in at the closest zoom', () => {
    expect(zoomRoom(22, 14, 22)).toEqual({ canZoomIn: false, canZoomOut: true });
  });
});
