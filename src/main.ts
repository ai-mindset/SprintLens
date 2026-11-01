import { config } from "./config.ts";
import { createDashboardHandler } from "./dashboard.ts";
import { openDB } from "./db.ts";

const handler = createDashboardHandler(openDB());

// Deno Desktop publishes a private loopback address and automatically opens
// its native window once `Deno.serve(handler)` responds there. Supplying a
// port bypasses that handshake and leaves the app running without a window.
if ("desktopVersion" in Deno) {
  Deno.serve(handler);
} else {
  Deno.serve({ hostname: "127.0.0.1", port: config.port }, handler);
}
