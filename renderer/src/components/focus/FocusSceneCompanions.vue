<script setup lang="ts">
import { ref } from "vue";
import { t } from "../../i18n";
import { useSceneContrast } from "../../composables/useSceneContrast";
import { getDailyQuote } from "../../data/daily-quotes";
import FocusMiniPlayer from "./FocusMiniPlayer.vue";

const dailyQuote = getDailyQuote();
const quote = ref<HTMLElement | null>(null);
const { sceneTone } = useSceneContrast(quote);
</script>

<template>
  <FocusMiniPlayer />
  <aside ref="quote" class="focus-daily-quote" :data-scene-tone="sceneTone" :aria-label="t('focus.dailyQuote.label')">
    <span>{{ t('focus.dailyQuote.label') }} · {{ String(dailyQuote.id).padStart(3, '0') }}</span>
    <blockquote lang="zh-CN">{{ dailyQuote.text }}</blockquote>
  </aside>
</template>
