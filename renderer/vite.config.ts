import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import fs from "node:fs";

const appRoot = path.resolve(__dirname, "../app");
const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".cjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon"
};

export default defineConfig({
  root: path.resolve(__dirname),
  base: "./",
  plugins: [vue(), {
    name: "kairos-legacy-preview",
    configureServer(server) {
      // The Vue shell embeds original Kairos pages through /legacy. Those
      // files are outside Vite's module graph, so explicitly watch them and
      // refresh the embedded document after a source edit during development.
      server.watcher.add(appRoot);
      server.watcher.on("change", file => {
        if (file.startsWith(`${appRoot}${path.sep}`)) server.ws.send({ type: "full-reload", path: "*" });
      });
      const serveAppFile = (directory: string, request: import("http").IncomingMessage, response: import("http").ServerResponse, next: () => void) => {
        // Connect strips the mounted prefix from `request.url`, so use its
        // remaining path rather than attempting to remove the prefix again.
        const relative = decodeURIComponent(String(request.url || "/").split("?")[0]).replace(/^\/+/, "");
        const target = path.resolve(appRoot, directory, relative);
        if (!target.startsWith(`${appRoot}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) return next();
        response.setHeader("Content-Type", contentTypes[path.extname(target).toLowerCase()] || "application/octet-stream");
        response.setHeader("Cache-Control", "no-store");
        fs.createReadStream(target).pipe(response);
      };
      server.middlewares.use("/legacy", (request, response, next) => serveAppFile("", request, response, next));
      // Legacy documents resolve `../../themes` and `../../i18n` relative to
      // `/legacy/pages/<page>/`.  Expose those paths too; without these
      // aliases the embedded desktop pages silently miss the theme runtime
      // and remain light while the Vue shell switches to dark.
      server.middlewares.use("/legacy/themes", (request, response, next) => serveAppFile("themes", request, response, next));
      server.middlewares.use("/legacy/i18n", (request, response, next) => serveAppFile("i18n", request, response, next));
      server.middlewares.use("/i18n", (request, response, next) => serveAppFile("i18n", request, response, next));
      server.middlewares.use("/themes", (request, response, next) => serveAppFile("themes", request, response, next));
    }
  }],
  server: {
    fs: { allow: [path.resolve(__dirname, "..")] }
  },
  build: {
    outDir: path.resolve(__dirname, "../app/vue-preview"),
    emptyOutDir: true
  }
});
