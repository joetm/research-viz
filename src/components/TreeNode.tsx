import { memo } from "react";
import type { OntologyNode } from "../lib/ontology";
import { depthColor } from "../lib/colors";

type Props = {
  node: OntologyNode;
  expanded: Set<string>;
  toggleExpanded: (path: string) => void;
  selectedPath: string | null;
  setSelected: (path: string) => void;
  searchVisible: Set<string> | null;
  searchMatches: Set<string> | null;
};

function TreeNodeImpl({
  node,
  expanded,
  toggleExpanded,
  selectedPath,
  setSelected,
  searchVisible,
  searchMatches,
}: Props) {
  const isExpanded = expanded.has(node.path);
  const hasChildren = node.children.length > 0;
  const isEmpty = node.totalCount === 0;
  const isSelected = selectedPath === node.path;
  const inSearch = searchVisible == null || searchVisible.has(node.path);
  if (!inSearch) return null;
  const isMatch = searchMatches?.has(node.path) ?? false;

  const indent = node.depth * 14;

  return (
    <div>
      <div
        role="row"
        data-path={node.path}
        onClick={() => {
          if (isSelected && hasChildren) toggleExpanded(node.path);
          else setSelected(node.path);
        }}
        className={[
          "group flex items-center gap-1 py-0.5 pr-3 text-sm cursor-pointer select-none",
          isSelected
            ? "bg-amber-100"
            : "hover:bg-neutral-100",
          isEmpty ? "italic" : "",
          isMatch ? "font-semibold" : "",
        ].join(" ")}
        style={{ paddingLeft: indent + 4 }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) toggleExpanded(node.path);
          }}
          className={`w-4 text-neutral-500 text-xs ${hasChildren ? "" : "invisible"}`}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? "▼" : "▶"}
        </button>
        <span
          aria-hidden
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{
            background: isEmpty ? "#e5e5e5" : depthColor(node.depth),
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
          }}
        />
        <span className={`flex-1 truncate ${isEmpty ? "text-neutral-400" : ""}`}>
          {node.name || "Literatur"}
        </span>
        <span
          className="font-mono text-xs tabular-nums text-neutral-500"
          title={
            node.directCount !== node.totalCount
              ? `${node.directCount} direct / ${node.totalCount} total`
              : undefined
          }
        >
          {node.totalCount.toLocaleString()}
        </span>
      </div>
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
              selectedPath={selectedPath}
              setSelected={setSelected}
              searchVisible={searchVisible}
              searchMatches={searchMatches}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const TreeNode = memo(TreeNodeImpl);
