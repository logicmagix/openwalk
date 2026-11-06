import { expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

it('exports its package name', () => {
  expect(PACKAGE_NAME).toBe('@openwalk/routing');
});
