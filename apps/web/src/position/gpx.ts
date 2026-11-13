// Reading the track points of a GPX file, the format GPS logger apps export. Only
// what a replay needs is kept: position, time, and the logger's accuracy estimate
// when present. The parser is a few regular expressions over the track point
// elements, which is enough for logger output and runs without a browser.

import type { Position } from '../site/types';

export interface TrackPoint {
  readonly position: Position;
  /** Milliseconds since the epoch, or null when the file carries no times. */
  readonly time: number | null;
  /** Horizontal accuracy in meters, if the file carries one. */
  readonly accuracyM: number | null;
}

// Attributes are matched lazily so a self-closing point ends at its own "/>"
// rather than running on to the next point's closing tag.
const TRACK_POINT = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g;

export function parseGpx(xml: string): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (const match of xml.matchAll(TRACK_POINT)) {
    const attributes = match[1] ?? '';
    const body = match[2] ?? '';
    const lat = attribute(attributes, 'lat');
    const lon = attribute(attributes, 'lon');
    if (lat === null || lon === null) continue;
    const time = element(body, 'time');
    const stamp = time === null ? NaN : Date.parse(time);
    const hdop = element(body, 'hdop');
    const accuracy = element(body, 'accuracy') ?? element(body, 'pdop');
    points.push({
      position: [lon, lat],
      time: Number.isNaN(stamp) ? null : stamp,
      // Loggers write either an accuracy in meters or a dilution of precision; a
      // dilution of 1 is roughly 5 m for a phone.
      accuracyM: accuracy !== null ? Number(accuracy) : hdop !== null ? Number(hdop) * 5 : null,
    });
  }
  return points;
}

function attribute(attributes: string, name: string): number | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attributes);
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function element(body: string, name: string): string | null {
  const match = new RegExp(`<(?:[a-z0-9]+:)?${name}\\b[^>]*>([^<]*)<`).exec(body);
  return match === null ? null : (match[1] ?? '').trim();
}
