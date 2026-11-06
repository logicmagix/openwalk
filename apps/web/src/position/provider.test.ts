import { expect, it } from 'vitest';
import { positionErrorMessage } from './provider';

it('explains each kind of position error without technical terms', () => {
  expect(positionErrorMessage({ kind: 'denied' })).toMatch(/Location access is off/);
  expect(positionErrorMessage({ kind: 'unavailable' })).toMatch(/not available/);
  expect(positionErrorMessage({ kind: 'timeout' })).toMatch(/waiting/);
});
