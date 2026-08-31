const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "vendor", "ffmpeg", "win-x64");
const outputPath = path.join(outputDir, "ffmpeg.exe");
const manifestPath = path.join(outputDir, "manifest.json");

const sha256 = filePath => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

async function main() {
  if (process.platform !== "win32") throw new Error("FFmpeg packaging is currently configured for win32 x64 only.");
  const sourcePath = require("ffmpeg-static");
  if (!sourcePath || path.extname(sourcePath).toLowerCase() !== ".exe") throw new Error("ffmpeg-static did not provide a Windows executable.");
  await fsp.mkdir(outputDir, { recursive: true });
  await fsp.copyFile(sourcePath, outputPath);
  const { stdout } = await execFileAsync(outputPath, ["-version"], { windowsHide: true, timeout: 20_000 });
  const versionLine = String(stdout).split(/\r?\n/, 1)[0] || "";
  if (!/^ffmpeg version /i.test(versionLine)) throw new Error("Copied FFmpeg executable did not report a valid version.");
  const manifest = {
    package: "ffmpeg-static",
    packageVersion: require("ffmpeg-static/package.json").version,
    license: "GPL-3.0-or-later",
    sourcePath: path.relative(root, sourcePath).replaceAll("\\", "/"),
    file: "ffmpeg.exe",
    sha256: sha256(outputPath),
    version: versionLine,
    generatedAt: new Date().toISOString()
  };
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Prepared ${manifest.file} (${manifest.sha256})`);
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
