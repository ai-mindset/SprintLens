import { dirname, join } from "@std/path";
import { ensureDir } from "@std/fs";
import {
  desktopBuildArgs,
  desktopOutput,
  type DesktopTarget,
  desktopTargets,
  isDesktopTarget,
} from "./desktop_build.ts";

const projectRoot = join(import.meta.dirname!, "..");

function requestedTargets(args: string[]): DesktopTarget[] {
  if (args.length === 0) {
    if (!isDesktopTarget(Deno.build.target)) {
      throw new Error(`Unsupported host target: ${Deno.build.target}`);
    }
    return [Deno.build.target];
  }
  if (args.length === 1 && args[0] === "--all") return [...desktopTargets];
  if (args.length === 1 && isDesktopTarget(args[0])) return [args[0]];
  throw new Error(
    `Usage: deno task bundle [--all|${desktopTargets.join("|")}]`,
  );
}

async function assertOutputDoesNotExist(output: string): Promise<void> {
  try {
    await Deno.stat(output);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return;
    throw error;
  }
  throw new Error(`Refusing to overwrite existing build output: ${output}`);
}

async function build(target: DesktopTarget): Promise<void> {
  const output = desktopOutput(projectRoot, target);
  await ensureDir(dirname(output));
  console.log(`Building SprintLens for ${target}...`);

  const command = new Deno.Command(Deno.execPath(), {
    args: desktopBuildArgs({ output, target, release: true }),
    cwd: projectRoot,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await command.spawn().status;
  if (!status.success) {
    throw new Error(`Desktop build for ${target} exited with ${status.code}`);
  }
  console.log(`Created ${output}`);
}

if (import.meta.main) {
  const targets = requestedTargets(Deno.args);
  const outputs = targets.map((target) => desktopOutput(projectRoot, target));
  await Promise.all(outputs.map(assertOutputDoesNotExist));
  for (const target of targets) await build(target);
}
