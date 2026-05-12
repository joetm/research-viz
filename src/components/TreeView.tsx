import { useEffect, useRef } from "react";
import type { OntologyNode } from "../lib/ontology";
import { TreeNode } from "./TreeNode";

type Props = {
  root: OntologyNode;
  expanded: Set<string>;
  toggleExpanded: (path: string) => void;
  selectedPath: string | null;
  setSelected: (path: string) => void;
  searchVisible: Set<string> | null;
  searchMatches: Set<string> | null;
};

export function TreeView(props: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll selected into view when it changes (e.g., from circle-pack click).
  useEffect(() => {
    if (!props.selectedPath) return;
    const el = scrollRef.current?.querySelector(
      `[data-path="${CSS.escape(props.selectedPath)}"]`
    );
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [props.selectedPath]);

  return (
    <div ref={scrollRef} className="h-full overflow-auto py-2">
      <TreeNode {...props} node={props.root} />
    </div>
  );
}
