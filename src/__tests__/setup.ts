import { vi } from "vitest";

// after() aus next/server braucht den Request-Kontext von Next.js, den es in
// Tests nicht gibt. Hier laeuft der Callback sofort (ohne darauf zu warten),
// wie er es nach dem Senden der Antwort tun wuerde.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((task: Promise<unknown> | (() => unknown)) => {
      if (typeof task === "function") void task();
    }),
  };
});
