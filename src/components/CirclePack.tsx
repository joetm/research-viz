import { useEffect, useMemo, useRef, useState } from "react";
import { hierarchy, pack, type HierarchyCircularNode } from "d3-hierarchy";
import { select } from "d3-selection";
import "d3-transition";
import type { OntologyNode } from "../lib/ontology";
import { depthColor } from "../lib/colors";

type Props = {
  root: OntologyNode;
  selectedPath: string | null;
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
    const h = hierarchy<OntologyNode>(root)
      .sum((d) => d.directCount)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return pack<OntologyNode>().size([LAYOUT_SIZE, LAYOUT_SIZE]).padding(3)(h);
  }, [root]);

  const byPath = useMemo(() => {
    const map = new Map<string, Circ>();
    packed.each((d) => map.set(d.data.path, d as Circ));
    return map;
  }, [packed]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const s = select(svg);
    s.selectAll("*").remove();
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
      .attr("fill", "#1f2937")
      .text((d) => d.data.name || "Literatur");

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

      const hasVisibleChild = (d: Circ) =>
        !!d.children?.some((c) => isWithinFocus(c as Circ, target));
      const shouldLabel = (d: Circ) =>
        d.depth > 0 &&
        isWithinFocus(d, target) &&
        radiusPx(d) >= 12 &&
        maxChars(d) >= 3 &&
        (d === target || !hasVisibleChild(d));

      const fittedName = (d: Circ) => {
        const name = d.data.name ?? "";
        const m = maxChars(d);
        return name.length <= m ? name : name.slice(0, m - 1) + "…";
      };

      s.selectAll<SVGTextElement, Circ>("text.label")
        .style("display", (d) => (shouldLabel(d) ? null : "none"))
        .style("font-size", (d) => `${desiredPx(d) / totalPx}px`)
        .text((d) => (shouldLabel(d) ? fittedName(d) : ""));
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
    select(svg)
      .selectAll<SVGCircleElement, Circ>("circle.node")
      .attr("fill-opacity", (d) =>
        searchVisible == null || searchVisible.has(d.data.path) ? 1 : 0.15
      )
      .attr("stroke", (d) =>
        d.data.path === selectedPath
          ? "#b45309"
          : searchMatches?.has(d.data.path)
            ? "#92400e"
            : "rgba(0,0,0,0.08)"
      )
      .attr("stroke-width", (d) =>
        d.data.path === selectedPath ? 2.5 : searchMatches?.has(d.data.path) ? 1.5 : 0.5
      );
  }, [selectedPath, searchVisible, searchMatches]);

  // When external selection changes (tree click), drill into that folder.
  useEffect(() => {
    if (selectedPath === null) return;
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
  return depthColor(d.depth);
}
