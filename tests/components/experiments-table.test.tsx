// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExperimentsTable } from "@/components/experiments-table";
import { ToastProvider } from "@/components/toast-provider";
import type { ExperimentSearchParams } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  unstable_rethrow: (e: unknown) => {
    throw e;
  },
}));

const emptyParams: ExperimentSearchParams = {};

describe("ExperimentsTable sort headers", () => {
  it("exposes each sort header as a document link to the sorted URL", () => {
    render(
      <ToastProvider>
        <ExperimentsTable
          rows={[]}
          nextCursor={null}
          facets={{ status: {}, project: {}, reactionType: {}, methods: {} }}
          projects={[]}
          savedViews={[]}
          params={emptyParams}
        />
      </ToastProvider>
    );

    const id = screen.getByRole("link", { name: /^ID/ });
    expect(id.getAttribute("href")).toMatch(/sort=id/);
    expect(id.getAttribute("href")).toMatch(/dir=asc/);
  });
});
