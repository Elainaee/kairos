const fs = require("node:fs");
const path = require("node:path");

const packagePath = path.join(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const version = packageJson.version;
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

if (typeof version !== "string" || !semver.test(version)) {
  throw new Error(`package.json version must be a valid SemVer version without a leading 'v'; received ${JSON.stringify(version)}.`);
}

const tag = process.env.RELEASE_TAG || (process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : "");
if (tag && tag !== `v${version}`) {
  throw new Error(`Release tag ${JSON.stringify(tag)} must match package.json version as v${version}.`);
}

console.log(`Release version is valid: ${version}${tag ? ` (tag: ${tag})` : ""}`);
