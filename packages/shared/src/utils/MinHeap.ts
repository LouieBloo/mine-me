/** Binary min-heap ordered by a numeric priority. O(log n) push/pop. */
export class MinHeap<T> {
  private items: T[] = [];
  private priorities: number[] = [];

  public get size(): number {
    return this.items.length;
  }

  public push(item: T, priority: number): void {
    let i = this.items.length;
    this.items.push(item);
    this.priorities.push(priority);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.priorities[parent] <= this.priorities[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  /** Removes and returns the item with the lowest priority, or undefined when empty. */
  public pop(): T | undefined {
    const n = this.items.length;
    if (n === 0) return undefined;
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastPriority = this.priorities.pop()!;
    if (n > 1) {
      this.items[0] = lastItem;
      this.priorities[0] = lastPriority;
      this.siftDown(0);
    }
    return top;
  }

  private siftDown(start: number): void {
    const n = this.items.length;
    let i = start;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this.priorities[left] < this.priorities[smallest]) smallest = left;
      if (right < n && this.priorities[right] < this.priorities[smallest]) smallest = right;
      if (smallest === i) return;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.priorities[a], this.priorities[b]] = [this.priorities[b], this.priorities[a]];
  }
}
