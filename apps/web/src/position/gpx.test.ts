import { describe, expect, it } from 'vitest';
import { parseGpx } from './gpx';

const SAMPLE = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <trk><name>Walk</name><trkseg>
    <trkpt lat="29.1" lon="-82.1"><ele>30</ele><time>2026-01-01T10:00:00Z</time><hdop>1.2</hdop></trkpt>
    <trkpt lon="-82.1001" lat="29.1001">
      <time>2026-01-01T10:00:02Z</time>
      <extensions><gpxtpx:accuracy>4.5</gpxtpx:accuracy></extensions>
    </trkpt>
    <trkpt lat="29.1002" lon="-82.1002"/>
    <trkpt lat="bad" lon="-82.1003"><time>2026-01-01T10:00:06Z</time></trkpt>
  </trkseg></trk>
</gpx>`;

describe('parseGpx', () => {
  it('reads positions, times and accuracy from track points', () => {
    const points = parseGpx(SAMPLE);
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({
      position: [-82.1, 29.1],
      time: Date.parse('2026-01-01T10:00:00Z'),
      accuracyM: 6,
    });
    expect(points[1]).toEqual({
      position: [-82.1001, 29.1001],
      time: Date.parse('2026-01-01T10:00:02Z'),
      accuracyM: 4.5,
    });
    expect(points[2]).toEqual({ position: [-82.1002, 29.1002], time: null, accuracyM: null });
  });

  it('returns nothing for a file without track points', () => {
    expect(parseGpx('<gpx><wpt lat="1" lon="2"/></gpx>')).toEqual([]);
  });
});
