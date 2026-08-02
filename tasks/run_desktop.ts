import { basename, join } from "@std/path";

const projectRoot = join(import.meta.dirname!, "..");
const buildDir = await Deno.makeTempDir({ prefix: "sprintlens-desktop-" });
const appName = "SprintLens";
const output = Deno.build.os === "darwin"
  ? join(buildDir, `${appName}.app`)
  : join(buildDir, appName);

function commandFailure(command: string, code: number): Error {
  return new Error(`${command} exited with code ${code}`);
}

try {
  const build = new Deno.Command(Deno.execPath(), {
    args: [
      "desktop",
      "--allow-all",
      `--output=${output}`,
      "--include=index.html",
      "--include=data",
      "desktop.ts",
    ],
    cwd: projectRoot,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const buildStatus = await build.spawn().status;
  if (!buildStatus.success) {
    throw commandFailure("deno desktop", buildStatus.code);
  }

  const executable = Deno.build.os === "darwin"
    ? join(output, "Contents", "MacOS", appName)
    : Deno.build.os === "windows"
    ? join(output, `${appName}.exe`)
    : join(output, appName);

  const app = new Deno.Command(executable, {
    cwd: projectRoot,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const appStatus = await app.spawn().status;
  if (!appStatus.success) {
    throw commandFailure(basename(executable), appStatus.code);
  }
} finally {
  await Deno.remove(buildDir, { recursive: true });
}
