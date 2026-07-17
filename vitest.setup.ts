// Unmount React trees between tests so renders don't accumulate in the shared
// happy-dom document (otherwise getByRole/getByText hit "multiple elements").
// The canonical Vitest + React Testing Library glue.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
