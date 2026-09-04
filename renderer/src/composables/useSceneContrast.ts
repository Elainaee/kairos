import { onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";

type SceneTone = "dark" | "light";

function mediaDimensions(media: HTMLImageElement | HTMLVideoElement) {
  if (media instanceof HTMLVideoElement) return { width: media.videoWidth, height: media.videoHeight };
  return { width: media.naturalWidth, height: media.naturalHeight };
}

export function useSceneContrast(target: Ref<HTMLElement | null>) {
  const sceneTone = ref<SceneTone>("dark");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = 12;
  canvas.height = 12;
  let timer: number | undefined;

  function sample() {
    const element = target.value;
    const surface = element?.closest<HTMLElement>(".focus-page, .focus-session");
    const media = surface?.querySelector<HTMLImageElement | HTMLVideoElement>(".focus-scene > img, .focus-scene > video");
    if (!element || !media || !context) return;

    const dimensions = mediaDimensions(media);
    if (!dimensions.width || !dimensions.height) return;

    const sceneRect = media.getBoundingClientRect();
    const targetRect = element.getBoundingClientRect();
    if (!sceneRect.width || !sceneRect.height || !targetRect.width || !targetRect.height) return;

    const scale = Math.max(sceneRect.width / dimensions.width, sceneRect.height / dimensions.height);
    const renderedWidth = dimensions.width * scale;
    const renderedHeight = dimensions.height * scale;
    const offsetX = (sceneRect.width - renderedWidth) / 2;
    const offsetY = (sceneRect.height - renderedHeight) / 2;
    const sourceX = Math.max(0, (targetRect.left - sceneRect.left - offsetX) / scale);
    const sourceY = Math.max(0, (targetRect.top - sceneRect.top - offsetY) / scale);
    const sourceWidth = Math.min(dimensions.width - sourceX, targetRect.width / scale);
    const sourceHeight = Math.min(dimensions.height - sourceY, targetRect.height / scale);
    if (sourceWidth <= 0 || sourceHeight <= 0) return;

    try {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(media, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let luminance = 0;
      let samples = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] < 24) continue;
        luminance += pixels[index] * .2126 + pixels[index + 1] * .7152 + pixels[index + 2] * .0722;
        samples += 1;
      }
      if (!samples) return;
      const average = luminance / samples;
      if (sceneTone.value === "dark" && average > 172) sceneTone.value = "light";
      if (sceneTone.value === "light" && average < 144) sceneTone.value = "dark";
    } catch {
      // Sandboxed HTML scenes and some custom protocols cannot be sampled safely.
      // Keep the established light foreground fallback in those cases.
    }
  }

  onMounted(() => {
    sample();
    timer = window.setInterval(sample, 800);
  });
  watch(target, sample);
  onBeforeUnmount(() => { if (timer !== undefined) window.clearInterval(timer); });

  return { sceneTone };
}
