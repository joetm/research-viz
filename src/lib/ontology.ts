export type OntologyNode = {
  name: string;
  path: string;
  depth: number;
  directCount: number;
  totalCount: number;
  children: OntologyNode[];
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
