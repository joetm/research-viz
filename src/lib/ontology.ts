export type OntologyNode = {
  name: string;
  path: string;
  depth: number;
  directCount: number;
  totalCount: number;
  children: OntologyNode[];
  // Viz-only (set by collapseLinearChains): segment names along a collapsed
  // single-child chain, outermost-first. Absent for non-collapsed nodes.
  chainNames?: string[];
  // Viz-only: intermediate paths that were swallowed by a collapse, so click
  // handling and deep-links resolve to the merged circle.
  aliases?: string[];
};

export type Meta = {
  root: string;
  extension: string;
  generatedAt: string;
  totalFolders: number;
  totalMatches: number;
  maxDepth: number;
};

export function ancestorsOf(path: string): string[] {
  if (!path) return [];
  const parts = path.split("/");
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    out.push(parts.slice(0, i).join("/"));
  }
  out.push(""); // root
  return out;
}

export type ViewMode = "exploration" | "issues";

function reparent(node: OntologyNode, parentPath: string, depth: number): OntologyNode {
  const path = parentPath ? `${parentPath}/${node.name}` : node.name;
  return {
    ...node,
    path,
    depth,
    children: node.children.map((c) => reparent(c, path, depth + 1)),
  };
}

function mergeOrAppend(siblings: OntologyNode[], incoming: OntologyNode): void {
  const existing = siblings.find((s) => s.name === incoming.name);
  if (!existing) {
    siblings.push(incoming);
    return;
  }
  existing.directCount += incoming.directCount;
  existing.totalCount += incoming.totalCount;
  for (const c of incoming.children) mergeOrAppend(existing.children, c);
}

// Recursively flatten every "Issues" descendant into its parent, the same way
// scripts/build_ontology.py treats "General, Theory". Used internally so the
// content lifted out of an Issues folder doesn't itself contain nested Issues
// wrappers. The passed-in node itself is not erased — only descendants named
// "Issues" are.
function eraseIssuesDeep(node: OntologyNode): OntologyNode {
  let directBonus = 0;
  const newChildren: OntologyNode[] = [];
  for (const c of node.children) {
    const rc = eraseIssuesDeep(c);
    if (c.name === "Issues") {
      directBonus += rc.directCount;
      for (const gc of rc.children) {
        mergeOrAppend(newChildren, reparent(gc, node.path, node.depth + 1));
      }
    } else {
      mergeOrAppend(newChildren, rc);
    }
  }
  newChildren.sort((a, b) => a.name.localeCompare(b.name));
  const directCount = node.directCount + directBonus;
  const totalCount =
    directCount + newChildren.reduce((sum, c) => sum + c.totalCount, 0);
  return { ...node, directCount, totalCount, children: newChildren };
}

// Collapse linear single-child chains into one node. The merged node uses the
// deepest path (so deep-links resolve), accumulates loose-PDF counts, records
// each segment name in `chainNames` for multi-line rendering, and tracks the
// swallowed intermediate paths in `aliases` so the CirclePack can map them
// back to the merged circle.
export function collapseLinearChains(node: OntologyNode): OntologyNode {
  const children = node.children.map(collapseLinearChains);
  if (children.length !== 1) {
    return { ...node, children };
  }
  const only = children[0];
  return {
    ...only,
    chainNames: [node.name, ...(only.chainNames ?? [only.name])],
    aliases: [node.path, ...(only.aliases ?? [])],
    directCount: node.directCount + only.directCount,
    totalCount: only.totalCount + node.directCount,
  };
}

export function filterToIssues(node: OntologyNode): OntologyNode | null {
  const issuesChild = node.children.find((c) => c.name === "Issues");

  const liftedChildren: OntologyNode[] = [];
  let liftedDirect = 0;
  if (issuesChild) {
    const flat = eraseIssuesDeep(issuesChild);
    liftedDirect = flat.directCount;
    for (const gc of flat.children) {
      liftedChildren.push(reparent(gc, node.path, node.depth + 1));
    }
  }

  const recursedChildren: OntologyNode[] = [];
  for (const c of node.children) {
    if (c.name === "Issues") continue;
    const fc = filterToIssues(c);
    if (fc) recursedChildren.push(fc);
  }

  if (!issuesChild && recursedChildren.length === 0) return null;

  const newChildren: OntologyNode[] = [];
  for (const c of liftedChildren) mergeOrAppend(newChildren, c);
  for (const c of recursedChildren) mergeOrAppend(newChildren, c);
  newChildren.sort((a, b) => a.name.localeCompare(b.name));

  const directCount = liftedDirect;
  const totalCount =
    directCount + newChildren.reduce((sum, c) => sum + c.totalCount, 0);

  return {
    ...node,
    directCount,
    totalCount,
    children: newChildren,
  };
}
