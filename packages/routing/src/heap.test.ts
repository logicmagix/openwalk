import { expect, it } from 'vitest';
import { MinHeap } from './heap';

it('pops values in ascending key order', () => {
  const heap = new MinHeap<string>();
  const keys = [5, 3, 8, 1, 9, 2, 7, 3, 6, 0];
  for (const key of keys) heap.push(key, `v${key}`);
  const popped: string[] = [];
  for (let value = heap.pop(); value !== undefined; value = heap.pop()) popped.push(value);
  expect(popped).toEqual([...keys].sort((a, b) => a - b).map((key) => `v${key}`));
  expect(heap.size).toBe(0);
});

it('returns undefined when empty', () => {
  expect(new MinHeap<number>().pop()).toBeUndefined();
});

it('keeps order under interleaved pushes and pops', () => {
  const heap = new MinHeap<number>();
  let seed = 12345;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const reference: number[] = [];
  for (let step = 0; step < 2000; step += 1) {
    if (random() < 0.6 || reference.length === 0) {
      const key = Math.floor(random() * 1000);
      heap.push(key, key);
      reference.push(key);
    } else {
      reference.sort((a, b) => a - b);
      expect(heap.pop()).toBe(reference.shift());
    }
  }
  expect(heap.size).toBe(reference.length);
});
