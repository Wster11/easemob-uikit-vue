<script setup lang="ts">
import { ref } from 'vue'
import { MESSAGE_TYPE, useLocale } from '@easemob-community/uikit-core'
import { EmIcon as Icon, EmText } from '@easemob-community/uikit-core'
import { formatComposerFileSize, scaleComposerImageSize, type ComposerBlock } from './composer-segment'

export interface ComposerEmbedProps {
  block: ComposerBlock
}

defineProps<ComposerEmbedProps>()
const emit = defineEmits<{
  (e: 'remove'): void
}>()
const { t } = useLocale()

const imageSize = ref(scaleComposerImageSize(0, 0))
const videoSize = ref(scaleComposerImageSize(0, 0))

function onImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  if (img?.naturalWidth && img.naturalHeight)
    imageSize.value = scaleComposerImageSize(img.naturalWidth, img.naturalHeight)
}

function onVideoMeta(event: Event) {
  const video = event.target as HTMLVideoElement
  if (video.videoWidth && video.videoHeight)
    videoSize.value = scaleComposerImageSize(video.videoWidth, video.videoHeight)
}
</script>

<template>
  <div v-if="block.type !== MESSAGE_TYPE.TEXT" class="composer-embed" :class="`composer-embed--${block.type}`">
    <div
      v-if="block.type === MESSAGE_TYPE.IMAGE"
      class="composer-embed__image-box"
      :style="{ width: `${imageSize.width}px`, height: `${imageSize.height}px` }"
    >
      <img
        class="composer-embed__image"
        :src="block.url"
        alt=""
        @load="onImageLoad"
      >
    </div>
    <div
      v-else-if="block.type === MESSAGE_TYPE.VIDEO"
      class="composer-embed__image-box"
      :style="{ width: `${videoSize.width}px`, height: `${videoSize.height}px` }"
    >
      <video
        class="composer-embed__video"
        :src="block.url"
        preload="metadata"
        muted
        playsinline
        @loadedmetadata="onVideoMeta"
      />
    </div>
    <div v-else class="composer-embed__file">
      <div class="composer-embed__file-icon">
        <Icon name="file/empty" :size="20" />
      </div>
      <div class="composer-embed__file-info">
        <EmText level="body" weight="medium" ellipsis class="composer-embed__name" :title="block.file.name">
          {{ block.file.name }}
        </EmText>
        <span class="composer-embed__size">{{ formatComposerFileSize(block.file.size) }}</span>
      </div>
    </div>
    <button
      type="button"
      class="composer-embed__remove"
      :aria-label="t('chat.input.removeAttachment')"
      @click.stop="emit('remove')"
    >
      <Icon name="circle/xmark" :size="14" />
    </button>
  </div>
</template>

<style scoped>
.composer-embed {
  position: relative;
  max-width: 240px;
}

.composer-embed__image-box {
  overflow: hidden;
  border-radius: var(--uikit-bubble-radius, 16px);
}

.composer-embed__image,
.composer-embed__video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.composer-embed__file {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 166px;
  padding: 10px 32px 10px 12px;
  box-sizing: border-box;
  border-radius: var(--uikit-file-card-radius, 12px);
  background-color: var(--uikit-bubble-bg-other);
  color: var(--uikit-bubble-text-other);
}

.composer-embed__file-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--uikit-components-radius, 8px);
  background-color: var(--uikit-file-icon-file);
  color: var(--uikit-text-inverse, #fff);
}

.composer-embed__file-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.composer-embed__name {
  color: var(--uikit-bubble-text-other);
  font-size: var(--uikit-font-size-15);
}

.composer-embed__size {
  font-size: var(--uikit-font-size-11);
  color: var(--uikit-text-tertiary, #919BA1);
}

.composer-embed__remove {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  color: var(--uikit-text-secondary);
  cursor: pointer;
  background-color: var(--uikit-input-bg, #fff);
  border: 0;
  border-radius: 50%;
}
</style>
