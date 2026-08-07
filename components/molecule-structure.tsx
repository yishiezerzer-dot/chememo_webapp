"use client";

import { useEffect, useRef, useState } from "react";
import SmilesDrawer from "smiles-drawer";

// T2.8 D2/D4 — dynamically imported (ssr: false, see materials-client.tsx)
// since smiles-drawer touches the DOM at draw time; renders the given SMILES
// as an inline 2D SVG structure, or a clear "could not render" message if the
// string doesn't parse. Never a blank space or a crash (D4).
export function MoleculeStructure({ smiles }: { smiles: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!svgRef.current) return;
    const drawer = new SmilesDrawer.SvgDrawer({ width: 160, height: 120 });
    SmilesDrawer.parse(
      smiles,
      (tree) => {
        if (svgRef.current) drawer.draw(tree, svgRef.current, "dark");
        setError(false);
      },
      () => setError(true)
    );
  }, [smiles]);

  // The <svg> stays mounted even on error (just hidden) so its ref is never
  // torn down — otherwise a later smiles change couldn't re-attach and
  // retry drawing once a prior parse had failed.
  return (
    <div>
      <svg ref={svgRef} width={160} height={120} style={error ? { display: "none" } : undefined} />
      {error && (
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          Could not render this structure.
        </p>
      )}
    </div>
  );
}
