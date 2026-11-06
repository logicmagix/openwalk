import { describe, expect, it } from 'vitest';
import { APP_NAME, placeholderStatus } from './app';

describe('placeholderStatus', () => {
  it('mentions the app name', () => {
    expect(placeholderStatus()).toContain(APP_NAME);
  });
});
