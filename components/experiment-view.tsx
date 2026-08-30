"use client";

import { createContext, useContext, type ReactNode } from "react";
import { StatusBadge } from "@/components/status-badge";
import { useStickyState } from "@/lib/use-sticky-state";
import type { ExperimentStatus } from "@/lib/types";

type ExperimentView = {
  name: string;
  status: ExperimentStatus | null;
  patch: (next: { name?: string; status?: ExperimentStatus | null }) => void;
};

const ExperimentViewContext = createContext<ExperimentView | null>(null);

export function ExperimentViewProvider({
  name,
  status,
  children,
}: {
  name: string;
  status: ExperimentStatus | null;
  children: ReactNode;
}) {
  const [viewName, setName] = useStickyState(name);
  const [viewStatus, setStatus] = useStickyState(status);

  function patch(next: { name?: string; status?: ExperimentStatus | null }) {
    if (next.name !== undefined) setName(next.name);
    if (next.status !== undefined) setStatus(next.status);
  }

  return (
    <ExperimentViewContext.Provider value={{ name: viewName, status: viewStatus, patch }}>
      {children}
    </ExperimentViewContext.Provider>
  );
}

export function useExperimentView(): ExperimentView {
  const ctx = useContext(ExperimentViewContext);
  if (!ctx) throw new Error("useExperimentView must be used within ExperimentViewProvider");
  return ctx;
}

export function useOptionalExperimentView(): ExperimentView | null {
  return useContext(ExperimentViewContext);
}

export function ExperimentHeading() {
  const { name } = useExperimentView();
  return <h2>{name}</h2>;
}

export function ExperimentStatusBadge() {
  const { status } = useExperimentView();
  return <StatusBadge status={status} />;
}
