import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import {
  desktopBuildArgs,
  desktopOutput,
  isDesktopTarget,
} from "../tasks/desktop_build.ts";

Deno.test("desktop targets and output formats match supported releases", () => {
  assertEquals(isDesktopTarget("x86_64-pc-windows-msvc"), true);
  assertEquals(isDesktopTarget("aarch64-pc-windows-msvc"), false);
  assertEquals(
    desktopOutput("/project", "x86_64-pc-windows-msvc"),
    join("/project", "dist", "x86_64-pc-windows-msvc", "SprintLens"),
  );
  assertEquals(
    desktopOutput("/project", "aarch64-apple-darwin"),
    join("/project", "dist", "aarch64-apple-darwin", "SprintLens.app"),
  );
  assertEquals(
    desktopOutput("/project", "x86_64-unknown-linux-gnu"),
    join(
      "/project",
      "dist",
      "x86_64-unknown-linux-gnu",
      "SprintLens.AppImage",
    ),
  );
});

Deno.test("release builds are self-extracting and use the portable backend", () => {
  const args = desktopBuildArgs({
    output: "/tmp/SprintLens",
    target: "x86_64-pc-windows-msvc",
    release: true,
  });
  assertEquals(args.includes("--target=x86_64-pc-windows-msvc"), true);
  assertEquals(args.includes("--backend=cef"), true);
  assertEquals(args.includes("--compress=xz"), true);
  assertEquals(args.includes("--allow-all"), false);
  assertEquals(args.some((arg) => arg.includes("sprintlens.db")), false);
  assertEquals(args.at(-1), "desktop.ts");
});
