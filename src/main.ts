import { config } from "./config.ts";
import { createDashboardHandler } from "./dashboard.ts";
import { openDB } from "./db.ts";

let startupError: unknown;
let db: ReturnType<typeof openDB> | null = null;
try {
  db = openDB();
} catch (error) {
  startupError = error;
  console.error("SprintLens could not open its database:", error);
}

const handler = createDashboardHandler(db, { startupError });

if (Deno.args.includes("--smoke-test")) {
  if (!db) throw startupError;
  db.prepare("SELECT sqlite_version()").get();
  for (
    const path of [
      "/",
      "/vendor/pico.min.css",
      "/vendor/d3.min.js",
      "/vendor/plot.umd.min.js",
    ]
  ) {
    const response = await handler(new Request(`http://app${path}`));
    if (!response.ok) throw new Error(`Smoke test failed for ${path}`);
    await response.arrayBuffer();
  }
  db.close();
  console.log(`SprintLens smoke test passed on ${Deno.build.target}`);
  Deno.exit(0);
}

// Deno Desktop publishes a private loopback address and automatically opens
// its native window once `Deno.serve(handler)` responds there. Supplying a
// port bypasses that handshake and leaves the app running without a window.
if ("desktopVersion" in Deno) {
  Deno.serve(handler);
} else {
  Deno.serve({ hostname: "127.0.0.1", port: config.port }, handler);
}
