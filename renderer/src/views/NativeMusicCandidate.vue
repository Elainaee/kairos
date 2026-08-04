<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

/**
 * A non-routed migration candidate.  It deliberately starts from the original
 * Music document instead of recreating its markup from a new design.  Vue
 * owns only this lifecycle boundary; the original DOM, selectors, CSS and
 * controller are retained for the later, per-view replacement gate.
 */
const host = ref<HTMLElement>();
let pageStyle: HTMLStyleElement | undefined;
let tailwindLink: HTMLLinkElement | undefined;
let controllerAbort: AbortController | undefined;
let controllerRuntime: CandidateRuntime | undefined;
let mountVersion = 0;

type CandidateRuntime = {
  document: Document;
  window: Window;
  setTimeout: typeof window.setTimeout;
  clearTimeout: typeof window.clearTimeout;
  setInterval: typeof window.setInterval;
  clearInterval: typeof window.clearInterval;
  requestAnimationFrame: typeof window.requestAnimationFrame;
  cancelAnimationFrame: typeof window.cancelAnimationFrame;
  dispose: () => void;
};

const runtimeKey = "__kairosNativeMusicCandidateRuntime";

function originalPageUrl() {
  return import.meta.env.DEV
    ? "/legacy/pages/music/index.html"
    : new URL("../pages/music/index.html", window.location.href).href;
}

function tailwindUrl() {
  return import.meta.env.DEV
    ? "/legacy/assets/styles/tailwind.css"
    : new URL("../assets/styles/tailwind.css", window.location.href).href;
}

function originalControllerUrl() {
  return import.meta.env.DEV
    ? "/legacy/pages/music/native-vue-controller.js"
    : new URL("../pages/music/native-vue-controller.js", window.location.href).href;
}

function scopePageCss(css: string) {
  const scope = "#kairos-native-music-candidate";
  return css
    .replace(/:root\b/g, scope)
    .replace(/body\[data-embedded="true"\]/g, scope)
    .replace(/body\[data-page="music"\]/g, scope)
    .replace(/\bbody\b/g, scope)
    // These two selectors are intentionally global in the legacy document.
    // Under Vue they must remain inside the Music surface rather than alter
    // sibling controls in the persistent application shell.
    .replace(/\[data-state="collapsed"\]/g, `${scope} [data-state="collapsed"]`)
    .replace(/(^|})\s*\.material-symbols-outlined\s*\{/gm, `$1\n${scope} .material-symbols-outlined {`);
}

function eventOptions(options: boolean | AddEventListenerOptions | undefined, signal: AbortSignal) {
  if (typeof options === "boolean") return { capture: options, signal };
  return { ...(options || {}), signal };
}

function createCandidateRuntime(target: HTMLElement, abort: AbortController): CandidateRuntime {
  const timeouts = new Set<number>();
  const intervals = new Set<number>();
  const frames = new Set<number>();
  const setTimeoutScoped = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
    let id = 0;
    id = window.setTimeout(() => {
      timeouts.delete(id);
      if (!abort.signal.aborted && typeof callback === "function") callback(...args);
    }, delay);
    timeouts.add(id);
    return id;
  }) as typeof window.setTimeout;
  const setIntervalScoped = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
    const id = window.setInterval(() => {
      if (!abort.signal.aborted && typeof callback === "function") callback(...args);
    }, delay);
    intervals.add(id);
    return id;
  }) as typeof window.setInterval;
  const requestAnimationFrameScoped = ((callback: FrameRequestCallback) => {
    let id = 0;
    id = window.requestAnimationFrame(time => {
      frames.delete(id);
      if (!abort.signal.aborted) callback(time);
    });
    frames.add(id);
    return id;
  }) as typeof window.requestAnimationFrame;
  const scopedDocument = new Proxy(document, {
    get(nativeDocument, property, receiver) {
      if (property === "body") return target;
      if (property === "getElementById") {
        return (id: string) => target.querySelector(`[id="${CSS.escape(String(id))}"]`);
      }
      if (property === "querySelector") return target.querySelector.bind(target);
      if (property === "querySelectorAll") return target.querySelectorAll.bind(target);
      if (property === "addEventListener") {
        return (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
          nativeDocument.addEventListener(type, listener, eventOptions(options, abort.signal));
        };
      }
      // Native DOM accessors (for example `document.location`) reject a
      // Proxy receiver. Read them with the real document as their receiver,
      // then bind callable methods below.
      const value = Reflect.get(nativeDocument, property, nativeDocument);
      return typeof value === "function" ? value.bind(nativeDocument) : value;
    }
  }) as Document;

  const scopedWindow = new Proxy(window, {
    get(nativeWindow, property, receiver) {
      // The original source uses this comparison to detect its iframe host.
      // A native Vue route is its own page surface, so use the standalone
      // branch while still forwarding all real desktop APIs.
      if (property === "parent" || property === "top") return scopedWindow;
      if (property === "addEventListener") {
        return (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
          nativeWindow.addEventListener(type, listener, eventOptions(options, abort.signal));
        };
      }
      // Window accessors such as `location` require the actual Window object
      // as `this`; passing the Proxy triggers Chromium's Illegal invocation.
      const value = Reflect.get(nativeWindow, property, nativeWindow);
      return typeof value === "function" ? value.bind(nativeWindow) : value;
    }
  }) as Window;

  return {
    document: scopedDocument,
    window: scopedWindow,
    setTimeout: setTimeoutScoped,
    clearTimeout: ((id: number | undefined) => { timeouts.delete(Number(id)); window.clearTimeout(id); }) as typeof window.clearTimeout,
    setInterval: setIntervalScoped,
    clearInterval: ((id: number | undefined) => { intervals.delete(Number(id)); window.clearInterval(id); }) as typeof window.clearInterval,
    requestAnimationFrame: requestAnimationFrameScoped,
    cancelAnimationFrame: ((id: number) => { frames.delete(id); window.cancelAnimationFrame(id); }) as typeof window.cancelAnimationFrame,
    dispose: () => {
      abort.abort();
      timeouts.forEach(id => window.clearTimeout(id));
      intervals.forEach(id => window.clearInterval(id));
      frames.forEach(id => window.cancelAnimationFrame(id));
      timeouts.clear();
      intervals.clear();
      frames.clear();
    }
  };
}

function appendOriginalController(target: HTMLElement, runtime: CandidateRuntime) {
  // Preserve the original controller in a same-origin external script. The
  // Vue shell CSP correctly rejects dynamic inline scripts, while an external
  // controller still uses the exact source synchronised from the legacy page.
  (globalThis as Record<string, unknown>)[runtimeKey] = runtime;
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.dataset.nativeMusicCandidateController = "";
    script.src = originalControllerUrl();
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Unable to load original Music controller")), { once: true });
    target.append(script);
  });
}

async function mountOriginalMusicCandidate() {
  const version = ++mountVersion;
  const target = host.value;
  if (!target) return;
  const response = await fetch(originalPageUrl(), { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load original Music page (${response.status})`);
  const original = new DOMParser().parseFromString(await response.text(), "text/html");
  if (version !== mountVersion || host.value !== target) return;
  const musicRoot = original.querySelector<HTMLElement>(".music-root");
  const pageCss = [...original.head.querySelectorAll("style")].at(-1)?.textContent || "";
  // The last script tag belongs to the shared player and has a src attribute.
  // Select the actual inline Music-page controller instead.
  if (!musicRoot || !pageCss) throw new Error("Original Music source is incomplete");

  pageStyle = document.createElement("style");
  pageStyle.dataset.nativeMusicCandidateStyle = "";
  pageStyle.textContent = `${scopePageCss(pageCss)}\n#kairos-native-music-candidate{position:relative;height:100%;overflow:hidden;isolation:isolate;background:#f9f7f0}#kairos-native-music-candidate[data-embedded="true"] .music-root{height:100%!important}#kairos-native-music-candidate .music-sidebar-panel{position:absolute}#kairos-native-music-candidate .kairos-sonner{position:absolute}`;
  document.head.append(pageStyle);

  tailwindLink = document.createElement("link");
  tailwindLink.rel = "stylesheet";
  tailwindLink.href = tailwindUrl();
  tailwindLink.dataset.nativeMusicCandidateTailwind = "";
  document.head.append(tailwindLink);

  // Match the context established by the original `?embed=1` document before
  // it mounts its Music root; this preserves its original height calculation.
  target.className = "font-body-md text-body-md overflow-hidden";
  target.dataset.page = "music";
  target.dataset.embedded = "true";
  target.replaceChildren(musicRoot);
  controllerAbort = new AbortController();
  controllerRuntime = createCandidateRuntime(target, controllerAbort);
  await appendOriginalController(target, controllerRuntime);
  if (version !== mountVersion || host.value !== target) controllerRuntime.dispose();
}

onMounted(() => { void mountOriginalMusicCandidate().catch(error => console.error("Native Music candidate failed", error)); });
onBeforeUnmount(() => {
  mountVersion += 1;
  controllerRuntime?.dispose();
  controllerRuntime = undefined;
  controllerAbort = undefined;
  delete (globalThis as Record<string, unknown>)[runtimeKey];
  pageStyle?.remove();
  tailwindLink?.remove();
  host.value?.replaceChildren();
});
</script>

<template>
  <section id="kairos-native-music-candidate" ref="host" aria-label="Music workspace" />
</template>
