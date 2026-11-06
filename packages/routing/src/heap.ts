// A binary min-heap keyed by a number. The searches push a node every time they find
// a cheaper way to reach it and skip stale entries when they pop, which is simpler
// than a decrease-key operation and just as fast at this scale.

export class MinHeap<T> {
  private readonly keys: number[] = [];
  private readonly values: T[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, value: T): void {
    this.keys.push(key);
    this.values.push(value);
    this.siftUp(this.keys.length - 1);
  }

  /** Remove and return the value with the smallest key, or undefined when empty. */
  pop(): T | undefined {
    const count = this.keys.length;
    if (count === 0) return undefined;
    const top = this.values[0];
    const lastKey = this.keys.pop() as number;
    const lastValue = this.values.pop() as T;
    if (count > 1) {
      this.keys[0] = lastKey;
      this.values[0] = lastValue;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(index: number): void {
    const key = this.keys[index] as number;
    const value = this.values[index] as T;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      const parentKey = this.keys[parent] as number;
      if (parentKey <= key) break;
      this.keys[index] = parentKey;
      this.values[index] = this.values[parent] as T;
      index = parent;
    }
    this.keys[index] = key;
    this.values[index] = value;
  }

  private siftDown(index: number): void {
    const count = this.keys.length;
    const key = this.keys[index] as number;
    const value = this.values[index] as T;
    for (;;) {
      let child = 2 * index + 1;
      if (child >= count) break;
      const right = child + 1;
      if (right < count && (this.keys[right] as number) < (this.keys[child] as number)) {
        child = right;
      }
      const childKey = this.keys[child] as number;
      if (childKey >= key) break;
      this.keys[index] = childKey;
      this.values[index] = this.values[child] as T;
      index = child;
    }
    this.keys[index] = key;
    this.values[index] = value;
  }
}
