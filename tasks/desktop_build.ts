import { join } from "@std/path";

export const desktopTargets = [
  "x86_64-pc-windows-msvc",
  "x86_64-apple-darwin",
  "aarch64-apple-darwin",
  "x86_64-unknown-linux-gnu",
  "aarch64-unknown-linux-gnu",
] as const;

export type DesktopTarget = typeof desktopTargets[number];

export function isDesktopTarget(value: string): value is DesktopTarget {
  return desktopTargets.includes(value as DesktopTarget);
}

export function desktopOutput(root: string, target: DesktopTarget): string {
  const directory = join(root, "dist", target);
  if (target.endsWith("windows-msvc")) return join(directory, "SprintLens");
  if (target.endsWith("apple-darwin")) {
    return join(directory, "SprintLens.app");
  }
  return join(directory, "SprintLens.AppImage");
}

export function desktopBuildArgs(options: {
  output: string;
  target?: DesktopTarget;
  release?: boolean;
}): string[] {
  const args = [
    "desktop",
    "--allow-read",
    "--allow-write",
    "--allow-net",
    "--allow-env",
    "--allow-ffi",
    `--output=${options.output}`,
    "--include=index.html",
    "--include=node_modules",
  ];

  if (options.target) args.push(`--target=${options.target}`);
  if (options.release) args.push("--backend=cef", "--compress=xz");
  args.push("desktop.ts");
  return args;
}
