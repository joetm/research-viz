import { useEffect, useMemo, useRef } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { select } from "d3-selection";
import { drag } from "d3-drag";
import { zoom, zoomIdentity } from "d3-zoom";
import "d3-transition";
import type { OntologyNode } from "../lib/ontology";
import type { CrossLinkMap } from "../lib/crossLinks";
import { getCategoryMatrix, getEgoGraph } from "../lib/crossLinks";

type Props = {
  root: OntologyNode;
  selectedPath: string;
  setSelected: (path: string) => void;
  crossLinks: CrossLinkMap;
};

const SIZE = 1000;

const CATEGORY_COLORS = [
  "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
  "#06b6d4", "#e11d48", "#a855f7", "#22c55e", "#eab308",
  "#0ea5e9", "#d946ef", "#64748b", "#fb923c", "#2dd4bf",
  "#818cf8", "#facc15", "#4ade80", "#f43f5e", "#a78bfa",
  "#34d399", "#fbbf24", "#60a5fa", "#fb7185", "#c084fc",
];

function categoryColor(name: string, allNames: string[]): string {
  const idx = allNames.indexOf(name);
  return CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
}

type GNode = SimulationNodeDatum & {
  id: string;
  label: string;
  radius: number;
  color: string;
  path: string;
  tooltip: string;
};

type GLink = SimulationLinkDatum<GNode> & {
  weight: number;
  tooltip: string;
};

export function NetworkGraph({
  root,
  selectedPath,
  setSelected,
  crossLinks,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GNode>> | null>(null);

  const topLevelNames = useMemo(
    () => root.children.map((c) => c.name).sort(),
    [root]
  );

  const graphData = useMemo(() => {
    if (!selectedPath || selectedPath === "") {
      return buildCategoryGraph(root, crossLinks, topLevelNames);
    }
    const ego = getEgoGraph(crossLinks, selectedPath, root);
    if (!ego) return buildCategoryGraph(root, crossLinks, topLevelNames);
    return buildEgoForceGraph(ego, topLevelNames);
  }, [root, selectedPath, crossLinks, topLevelNames]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const s = select(svg);
    s.selectAll("*").remove();
    if (simRef.current) simRef.current.stop();

    const { nodes, links } = graphData;
    if (nodes.length === 0) {
      s.append("text")
        .attr("x", SIZE / 2)
        .attr("y", SIZE / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#a3a3a3")
        .attr("font-size", 16)
        .text("No cross-branch links for this selection");
      return;
    }

    const view = s.append("g").attr("class", "network-view");

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => {
        view.attr("transform", event.transform);
      });

    s.call(zoomBehavior);
    s.call(zoomBehavior.transform, zoomIdentity);

    const linkSel = view
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#d4d4d4")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", (d: GLink) => Math.max(1, Math.min(d.weight * 0.5, 6)));

    linkSel.append("title").text((d: GLink) => d.tooltip);

    const nodeSel = view
      .append("g")
      .attr("class", "nodes")
      .selectAll<SVGGElement, GNode>("g")
      .data(nodes)
      .join("g")
      .style("cursor", "pointer")
      .on("click", (_event: MouseEvent, d: GNode) => {
        setSelected(d.path);
      });

    nodeSel
      .append("circle")
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => d.color)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5);

    nodeSel.append("title").text((d) => d.tooltip);

    nodeSel
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("dy", (d) => d.radius + 14)
      .attr("fill", "#374151")
      .attr("font-size", (d) => Math.max(9, Math.min(d.radius * 0.45, 16)))
      .text((d) => truncate(d.label, 25));

    const dragBehavior = drag<SVGGElement, GNode>()
      .on("start", (event, d) => {
        if (!event.active && simRef.current) simRef.current.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active && simRef.current) simRef.current.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeSel.call(dragBehavior);
    nodeSel.on(".zoom", null);

    const sim = forceSimulation<GNode>(nodes)
      .force(
        "link",
        forceLink<GNode, GLink>(links)
          .id((d) => d.id)
          .distance((d) => 120 / Math.sqrt(d.weight || 1))
      )
      .force("charge", forceManyBody<GNode>().strength(-300))
      .force("center", forceCenter(SIZE / 2, SIZE / 2))
      .force(
        "collide",
        forceCollide<GNode>().radius((d) => d.radius + 8)
      )
      .on("tick", () => {
        linkSel
          .attr("x1", (d) => (d.source as GNode).x!)
          .attr("y1", (d) => (d.source as GNode).y!)
          .attr("x2", (d) => (d.target as GNode).x!)
          .attr("y2", (d) => (d.target as GNode).y!);
        nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
      });

    simRef.current = sim;

    return () => {
      sim.stop();
    };
  }, [graphData, setSelected]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    select(svg)
      .selectAll<SVGCircleElement, GNode>("g.nodes circle")
      .attr("stroke", (d) => (d.path === selectedPath ? "#b45309" : "#fff"))
      .attr("stroke-width", (d) => (d.path === selectedPath ? 3 : 1.5));
  }, [selectedPath]);

  return (
    <svg
      ref={svgRef}
      className="h-full w-full"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

function buildCategoryGraph(
  root: OntologyNode,
  crossLinks: CrossLinkMap,
  topLevelNames: string[]
): { nodes: GNode[]; links: GLink[] } {
  const edges = getCategoryMatrix(crossLinks);
  const categorySet = new Set<string>();
  for (const e of edges) {
    categorySet.add(e.source);
    categorySet.add(e.target);
  }

  const countByName = new Map<string, number>();
  for (const c of root.children) {
    countByName.set(c.name, c.totalCount);
  }

  const maxCount = Math.max(1, ...root.children.map((c) => c.totalCount));

  const nodes: GNode[] = [...categorySet].map((name) => ({
    id: name,
    label: name,
    radius: 12 + 30 * Math.sqrt((countByName.get(name) ?? 0) / maxCount),
    color: categoryColor(name, topLevelNames),
    path: name,
    tooltip: `${name} · ${(countByName.get(name) ?? 0).toLocaleString()} PDFs`,
  }));

  const maxWeight = Math.max(1, ...edges.map((e) => e.weight));
  const links: GLink[] = edges
    .filter((e) => categorySet.has(e.source) && categorySet.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight / maxWeight * 5,
      tooltip: `${e.source} ↔ ${e.target}: ${e.weight} shared concepts\n${e.concepts.slice(0, 10).join(", ")}${e.concepts.length > 10 ? "…" : ""}`,
    }));

  return { nodes, links };
}

function buildEgoForceGraph(
  ego: NonNullable<ReturnType<typeof getEgoGraph>>,
  topLevelNames: string[]
): { nodes: GNode[]; links: GLink[] } {
  const maxCount = Math.max(1, ...ego.nodes.map((n) => n.totalCount));

  const nodes: GNode[] = ego.nodes.map((n) => ({
    id: n.path,
    label: n.name,
    radius: 8 + 25 * Math.sqrt(Math.log(n.totalCount + 1) / Math.log(maxCount + 1)),
    color: categoryColor(n.topLevel, topLevelNames),
    path: n.path,
    tooltip: `${n.path} · ${n.totalCount.toLocaleString()} PDFs\n${n.isLocal ? "(local child)" : "(cross-branch)"}`,
  }));

  const edgeAgg = new Map<string, { weight: number; concepts: string[] }>();
  for (const e of ego.edges) {
    const key = [e.sourcePath, e.targetPath].sort().join("\0");
    const existing = edgeAgg.get(key);
    if (existing) {
      existing.weight++;
      existing.concepts.push(e.concept);
    } else {
      edgeAgg.set(key, { weight: 1, concepts: [e.concept] });
    }
  }

  const links: GLink[] = [...edgeAgg.entries()].map(([key, val]) => {
    const [s, t] = key.split("\0");
    return {
      source: s,
      target: t,
      weight: val.weight,
      tooltip: `Shared: ${val.concepts.join(", ")}`,
    };
  });

  return { nodes, links };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
