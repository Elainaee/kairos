const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "app", "pages", "music", "index.html");
const outputPath = path.join(root, "app", "pages", "music", "native-vue-controller.js");
const source = fs.readFileSync(sourcePath, "utf8");
const body = source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || "";
const inlineScripts = [...body.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .filter(script => script.trim());
const controller = inlineScripts.at(-1);

if (!controller) throw new Error("Unable to find the original Music inline controller.");

const generated = `/* Generated from app/pages/music/index.html. Do not hand-edit. */
(() => {
  const __candidateGlobal = globalThis;
  const __runtime = __candidateGlobal.__kairosNativeMusicCandidateRuntime;
  if (!__runtime) return;
  const document = __runtime.document;
  const window = __runtime.window;
  const location = window.location;
  const setTimeout = __runtime.setTimeout;
  const clearTimeout = __runtime.clearTimeout;
  const setInterval = __runtime.setInterval;
  const clearInterval = __runtime.clearInterval;
  const requestAnimationFrame = __runtime.requestAnimationFrame;
  const cancelAnimationFrame = __runtime.cancelAnimationFrame;
${controller}
})();
`;

if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== generated) {
  fs.writeFileSync(outputPath, generated, "utf8");
}
