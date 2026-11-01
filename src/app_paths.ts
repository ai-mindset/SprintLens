import { join as joinPosix } from "@std/path/posix";
import { join as joinWindows } from "@std/path/windows";

export type AppEnvironment = Record<string, string | undefined>;

export function getAppDataDirectory(
  os: typeof Deno.build.os,
  env: AppEnvironment,
): string {
  if (env.SPRINTLENS_DATA_DIR) return env.SPRINTLENS_DATA_DIR;

  if (os === "windows") {
    const base = env.APPDATA ?? env.USERPROFILE;
    if (!base) throw new Error("APPDATA or USERPROFILE is required");
    return joinWindows(base, "SprintLens");
  }

  const home = env.HOME;
  if (!home) throw new Error("HOME is required");
  if (os === "darwin") {
    return joinPosix(home, "Library", "Application Support", "SprintLens");
  }
  return joinPosix(
    env.XDG_DATA_HOME ?? joinPosix(home, ".local", "share"),
    "SprintLens",
  );
}

export function readEnvironment(): AppEnvironment {
  const names = [
    "SPRINTLENS_DATA_DIR",
    "SPRINTLENS_DB_PATH",
    "SPRINTLENS_AI_BASE_URL",
    "SPRINTLENS_API_KEY",
    "SPRINTLENS_CHAT_MODEL",
    "SPRINTLENS_EMBED_MODEL",
    "SPRINTLENS_EMBED_DIM",
    "SPRINTLENS_PORT",
    "APPDATA",
    "USERPROFILE",
    "HOME",
    "XDG_DATA_HOME",
  ];
  return Object.fromEntries(names.map((name) => {
    try {
      return [name, Deno.env.get(name)];
    } catch {
      return [name, undefined];
    }
  }));
}
