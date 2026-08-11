"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from "d3-force";
import type { GraphNode, GraphEdge } from "@/lib/relationships/service";
import { RELATIONSHIP_LABEL, type RelationshipType } from "@/lib/types";
import { STATUS_LABEL } from "@/components/status-badge";

// T3.6 D7 — the ONLY graph in this app; no continuous re-simulation on every
// render. d3-force computes a stable layout once per data change (a fixed
// number of synchronous ticks, small project-scoped node counts converge
// well within that), then the component is a static, drag-repositionable
// SVG — simpler than wiring a live physics loop into React for a feature
// whose acceptance criterion is "explorable map," not "live simulation."

type SimNode = GraphNode & SimulationNodeDatum;

const WIDTH = 800;
const HEIGHT = 520;
const TICKS = 300;

const RELATIONSHIP_DASH: Record<RelationshipType, string> = {
  replicate_of: "",
  control_for: "6 3",
  optimization_of: "1 4",
  continuation_of: "10 3",
  based_on: "10 3 2 3",
  confirms: "",
  contradicts: "3 3",
  same_series: "1 4 6 4",
};

const STATUS_CLASS: Record<string, string> = {
  draft: "s-draft",
  planned: "s-planned",
  in_progress: "s-in-progress",
  paused: "s-paused",
  completed: "s-completed",
  reviewed: "s-reviewed",
  archived: "s-archived",
  failed: "s-failed",
  cancelled: "s-cancelled",
};

function layout(nodes: GraphNode[], edges: GraphEdge[]): Map<string, { x: number; y: number }> {
  const simNodes: SimNode[] = nodes.map((n) => ({ ...n }));
  const simLinks = edges.map((e) => ({ source: e.source, target: e.target }));

  const sim = forceSimulation(simNodes)
    .force(
      "link",
      forceLink(simLinks)
        .id((d) => (d as SimNode).id)
        .distance(95)
        .strength(0.35)
    )
    .force("charge", forceManyBody().strength(-260))
    .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
    .force("collide", forceCollide(28))
    .stop();

  for (let i = 0; i < TICKS; i++) sim.tick();

  return new Map(simNodes.map((n) => [n.id, { x: n.x ?? WIDTH / 2, y: n.y ?? HEIGHT / 2 }]));
}

export function ExperimentGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const router = useRouter();
  const initial = useMemo(() => layout(nodes, edges), [nodes, edges]);
  const [positions, setPositions] = useState(initial);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);

  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  function toSvgPoint(clientX: number, clientY: number) {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.k,
      y: (clientY - rect.top - view.y) / view.k,
    };
  }

  function onNodePointerDown(id: string, e: React.PointerEvent) {
    e.stopPropagation();
    dragRef.current = { id, moved: false };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onNodePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    dragRef.current.moved = true;
    const p = toSvgPoint(e.clientX, e.clientY);
    setPositions((prev) => new Map(prev).set(dragRef.current!.id, p));
  }

  function onNodePointerUp(id: string) {
    const wasDrag = dragRef.current?.moved;
    dragRef.current = null;
    if (!wasDrag) router.push(`/experiments/${id}`);
  }

  function onCanvasPointerDown(e: React.PointerEvent) {
    panRef.current = { startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y };
  }
  function onCanvasPointerMove(e: React.PointerEvent) {
    if (dragRef.current) return onNodePointerMove(e);
    if (!panRef.current) return;
    setView((v) => ({
      ...v,
      x: panRef.current!.viewX + (e.clientX - panRef.current!.startX),
      y: panRef.current!.viewY + (e.clientY - panRef.current!.startY),
    }));
  }
  function onCanvasPointerUp() {
    panRef.current = null;
  }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setView((v) => ({ ...v, k: Math.min(2.5, Math.max(0.4, v.k * (e.deltaY < 0 ? 1.1 : 0.9))) }));
  }

  if (nodes.length === 0) {
    return (
      <div className="empty-state">
        <div className="big">No experiments in this project yet.</div>
      </div>
    );
  }

  return (
    <div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
        {nodes.length} experiment{nodes.length === 1 ? "" : "s"}, {edges.length} relationship
        {edges.length === 1 ? "" : "s"}. Click a node to open it; drag to reposition; scroll to zoom.
      </p>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ width: "100%", height: 480, background: "rgba(255,255,255,.02)", borderRadius: 12, cursor: "grab", touchAction: "none" }}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onPointerLeave={onCanvasPointerUp}
        onWheel={onWheel}
        role="img"
        aria-label={`Relationship map: ${nodes.length} experiments, ${edges.length} relationships. See the list below for the same information as text.`}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {edges.map((e) => {
            const s = positions.get(e.source);
            const t = positions.get(e.target);
            if (!s || !t) return null;
            const hovered = hoveredEdge === e.id;
            return (
              <line
                key={e.id}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke={hovered ? "var(--teal)" : "var(--border-strong)"}
                strokeWidth={hovered ? 2 : 1.2}
                strokeDasharray={RELATIONSHIP_DASH[e.relationshipType]}
                onPointerEnter={() => setHoveredEdge(e.id)}
                onPointerLeave={() => setHoveredEdge(null)}
              >
                <title>{`${nodesById.get(e.source)?.name ?? e.source} — ${RELATIONSHIP_LABEL[e.relationshipType]} — ${nodesById.get(e.target)?.name ?? e.target}`}</title>
              </line>
            );
          })}
          {nodes.map((n) => {
            const p = positions.get(n.id);
            if (!p) return null;
            const statusClass = n.status ? STATUS_CLASS[n.status] : "s-unknown";
            return (
              <g
                key={n.id}
                transform={`translate(${p.x} ${p.y})`}
                onPointerDown={(e) => onNodePointerDown(n.id, e)}
                onPointerMove={onNodePointerMove}
                onPointerUp={() => onNodePointerUp(n.id)}
                onPointerEnter={() => setHoveredNode(n.id)}
                onPointerLeave={() => setHoveredNode(null)}
                style={{ cursor: "pointer" }}
                className={`status-badge ${statusClass}`}
              >
                <circle r={hoveredNode === n.id ? 12 : 9} fill="currentColor" fillOpacity={0.85} stroke="var(--bg, #0a0f0e)" strokeWidth={2} />
                <title>{`${n.name} — ${n.status ? STATUS_LABEL[n.status] : "Status not recorded"}${n.date ? ` — ${n.date}` : ""}`}</title>
                <text x={0} y={22} textAnchor="middle" fontSize={11} fill="var(--ink-dim)" style={{ pointerEvents: "none" }}>
                  {n.id}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="detail-meta" style={{ marginTop: 10 }}>
        {(Object.keys(RELATIONSHIP_LABEL) as RelationshipType[])
          .filter((t) => edges.some((e) => e.relationshipType === t))
          .map((t) => (
            <span key={t} className="chip" style={{ fontSize: 11 }}>
              {RELATIONSHIP_LABEL[t]}
            </span>
          ))}
      </div>

      <details style={{ marginTop: 14 }}>
        <summary className="muted" style={{ fontSize: 12.5, cursor: "pointer" }}>
          Text summary (same information as the map above)
        </summary>
        <ul style={{ marginTop: 8, paddingLeft: 20 }}>
          {nodes.map((n) => {
            const nodeEdges = edges.filter((e) => e.source === n.id || e.target === n.id);
            return (
              <li key={n.id} style={{ marginBottom: 6, fontSize: 13 }}>
                <strong>{n.name}</strong> ({n.id}) — {n.status ? STATUS_LABEL[n.status] : "status not recorded"}
                {nodeEdges.length > 0 && (
                  <ul style={{ paddingLeft: 18 }}>
                    {nodeEdges.map((e) => {
                      const outgoing = e.source === n.id;
                      const otherId = outgoing ? e.target : e.source;
                      return (
                        <li key={e.id} style={{ fontSize: 12.5 }}>
                          {RELATIONSHIP_LABEL[e.relationshipType]} {nodesById.get(otherId)?.name ?? otherId}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
