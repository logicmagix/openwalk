import { expect, test, type Request } from '@playwright/test';
import { choosePlace, controls, openMap } from './app';
import { arrivalPoint, farthestPair, reading } from './site';

// The promise the app makes: a person's position and route never leave the phone,
// and nothing is fetched from anyone but the site itself. This watches every
// request the page makes while someone locates themselves and gets directions.

test.use({ permissions: ['geolocation'] });

test('no request leaves the site or carries a position', async ({ page, context, baseURL }) => {
  const { from, to } = farthestPair();
  const start = arrivalPoint(from);
  const end = arrivalPoint(to);
  const requests: Request[] = [];
  page.on('request', (request) => requests.push(request));

  await context.setGeolocation(reading(start));
  await openMap(page);
  const { locate, directions } = controls(page);
  await locate.click();
  await choosePlace(page, to);
  await expect(directions).toContainText(/\d+ min/);
  await context.setGeolocation(reading(end));
  await expect(directions).toContainText('You have arrived.');
  await page.waitForLoadState('networkidle');

  expect(requests.length).toBeGreaterThan(5);
  const origin = new URL(baseURL!).origin;
  const elsewhere = requests
    .map((r) => r.url())
    .filter((url) => !url.startsWith('blob:') && new URL(url).origin !== origin);
  expect(elsewhere, 'requests to other hosts').toEqual([]);

  // A coordinate written to three decimal places pins a person to about a
  // hundred metres; none of the positions used may appear anywhere in a request.
  const fragments = [start, end].flatMap(([lon, lat]) => [lon.toFixed(3), lat.toFixed(3)]);
  const leaks = requests.filter((request) => {
    const sent = `${decodeURIComponent(request.url())} ${request.postData() ?? ''}`;
    return fragments.some((fragment) => sent.includes(fragment));
  });
  expect(
    leaks.map((r) => `${r.method()} ${r.url()}`),
    'requests carrying a position',
  ).toEqual([]);
  expect(
    requests.filter((r) => r.method() !== 'GET').map((r) => r.url()),
    'requests that send data',
  ).toEqual([]);
});
