// Shortest trailing run of path segments that no other path on screen also
// ends with. Two items with the same full path keep their full path.
export function shortestUniqueLabels(paths: readonly string[]): Map<string, string> {
  const split = paths.map((p) => p.split("/"));
  const out = new Map<string, string>();
  split.forEach((segs, i) => {
    for (let k = 1; k <= segs.length; k++) {
      const suffix = segs.slice(-k).join("/");
      const clash = split.some(
        (other, j) => j !== i && other.length >= k && other.slice(-k).join("/") === suffix,
      );
      if (!clash || k === segs.length) {
        out.set(paths[i], suffix);
        break;
      }
    }
  });
  return out;
}
