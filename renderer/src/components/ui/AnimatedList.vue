<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

const list = ref<HTMLElement>();
let intersectionObserver: IntersectionObserver | null = null;
let mutationObserver: MutationObserver | null = null;

function observeItems() {
  const items = Array.from(list.value?.children || []) as HTMLElement[];
  items.forEach((item, index) => {
    if (item.dataset.animatedListObserved === "true") return;
    item.dataset.animatedListObserved = "true";
    item.style.setProperty("--animated-list-delay", `${100 + Math.min(index, 8) * 35}ms`);
    intersectionObserver?.observe(item);
  });
}

onMounted(async () => {
  await nextTick();
  const root = list.value?.closest(".focus-page--records") || null;
  intersectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      entry.target.classList.toggle("is-in-view", entry.isIntersecting && entry.intersectionRatio >= 0.5);
    });
  }, { root, threshold: [0, 0.5] });
  observeItems();
  if (list.value) {
    mutationObserver = new MutationObserver(observeItems);
    mutationObserver.observe(list.value, { childList: true });
  }
});

onBeforeUnmount(() => {
  intersectionObserver?.disconnect();
  mutationObserver?.disconnect();
});
</script>

<template>
  <div ref="list" class="kairos-animated-list">
    <slot />
  </div>
</template>
