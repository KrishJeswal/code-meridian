// Framework knowledge lives behind this interface and nowhere else in the
// parser. An adapter may only label what the parser already found; it never
// adds files or edges.
export interface RepositoryContext {
  root: string;
  files: readonly string[];
}

export interface FrameworkAdapter {
  id: string;
  detect(repo: RepositoryContext): boolean;
  roleOf(path: string): string | null;
}

export const noFrameworkAdapter: FrameworkAdapter = {
  id: "none",
  detect: () => true,
  roleOf: () => null,
};

export function selectAdapter(
  adapters: readonly FrameworkAdapter[],
  repo: RepositoryContext,
): FrameworkAdapter {
  return adapters.find((a) => a.detect(repo)) ?? noFrameworkAdapter;
}
