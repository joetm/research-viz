import type { OntologyNode } from "./ontology";

export type SearchResult = {
  /** Paths that match the query directly. */
  matches: Set<string>;
  /** Paths to render: matches + all ancestors of matches. */
  visible: Set<string>;
};

export function search(root: OntologyNode, rawQuery: string): SearchResult | null {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return null;

  const matches = new Set<string>();
  const visible = new Set<string>();

  function walk(node: OntologyNode, ancestors: string[]): boolean {
    let descendantMatched = false;
    for (const child of node.children) {
      if (walk(child, [...ancestors, node.path])) descendantMatched = true;
    }
    const selfMatch = node.name.toLowerCase().includes(q);
    if (selfMatch) matches.add(node.path);
    if (selfMatch || descendantMatched) {
      visible.add(node.path);
      for (const a of ancestors) visible.add(a);
      return true;
    }
    return false;
  }

  walk(root, []);
  return { matches, visible };
}
