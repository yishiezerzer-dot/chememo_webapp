import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library doesn't auto-cleanup between tests under Vitest the way
// it does under Jest's setupFilesAfterEach convention — wired explicitly here.
afterEach(() => cleanup());
