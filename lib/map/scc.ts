// Tarjan's strongly connected components, iterative so a deep graph can't
// overflow the stack. Returns a component number per node; nodes that
// reach each other share a number.
export function stronglyConnected(
  ids: readonly string[],
  edges: readonly { source: string; target: string }[],
): Map<string, number> {
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) adj.get(e.source)?.push(e.target);

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const component = new Map<string, number>();
  let next = 0;
  let count = 0;

  for (const root of ids) {
    if (index.has(root)) continue;
    const work: { id: string; i: number }[] = [{ id: root, i: 0 }];
    index.set(root, next);
    low.set(root, next++);
    stack.push(root);
    onStack.add(root);

    while (work.length > 0) {
      const frame = work[work.length - 1];
      const out = adj.get(frame.id) ?? [];
      if (frame.i < out.length) {
        const w = out[frame.i++];
        if (!index.has(w)) {
          index.set(w, next);
          low.set(w, next++);
          stack.push(w);
          onStack.add(w);
          work.push({ id: w, i: 0 });
        } else if (onStack.has(w)) {
          low.set(frame.id, Math.min(low.get(frame.id) ?? 0, index.get(w) ?? 0));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.id, Math.min(low.get(parent.id) ?? 0, low.get(frame.id) ?? 0));
      if (low.get(frame.id) === index.get(frame.id)) {
        let w: string | undefined;
        do {
          w = stack.pop();
          if (w === undefined) break;
          onStack.delete(w);
          component.set(w, count);
        } while (w !== frame.id);
        count++;
      }
    }
  }
  return component;
}
