import { describe, expect, it } from 'vitest';
import { forgiving, memoryStore, type Store } from './kv';

describe('memoryStore', () => {
  it('keeps, returns and removes values by key', async () => {
    const store = memoryStore({ a: 1 });
    expect(await store.get('a')).toBe(1);
    expect(await store.get('b')).toBeUndefined();
    await store.set('b', { deep: [1, 2] });
    expect(await store.get('b')).toEqual({ deep: [1, 2] });
    await store.delete('a');
    expect(await store.get('a')).toBeUndefined();
  });
});

describe('forgiving', () => {
  const broken: Store = {
    get: () => Promise.reject(new Error('no')),
    set: () => Promise.reject(new Error('no')),
    delete: () => Promise.reject(new Error('no')),
  };

  it('reads a failure as nothing kept, and lets a failed write pass', async () => {
    const store = forgiving(broken);
    expect(await store.get('a')).toBeUndefined();
    await expect(store.set('a', 1)).resolves.toBeUndefined();
    await expect(store.delete('a')).resolves.toBeUndefined();
  });

  it('passes a working store through', async () => {
    const store = forgiving(memoryStore());
    await store.set('a', 1);
    expect(await store.get('a')).toBe(1);
  });
});
