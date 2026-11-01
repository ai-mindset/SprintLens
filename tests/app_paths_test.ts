import { assertEquals, assertThrows } from "@std/assert";
import { getAppDataDirectory } from "../src/app_paths.ts";

Deno.test("app data directory follows each platform convention", () => {
  assertEquals(
    getAppDataDirectory("linux", { HOME: "/home/alex" }),
    "/home/alex/.local/share/SprintLens",
  );
  assertEquals(
    getAppDataDirectory("linux", {
      HOME: "/home/alex",
      XDG_DATA_HOME: "/var/alex/data",
    }),
    "/var/alex/data/SprintLens",
  );
  assertEquals(
    getAppDataDirectory("darwin", { HOME: "/Users/alex" }),
    "/Users/alex/Library/Application Support/SprintLens",
  );
  assertEquals(
    getAppDataDirectory("windows", {
      APPDATA: "C:\\Users\\Alex\\AppData\\Roaming",
    }),
    "C:\\Users\\Alex\\AppData\\Roaming\\SprintLens",
  );
});

Deno.test("explicit data directory wins and missing home is actionable", () => {
  assertEquals(
    getAppDataDirectory("linux", {
      SPRINTLENS_DATA_DIR: "/opt/sprintlens-data",
    }),
    "/opt/sprintlens-data",
  );
  assertThrows(
    () => getAppDataDirectory("linux", {}),
    Error,
    "HOME is required",
  );
});
