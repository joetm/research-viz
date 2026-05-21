import { useEffect, useMemo, useRef, useState } from "react";
import { hierarchy, pack, type HierarchyCircularNode } from "d3-hierarchy";
import { select } from "d3-selection";
import "d3-transition";
import type { OntologyNode } from "../lib/ontology";
import { collapseEmptyFolders, collapseLinearChains } from "../lib/ontology";
import { depthColor, grayDepthColor } from "../lib/colors";

type Props = {
  root: OntologyNode;
  selectedPath: string;
  setSelected: (path: string) => void;
  searchVisible: Set<string> | null;
  searchMatches: Set<string> | null;
};

type Circ = HierarchyCircularNode<OntologyNode>;

const LAYOUT_SIZE = 1000;
const DEPTH_BUDGET = 3;

export function CirclePack({
  root,
  selectedPath,
  setSelected,
  searchVisible,
  searchMatches,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const focusRef = useRef<Circ | null>(null);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 800, h: 800 });
  const zoomToRef = useRef<(target: Circ, animate: boolean) => void>(() => {});
  const [drawn, setDrawn] = useState(false);

  const packed = useMemo<Circ>(() => {
    const pruned = collapseEmptyFolders(root);
    const collapsed: OntologyNode = {
      ...pruned,
      children: pruned.children.map(collapseLinearChains),
    };
    const h = hierarchy<OntologyNode>(collapsed)
      .sum((d) => (d.totalCount === 0 ? 1 : d.directCount))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return pack<OntologyNode>().size([LAYOUT_SIZE, LAYOUT_SIZE]).padding(3)(h);
  }, [root]);

  const byPath = useMemo(() => {
    const map = new Map<string, Circ>();
    packed.each((d) => {
      map.set(d.data.path, d as Circ);
      for (const a of d.data.aliases ?? []) map.set(a, d as Circ);
    });
    return map;
  }, [packed]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const s = select(svg);
    s.selectAll("*").remove();
    focusRef.current = null;
    const view = s.append("g").attr("class", "view");
    const nodes = packed.descendants() as Circ[];

    view
      .append("g")
      .attr("class", "circles")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("class", "node")
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => d.y)
      .attr("r", (d) => d.r)
      .attr("fill", fillFor)
      .attr("stroke", "rgba(0,0,0,0.08)")
      .attr("stroke-width", 0.5)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        setSelected(d.data.path);
        zoomToRef.current(d, true);
      })
      .append("title")
      .text((d) => `${d.data.path || "Literatur"} · ${d.data.totalCount.toLocaleString()} PDFs`);

    view
      .append("g")
      .attr("class", "labels")
      .style("pointer-events", "none")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .attr("class", "label")
      .attr("x", (d) => d.x)
      .attr("y", (d) => d.y)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", "#1f2937");

    function applyVisibility(target: Circ, scale: number) {
      s.selectAll<SVGCircleElement, Circ>("circle.node").style("display", (d) =>
        isWithinFocus(d, target) ? null : "none"
      );

      const { w, h } = sizeRef.current;
      const vbToPx = Math.min(w, h) / LAYOUT_SIZE;
      const totalPx = scale * vbToPx;

      const radiusPx = (d: Circ) => d.r * totalPx;
      const desiredPx = (d: Circ) =>
        Math.max(8, Math.min(radiusPx(d) * 0.32, 18));
      const maxChars = (d: Circ) =>
        Math.floor((radiusPx(d) * 1.85) / (desiredPx(d) * 0.55));

      const linesOf = (d: Circ): string[] => {
        const chain = d.data.chainNames;
        if (chain && chain.length > 1) return chain;
        return [d.data.name || "Literatur"];
      };

      const shouldLabel = (d: Circ) => {
        if (!isWithinFocus(d, target)) return false;
        if (d.depth !== target.depth + 1) return false;
        if (maxChars(d) < 3) return false;
        const n = linesOf(d).length;
        return radiusPx(d) >= 12 * Math.sqrt(n);
      };

      const fittedLine = (line: string, m: number) =>
        line.length <= m ? line : line.slice(0, Math.max(1, m - 1)) + "…";

      const LINE_HEIGHT_EM = 1.05;

      s.selectAll<SVGTextElement, Circ>("text.label")
        .style("display", (d) => (shouldLabel(d) ? null : "none"))
        .style("font-size", (d) => `${desiredPx(d) / totalPx}px`)
        .each(function (d) {
          const sel = select(this);
          sel.selectAll("tspan").remove();
          if (!shouldLabel(d)) return;
          const lines = linesOf(d);
          const m = maxChars(d);
          const startDy = -((lines.length - 1) / 2) * LINE_HEIGHT_EM;
          lines.forEach((line, i) => {
            sel
              .append("tspan")
              .attr("x", d.x)
              .attr("dy", i === 0 ? `${startDy}em` : `${LINE_HEIGHT_EM}em`)
              .text(fittedLine(line, m));
          });
        });
    }

    function zoomTo(target: Circ, animate: boolean) {
      focusRef.current = target;
      const MARGIN = 12;
      const scale = (LAYOUT_SIZE - 2 * MARGIN) / (2 * target.r);
      const tx = LAYOUT_SIZE / 2 - target.x * scale;
      const ty = MARGIN + (target.r - target.y) * scale;
      const g = s.select<SVGGElement>("g.view");
      const sel = animate ? g.transition().duration(500) : g;
      sel.attr("transform", `translate(${tx},${ty}) scale(${scale})`);
      applyVisibility(target, scale);
    }
    zoomToRef.current = zoomTo;

    s.on("click", () => {
      const f = focusRef.current;
      const parent = f?.parent as Circ | undefined;
      if (parent) {
        setSelected(parent.data.path);
        zoomTo(parent, true);
      } else {
        zoomTo(packed, true);
      }
    });

    const ro = new ResizeObserver(() => {
      const rect = svg.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };
      zoomTo(focusRef.current ?? packed, false);
    });
    ro.observe(svg);

    setDrawn(true);

    return () => ro.disconnect();
  }, [packed, setSelected]);

  // Update stroke/fill for selection + search without rebuilding the DOM.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const matchesAny = (d: Circ, set: Set<string>) => {
      if (set.has(d.data.path)) return true;
      const aliases = d.data.aliases;
      if (aliases) for (const a of aliases) if (set.has(a)) return true;
      return false;
    };
    const isSelected = (d: Circ) =>
      d.data.path === selectedPath ||
      (d.data.aliases?.includes(selectedPath) ?? false);
    select(svg)
      .selectAll<SVGCircleElement, Circ>("circle.node")
      .attr("fill-opacity", (d) =>
        searchVisible == null || matchesAny(d, searchVisible) ? 1 : 0.15
      )
      .attr("stroke", (d) =>
        isSelected(d)
          ? "#b45309"
          : searchMatches && matchesAny(d, searchMatches)
            ? "#92400e"
            : "rgba(0,0,0,0.08)"
      )
      .attr("stroke-width", (d) =>
        isSelected(d) ? 2.5 : searchMatches && matchesAny(d, searchMatches) ? 1.5 : 0.5
      );
  }, [selectedPath, searchVisible, searchMatches]);

  // When external selection changes (tree click), drill into that folder.
  useEffect(() => {
    const target = byPath.get(selectedPath);
    if (!target) return;
    zoomToRef.current(target, true);
  }, [selectedPath, byPath]);

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        className="h-full w-full"
        viewBox={`0 0 ${LAYOUT_SIZE} ${LAYOUT_SIZE}`}
        preserveAspectRatio="xMidYMin meet"
      />
      {!drawn && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-amber-500"
            role="status"
            aria-label="Rendering circle pack"
          />
        </div>
      )}
    </div>
  );
}

function isWithinFocus(d: Circ, focus: Circ): boolean {
  if (d.depth < focus.depth) return false;
  if (d.depth > focus.depth + DEPTH_BUDGET) return false;
  let n: Circ | null = d;
  while (n) {
    if (n === focus) return true;
    n = n.parent as Circ | null;
  }
  return false;
}

function fillFor(d: Circ): string {
  if (d.data.totalCount === 0) return "#f5f5f5";
  if (d.data.lowPriority) return grayDepthColor(d.depth);
  return depthColor(d.depth);
}
