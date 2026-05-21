import { useEffect, useRef } from "react";
import type { OntologyNode, ViewMode } from "../lib/ontology";
import { TreeNode } from "./TreeNode";

type Props = {
  root: OntologyNode;
  expanded: Set<string>;
  toggleExpanded: (path: string) => void;
  selectedPath: string;
  setSelected: (path: string) => void;
  searchVisible: Set<string> | null;
  searchMatches: Set<string> | null;
  mode: ViewMode;
};

export function TreeView(props: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll selected into view when it changes (e.g., from circle-pack click).
  useEffect(() => {
    const el = scrollRef.current?.querySelector(
      `[data-path="${CSS.escape(props.selectedPath)}"]`
    );
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [props.selectedPath]);

  return (
    <div ref={scrollRef} className="h-full overflow-auto py-2">
      <TreeNode {...props} node={props.root} />
    </div>
  );
}
