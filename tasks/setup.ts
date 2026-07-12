import { ensureDir } from "@std/fs";
import { config } from "../src/config.ts";

const releaseBase =
  `https://github.com/asg017/sqlite-vec/releases/download/v${config.sqliteVecVersion}`;

function platformAsset(): { archive: string; ext: string } {
  const os = Deno.build.os;
  const arch = Deno.build.arch;

  const osPart = os === "darwin"
    ? "darwin"
    : os === "windows"
    ? "windows"
    : "linux";
  const archPart = arch === "aarch64" ? "aarch64" : "x86_64";
  const ext = os === "windows" ? "dll" : os === "darwin" ? "dylib" : "so";

  return {
    archive:
      `sqlite-vec-${config.sqliteVecVersion}-loadable-${osPart}-${archPart}.tar.gz`,
    ext,
  };
}

const { archive, ext } = platformAsset();
const url = `${releaseBase}/${archive}`;
const outDir = "data";
const archivePath = `${outDir}/${archive}`;
const expectedLibName = `vec0.${ext}`;
const libPath = `${outDir}/${expectedLibName}`;

await ensureDir(outDir);

console.log(`Downloading ${archive}...`);
const res = await fetch(url);
if (!res.ok) {
  console.error(`Failed: ${res.status} ${res.statusText}`);
  console.error(`URL: ${url}`);
  Deno.exit(1);
}

await Deno.writeFile(archivePath, new Uint8Array(await res.arrayBuffer()));
console.log(`Saved to ${archivePath}`);

console.log(`Extracting ${expectedLibName}...`);
const tar = new Deno.Command("tar", {
  args: ["-xzf", archivePath, "-C", outDir, expectedLibName],
});
const { success, stderr } = await tar.output();
if (!success) {
  console.error(`Extraction failed: ${new TextDecoder().decode(stderr)}`);
  Deno.exit(1);
}

await Deno.remove(archivePath);
console.log(`Saved extension to ${libPath}`);
