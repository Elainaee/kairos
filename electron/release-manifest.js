import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(".");
const releaseDir = path.join(root, "release");
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));

async function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(await fs.readFile(filePath));
  return hash.digest("hex");
}

async function artifact(name, kind) {
  const filePath = path.join(releaseDir, name);
  const stat = await fs.stat(filePath);
  return {
    kind,
    name,
    size: stat.size,
    sha256: await sha256(filePath)
  };
}

const product = `${packageJson.productName}-${packageJson.version}-win-x64`;
const artifacts = [
  await artifact(`${product}-setup.exe`, "windows-installer"),
  await artifact(`${product}-setup.exe.blockmap`, "windows-installer-blockmap"),
  await artifact(`${product}-portable.exe`, "windows-portable"),
  await artifact(path.join("win-unpacked", `${packageJson.productName}.exe`), "windows-unpacked-exe")
];

const manifest = {
  productName: packageJson.productName,
  version: packageJson.version,
  appId: packageJson.build?.appId || "",
  generatedAt: new Date().toISOString(),
  artifacts
};

await fs.writeFile(path.join(releaseDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Wrote release manifest with ${artifacts.length} artifacts.`);
