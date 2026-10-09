/** Minimal binary min-heap. Ties break by insertion order, so results are deterministic. */
export class MinHeap<T> {
  private items: { pri: number; seq: number; value: T }[] = [];
  private seq = 0;

  get size(): number {
    return this.items.length;
  }

  push(pri: number, value: T): void {
    const items = this.items;
    items.push({ pri, seq: this.seq++, value });
    let i = items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      [items[i], items[p]] = [items[p], items[i]];
      i = p;
    }
  }

  pop(): T | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && this.less(l, m)) m = l;
        if (r < items.length && this.less(r, m)) m = r;
        if (m === i) break;
        [items[i], items[m]] = [items[m], items[i]];
        i = m;
      }
    }
    return top.value;
  }

  private less(a: number, b: number): boolean {
    const x = this.items[a];
    const y = this.items[b];
    return x.pri < y.pri || (x.pri === y.pri && x.seq < y.seq);
  }
}
