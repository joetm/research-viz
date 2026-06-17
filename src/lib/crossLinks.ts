import type { OntologyNode } from "./ontology";

export type CrossLinkGroup = {
  name: string;
  nodes: { path: string; totalCount: number; topLevel: string }[];
};

export type CrossLinkMap = {
  groups: Map<string, CrossLinkGroup>;
  byPath: Map<string, string[]>;
};

export type CategoryEdge = {
  source: string;
  target: string;
  weight: number;
  concepts: string[];
};

const EXCLUDED = new Set([
  "issues",
  "applications",
  "references",
  "scripts",
  "examples",
  "evaluation",
  "systems",
  "tools",
  "images",
  "assets",
  "general",
  "libraries",
  "best practices",
  "guidelines",
  "methods",
  "tools, libraries",
  "systems, tools",
  "projects",
  "organizations",
  "organisations",
  "services",
  "misc",
  "frameworks",
  "documentation",
]);

export function buildCrossLinks(root: OntologyNode): CrossLinkMap {
  const nameMap = new Map<string, CrossLinkGroup>();

  function walk(node: OntologyNode, topLevel: string) {
    const normalized = node.name.toLowerCase().trim();
    if (normalized && node.depth >= 1 && !EXCLUDED.has(normalized)) {
      const tl = node.depth === 1 ? node.name : topLevel;
      let group = nameMap.get(normalized);
      if (!group) {
        group = { name: normalized, nodes: [] };
        nameMap.set(normalized, group);
      }
      group.nodes.push({
        path: node.path,
        totalCount: node.totalCount,
        topLevel: tl,
      });
      for (const c of node.children) walk(c, tl);
    } else {
      const tl = node.depth === 1 ? node.name : topLevel;
      for (const c of node.children) walk(c, tl);
    }
  }

  walk(root, "");

  for (const [key, group] of nameMap) {
    const topLevels = new Set(group.nodes.map((n) => n.topLevel));
    if (topLevels.size < 2) nameMap.delete(key);
  }

  const byPath = new Map<string, string[]>();
  for (const [name, group] of nameMap) {
    for (const n of group.nodes) {
      const existing = byPath.get(n.path);
      if (existing) existing.push(name);
      else byPath.set(n.path, [name]);
    }
  }

  return { groups: nameMap, byPath };
}

export function getCategoryMatrix(map: CrossLinkMap): CategoryEdge[] {
  const pairMap = new Map<string, { weight: number; concepts: string[] }>();

  for (const [, group] of map.groups) {
    const topLevels = [...new Set(group.nodes.map((n) => n.topLevel))].sort();
    for (let i = 0; i < topLevels.length; i++) {
      for (let j = i + 1; j < topLevels.length; j++) {
        const key = `${topLevels[i]}\0${topLevels[j]}`;
        const existing = pairMap.get(key);
        if (existing) {
          existing.weight++;
          existing.concepts.push(group.name);
        } else {
          pairMap.set(key, { weight: 1, concepts: [group.name] });
        }
      }
    }
  }

  const edges: CategoryEdge[] = [];
  for (const [key, val] of pairMap) {
    const [source, target] = key.split("\0");
    edges.push({ source, target, weight: val.weight, concepts: val.concepts });
  }
  return edges.sort((a, b) => b.weight - a.weight);
}

export type EgoNode = {
  path: string;
  name: string;
  totalCount: number;
  topLevel: string;
  isLocal: boolean;
};

export type EgoEdge = {
  sourcePath: string;
  targetPath: string;
  concept: string;
};

export type EgoGraph = {
  nodes: EgoNode[];
  edges: EgoEdge[];
};

export function getEgoGraph(
  map: CrossLinkMap,
  selectedPath: string,
  root: OntologyNode
): EgoGraph | null {
  const selected = findNode(root, selectedPath);
  if (!selected || selected.children.length === 0) return null;

  const localChildren = selected.children;
  const nodesByPath = new Map<string, EgoNode>();
  const edges: EgoEdge[] = [];

  for (const child of localChildren) {
    const normalized = child.name.toLowerCase().trim();
    const group = map.groups.get(normalized);
    if (!group) continue;

    const topLevel = child.path.split("/")[0];
    nodesByPath.set(child.path, {
      path: child.path,
      name: child.name,
      totalCount: child.totalCount,
      topLevel,
      isLocal: true,
    });

    for (const remote of group.nodes) {
      if (remote.path === child.path) continue;
      if (!nodesByPath.has(remote.path)) {
        const segments = remote.path.split("/");
        let parentName = remote.topLevel;
        for (let i = segments.length - 2; i >= 0; i--) {
          if (!EXCLUDED.has(segments[i].toLowerCase().trim())) {
            parentName = segments[i];
            break;
          }
        }
        nodesByPath.set(remote.path, {
          path: remote.path,
          name: parentName,
          totalCount: remote.totalCount,
          topLevel: remote.topLevel,
          isLocal: false,
        });
      }
      edges.push({
        sourcePath: child.path,
        targetPath: remote.path,
        concept: normalized,
      });
    }
  }

  if (edges.length === 0) return null;
  return { nodes: [...nodesByPath.values()], edges };
}

function findNode(
  root: OntologyNode,
  path: string
): OntologyNode | null {
  if (root.path === path) return root;
  if (!path) return root;
  const segments = path.split("/");
  let node: OntologyNode | undefined = root;
  for (const seg of segments) {
    node = node?.children.find((c) => c.name === seg);
    if (!node) return null;
  }
  return node ?? null;
}
