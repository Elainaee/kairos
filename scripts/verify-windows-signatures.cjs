const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");

const required = /^(1|true|yes)$/i.test(process.env.REQUIRE_WINDOWS_SIGNING || "");
if (!required) {
  console.log("Windows signature verification is skipped for this non-release build.");
  process.exit(0);
}

if (process.platform !== "win32") {
  throw new Error("Windows signature verification must run on a Windows runner.");
}

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
const artifactBase = `${packageJson.productName}-${packageJson.version}-win-x64`;
const files = [
  path.join("release", "win-unpacked", `${packageJson.productName}.exe`),
  path.join("release", `${artifactBase}-setup.exe`),
  path.join("release", `${artifactBase}-portable.exe`)
];
const execFileAsync = promisify(execFile);
const command = "$signature=Get-AuthenticodeSignature -LiteralPath $env:KAIROS_SIGNATURE_FILE;if($signature.Status -ne 'Valid'){Write-Error ('Invalid Authenticode signature: '+$signature.Status);exit 1};$signature.SignerCertificate.Subject";

async function main() {
  for (const filePath of files) {
    if (!fs.existsSync(filePath)) throw new Error(`Cannot verify missing signed artifact: ${filePath}`);
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
      env: { ...process.env, KAIROS_SIGNATURE_FILE: path.resolve(filePath) },
      windowsHide: true
    });
    console.log(`Valid Windows signature: ${filePath} (${stdout.trim() || "certificate subject unavailable"})`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
