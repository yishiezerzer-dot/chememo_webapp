"use client";

import dynamic from "next/dynamic";
import type { GraphNode, GraphEdge } from "@/lib/relationships/service";

// T3.6 D2/D7 — dynamically imported with ssr:false so d3-force's layout
// computation and the graph's pointer-event/pan/zoom logic never run during
// server rendering or enter the server bundle; only this thin wrapper does.
const ExperimentGraph = dynamic(() => import("./experiment-graph").then((m) => m.ExperimentGraph), {
  ssr: false,
  loading: () => (
    <p className="muted" style={{ fontSize: 12.5 }}>
      Loading map…
    </p>
  ),
});

export function ExperimentGraphLoader({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  return <ExperimentGraph nodes={nodes} edges={edges} />;
}
