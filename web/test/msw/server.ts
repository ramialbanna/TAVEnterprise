import { setupServer } from "msw/node";

import { handlers } from "./handlers";

/** Shared MSW server for component/integration tests. Lifecycle is wired in test/setup.ts. */
export const server = setupServer(...handlers);
